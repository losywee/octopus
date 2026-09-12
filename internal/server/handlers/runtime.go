package handlers

import (
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xuanli27/octopus/internal/op"
	"github.com/xuanli27/octopus/internal/relay/balancer"
	"github.com/xuanli27/octopus/internal/server/middleware"
	"github.com/xuanli27/octopus/internal/server/resp"
	"github.com/xuanli27/octopus/internal/server/router"
)

func init() {
	router.NewGroupRouter("/api/v1/runtime").
		Use(middleware.Auth()).
		AddRoute(router.NewRoute("/overview", http.MethodGet).Handle(getRuntimeOverview))
}

type runtimeCircuitView struct {
	ChannelID           int    `json:"channel_id"`
	ChannelName         string `json:"channel_name"`
	ChannelKeyID        int    `json:"channel_key_id"`
	ModelName           string `json:"model_name"`
	State               string `json:"state"`
	ConsecutiveFailures int64  `json:"consecutive_failures"`
	TripCount           int    `json:"trip_count"`
	RemainingCooldownMS int64  `json:"remaining_cooldown_ms"`
}

type runtimeChannelHealth struct {
	ChannelID      int     `json:"channel_id"`
	ChannelName    string  `json:"channel_name"`
	RequestSuccess int64   `json:"request_success"`
	RequestFailed  int64   `json:"request_failed"`
	TotalRequests  int64   `json:"total_requests"`
	FailRate       float64 `json:"fail_rate"` // 0-100
	Enabled        bool    `json:"enabled"`
	Window         string  `json:"window"` // e.g. "1h"
}

type runtimeStickyView struct {
	APIKeyID     int    `json:"api_key_id"`
	RequestModel string `json:"request_model"`
	ChannelID    int    `json:"channel_id"`
	ChannelKeyID int    `json:"channel_key_id"`
	AgeMS        int64  `json:"age_ms"`
}

type runtimeOverview struct {
	OpenCircuits     int                    `json:"open_circuits"`
	HalfOpenCircuits int                    `json:"half_open_circuits"`
	Circuits         []runtimeCircuitView   `json:"circuits"`
	ChannelHealth    []runtimeChannelHealth `json:"channel_health"`
	UnhealthyCount   int                    `json:"unhealthy_count"`
	HealthWindow     string                 `json:"health_window"`
	StickySessions   []runtimeStickyView    `json:"sticky_sessions"`
	StickyCount      int                    `json:"sticky_count"`
}

