package sitesync

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"sync/atomic"
	"time"

	"github.com/xuanli27/octopus/internal/model"
	"github.com/xuanli27/octopus/internal/op"
	"github.com/xuanli27/octopus/internal/utils/log"
	"github.com/xuanli27/octopus/internal/utils/safe"
)

const (
	siteSyncJobPersistenceTimeout = 5 * time.Second
	siteSyncJobProgressInterval   = time.Second
	siteSyncLeaseTTL              = 90 * time.Second
	siteSyncLeaseHeartbeat        = 20 * time.Second
)

type siteSyncJobRun struct {
	id            int
	lastPersistAt time.Time

	leaseName   string
	leaseOwner  string
	leaseCtx    context.Context
	leaseCancel context.CancelFunc
	leaseLost   atomic.Bool

	leaseMu        sync.RWMutex
	leaseExpiresAt time.Time
	heartbeatStop  chan struct{}
	heartbeatDone  chan struct{}
	heartbeatOnce  sync.Once
}

// CreateSiteSyncJob lets an HTTP handler reserve a durable job ID before it
// launches a background worker. Scheduled and import syncs use the lazy path in
// prepareSiteSyncJob instead.
func CreateSiteSyncJob(ctx context.Context, opts SiteBatchOptions) (*model.SiteSyncJob, error) {
	return op.SiteSyncJobCreate(
		ctx,
		string(SiteBatchPhaseSync),
		string(normalizedSiteBatchTrigger(opts.Trigger)),
	)
}

func prepareSiteSyncJob(opts SiteBatchOptions) (*siteSyncJobRun, error) {
	if opts.JobID > 0 {
		return &siteSyncJobRun{id: opts.JobID}, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), siteSyncJobPersistenceTimeout)
	job, err := CreateSiteSyncJob(ctx, opts)
	cancel()
	if err != nil {
		return &siteSyncJobRun{}, err
	}
	return &siteSyncJobRun{id: job.ID}, nil
}

func newSiteSyncLeaseOwner() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func beginSiteSyncJob(ctx context.Context, summary *SiteBatchSummary, opts SiteBatchOptions) (*siteSyncJobRun, bool, error) {
	if summary == nil {
		return &siteSyncJobRun{}, false, errors.New("site sync summary is nil")
	}
	run, err := prepareSiteSyncJob(opts)
	if err != nil {
		return run, false, err
	}
	summary.JobID = run.id

	owner, err := newSiteSyncLeaseOwner()
	if err != nil {
		return run, false, err
	}
	now := time.Now().UTC()
	persistenceParent := ctx
	if persistenceParent == nil {
		persistenceParent = context.Background()
	}
	leaseCtx, leaseCancel := context.WithTimeout(persistenceParent, siteSyncJobPersistenceTimeout)
	lease, acquired, err := op.SiteSyncLeaseAcquire(
		leaseCtx,
		model.SiteSyncLeaseNameGlobal,
		owner,
		run.id,
		now,
		siteSyncLeaseTTL,
	)
	leaseCancel()
	if err != nil {
		return run, false, err
	}
	if !acquired {
		if lease != nil {
			summary.BlockedByJobID = lease.JobID
		}
		return run, false, nil
	}

	markCtx, markCancel := context.WithTimeout(persistenceParent, siteSyncJobPersistenceTimeout)
	err = op.SiteSyncJobMarkRunning(markCtx, run.id, summary.Total, summary.startedAt, owner, lease.ExpiresAt)
	markCancel()
	if err != nil {
		releaseCtx, releaseCancel := context.WithTimeout(context.Background(), siteSyncJobPersistenceTimeout)
		_, _ = op.SiteSyncLeaseRelease(releaseCtx, model.SiteSyncLeaseNameGlobal, owner, run.id, time.Now())
		releaseCancel()
		return run, false, err
	}

	if ctx == nil {
		ctx = context.Background()
	}
	run.leaseName = model.SiteSyncLeaseNameGlobal
	run.leaseOwner = owner
	run.leaseCtx, run.leaseCancel = context.WithCancel(ctx)
	run.setLeaseExpiry(lease.ExpiresAt)
	run.startHeartbeat()
	return run, true, nil
}

