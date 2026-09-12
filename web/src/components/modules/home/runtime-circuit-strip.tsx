'use client';

import { useRuntimeOverview } from '@/api/endpoints/runtime';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Activity, ShieldAlert, TrendingDown } from 'lucide-react';
import { useNavStore } from '@/components/modules/navbar';
import { useToolbarViewOptionsStore } from '@/components/modules/toolbar/view-options-store';

function stateLabel(state: string) {
    switch (state) {
        case 'open':
            return '熔断中';
        case 'half_open':
            return '半开试探';
        case 'closed':
            return '已恢复';
        default:
            return state;
    }
}

function stateClass(state: string) {
    switch (state) {
        case 'open':
            return 'border-destructive/30 bg-destructive/10 text-destructive';
        case 'half_open':
            return 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200';
        default:
            return 'border-border/70 bg-muted/40 text-muted-foreground';
    }
}

function failRateClass(rate: number) {
    if (rate >= 50) return 'text-destructive';
    if (rate >= 20) return 'text-amber-700 dark:text-amber-300';
    return 'text-muted-foreground';
}

/** Compact runtime strip: circuits + channel fail rates (home page). */
export function RuntimeCircuitStrip() {
    const setActiveItem = useNavStore((s) => s.setActiveItem);
    const setLogStatus = useToolbarViewOptionsStore((s) => s.setLogStatus);
    const { data, isLoading, error, refetch, isFetching } = useRuntimeOverview(true);
    const circuits = data?.circuits ?? [];
    const health = data?.channel_health ?? [];
    const open = data?.open_circuits ?? 0;
    const half = data?.half_open_circuits ?? 0;
    const unhealthy = data?.unhealthy_count ?? 0;
    const stickyCount = data?.sticky_count ?? 0;

    if (isLoading && !data) {
        return null;
    }
    if (error) {
        return null;
    }

    const idle = open === 0 && half === 0 && health.length === 0;
    if (idle) {
        return (
            <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
                <Activity className="size-3.5" />
                运行态：当前无熔断/高失败率渠道（编辑渠道后会自动刷新）
            </div>
        );
    }

    return (
        <div className="space-y-3 rounded-2xl border border-border/70 bg-card/70 p-3">
            <div className="flex flex-wrap items-center gap-2">
                <ShieldAlert className="size-4 text-amber-600" />
                <span className="text-sm font-medium text-foreground">运行态</span>
                {open > 0 ? (
                    <Badge variant="outline" className={cn('rounded-full', stateClass('open'))}>
                        熔断 {open}
                    </Badge>
                ) : null}
                {half > 0 ? (
                    <Badge variant="outline" className={cn('rounded-full', stateClass('half_open'))}>
                        半开 {half}
                    </Badge>
                ) : null}
                {unhealthy > 0 ? (
                    <Badge variant="outline" className="rounded-full border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200">
                        高失败 {unhealthy}
                    </Badge>
                ) : null}
                {stickyCount > 0 ? (
                    <Badge variant="outline" className="rounded-full border-border/70 bg-muted/40 text-muted-foreground">
                        粘性 {stickyCount}
                    </Badge>
                ) : null}
                <button
                    type="button"
                    onClick={() => void refetch()}
                    className="ml-auto rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/50"
                >
                    {isFetching ? '刷新中…' : '刷新状态'}
                </button>
            </div>

            {circuits.length > 0 ? (
                <div>
                    <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">熔断器</div>
                    <div className="max-h-36 space-y-1.5 overflow-y-auto">
                        {circuits.slice(0, 12).map((c) => (
                            <div
                                key={`${c.channel_id}-${c.channel_key_id}-${c.model_name}-${c.state}`}
                                className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-background/60 px-2.5 py-1.5 text-xs"
                            >
                                <div className="min-w-0">
                                    <div className="truncate font-medium text-foreground">
                                        {c.channel_name || `渠道 #${c.channel_id}`}
                                        <span className="ml-1.5 font-normal text-muted-foreground">· {c.model_name}</span>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">
                                        连续失败 {c.consecutive_failures} · 触发 {c.trip_count}
                                        {c.remaining_cooldown_ms > 0
                                            ? ` · 剩余 ${Math.ceil(c.remaining_cooldown_ms / 1000)}s`
                                            : ''}
                                    </div>
                                </div>
                                <Badge variant="outline" className={cn('shrink-0 rounded-full', stateClass(c.state))}>
                                    {stateLabel(c.state)}
                                </Badge>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {health.length > 0 ? (
                <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <TrendingDown className="size-3.5" />
                        {`渠道失败率（近 ${data?.health_window || health[0]?.window || '1h'}）`}
                    </div>
                    <div className="max-h-36 space-y-1.5 overflow-y-auto">
                        {health.slice(0, 10).map((h) => (
                            <button
                                type="button"
                                key={h.channel_id}
                                onClick={() => {
                                    setLogStatus('error');
                                    setActiveItem('log');
                                }}
                                className="flex w-full items-center justify-between gap-2 rounded-xl border border-border/50 bg-background/60 px-2.5 py-1.5 text-left text-xs transition hover:bg-muted/40"
                            >
                                <div className="min-w-0">
                                    <div className="truncate font-medium text-foreground">
                                        {h.channel_name || `渠道 #${h.channel_id}`}
                                        {!h.enabled ? (
                                            <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">已停用</span>
                                        ) : null}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">
                                        成功 {h.request_success} · 失败 {h.request_failed} · 共 {h.total_requests}
                                    </div>
                                </div>
                                <span className={cn('shrink-0 tabular-nums text-sm font-semibold', failRateClass(h.fail_rate))}>
                                    {h.fail_rate.toFixed(0)}%
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
