'use client';

import { useMemo } from 'react';
import { Cable, ChevronRight, Globe2, KeyRound, RefreshCw, Waypoints } from 'lucide-react';
import { useSiteList, useSiteSyncJobs, useSiteSyncRuntimeStatus } from '@/api/endpoints/site';
import { useSiteChannelList } from '@/api/endpoints/site-channel';
import { useGroupList } from '@/api/endpoints/group';
import { useAPIKeyList } from '@/api/endpoints/apikey';
import { useNavStore } from '@/components/modules/navbar';
import { useChannelTabStore } from '@/components/modules/channel/tab-store';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STEPS = [
    { id: 1, title: '添加站点账号', hint: 'Access Token / 管理凭证', icon: Globe2 },
    { id: 2, title: '同步并补源密钥', hint: '上游分组可调用', icon: KeyRound },
    { id: 3, title: '生成对外分组', hint: '路由页 · 模型名', icon: Waypoints },
    { id: 4, title: '创建访问密钥', hint: '设置 · 给客户端用', icon: Cable },
] as const;

function formatRuntimeTime(value?: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function syncJobStatusLabel(status?: string) {
    switch (status) {
        case 'success':
            return '成功';
        case 'partial':
            return '部分成功';
        case 'failed':
            return '失败';
        case 'canceled':
            return '已取消';
        case 'skipped':
            return '已跳过';
        default:
            return status || '未执行';
    }
}

export function SiteConnectStrip() {
    const { data: sites } = useSiteList();
    const { data: siteCards } = useSiteChannelList({ includeHistory: false });
    const { data: groups } = useGroupList();
    const { data: apiKeys } = useAPIKeyList();
    const { data: syncRuntime } = useSiteSyncRuntimeStatus();
    const { data: syncJobs } = useSiteSyncJobs(5);
    // A blocked/skipped request can be newer than the worker it tried to
    // start. Prefer an active durable job so the strip reflects real progress
    // across multiple application instances.
    const latestSyncJob = syncJobs?.find((job) => job.status === 'queued' || job.status === 'running') ?? syncJobs?.[0];
    const setActiveItem = useNavStore((s) => s.setActiveItem);
    const setChannelTab = useChannelTabStore((s) => s.setActiveTab);

    const progress = useMemo(() => {
        const hasAccounts = (sites ?? []).some((s) => (s.accounts?.length ?? 0) > 0);
        let missingKeys = 0;
        for (const card of siteCards ?? []) {
            for (const acc of card.accounts) {
                for (const g of acc.groups) {
                    if (!g.has_keys && !g.projection_disabled) missingKeys += 1;
                }
            }
        }
        const hasGroups = (groups?.length ?? 0) > 0;
        const hasAccessKey = (apiKeys ?? []).some((k) => k.enabled !== false && !!k.api_key);
        const step1 = hasAccounts;
        const step2Done = hasAccounts && siteCards != null && missingKeys === 0;
        const step3 = hasGroups;
        const step4 = hasAccessKey;
        let active = 1;
        if (!step1) active = 1;
        else if (!step2Done) active = 2;
        else if (!step3) active = 3;
        else if (!step4) active = 4;
        else active = 4;
        return { active, step1, step2Done, step3, step4, missingKeys };
    }, [sites, siteCards, groups, apiKeys]);

    return (
        <section className="mb-4 rounded-3xl border border-border/70 bg-card/80 p-4 custom-shadow">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-sm font-semibold text-foreground">接入进度</div>
                    <div className="text-xs text-muted-foreground">
                        站点 → 源密钥 → 对外分组 → 访问密钥
                        {progress.missingKeys > 0 ? ` · 缺源密钥 ${progress.missingKeys} 组` : ''}
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {syncRuntime?.running ? (
                        <Badge
                            variant="outline"
                            className="gap-1.5 border-primary/30 bg-primary/5 text-primary"
                        >
                            <RefreshCw className="size-3 animate-spin" />
                            同步中 {syncRuntime.attempted}/{syncRuntime.total}
                        </Badge>
                    ) : latestSyncJob?.status === 'queued' ? (
                        <Badge variant="outline" className="gap-1.5 border-amber-500/30 bg-amber-500/5 text-amber-700">
                            <RefreshCw className="size-3" />
                            同步任务排队中
                        </Badge>
                    ) : latestSyncJob?.status === 'running' ? (
                        <Badge
                            variant="outline"
                            className="gap-1.5 border-primary/30 bg-primary/5 text-primary"
                        >
                            <RefreshCw className="size-3 animate-spin" />
                            同步中 {latestSyncJob.attempted}/{latestSyncJob.total}
                        </Badge>
                    ) : latestSyncJob?.status === 'skipped' && latestSyncJob.blocked_by_job_id ? (
                        <span className="text-[11px] text-muted-foreground">
                            已有同步任务 #{latestSyncJob.blocked_by_job_id} 运行中
                        </span>
                    ) : latestSyncJob?.finished_at ? (
                        <span className="text-[11px] text-muted-foreground">
                            最近同步 {formatRuntimeTime(latestSyncJob.finished_at)} · {syncJobStatusLabel(latestSyncJob.status)}
                            {latestSyncJob.failed > 0 ? ` · 失败 ${latestSyncJob.failed}` : ''}
                        </span>
                    ) : syncRuntime?.finished_at ? (
                        <span className="text-[11px] text-muted-foreground">
                            最近同步 {formatRuntimeTime(syncRuntime.finished_at)} · 成功 {syncRuntime.success}
                            {syncRuntime.failed > 0 ? ` · 失败 ${syncRuntime.failed}` : ''}
                        </span>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => {
                            setChannelTab('site');
                            setActiveItem('channel');
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/60"
                    >
                        站点渠道
                        <ChevronRight className="size-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveItem('group')}
                        className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/60"
                    >
                        去路由
                        <ChevronRight className="size-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveItem('setting')}
                        className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/60"
                    >
                        访问密钥
                        <ChevronRight className="size-3.5" />
                    </button>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {STEPS.map((step) => {
                    const Icon = step.icon;
                    const done =
                        (step.id === 1 && progress.step1) ||
                        (step.id === 2 && progress.step2Done) ||
                        (step.id === 3 && progress.step3) ||
                        (step.id === 4 && progress.step4);
                    const current = step.id === progress.active;
                    return (
                        <div
                            key={step.id}
                            className={cn(
                                'rounded-2xl border px-3 py-2.5',
                                done && !current && 'border-emerald-500/25 bg-emerald-500/5',
                                current && 'border-primary/30 bg-primary/5',
                                !done && !current && 'border-border/60 bg-muted/20',
                            )}
                        >
                            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                                <Icon className="size-3.5 shrink-0 opacity-80" />
                                <span>
                                    {step.id}. {step.title}
                                </span>
                            </div>
                            <div className="mt-1 pl-5 text-[11px] text-muted-foreground">{step.hint}</div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
