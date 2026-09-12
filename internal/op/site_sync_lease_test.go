package op

import (
	"sync"
	"testing"
	"time"

	"github.com/xuanli27/octopus/internal/model"
)

func TestSiteSyncLeaseAllowsOneLiveOwner(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	firstJob, err := SiteSyncJobCreate(ctx, "sync", "scheduled")
	if err != nil {
		t.Fatalf("create first job: %v", err)
	}
	secondJob, err := SiteSyncJobCreate(ctx, "sync", "manual")
	if err != nil {
		t.Fatalf("create second job: %v", err)
	}
	now := time.Now().UTC()
	lease, acquired, err := SiteSyncLeaseAcquire(ctx, model.SiteSyncLeaseNameGlobal, "owner-a", firstJob.ID, now, time.Minute)
	if err != nil || !acquired {
		t.Fatalf("first acquire: acquired=%v err=%v", acquired, err)
	}
	if lease.JobID != firstJob.ID || lease.Owner != "owner-a" || !lease.ExpiresAt.After(now) {
		t.Fatalf("unexpected first lease: %+v", lease)
	}

	contender, acquired, err := SiteSyncLeaseAcquire(ctx, model.SiteSyncLeaseNameGlobal, "owner-b", secondJob.ID, now.Add(time.Second), time.Minute)
	if err != nil {
		t.Fatalf("contender acquire: %v", err)
	}
	if acquired {
		t.Fatal("a live lease must reject a different owner")
	}
	if contender == nil || contender.Owner != "owner-a" || contender.JobID != firstJob.ID {
		t.Fatalf("contender should observe current owner, got %+v", contender)
	}
}

func TestSiteSyncLeaseExpiredTakeoverFailsPreviousJob(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	oldJob, err := SiteSyncJobCreate(ctx, "sync", "scheduled")
	if err != nil {
		t.Fatalf("create old job: %v", err)
	}
	newJob, err := SiteSyncJobCreate(ctx, "sync", "manual")
	if err != nil {
		t.Fatalf("create new job: %v", err)
	}
	base := time.Now().UTC().Truncate(time.Microsecond)
	oldLease, acquired, err := SiteSyncLeaseAcquire(ctx, model.SiteSyncLeaseNameGlobal, "owner-old", oldJob.ID, base, time.Minute)
	if err != nil || !acquired {
		t.Fatalf("old acquire: acquired=%v err=%v", acquired, err)
	}
	if err := SiteSyncJobMarkRunning(ctx, oldJob.ID, 2, base, "owner-old", oldLease.ExpiresAt); err != nil {
		t.Fatalf("mark old job running: %v", err)
	}

	takeoverAt := base.Add(2 * time.Minute)
	newLease, acquired, err := SiteSyncLeaseAcquire(ctx, model.SiteSyncLeaseNameGlobal, "owner-new", newJob.ID, takeoverAt, time.Minute)
	if err != nil || !acquired {
		t.Fatalf("takeover acquire: acquired=%v err=%v", acquired, err)
	}
	if newLease.Owner != "owner-new" || newLease.JobID != newJob.ID {
		t.Fatalf("unexpected takeover lease: %+v", newLease)
	}
	oldLoaded, err := SiteSyncJobGet(ctx, oldJob.ID)
	if err != nil {
		t.Fatalf("load old job: %v", err)
	}
	if oldLoaded.Status != model.SiteSyncJobStatusFailed || oldLoaded.LeaseOwner != "" || oldLoaded.ErrorMessage == "" {
		t.Fatalf("old job was not fenced during takeover: %+v", oldLoaded)
	}
}

func TestSiteSyncLeaseExpiredTakeoverFailsQueuedPreviousJob(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	oldJob, err := SiteSyncJobCreate(ctx, "sync", "scheduled")
	if err != nil {
		t.Fatalf("create queued old job: %v", err)
	}
	newJob, err := SiteSyncJobCreate(ctx, "sync", "manual")
	if err != nil {
		t.Fatalf("create queued replacement job: %v", err)
	}
	base := time.Now().UTC()
	if _, acquired, err := SiteSyncLeaseAcquire(ctx, model.SiteSyncLeaseNameGlobal, "owner-before-mark", oldJob.ID, base, time.Minute); err != nil || !acquired {
		t.Fatalf("acquire lease before mark-running: acquired=%v err=%v", acquired, err)
	}
	if _, acquired, err := SiteSyncLeaseAcquire(ctx, model.SiteSyncLeaseNameGlobal, "owner-replacement", newJob.ID, base.Add(2*time.Minute), time.Minute); err != nil || !acquired {
		t.Fatalf("take over queued lease: acquired=%v err=%v", acquired, err)
	}
	oldLoaded, err := SiteSyncJobGet(ctx, oldJob.ID)
	if err != nil {
		t.Fatalf("load queued old job: %v", err)
	}
	if oldLoaded.Status != model.SiteSyncJobStatusFailed || oldLoaded.FinishedAt == nil {
		t.Fatalf("queued job was not failed during takeover: %+v", oldLoaded)
	}
}

