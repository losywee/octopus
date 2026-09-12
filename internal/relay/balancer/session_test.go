package balancer

import (
	"testing"
	"time"
)

func TestDeleteStickyRemovesSession(t *testing.T) {
	Reset()
	SetSticky(1, "gpt-4o", 10, 20)
	if entry := GetSticky(1, "gpt-4o", 60*time.Second); entry == nil || entry.ChannelKeyID != 20 {
		t.Fatalf("expected sticky session to exist before delete, got %#v", entry)
	}

	DeleteSticky(1, "gpt-4o")
	if entry := GetSticky(1, "gpt-4o", 60*time.Second); entry != nil {
		t.Fatalf("expected sticky session to be deleted, got %#v", entry)
	}
}


func TestListStickySnapshotsDropsStale(t *testing.T) {
	Reset()
	SetSticky(1, "fresh", 10, 100)
	globalSession.Store(sessionKey(2, "stale"), &SessionEntry{
		ChannelID:    20,
		ChannelKeyID: 200,
		Timestamp:    time.Now().Add(-25 * time.Hour),
	})
	snaps := ListStickySnapshots(0)
	if len(snaps) != 1 || snaps[0].RequestModel != "fresh" {
		t.Fatalf("expected only fresh sticky, got %+v", snaps)
	}
	if GetSticky(2, "stale", time.Hour) != nil {
		t.Fatal("stale sticky should have been deleted by list")
	}
}

func TestListStickySnapshotsFilterByChannel(t *testing.T) {
	Reset()
	SetSticky(1, "a", 10, 1)
	SetSticky(2, "b", 20, 2)
	snaps := ListStickySnapshots(10)
	if len(snaps) != 1 || snaps[0].ChannelID != 10 {
		t.Fatalf("filter by channel failed: %+v", snaps)
	}
}
