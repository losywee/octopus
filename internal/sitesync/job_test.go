package sitesync

import (
	"testing"
	"time"

	"github.com/xuanli27/octopus/internal/model"
	"github.com/xuanli27/octopus/internal/op"
)

func TestFinalSiteSyncJobStatusMapsBatchOutcomes(t *testing.T) {
	tests := []struct {
		name   string
		setup  func(*SiteBatchSummary)
		status model.SiteSyncJobStatus
	}{
		{
			name: "success",
			setup: func(s *SiteBatchSummary) {
				s.Total = 2
				s.Attempted = 2
				s.Success = 2
			},
			status: model.SiteSyncJobStatusSuccess,
		},
		{
			name: "partial failure",
			setup: func(s *SiteBatchSummary) {
				s.Total = 2
				s.Attempted = 2
				s.Success = 1
				s.Failed = 1
			},
			status: model.SiteSyncJobStatusPartial,
		},
		{
			name: "all failed",
			setup: func(s *SiteBatchSummary) {
				s.Total = 2
				s.Attempted = 2
				s.Failed = 2
			},
			status: model.SiteSyncJobStatusFailed,
		},
		{
			name: "canceled",
			setup: func(s *SiteBatchSummary) {
				s.Total = 2
				s.Canceled = true
			},
			status: model.SiteSyncJobStatusCanceled,
		},
		{
			name: "all skipped",
			setup: func(s *SiteBatchSummary) {
				s.Total = 2
				s.Attempted = 2
				s.Skipped = 2
			},
			status: model.SiteSyncJobStatusSkipped,
		},
		{
			name: "blocked empty batch",
			setup: func(s *SiteBatchSummary) {
				s.BlockedByJobID = 42
			},
			status: model.SiteSyncJobStatusSkipped,
		},
		{
			name: "list error",
			setup: func(s *SiteBatchSummary) {
				s.ErrorMessage = "unable to list sites"
			},
			status: model.SiteSyncJobStatusFailed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			summary := newSiteBatchSummary(SiteBatchPhaseSync, SiteBatchOptions{}, 0)
			tt.setup(summary)
			if got := finalSiteSyncJobStatus(summary); got != tt.status {
				t.Fatalf("status = %q, want %q", got, tt.status)
			}
		})
	}
}

func TestBeginSiteSyncJobReportsLiveLeaseBlocker(t *testing.T) {
	ctx := setupProjectTestDB(t)
	firstSummary := newSiteBatchSummary(SiteBatchPhaseSync, SiteBatchOptions{Trigger: SiteBatchTriggerScheduled}, 1)
	firstRun, acquired, err := beginSiteSyncJob(ctx, firstSummary, SiteBatchOptions{Trigger: SiteBatchTriggerScheduled})
	if err != nil || !acquired {
		t.Fatalf("begin first job: acquired=%v err=%v", acquired, err)
	}
	firstFinished := false
	t.Cleanup(func() {
		if !firstFinished {
			firstRun.finish(firstSummary)
		}
	})

	secondSummary := newSiteBatchSummary(SiteBatchPhaseSync, SiteBatchOptions{Trigger: SiteBatchTriggerManual}, 2)
	secondRun, acquired, err := beginSiteSyncJob(ctx, secondSummary, SiteBatchOptions{Trigger: SiteBatchTriggerManual})
	if err != nil {
		t.Fatalf("begin blocked job: %v", err)
	}
	if acquired {
		t.Fatal("second job should not acquire a live singleton lease")
	}
	if secondSummary.BlockedByJobID != firstSummary.JobID || secondSummary.BlockedByJobID == 0 {
		t.Fatalf("expected blocker job %d, got %+v", firstSummary.JobID, secondSummary)
	}
	secondSummary.Skipped = secondSummary.Total
	secondRun.finish(secondSummary)
	blockedJob, err := op.SiteSyncJobGet(ctx, secondSummary.JobID)
	if err != nil {
		t.Fatalf("load blocked job: %v", err)
	}
	if blockedJob.Status != model.SiteSyncJobStatusSkipped || blockedJob.BlockedByJobID != firstSummary.JobID {
		t.Fatalf("blocked job snapshot missing lease owner: %+v", blockedJob)
	}

	firstSummary.Attempted = 1
	firstSummary.Success = 1
	firstRun.finish(firstSummary)
	firstFinished = true
}

func TestSiteSyncJobRunCancelsAfterExpiredLeaseTakeover(t *testing.T) {
	ctx := setupProjectTestDB(t)
	summary := newSiteBatchSummary(SiteBatchPhaseSync, SiteBatchOptions{Trigger: SiteBatchTriggerScheduled}, 1)
	run, acquired, err := beginSiteSyncJob(ctx, summary, SiteBatchOptions{Trigger: SiteBatchTriggerScheduled})
	if err != nil || !acquired {
		t.Fatalf("begin original job: acquired=%v err=%v", acquired, err)
	}
	finished := false
	t.Cleanup(func() {
		if !finished {
			run.finish(summary)
		}
	})

	replacement, err := op.SiteSyncJobCreate(ctx, string(SiteBatchPhaseSync), string(SiteBatchTriggerManual))
	if err != nil {
		t.Fatalf("create replacement job: %v", err)
	}
	takeoverAt := time.Now().UTC().Add(siteSyncLeaseTTL + time.Second)
	if _, acquired, err := op.SiteSyncLeaseAcquire(ctx, model.SiteSyncLeaseNameGlobal, "replacement-owner", replacement.ID, takeoverAt, siteSyncLeaseTTL); err != nil || !acquired {
		t.Fatalf("take over expired lease: acquired=%v err=%v", acquired, err)
	}

	run.update(summary)
	if !run.leaseWasLost() {
		t.Fatal("stale worker should detect job ownership loss")
	}
	select {
	case <-run.context(ctx).Done():
	default:
		t.Fatal("stale worker context was not canceled")
	}
	run.finish(summary)
	finished = true
}