func TestSiteSyncLeaseRenewAndReleaseRequireOwner(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	job, err := SiteSyncJobCreate(ctx, "sync", "manual")
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	now := time.Now().UTC()
	lease, acquired, err := SiteSyncLeaseAcquire(ctx, model.SiteSyncLeaseNameGlobal, "owner-a", job.ID, now, time.Minute)
	if err != nil || !acquired {
		t.Fatalf("acquire lease: acquired=%v err=%v", acquired, err)
	}
	if err := SiteSyncJobMarkRunning(ctx, job.ID, 1, now, "owner-a", lease.ExpiresAt); err != nil {
		t.Fatalf("mark running: %v", err)
	}

	if _, renewed, err := SiteSyncLeaseRenew(ctx, model.SiteSyncLeaseNameGlobal, "owner-b", job.ID, now.Add(10*time.Second), time.Minute); err != nil || renewed {
		t.Fatalf("wrong owner renew should be rejected: renewed=%v err=%v", renewed, err)
	}
	if _, renewed, err := SiteSyncLeaseRenew(ctx, model.SiteSyncLeaseNameGlobal, "owner-a", job.ID, now.Add(2*time.Minute), time.Minute); err != nil || renewed {
		t.Fatalf("expired lease renew should be rejected: renewed=%v err=%v", renewed, err)
	}
	if released, err := SiteSyncLeaseRelease(ctx, model.SiteSyncLeaseNameGlobal, "owner-b", job.ID, now.Add(10*time.Second)); err != nil || released {
		t.Fatalf("wrong owner release should be rejected: released=%v err=%v", released, err)
	}

	if renewedLease, renewed, err := SiteSyncLeaseRenew(ctx, model.SiteSyncLeaseNameGlobal, "owner-a", job.ID, now.Add(10*time.Second), time.Minute); err != nil || !renewed || !renewedLease.ExpiresAt.After(lease.ExpiresAt) {
		t.Fatalf("correct owner renew failed: lease=%+v renewed=%v err=%v", renewedLease, renewed, err)
	}
	if released, err := SiteSyncLeaseRelease(ctx, model.SiteSyncLeaseNameGlobal, "owner-a", job.ID, now.Add(20*time.Second)); err != nil || !released {
		t.Fatalf("correct owner release failed: released=%v err=%v", released, err)
	}
	current, err := SiteSyncLeaseGet(ctx, model.SiteSyncLeaseNameGlobal)
	if err != nil {
		t.Fatalf("get released lease: %v", err)
	}
	if current.Owner != "" || current.JobID != 0 {
		t.Fatalf("released lease still owned: %+v", current)
	}
}

func TestSiteSyncLeaseConcurrentAcquireHasSingleWinner(t *testing.T) {
	ctx := setupSiteOpTestDB(t)
	const contenders = 8
	jobs := make([]*model.SiteSyncJob, contenders)
	for i := range jobs {
		job, err := SiteSyncJobCreate(ctx, "sync", "scheduled")
		if err != nil {
			t.Fatalf("create contender job %d: %v", i, err)
		}
		jobs[i] = job
	}

	type result struct {
		acquired bool
		err      error
	}
	results := make(chan result, contenders)
	var wg sync.WaitGroup
	for i, job := range jobs {
		wg.Add(1)
		go func(i int, job *model.SiteSyncJob) {
			defer wg.Done()
			_, acquired, err := SiteSyncLeaseAcquire(ctx, model.SiteSyncLeaseNameGlobal, "concurrent-owner-"+string(rune('a'+i)), job.ID, time.Now().UTC(), time.Minute)
			results <- result{acquired: acquired, err: err}
		}(i, job)
	}
	wg.Wait()
	close(results)

	winners := 0
	for got := range results {
		if got.err != nil {
			t.Fatalf("concurrent acquire failed: %v", got.err)
		}
		if got.acquired {
			winners++
		}
	}
	if winners != 1 {
		t.Fatalf("expected exactly one lease winner, got %d", winners)
	}
}
