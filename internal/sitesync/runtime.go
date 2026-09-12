package sitesync

import (
	"sort"
	"sync"
	"time"
)

// SiteSyncRuntimeStatus is the process-local status of the latest site sync
// batch. It describes execution, while account-level results remain in
// SiteAccount.LastSync* fields.
type SiteSyncRuntimeStatus struct {
	Running          bool             `json:"running"`
	JobID            int              `json:"job_id,omitempty"`
	Trigger          SiteBatchTrigger `json:"trigger"`
	StartedAt        *time.Time       `json:"started_at,omitempty"`
	FinishedAt       *time.Time       `json:"finished_at,omitempty"`
	DurationMS       int64            `json:"duration_ms"`
	Total            int              `json:"total"`
	Attempted        int              `json:"attempted"`
	Success          int              `json:"success"`
	Partial          int              `json:"partial"`
	Failed           int              `json:"failed"`
	Skipped          int              `json:"skipped"`
	Warnings         int              `json:"warnings"`
	Canceled         bool             `json:"canceled"`
	CancelReason     SiteBatchReason  `json:"cancel_reason,omitempty"`
	ActiveAccountIDs []int            `json:"active_account_ids,omitempty"`
}

type siteSyncRuntimeTracker struct {
	mu      sync.RWMutex
	running *siteSyncRuntimeRun
	last    SiteSyncRuntimeStatus
}

type siteSyncRuntimeRun struct {
	tracker *siteSyncRuntimeTracker
	active  map[int]struct{}
}

var siteSyncRuntime = newSiteSyncRuntimeTracker()

func newSiteSyncRuntimeTracker() *siteSyncRuntimeTracker {
	return &siteSyncRuntimeTracker{}
}

// begin reserves the single process-local batch slot. Rejecting a second
// batch prevents duplicate full scans when a user clicks manual sync while a
// scheduled/import sync is still running; individual account calls are still
// coalesced by accountSync.
func (t *siteSyncRuntimeTracker) begin(summary *SiteBatchSummary) (*siteSyncRuntimeRun, bool) {
	if summary == nil {
		return nil, false
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.running != nil {
		return nil, false
	}
	run := &siteSyncRuntimeRun{tracker: t, active: make(map[int]struct{})}
	t.running = run
	t.last = runtimeStatusFromSummary(summary, true, nil)
	return run, true
}

func (r *siteSyncRuntimeRun) startAccount(accountID int) {
	if r == nil || r.tracker == nil || accountID <= 0 {
		return
	}
	r.tracker.mu.Lock()
	defer r.tracker.mu.Unlock()
	if r.tracker.running != r {
		return
	}
	r.active[accountID] = struct{}{}
	r.tracker.last = runtimeStatusFromSummaryLocked(r.tracker.last, true, r.active, time.Now())
}

func (r *siteSyncRuntimeRun) finishAccount(accountID int) {
	if r == nil || r.tracker == nil {
		return
	}
	r.tracker.mu.Lock()
	defer r.tracker.mu.Unlock()
	if r.tracker.running != r {
		return
	}
	delete(r.active, accountID)
	r.tracker.last = runtimeStatusFromSummaryLocked(r.tracker.last, true, r.active, time.Now())
}

func (r *siteSyncRuntimeRun) update(summary *SiteBatchSummary) {
	if r == nil || r.tracker == nil || summary == nil {
		return
	}
	r.tracker.mu.Lock()
	defer r.tracker.mu.Unlock()
	if r.tracker.running != r {
		return
	}
	status := runtimeStatusFromSummary(summary, true, nil)
	r.tracker.last = runtimeStatusFromSummaryLocked(status, true, r.active, time.Now())
}

func (r *siteSyncRuntimeRun) finish(summary *SiteBatchSummary) {
	if r == nil || r.tracker == nil || summary == nil {
		return
	}
	r.tracker.mu.Lock()
	defer r.tracker.mu.Unlock()
	if r.tracker.running != r {
		return
	}
	finishedAt := time.Now()
	status := runtimeStatusFromSummary(summary, false, nil)
	status.FinishedAt = timePtr(finishedAt)
	status.DurationMS = summary.Duration.Milliseconds()
	r.tracker.last = status
	r.tracker.running = nil
}

func (t *siteSyncRuntimeTracker) snapshot() SiteSyncRuntimeStatus {
	t.mu.RLock()
	defer t.mu.RUnlock()
	status := t.last
	if t.running == nil {
		status.ActiveAccountIDs = cloneInts(status.ActiveAccountIDs)
		return status
	}
	status.Running = true
	status.ActiveAccountIDs = sortedActiveIDs(t.running.active)
	if status.StartedAt != nil {
		status.DurationMS = time.Since(*status.StartedAt).Milliseconds()
	}
	return status
}

func SiteSyncRuntimeStatusSnapshot() SiteSyncRuntimeStatus {
	return siteSyncRuntime.snapshot()
}

func runtimeStatusFromSummary(summary *SiteBatchSummary, running bool, activeIDs []int) SiteSyncRuntimeStatus {
	if summary == nil {
		return SiteSyncRuntimeStatus{Running: running}
	}
	return SiteSyncRuntimeStatus{
		Running:          running,
		JobID:            summary.JobID,
		Trigger:          summary.Trigger,
		StartedAt:        timePtr(summary.startedAt),
		DurationMS:       summary.Duration.Milliseconds(),
		Total:            summary.Total,
		Attempted:        summary.Attempted,
		Success:          summary.Success,
		Partial:          summary.Partial,
		Failed:           summary.Failed,
		Skipped:          summary.Skipped,
		Warnings:         summary.Warnings,
		Canceled:         summary.Canceled,
		CancelReason:     summary.CancelReason,
		ActiveAccountIDs: cloneInts(activeIDs),
	}
}

func runtimeStatusFromSummaryLocked(status SiteSyncRuntimeStatus, running bool, active map[int]struct{}, now time.Time) SiteSyncRuntimeStatus {
	status.Running = running
	status.ActiveAccountIDs = sortedActiveIDs(active)
	if running && status.StartedAt != nil {
		status.DurationMS = now.Sub(*status.StartedAt).Milliseconds()
	}
	return status
}

func sortedActiveIDs(active map[int]struct{}) []int {
	if len(active) == 0 {
		return nil
	}
	ids := make([]int, 0, len(active))
	for id := range active {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	return ids
}

func cloneInts(values []int) []int {
	if len(values) == 0 {
		return nil
	}
	return append([]int(nil), values...)
}

func timePtr(value time.Time) *time.Time {
	if value.IsZero() {
		return nil
	}
	copy := value
	return &copy
}
