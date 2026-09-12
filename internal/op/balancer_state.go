package op

var resetRelayBalancerStateForChannel func(int)

func RegisterRelayBalancerStateReset(fn func(int)) {
	resetRelayBalancerStateForChannel = fn
}

func resetBalancerStateForChannel(channelID int) {
	if channelID <= 0 {
		return
	}
	// Runtime dashboards: drop stale 1h fail-rate samples so "state" matches post-edit reality.
	StatsChannelRecentClear(channelID)
	if resetRelayBalancerStateForChannel != nil {
		resetRelayBalancerStateForChannel(channelID)
	}
}

func resetBalancerStateForChannels(channelIDs ...int) {
	if len(channelIDs) == 0 {
		return
	}
	seen := make(map[int]struct{}, len(channelIDs))
	for _, channelID := range channelIDs {
		if channelID <= 0 {
			continue
		}
		if _, ok := seen[channelID]; ok {
			continue
		}
		seen[channelID] = struct{}{}
		// Always go through the single-channel path so recent-health + circuit/sticky stay in sync.
		resetBalancerStateForChannel(channelID)
	}
}