func (r *siteSyncJobRun) context(fallback context.Context) context.Context {
	if r != nil && r.leaseCtx != nil {
		return r.leaseCtx
	}
	return fallback
}

func (r *siteSyncJobRun) setLeaseExpiry(value time.Time) {
	if r == nil {
		return
	}
	r.leaseMu.Lock()
	r.leaseExpiresAt = value
	r.leaseMu.Unlock()
}

func (r *siteSyncJobRun) leaseExpiry() time.Time {
	if r == nil {
		return time.Time{}
	}
	r.leaseMu.RLock()
	defer r.leaseMu.RUnlock()
	return r.leaseExpiresAt
}

func (r *siteSyncJobRun) startHeartbeat() {
	if r == nil || r.leaseOwner == "" || r.leaseCancel == nil {
		return
	}
	r.heartbeatStop = make(chan struct{})
	r.heartbeatDone = make(chan struct{})
	safe.Go("site-sync-lease-heartbeat", func() {
		defer close(r.heartbeatDone)
		ticker := time.NewTicker(siteSyncLeaseHeartbeat)
		defer ticker.Stop()
		for {
			select {
			case <-r.heartbeatStop:
				return
			case <-ticker.C:
				now := time.Now().UTC()
				ctx, cancel := context.WithTimeout(context.Background(), siteSyncJobPersistenceTimeout)
				lease, renewed, err := op.SiteSyncLeaseRenew(ctx, r.leaseName, r.leaseOwner, r.id, now, siteSyncLeaseTTL)
				cancel()
				if err != nil || !renewed {
					r.leaseLost.Store(true)
					r.leaseCancel()
					if err != nil {
						log.Warnw("sitesync.lease.renew_failed", "job_id", r.id, "message", sanitizeSiteStatusMessage(err))
					} else {
						log.Warnw("sitesync.lease.lost", "job_id", r.id)
					}
					return
				}
				r.setLeaseExpiry(lease.ExpiresAt)
			}
		}
	})
}

func (r *siteSyncJobRun) stopHeartbeat() {
	if r == nil || r.heartbeatDone == nil {
		return
	}
	r.heartbeatOnce.Do(func() {
		close(r.heartbeatStop)
	})
	<-r.heartbeatDone
}

func (r *siteSyncJobRun) leaseWasLost() bool {
	return r != nil && r.leaseLost.Load()
}

func (r *siteSyncJobRun) update(summary *SiteBatchSummary) {
	if r == nil || r.id <= 0 || r.leaseOwner == "" || summary == nil {
		return
	}
	now := time.Now()
	if !summary.Canceled && !r.lastPersistAt.IsZero() && now.Sub(r.lastPersistAt) < siteSyncJobProgressInterval {
		return
	}
	job := siteSyncJobSnapshot(r.id, summary, model.SiteSyncJobStatusRunning, false)
	job.LeaseOwner = r.leaseOwner
	if expiresAt := r.leaseExpiry(); !expiresAt.IsZero() {
		job.LeaseExpiresAt = timePtr(expiresAt)
	}
	ctx, cancel := context.WithTimeout(context.Background(), siteSyncJobPersistenceTimeout)
	err := op.SiteSyncJobSaveProgress(ctx, job)
	cancel()
	if err != nil {
		if errors.Is(err, op.ErrSiteSyncJobLeaseOwnershipLost) {
			r.leaseLost.Store(true)
			if r.leaseCancel != nil {
				r.leaseCancel()
			}
		}
		log.Warnw("sitesync.job.progress_failed", "job_id", r.id, "message", sanitizeSiteStatusMessage(err))
		return
	}
	r.lastPersistAt = now
}