func getRuntimeOverview(c *gin.Context) {
	snaps := balancer.ListCircuitSnapshots()
	focusChannelID := 0
	if raw := c.Query("channel_id"); raw != "" {
		if id, err := strconv.Atoi(raw); err == nil && id > 0 {
			focusChannelID = id
		}
	}
	stickySnaps := balancer.ListStickySnapshots(focusChannelID)
	stickyViews := make([]runtimeStickyView, 0, len(stickySnaps))
	for _, s := range stickySnaps {
		stickyViews = append(stickyViews, runtimeStickyView{
			APIKeyID:     s.APIKeyID,
			RequestModel: s.RequestModel,
			ChannelID:    s.ChannelID,
			ChannelKeyID: s.ChannelKeyID,
			AgeMS:        s.AgeMS,
		})
	}
	views := make([]runtimeCircuitView, 0, len(snaps))
	open, half := 0, 0
	for _, s := range snaps {
		name := ""
		if ch, err := op.ChannelGet(s.ChannelID, c.Request.Context()); err == nil && ch != nil {
			name = ch.Name
		}
		views = append(views, runtimeCircuitView{
			ChannelID:           s.ChannelID,
			ChannelName:         name,
			ChannelKeyID:        s.ChannelKeyID,
			ModelName:           s.ModelName,
			State:               s.State,
			ConsecutiveFailures: s.ConsecutiveFailures,
			TripCount:           s.TripCount,
			RemainingCooldownMS: s.RemainingCooldownMS,
		})
		switch s.State {
		case "open":
			open++
		case "half_open":
			half++
		}
	}
	sort.Slice(views, func(i, j int) bool {
		if views[i].State == views[j].State {
			if views[i].ChannelName == views[j].ChannelName {
				return views[i].ModelName < views[j].ModelName
			}
			return views[i].ChannelName < views[j].ChannelName
		}
		rank := func(s string) int {
			switch s {
			case "open":
				return 0
			case "half_open":
				return 1
			default:
				return 2
			}
		}
		return rank(views[i].State) < rank(views[j].State)
	})

	const windowLabel = "1h"
	window := time.Hour
	recent := op.StatsChannelRecentSnapshot(window)
	health := make([]runtimeChannelHealth, 0, len(recent))
	unhealthy := 0
	for _, r := range recent {
		name := ""
		enabled := true
		if ch, err := op.ChannelGet(r.ChannelID, c.Request.Context()); err == nil && ch != nil {
			name = ch.Name
			enabled = ch.Enabled
		}
		item := runtimeChannelHealth{
			ChannelID:      r.ChannelID,
			ChannelName:    name,
			RequestSuccess: r.RequestSuccess,
			RequestFailed:  r.RequestFailed,
			TotalRequests:  r.TotalRequests,
			FailRate:       r.FailRate,
			Enabled:        enabled,
			Window:         windowLabel,
		}
		// Surface any channel with failures in the window; count high-fail as unhealthy.
		if r.RequestFailed > 0 || r.FailRate >= 10 {
			health = append(health, item)
		}
		if r.FailRate >= 20 || r.RequestFailed >= 3 {
			unhealthy++
		}
	}
	sort.Slice(health, func(i, j int) bool {
		if health[i].FailRate == health[j].FailRate {
			if health[i].RequestFailed == health[j].RequestFailed {
				return health[i].ChannelName < health[j].ChannelName
			}
			return health[i].RequestFailed > health[j].RequestFailed
		}
		return health[i].FailRate > health[j].FailRate
	})
	if len(health) > 20 {
		health = health[:20]
	}

	// Optional focus: /overview?channel_id=123
	if raw := c.Query("channel_id"); raw != "" {
		if id, err := strconv.Atoi(raw); err == nil && id > 0 {
			filteredViews := make([]runtimeCircuitView, 0)
			for _, v := range views {
				if v.ChannelID == id {
					filteredViews = append(filteredViews, v)
				}
			}
			// health list only keeps "interesting" rows; also attach a zero-row for focus if missing
			filteredHealth := make([]runtimeChannelHealth, 0)
			foundHealth := false
			for _, h := range health {
				if h.ChannelID == id {
					filteredHealth = append(filteredHealth, h)
					foundHealth = true
				}
			}
			if !foundHealth {
				// Build from raw recent snapshot even if previously filtered out.
				for _, r := range recent {
					if r.ChannelID != id {
						continue
					}
					name := ""
					enabled := true
					if ch, err := op.ChannelGet(r.ChannelID, c.Request.Context()); err == nil && ch != nil {
						name = ch.Name
						enabled = ch.Enabled
					}
					filteredHealth = append(filteredHealth, runtimeChannelHealth{
						ChannelID:      r.ChannelID,
						ChannelName:    name,
						RequestSuccess: r.RequestSuccess,
						RequestFailed:  r.RequestFailed,
						TotalRequests:  r.TotalRequests,
						FailRate:       r.FailRate,
						Enabled:        enabled,
						Window:         windowLabel,
					})
				}
			}
			openF, halfF := 0, 0
			for _, v := range filteredViews {
				switch v.State {
				case "open":
					openF++
				case "half_open":
					halfF++
				}
			}
			// sticky already filtered by focusChannelID
			resp.Success(c, runtimeOverview{
				OpenCircuits:     openF,
				HalfOpenCircuits: halfF,
				Circuits:         filteredViews,
				ChannelHealth:    filteredHealth,
				UnhealthyCount:   len(filteredHealth),
				HealthWindow:     windowLabel,
				StickySessions:   stickyViews,
				StickyCount:      len(stickyViews),
			})
			return
		}
	}

	resp.Success(c, runtimeOverview{
		OpenCircuits:     open,
		HalfOpenCircuits: half,
		Circuits:         views,
		ChannelHealth:    health,
		UnhealthyCount:   unhealthy,
		HealthWindow:     windowLabel,
		StickySessions:   stickyViews,
		StickyCount:      len(stickyViews),
	})
}
