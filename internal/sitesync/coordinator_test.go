package sitesync

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/xuanli27/octopus/internal/model"
)

func TestAccountSyncCoordinatorCoalescesSameAccount(t *testing.T) {
	coordinator := newAccountSyncCoordinator()
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	result := &model.SiteSyncResult{AccountID: 42, Status: model.SiteExecutionStatusSuccess}

	fn := func(context.Context, int) (*model.SiteSyncResult, error) {
		if calls.Add(1) == 1 {
			close(started)
		}
		<-release
		return result, nil
	}

	type outcome struct {
		result *model.SiteSyncResult
		err    error
	}
	outcomes := make(chan outcome, 2)
	go func() {
		got, err := coordinator.do(context.Background(), 42, fn)
		outcomes <- outcome{result: got, err: err}
	}()
	<-started
	go func() {
		got, err := coordinator.do(context.Background(), 42, fn)
		outcomes <- outcome{result: got, err: err}
	}()

	// Give the second goroutine a chance to register as a waiter before the
	// leader is released; the call count must remain one either way.
	time.Sleep(10 * time.Millisecond)
	if got := calls.Load(); got != 1 {
		t.Fatalf("expected one underlying sync, got %d", got)
	}
	close(release)

	for range 2 {
		got := <-outcomes
		if got.err != nil {
			t.Fatalf("coalesced sync returned error: %v", got.err)
		}
		if got.result != result {
			t.Fatalf("expected shared result pointer, got %#v", got.result)
		}
	}
}

func TestAccountSyncCoordinatorAllowsDifferentAccountsToRunInParallel(t *testing.T) {
	coordinator := newAccountSyncCoordinator()
	started := make(chan int, 2)
	release := make(chan struct{})
	var calls atomic.Int32

	fn := func(_ context.Context, accountID int) (*model.SiteSyncResult, error) {
		calls.Add(1)
		started <- accountID
		<-release
		return &model.SiteSyncResult{AccountID: accountID}, nil
	}

	var wg sync.WaitGroup
	for _, accountID := range []int{1, 2} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := coordinator.do(context.Background(), accountID, fn); err != nil {
				t.Errorf("account %d returned error: %v", accountID, err)
			}
		}()
	}

	seen := map[int]bool{}
	for range 2 {
		select {
		case accountID := <-started:
			seen[accountID] = true
		case <-time.After(time.Second):
			t.Fatal("timed out waiting for both accounts to start")
		}
	}
	if len(seen) != 2 || calls.Load() != 2 {
		t.Fatalf("expected two independent underlying syncs, seen=%v calls=%d", seen, calls.Load())
	}
	close(release)
	wg.Wait()
}

func TestAccountSyncCoordinatorWaiterCanCancel(t *testing.T) {
	coordinator := newAccountSyncCoordinator()
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	underlyingErr := errors.New("underlying failure")

	fn := func(_ context.Context, _ int) (*model.SiteSyncResult, error) {
		calls.Add(1)
		close(started)
		<-release
		return nil, underlyingErr
	}

	leaderDone := make(chan error, 1)
	go func() {
		_, err := coordinator.do(context.Background(), 7, fn)
		leaderDone <- err
	}()
	<-started

	waiterCtx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := coordinator.do(waiterCtx, 7, fn); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected waiter context deadline, got %v", err)
	}
	if calls.Load() != 1 {
		t.Fatalf("waiter must not start a second sync, got %d calls", calls.Load())
	}

	close(release)
	if err := <-leaderDone; !errors.Is(err, underlyingErr) {
		t.Fatalf("unexpected leader error: %v", err)
	}
}
