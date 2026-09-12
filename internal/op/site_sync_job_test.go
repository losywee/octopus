package op

import (
	"errors"
	"testing"
	"time"

	dbpkg "github.com/xuanli27/octopus/internal/db"
	"github.com/xuanli27/octopus/internal/model"
)

func TestSiteSyncJobLifecyclePersistsProgressAndFinalStatus(t *testing.T) {
	ctx := setupSiteOpTestDB(t)

	job, err := SiteSyncJobCreate(ctx, "sync", "manual")
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	if job.ID == 0 || job.Status != model.SiteSyncJobStatusQueued {
		t.Fatalf("unexpected queued job: %+v", job)
	}

	owner := "test-owner"
	leaseExpiry := time.Now().Add(time.Minute)
	if _, acquired, err := SiteSyncLeaseAcquire(ctx, model.SiteSyncLeaseNameGlobal, owner, job.ID, time.Now(), time.Minute); err != nil || !acquired {
		t.Fatalf("acquire lease: acquired=%v err=%v", acquired, err)
	}
	started := time.Now().Add(-time.Second)
	if err := SiteSyncJobMarkRunning(ctx, job.ID, 3, started, owner, leaseExpiry); err != nil {
		t.Fatalf("mark running: %v", err)
	}
	if err := SiteSyncJobSaveProgress(ctx, &model.SiteSyncJob{
		ID:             job.ID,
		LeaseOwner:     owner,
		LeaseExpiresAt: &leaseExpiry,
		Total:          3,
		Attempted:      2,
		Success:        1,
		Partial:        1,
		HeartbeatAt: func() *time.Time {
			now := time.Now()
			return &now
		}(),
	}); err != nil {
		t.Fatalf("save progress: %v", err)
	}

	loaded, err := SiteSyncJobGet(ctx, job.ID)
	if err != nil {
		t.Fatalf("get progress: %v", err)
	}
	if loaded.Status != model.SiteSyncJobStatusRunning || loaded.Total != 3 || loaded.Attempted != 2 || loaded.Success != 1 || loaded.Partial != 1 {
		t.Fatalf("unexpected progress snapshot: %+v", loaded)
	}

	finished := time.Now()
	if err := SiteSyncJobFinish(ctx, &model.SiteSyncJob{
		ID:         job.ID,
		LeaseOwner: owner,
		Status:     model.SiteSyncJobStatusPartial,
		Total:      3,
		Attempted:  3,
		Success:    2,
		Partial:    1,
		FinishedAt: &finished,
		DurationMS: 123,
	}); err != nil {
		t.Fatalf("finish job: %v", err)
	}

	loaded, err = SiteSyncJobGet(ctx, job.ID)
	if err != nil {
		t.Fatalf("get finished job: %v", err)
	}
	if loaded.Status != model.SiteSyncJobStatusPartial || loaded.FinishedAt == nil || loaded.DurationMS != 123 {
		t.Fatalf("unexpected finished snapshot: %+v", loaded)
	}

	jobs, err := SiteSyncJobList(ctx, 1)
	if err != nil {
		t.Fatalf("list jobs: %v", err)
	}
	if len(jobs) != 1 || jobs[0].ID != job.ID {
		t.Fatalf("unexpected job list: %+v", jobs)
	}
}

func TestSiteSyncJobRejectsStaleOwnerWrites(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	job, err := SiteSyncJobCreate(ctx, "sync", "manual")
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	now := time.Now().UTC()
	lease, acquired, err := SiteSyncLeaseAcquire(ctx, model.SiteSyncLeaseNameGlobal, "owner-current", job.ID, now, time.Minute)
	if err != nil || !acquired {
		t.Fatalf("acquire lease: acquired=%v err=%v", acquired, err)
	}
	if err := SiteSyncJobMarkRunning(ctx, job.ID, 2, now, "owner-current", lease.ExpiresAt); err != nil {
		t.Fatalf("mark running: %v", err)
	}

	staleHeartbeat := now.Add(time.Second)
	err = SiteSyncJobSaveProgress(ctx, &model.SiteSyncJob{
		ID:          job.ID,
		LeaseOwner:  "owner-stale",
		Attempted:   1,
		HeartbeatAt: &staleHeartbeat,
	})
	if !errors.Is(err, ErrSiteSyncJobLeaseOwnershipLost) {
		t.Fatalf("stale progress should report ownership loss, got %v", err)
	}
	if err = SiteSyncJobFinish(ctx, &model.SiteSyncJob{ID: job.ID, LeaseOwner: "owner-stale", Status: model.SiteSyncJobStatusSuccess}); !errors.Is(err, ErrSiteSyncJobLeaseOwnershipLost) {
		t.Fatalf("stale finish should report ownership loss, got %v", err)
	}

	loaded, err := SiteSyncJobGet(ctx, job.ID)
	if err != nil {
		t.Fatalf("load job: %v", err)
	}
	if loaded.Status != model.SiteSyncJobStatusRunning || loaded.Attempted != 0 || loaded.LeaseOwner != "owner-current" {
		t.Fatalf("stale owner changed the active job: %+v", loaded)
	}
}

