package op

import "testing"

func TestNormalizePublicModelName(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"", ""},
		{"  gpt-4o  ", "gpt-4o"},
		{"gpt-4o-2024-08-06", "gpt-4o"},
		{"gpt-4o-mini-2024-07-18", "gpt-4o-mini"},
		{"gpt-4o-20240806", "gpt-4o"},
		{"gpt-4o-2024-08-06-preview", "gpt-4o"},
		{"openai/gpt-4o", "gpt-4o"},
		{"openai/gpt-4o-2024-08-06", "gpt-4o"},
		{"anthropic/claude-3-5-sonnet-20241022", "claude-3.5-sonnet"},
		{"OpenAI:gpt-4o", "gpt-4o"},
		{"unknown-vendor/foo-bar", "unknown-vendor/foo-bar"}, // unknown prefix kept
		{"gpt-4o", "gpt-4o"},
		{"claude-3-5-sonnet", "claude-3.5-sonnet"},
		{"claude-3.5-sonnet", "claude-3.5-sonnet"},
		{"gpt-4-1-mini", "gpt-4.1-mini"},
	}
	for _, tc := range cases {
		if got := NormalizePublicModelName(tc.in); got != tc.want {
			t.Fatalf("NormalizePublicModelName(%q)=%q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestPublicModelNamesMatch(t *testing.T) {
	if !PublicModelNamesMatch("GPT-4o", "gpt-4o", false) {
		t.Fatal("case-insensitive exact should match without normalize")
	}
	if PublicModelNamesMatch("gpt-4o-2024-08-06", "gpt-4o", false) {
		t.Fatal("dated model should not match without normalize")
	}
	if !PublicModelNamesMatch("gpt-4o-2024-08-06", "gpt-4o", true) {
		t.Fatal("dated model should match with normalize")
	}
	if !PublicModelNamesMatch("openai/gpt-4o", "gpt-4o", true) {
		t.Fatal("provider prefix should match with normalize")
	}
	if PublicModelNamesMatch("openai/gpt-4o", "gpt-4o", false) {
		t.Fatal("provider prefix should not match without normalize")
	}
}
