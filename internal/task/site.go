package task

import (
	"context"
	"time"

	"github.com/xuanli27/octopus/internal/op"
	"github.com/xuanli27/octopus/internal/site"
	"github.com/xuanli27/octopus/internal/utils/log"
)

// The worker lease expires after 90 seconds. Keep a two-heartbeat grace
// window before the cleanup task marks a job abandoned, so a transient DB
// pause does not race a still-live worker.
const siteSyncJobStaleAfter = 3 * time.Minute

func SiteSyncTask() {
	log.Debugf("site sync task started")
	startTime := time.Now()
	defer func() {
		log.Debugf("site sync task finished, update time: %s", time.Since(startTime))
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Minute)
	defer cancel()
	site.SyncAll(ctx)
}

func SiteCheckinTask() {
	log.Debugf("site checkin task started")
	startTime := time.Now()
	defer func() {
		log.Debugf("site checkin task finished, update time: %s", time.Since(startTime))
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Minute)
	defer cancel()
	site.CheckinAll(ctx)
}

func SiteSyncJobCleanupTask() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	recovered, err := op.SiteSyncJobFailStale(
		ctx,
		time.Now().Add(-siteSyncJobStaleAfter),
		"site sync worker heartbeat expired",
	)
	if err != nil {
		log.Warnf("failed to recover stale site sync jobs: %v", err)
		return
	}
	if recovered > 0 {
		log.Warnf("recovered %d stale site sync jobs", recovered)
	}
	if err := op.SiteSyncJobPrune(ctx, 0); err != nil {
		log.Warnf("failed to prune site sync job history: %v", err)
	}
}
