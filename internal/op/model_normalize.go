package op

import (
	"regexp"
	"strings"
)

// Known provider prefixes stripped from "provider/model" style names.
// Comparison is case-insensitive; the longest matching prefix wins only via
// the first path segment, not free-form substring replacement.
var autoGroupProviderPrefixes = map[string]struct{}{
	"openai": {}, "anthropic": {}, "google": {}, "gemini": {}, "meta": {},
	"meta-llama": {}, "mistral": {}, "mistralai": {}, "deepseek": {},
	"qwen": {}, "alibaba": {}, "dashscope": {}, "zhipu": {}, "zhihu": {},
	"cohere": {}, "groq": {}, "xai": {}, "perplexity": {}, "together": {},
	"fireworks": {}, "openrouter": {}, "azure": {}, "aws": {}, "bedrock": {},
	"vertex": {}, "vertex_ai": {}, "huggingface": {}, "moonshot": {},
	"minimax": {}, "baichuan": {}, "yi": {}, "01-ai": {}, "lingyiwanwu": {},
}

// Date / snapshot suffixes commonly appended by providers.
// - 2024-08-06
// - 20240806
// - 2024-08-06-preview (keep trailing label? we strip only pure date tail)
var (
	reISODateSuffix   = regexp.MustCompile(`(?i)-(\d{4})-(\d{2})-(\d{2})$`)
	reCompactDateSuf  = regexp.MustCompile(`(?i)-(\d{8})$`)
	reSnapshotDateSuf = regexp.MustCompile(`(?i)-(\d{4})-(\d{2})-(\d{2})-(preview|latest|exp|experimental|beta|alpha)$`)
)

// NormalizePublicModelName derives a stable public-group candidate from an
// upstream model id. It is intentionally conservative:
//  1. trim space
//  2. strip a single known "provider/" or "provider:" prefix
//  3. strip trailing date / dated-preview snapshot suffixes
//
// The result is not lowercased (callers compare with EqualFold). Empty input
// yields empty output.
func NormalizePublicModelName(name string) string {
	s := strings.TrimSpace(name)
	if s == "" {
		return ""
	}
	s = stripProviderPrefix(s)
	s = stripTrailingDateSuffix(s)
	s = normalizeVersionDots(s)
	return strings.TrimSpace(s)
}

// normalizeVersionDots turns single-digit major-minor segments into dotted form:
// claude-3-5-sonnet → claude-3.5-sonnet, gpt-4-1-mini → gpt-4.1-mini.
// Only matches -N-M- or -N-M$ where N and M are single digits to avoid dates.
var reVersionDash = regexp.MustCompile(`(?i)(^|-)(\d)-(\d)(-|$)`)

func normalizeVersionDots(s string) string {
	// Apply repeatedly for rare double occurrences.
	for i := 0; i < 3; i++ {
		next := reVersionDash.ReplaceAllString(s, `${1}${2}.${3}${4}`)
		if next == s {
			break
		}
		s = next
	}
	return s
}

// PublicModelNamesMatch reports whether a channel model should exact-match a
// public group name, optionally after normalization.
func PublicModelNamesMatch(modelName, groupName string, normalize bool) bool {
	modelName = strings.TrimSpace(modelName)
	groupName = strings.TrimSpace(groupName)
	if modelName == "" || groupName == "" {
		return false
	}
	if strings.EqualFold(modelName, groupName) {
		return true
	}
	if !normalize {
		return false
	}
	left := NormalizePublicModelName(modelName)
	right := NormalizePublicModelName(groupName)
	if left == "" || right == "" {
		return false
	}
	return strings.EqualFold(left, right)
}

func stripProviderPrefix(s string) string {
	// openrouter-style "openai/gpt-4o" or "openai:gpt-4o"
	sep := -1
	for i, r := range s {
		if r == '/' || r == ':' {
			sep = i
			break
		}
	}
	if sep <= 0 || sep >= len(s)-1 {
		return s
	}
	prefix := strings.ToLower(strings.TrimSpace(s[:sep]))
	if _, ok := autoGroupProviderPrefixes[prefix]; !ok {
		return s
	}
	return strings.TrimSpace(s[sep+1:])
}

func stripTrailingDateSuffix(s string) string {
	// Prefer dated preview first so "gpt-4o-2024-08-06-preview" → "gpt-4o"
	if loc := reSnapshotDateSuf.FindStringIndex(s); loc != nil {
		return s[:loc[0]]
	}
	if loc := reISODateSuffix.FindStringIndex(s); loc != nil {
		return s[:loc[0]]
	}
	if loc := reCompactDateSuf.FindStringIndex(s); loc != nil {
		// Avoid stripping short numeric tails that are not 8-digit dates
		// (regex already enforces 8 digits).
		return s[:loc[0]]
	}
	return s
}
