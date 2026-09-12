package op

import (
	"sync"
	"time"
)

// Recent channel request outcomes for runtime dashboards (process-local, not persisted).
// Used to show fail rates over a sliding window instead of lifetime totals only.

const recentHealthCap = 256

type recentHealthSample struct {
	at time.Time
	ok bool
}

type recentHealthRing struct {
	mu   sync.Mutex
	buf  []recentHealthSample
	head int
	size int
}

func (r *recentHealthRing) add(ok bool, at time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.buf == nil {
		r.buf = make([]recentHealthSample, recentHealthCap)
	}
	r.buf[r.head] = recentHealthSample{at: at, ok: ok}
	r.head = (r.head + 1) % recentHealthCap
	if r.size < recentHealthCap {
		r.size++
	}
}

func (r *recentHealthRing) countSince(since time.Time) (success, failed int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.size == 0 {
		return 0, 0
	}
	// oldest index
	start := r.head - r.size
	if start < 0 {
		start += recentHealthCap
	}
	for i := 0; i < r.size; i++ {
		idx := (start + i) % recentHealthCap
		s := r.buf[idx]
		if s.at.Before(since) {
			continue
		}
		if s.ok {
			success++
		} else {
			failed++
		}
	}
	return success, failed
}

var recentChannelHealth sync.Map // int -> *recentHealthRing

// StatsChannelRecentClear drops sliding-window samples for a channel (e.g. after config change).
func StatsChannelRecentClear(channelID int) {
	if channelID <= 0 {
		return
	}
	recentChannelHealth.Delete(channelID)
}

// StatsChannelRecentRecord records one request outcome for sliding-window health.
func StatsChannelRecentRecord(channelID int, success bool) {
	if channelID <= 0 {
		return
	}
	val, _ := recentChannelHealth.LoadOrStore(channelID, &recentHealthRing{})
	ring := val.(*recentHealthRing)
	ring.add(success, time.Now())
}

// ChannelRecentHealth is a sliding-window snapshot for one channel.
type ChannelRecentHealth struct {
	ChannelID      int
	RequestSuccess int64
	RequestFailed  int64
	TotalRequests  int64
	FailRate       float64
}

// StatsChannelRecentSnapshot returns channels with traffic in the last window.
func StatsChannelRecentSnapshot(window time.Duration) []ChannelRecentHealth {
	if window <= 0 {
		window = time.Hour
	}
	since := time.Now().Add(-window)
	out := make([]ChannelRecentHealth, 0)
	recentChannelHealth.Range(func(key, value any) bool {
		id, ok := key.(int)
		if !ok {
			return true
		}
		ring, ok := value.(*recentHealthRing)
		if !ok || ring == nil {
			return true
		}
		success, failed := ring.countSince(since)
		total := success + failed
		if total == 0 {
			return true
		}
		rate := float64(failed) * 100 / float64(total)
		out = append(out, ChannelRecentHealth{
			ChannelID:      id,
			RequestSuccess: success,
			RequestFailed:  failed,
			TotalRequests:  total,
			FailRate:       rate,
		})
		return true
	})
	return out
}
