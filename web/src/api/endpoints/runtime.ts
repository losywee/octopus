import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';

export type RuntimeCircuit = {
    channel_id: number;
    channel_name: string;
    channel_key_id: number;
    model_name: string;
    state: 'open' | 'half_open' | 'closed' | string;
    consecutive_failures: number;
    trip_count: number;
    remaining_cooldown_ms: number;
};

export type RuntimeChannelHealth = {
    channel_id: number;
    channel_name: string;
    request_success: number;
    request_failed: number;
    total_requests: number;
    fail_rate: number;
    enabled: boolean;
    window?: string;
};

export type RuntimeStickySession = {
    api_key_id: number;
    request_model: string;
    channel_id: number;
    channel_key_id: number;
    age_ms: number;
};

export type RuntimeOverview = {
    open_circuits: number;
    half_open_circuits: number;
    circuits: RuntimeCircuit[];
    channel_health?: RuntimeChannelHealth[];
    unhealthy_count?: number;
    health_window?: string;
    sticky_sessions?: RuntimeStickySession[];
    sticky_count?: number;
};

export function useRuntimeOverview(enabled = true, channelId?: number) {
    return useQuery({
        queryKey: channelId ? ['runtime', 'overview', channelId] : ['runtime', 'overview'],
        queryFn: async () =>
            apiClient.get<RuntimeOverview>(
                channelId
                    ? `/api/v1/runtime/overview?channel_id=${channelId}`
                    : '/api/v1/runtime/overview',
            ),
        enabled,
        refetchInterval: 15000,
    });
}
