package relay

import (
	"context"
	"fmt"
	"testing"

	"github.com/xuanli27/octopus/internal/model"
	transformerModel "github.com/xuanli27/octopus/internal/transformer/model"
)

func TestIsClientCancellationMatchesWrappedRequestErrors(t *testing.T) {
	ctx := context.Background()

	if !isClientCancellation(ctx, fmt.Errorf("failed to send request: %w", context.Canceled)) {
		t.Fatalf("expected wrapped context.Canceled to be treated as client cancellation")
	}
	if !isClientCancellation(ctx, fmt.Errorf("failed to send request: %w", context.DeadlineExceeded)) {
		t.Fatalf("expected wrapped context.DeadlineExceeded to be treated as client cancellation")
	}
}

func TestIsClientCancellationFallsBackToContextState(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if !isClientCancellation(ctx, fmt.Errorf("upstream request aborted")) {
		t.Fatalf("expected canceled request context to be treated as client cancellation")
	}
}

func TestIsClientCancellationIgnoresOrdinaryErrors(t *testing.T) {
	if isClientCancellation(context.Background(), fmt.Errorf("dial tcp timeout")) {
		t.Fatalf("expected ordinary upstream error to not be treated as client cancellation")
	}
}

func TestIsClientCancellationIgnoresLocalRelayBudgetTimeout(t *testing.T) {
	ctx, cancel := context.WithTimeoutCause(context.Background(), 0, errLocalRelayBudgetExceeded)
	defer cancel()

	<-ctx.Done()
	if isClientCancellation(ctx, contextError(ctx)) {
		t.Fatalf("expected local relay budget timeout to not be treated as client cancellation")
	}
}

func TestStreamResponseCompleted(t *testing.T) {
	stop := "stop"
	empty := ""
	content := "hello world"

	cases := []struct {
		name string
		resp *transformerModel.InternalLLMResponse
		want bool
	}{
		{name: "nil", resp: nil, want: false},
		{name: "no choices", resp: &transformerModel.InternalLLMResponse{}, want: false},
		{
			name: "missing finish_reason without content",
			resp: &transformerModel.InternalLLMResponse{
				Choices: []transformerModel.Choice{{Index: 0}},
			},
			want: false,
		},
		{
			name: "empty finish_reason",
			resp: &transformerModel.InternalLLMResponse{
				Choices: []transformerModel.Choice{{Index: 0, FinishReason: &empty}},
			},
			want: false,
		},
		{
			name: "partial multi-choice",
			resp: &transformerModel.InternalLLMResponse{
				Choices: []transformerModel.Choice{
					{Index: 0, FinishReason: &stop},
					{Index: 1},
				},
			},
			want: false,
		},
		{
			name: "complete finish_reason",
			resp: &transformerModel.InternalLLMResponse{
				Choices: []transformerModel.Choice{{Index: 0, FinishReason: &stop}},
			},
			want: true,
		},
		{
			name: "soft complete content+usage without finish_reason",
			resp: &transformerModel.InternalLLMResponse{
				Choices: []transformerModel.Choice{{
					Index:   0,
					Message: &transformerModel.Message{Content: transformerModel.MessageContent{Content: &content}},
				}},
				Usage: &transformerModel.Usage{PromptTokens: 10, CompletionTokens: 5, TotalTokens: 15},
			},
			want: true,
		},
		{
			name: "content without usage still incomplete",
			resp: &transformerModel.InternalLLMResponse{
				Choices: []transformerModel.Choice{{
					Index:   0,
					Message: &transformerModel.Message{Content: transformerModel.MessageContent{Content: &content}},
				}},
			},
			want: false,
		},
		{
			name: "raw responses output items count as complete",
			resp: &transformerModel.InternalLLMResponse{
				RawResponsesOutputItems: []byte(`[{"id":"item_1"}]`),
			},
			want: true,
		},
	}

	for _, tc := range cases {
		if got := streamResponseCompleted(tc.resp); got != tc.want {
			t.Fatalf("%s: streamResponseCompleted = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestMetricsSuggestCompletedStream(t *testing.T) {
	m := &RelayMetrics{Stats: model.StatsMetrics{InputToken: 10, OutputToken: 5}}
	if !metricsSuggestCompletedStream(m) {
		t.Fatalf("expected usage-only metrics to suggest complete")
	}
	m2 := &RelayMetrics{Stats: model.StatsMetrics{InputToken: 10, OutputToken: 0}}
	if metricsSuggestCompletedStream(m2) {
		t.Fatalf("input without output should not suggest complete")
	}
}
