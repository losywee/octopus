package balancer

import (
	"strings"
	"testing"

	"github.com/xuanli27/octopus/internal/model"
)

func TestIteratorRecordsRouteReasonOnAttempt(t *testing.T) {
	group := model.Group{
		Mode: model.GroupModeFailover,
		Items: []model.GroupItem{
			{ChannelID: 1, ModelName: "gpt-4o", Priority: 10},
			{ChannelID: 2, ModelName: "gpt-4o", Priority: 1},
		},
	}

	iter := NewIterator(group, 7, "gpt-4o")
	if !iter.Next() {
		t.Fatal("expected first candidate")
	}

	span := iter.StartAttempt(1, 11, "primary")
	span.End(model.AttemptFailed, 500, "upstream 500")

	attempts := iter.Attempts()
	if len(attempts) != 1 {
		t.Fatalf("expected 1 attempt, got %d", len(attempts))
	}
	reason := attempts[0].Reason
	if !strings.Contains(reason, "mode=failover") {
		t.Fatalf("reason missing mode: %q", reason)
	}
	if !strings.Contains(reason, "order=1/2") {
		t.Fatalf("reason missing order: %q", reason)
	}
	if !strings.Contains(reason, "priority=") {
		t.Fatalf("reason missing priority: %q", reason)
	}
	if attempts[0].Msg != "upstream 500" {
		t.Fatalf("msg should remain outcome detail, got %q", attempts[0].Msg)
	}
}

func TestIteratorPreferredStickyReason(t *testing.T) {
	group := model.Group{
		Mode: model.GroupModeRoundRobin,
		Items: []model.GroupItem{
			{ChannelID: 1, ModelName: "m"},
			{ChannelID: 2, ModelName: "m"},
		},
	}
	iter := NewIteratorWithPreference(group, 1, "m", &SessionEntry{ChannelID: 2, ChannelKeyID: 99})
	if !iter.Next() {
		t.Fatal("expected candidate")
	}
	if !iter.IsSticky() {
		t.Fatal("expected sticky preferred candidate first")
	}
	iter.Skip(2, 99, "sticky-ch", "channel disabled")
	attempts := iter.Attempts()
	if len(attempts) != 1 {
		t.Fatalf("expected 1 attempt, got %d", len(attempts))
	}
	if !strings.Contains(attempts[0].Reason, "sticky=replay_or_preference") {
		t.Fatalf("expected sticky preference reason, got %q", attempts[0].Reason)
	}
	if !strings.Contains(attempts[0].Reason, "sticky_key=99") {
		t.Fatalf("expected sticky_key in reason, got %q", attempts[0].Reason)
	}
}

func TestIteratorWeightedReason(t *testing.T) {
	group := model.Group{
		Mode: model.GroupModeWeighted,
		Items: []model.GroupItem{
			{ChannelID: 1, ModelName: "m", Weight: 3},
		},
	}
	iter := NewIterator(group, 1, "m")
	if !iter.Next() {
		t.Fatal("expected candidate")
	}
	span := iter.StartAttempt(1, 1, "ch")
	span.End(model.AttemptSuccess, 200, "")
	reason := iter.Attempts()[0].Reason
	if !strings.Contains(reason, "mode=weighted") || !strings.Contains(reason, "weight=3") {
		t.Fatalf("unexpected weighted reason: %q", reason)
	}
}