func (r *siteSyncJobRun) finish(summary *SiteBatchSummary) {
	if r == nil || r.id <= 0 || summary == nil {
		return
	}
	r.stopHeartbeat()
	summary.finish()
	job := siteSyncJobSnapshot(r.id, summary, finalSiteSyncJobStatus(summary), true)
	job.LeaseOwner = r.leaseOwner

	ctx, cancel := context.WithTimeout(context.Background(), siteSyncJobPersistenceTimeout)
	finishErr := op.SiteSyncJobFinish(ctx, job)
	if finishErr == nil {
		finishErr = op.SiteSyncJobPrune(ctx, 0)
	}
	cancel()

	if r.leaseOwner != "" {
		releaseCtx, releaseCancel := context.WithTimeout(context.Background(), siteSyncJobPersistenceTimeout)
		_, releaseErr := op.SiteSyncLeaseRelease(releaseCtx, r.leaseName, r.leaseOwner, r.id, time.Now())
		releaseCancel()
		if releaseErr != nil {
			log.Warnw("sitesync.lease.release_failed", "job_id", r.id, "message", sanitizeSiteStatusMessage(releaseErr))
		}
	}
	if r.leaseCancel != nil {
		r.leaseCancel()
	}
	if finishErr != nil && !errors.Is(finishErr, op.ErrSiteSyncJobLeaseOwnershipLost) {
		log.Warnw("sitesync.job.finish_failed", "job_id", r.id, "message", sanitizeSiteStatusMessage(finishErr))
	}
}

func siteSyncJobSnapshot(id int, summary *SiteBatchSummary, status model.SiteSyncJobStatus, finished bool) *model.SiteSyncJob {
	now := time.Now()
	duration := summary.Duration
	if duration <= 0 && !summary.startedAt.IsZero() {
		duration = now.Sub(summary.startedAt)
	}
	job := &model.SiteSyncJob{
		ID:             id,
		Phase:          string(summary.Phase),
		Trigger:        string(summary.Trigger),
		Status:         status,
		Total:          summary.Total,
		Attempted:      summary.Attempted,
		Success:        summary.Success,
		Partial:        summary.Partial,
		Failed:         summary.Failed,
		Skipped:        summary.Skipped,
		Warnings:       summary.Warnings,
		Canceled:       summary.Canceled,
		BlockedByJobID: summary.BlockedByJobID,
		CancelReason:   string(summary.CancelReason),
		ErrorMessage:   sanitizeSiteStatusText(summary.ErrorMessage),
		StartedAt:      timePtr(summary.startedAt),
		HeartbeatAt:    timePtr(now),
		DurationMS:     duration.Milliseconds(),
	}
	if finished {
		job.FinishedAt = timePtr(now)
	}
	return job
}

func finalSiteSyncJobStatus(summary *SiteBatchSummary) model.SiteSyncJobStatus {
	if summary == nil {
		return model.SiteSyncJobStatusFailed
	}
	if summary.Canceled {
		return model.SiteSyncJobStatusCanceled
	}
	if summary.ErrorMessage != "" {
		return model.SiteSyncJobStatusFailed
	}
	if summary.BlockedByJobID > 0 {
		return model.SiteSyncJobStatusSkipped
	}
	if summary.Total > 0 && summary.Skipped >= summary.Total && summary.Success == 0 && summary.Partial == 0 && summary.Failed == 0 {
		return model.SiteSyncJobStatusSkipped
	}
	if summary.Failed > 0 {
		if summary.Success > 0 || summary.Partial > 0 {
			return model.SiteSyncJobStatusPartial
		}
		return model.SiteSyncJobStatusFailed
	}
	if summary.Partial > 0 || summary.Warnings > 0 {
		return model.SiteSyncJobStatusPartial
	}
	return model.SiteSyncJobStatusSuccess
}