func TestSiteSyncJobFailStaleMarksOnlyOldActiveJobs(t *testing.T) {
	ctx := setupSiteOpTestDB(t)

	oldJob, err := SiteSyncJobCreate(ctx, "sync", "scheduled")
	if err != nil {
		t.Fatalf("create old job: %v", err)
	}
	newJob, err := SiteSyncJobCreate(ctx, "sync", "manual")
	if err != nil {
		t.Fatalf("create new job: %v", err)
	}
	heartbeatJob, err := SiteSyncJobCreate(ctx, "sync", "scheduled")
	if err != nil {
		t.Fatalf("create heartbeat job: %v", err)
	}
	old := time.Now().Add(-3 * time.Hour)
	if err := dbpkg.GetDB().WithContext(ctx).Model(&model.SiteSyncJob{}).Where("id = ?", oldJob.ID).Updates(map[string]any{
		"updated_at": old,
	}).Error; err != nil {
		t.Fatalf("age old job: %v", err)
	}
	if err := dbpkg.GetDB().WithContext(ctx).Model(&model.SiteSyncJob{}).Where("id = ?", heartbeatJob.ID).Updates(map[string]any{
		"updated_at":   old,
		"heartbeat_at": time.Now(),
	}).Error; err != nil {
		t.Fatalf("age heartbeat job: %v", err)
	}

	recovered, err := SiteSyncJobFailStale(ctx, time.Now().Add(-2*time.Hour), "process restarted")
	if err != nil {
		t.Fatalf("fail stale: %v", err)
	}
	if recovered != 1 {
		t.Fatalf("expected one stale job, got %d", recovered)
	}

	oldLoaded, _ := SiteSyncJobGet(ctx, oldJob.ID)
	newLoaded, _ := SiteSyncJobGet(ctx, newJob.ID)
	if oldLoaded.Status != model.SiteSyncJobStatusFailed || oldLoaded.ErrorMessage != "process restarted" {
		t.Fatalf("old job was not recovered: %+v", oldLoaded)
	}
	if newLoaded.Status != model.SiteSyncJobStatusQueued {
		t.Fatalf("new job should remain queued: %+v", newLoaded)
	}
	heartbeatLoaded, _ := SiteSyncJobGet(ctx, heartbeatJob.ID)
	if heartbeatLoaded.Status != model.SiteSyncJobStatusQueued {
		t.Fatalf("fresh heartbeat job should remain queued: %+v", heartbeatLoaded)
	}
}

func TestSiteSyncJobPruneKeepsRecentHistoryAndActiveJobs(t *testing.T) {
	ctx := setupSiteOpTestDB(t)

	completedIDs := make([]int, 0, 3)
	for range 3 {
		job, err := SiteSyncJobCreate(ctx, "sync", "scheduled")
		if err != nil {
			t.Fatalf("create completed job: %v", err)
		}
		completedIDs = append(completedIDs, job.ID)
		if err := SiteSyncJobFinish(ctx, &model.SiteSyncJob{ID: job.ID, Status: model.SiteSyncJobStatusSuccess}); err != nil {
			t.Fatalf("finish completed job: %v", err)
		}
	}
	active, err := SiteSyncJobCreate(ctx, "sync", "manual")
	if err != nil {
		t.Fatalf("create active job: %v", err)
	}

	if err := SiteSyncJobPrune(ctx, 1); err != nil {
		t.Fatalf("prune jobs: %v", err)
	}
	jobs, err := SiteSyncJobList(ctx, 10)
	if err != nil {
		t.Fatalf("list pruned jobs: %v", err)
	}
	if len(jobs) != 2 {
		t.Fatalf("expected newest completed job and active job, got %+v", jobs)
	}
	wanted := map[int]bool{completedIDs[len(completedIDs)-1]: true, active.ID: true}
	for _, job := range jobs {
		if !wanted[job.ID] {
			t.Fatalf("unexpected retained job: %+v", job)
		}
	}
}
