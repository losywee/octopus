package sitesync

import (
	"context"
	"sync"

	"github.com/xuanli27/octopus/internal/model"
)

// accountSyncCoordinator coalesces concurrent sync requests for the same
// account. The first caller owns the execution and its context; later callers
// wait for that result (or stop waiting when their own context is canceled).
// This is intentionally process-local. A durable job/lock is still needed if
// the application is deployed with multiple replicas.
type accountSyncCoordinator struct {
	mu    sync.Mutex
	calls map[int]*accountSyncCall
}

type accountSyncCall struct {
	done   chan struct{}
	result *model.SiteSyncResult
	err    error
}

func newAccountSyncCoordinator() *accountSyncCoordinator {
	return &accountSyncCoordinator{calls: make(map[int]*accountSyncCall)}
}

func (c *accountSyncCoordinator) do(
	ctx context.Context,
	accountID int,
	fn func(context.Context, int) (*model.SiteSyncResult, error),
) (result *model.SiteSyncResult, err error) {
	c.mu.Lock()
	if call, ok := c.calls[accountID]; ok {
		c.mu.Unlock()
		select {
		case <-call.done:
			return call.result, call.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	call := &accountSyncCall{done: make(chan struct{})}
	if c.calls == nil {
		c.calls = make(map[int]*accountSyncCall)
	}
	c.calls[accountID] = call
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		call.result = result
		call.err = err
		delete(c.calls, accountID)
		close(call.done)
		c.mu.Unlock()
	}()

	return fn(ctx, accountID)
}
