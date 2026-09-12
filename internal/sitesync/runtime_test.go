package sitesync

import (
	"testing"

	"github.com/xuanli27/octopus/internal/model"
)

func TestSiteSyncRuntimeTrackerReportsProgressAndRejectsOverlap(t *testing.T) {
	tracker := newSiteSyncRuntimeTracker()
	summary := newSiteBatchSummary(
		SiteBatchPhaseSync,
		SiteBatchOptions{Trigger: SiteBatchTriggerManual},
		3,
	)
	summary.JobID = 42
	run, accepted := tracker.begin(summary)
	if !accepted || run == nil {
		t.Fatal("expected first sync batch to be accepted")
	}

	status := tracker.snapshot()
	if !status.Running || status.JobID != 42 || status.Trigger != SiteBatchTriggerManual || status.Total != 3 {
		t.Fatalf("unexpected initial runtime status: %+v", status)
	}

	run.startAccount(20)
	run.startAccount(10)
	status = tracker.snapshot()
	if len(status.ActiveAccountIDs) != 2 || status.ActiveAccountIDs[0] != 10 || status.ActiveAccountIDs[1] != 20 {
		t.Fatalf("expected sorted active accounts, got %+v", status.ActiveAccountIDs)
	}

	run.finishAccount(10)
	summary.recordResult(1, "new-api", 20, model.SiteExecutionStatusSuccess, "ok")
	run.update(summary)
	status = tracker.snapshot()
	if status.Attempted != 1 || status.Success != 1 || len(status.ActiveAccountIDs) != 1 || status.ActiveAccountIDs[0] != 20 {
		t.Fatalf("unexpected progress status: %+v", status)
	}

	if overlapping, accepted := tracker.begin(newSiteBatchSummary(SiteBatchPhaseSync, SiteBatchOptions{}, 1)); accepted || overlapping != nil {
		t.Fatal("expected overlapping sync batch to be rejected")
	}

	summary.finish()
	run.finish(summary)
	status = tracker.snapshot()
	if status.Running || status.FinishedAt == nil || status.DurationMS < 0 || len(status.ActiveAccountIDs) != 0 {
		t.Fatalf("unexpected completed runtime status: %+v", status)
	}
}

func TestSiteSyncRuntimeTrackerStartsFreshAfterCompletion(t *testing.T) {
	tracker := newSiteSyncRuntimeTracker()
	firstSummary := newSiteBatchSummary(SiteBatchPhaseSync, SiteBatchOptions{}, 0)
	first, accepted := tracker.begin(firstSummary)
	if !accepted {
		t.Fatal("expected first batch to start")
	}
	firstSummary.finish()
	first.finish(firstSummary)

	secondSummary := newSiteBatchSummary(SiteBatchPhaseSync, SiteBatchOptions{Trigger: SiteBatchTriggerImport}, 2)
	second, accepted := tracker.begin(secondSummary)
	if !accepted || second == nil {
		t.Fatal("expected a new batch after completion")
	}
	if status := tracker.snapshot(); status.Trigger != SiteBatchTriggerImport || status.Total != 2 || !status.Running {
		t.Fatalf("unexpected second batch status: %+v", status)
	}
	secondSummary.finish()
	second.finish(secondSummary)
}
