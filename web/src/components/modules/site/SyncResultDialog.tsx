'use client';

import { useMemo } from 'react';
import {
    CheckCircle2,
    CircleAlert,
    CirclePause,
    ExternalLink,
    KeyRound,
    Layers3,
    XCircle,
} from 'lucide-react';
import type { SiteSyncResult } from '@/api/endpoints/site';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type SyncResultDialogContext = {
    siteName: string;
    accountName: string;
    siteId: number;
    accountId: number;
    result: SiteSyncResult;
};

type GroupResult = SiteSyncResult['group_results'][number];

type GroupTone = 'success' | 'warning' | 'danger' | 'muted';

function overallTone(status: string): GroupTone {
    switch (status) {
        case 'success':
            return 'success';
        case 'partial':
            return 'warning';
        case 'failed':
            return 'danger';
        default:
            return 'muted';
    }
}

function overallLabel(status: string) {
    switch (status) {
        case 'success':
            return '同步成功';
        case 'partial':
            return '部分成功';
        case 'failed':
            return '同步失败';
        case 'skipped':
            return '已跳过';
        default:
            return status || '未知状态';
    }
}

function groupStatusMeta(group: GroupResult): { label: string; tone: GroupTone; hint: string } {
    if (group.projection_suspended || group.status === 'missing_key') {
        if (group.status === 'missing_key' || !group.has_key) {
            return {
                label: '缺源密钥',
                tone: 'warning',
                hint: group.projection_suspend_reason || group.message || '该上游分组没有可用调用密钥，投影已暂停',
            };
        }
        return {
            label: '投影暂停',
            tone: 'danger',
            hint: group.projection_suspend_reason || group.message || '该上游分组投影已暂停',
        };
    }

    switch (group.status) {
        case 'synced':
            return {
                label: '已更新',
                tone: 'success',
                hint: group.message || `确认 ${group.model_count} 个模型`,
            };
        case 'empty':
            return {
                label: '已清空',
                tone: 'muted',
                hint: group.message || '上游当前无可用模型，已清空历史模型',
            };
        case 'removed':
            return {
                label: '已移除',
                tone: 'muted',
                hint: group.message || '上游已不存在该分组',
            };
        case 'unresolved':
            return {
                label: '沿用历史',
                tone: 'warning',
                hint: group.message || '未能确认最新模型，保留上次成功投影',
            };
        case 'failed':
            return {
                label: '失败',
                tone: 'danger',
                hint: group.message || '该分组同步失败',
            };
        case 'missing_key':
            return {
                label: '缺源密钥',
                tone: 'warning',
                hint: group.message || '缺少可用源密钥',
            };
        default:
            return {
                label: group.status || '未知',
                tone: 'muted',
                hint: group.message || '',
            };
    }
}

function toneBadgeClass(tone: GroupTone) {
    switch (tone) {
        case 'success':
            return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        case 'warning':
            return 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200';
        case 'danger':
            return 'border-destructive/30 bg-destructive/10 text-destructive';
        default:
            return 'border-border/70 bg-muted/40 text-muted-foreground';
    }
}

function toneDotClass(tone: GroupTone) {
    switch (tone) {
        case 'success':
            return 'bg-emerald-500';
        case 'warning':
            return 'bg-amber-500';
        case 'danger':
            return 'bg-destructive';
        default:
            return 'bg-muted-foreground/50';
    }
}

function Metric({
    icon: Icon,
    label,
    value,
}: {
    icon: typeof Layers3;
    label: string;
    value: number | string;
}) {
    return (
        <div className="rounded-2xl border border-border/70 bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Icon className="size-3.5" />
                {label}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div>
        </div>
    );
}

function summarizeGroups(groups: GroupResult[]) {
    const counts = {
        synced: 0,
        missingKey: 0,
        suspended: 0,
        stale: 0,
        empty: 0,
        removed: 0,
        failed: 0,
    };

    for (const group of groups) {
        if (group.status === 'missing_key' || (!group.has_key && group.projection_suspended)) {
            counts.missingKey += 1;
            continue;
        }
        if (group.projection_suspended) {
            counts.suspended += 1;
            continue;
        }
        switch (group.status) {
            case 'synced':
                counts.synced += 1;
                break;
            case 'empty':
                counts.empty += 1;
                break;
            case 'removed':
                counts.removed += 1;
                break;
            case 'unresolved':
                counts.stale += 1;
                break;
            case 'failed':
                counts.failed += 1;
                break;
            default:
                break;
        }
    }

    return counts;
}

type Props = {
    open: boolean;
    context: SyncResultDialogContext | null;
    onClose: () => void;
    onGoFixKeys?: (ctx: SyncResultDialogContext) => void;
    onGoRoutes?: (ctx: SyncResultDialogContext) => void;
};

export function SyncResultDialog({ open, context, onClose, onGoFixKeys, onGoRoutes }: Props) {
    const groups = useMemo(
        () => context?.result.group_results ?? [],
        [context?.result.group_results],
    );
    const counts = useMemo(() => summarizeGroups(groups), [groups]);
    const tone = overallTone(context?.result.status ?? '');
    const needsKeyAction = counts.missingKey > 0;
    const canOfferRoutes = !needsKeyAction && (context?.result.channel_count ?? 0) > 0;

    const sortedGroups = useMemo(() => {
        const rank = (group: GroupResult) => {
            if (group.status === 'missing_key' || (!group.has_key && group.projection_suspended)) return 0;
            if (group.projection_suspended || group.status === 'failed') return 1;
            if (group.status === 'unresolved') return 2;
            if (group.status === 'synced') return 3;
            return 4;
        };
        return [...groups].sort((a, b) => {
            const diff = rank(a) - rank(b);
            if (diff !== 0) return diff;
            return (a.group_name || a.group_key).localeCompare(b.group_name || b.group_key);
        });
    }, [groups]);

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-h-[85vh] overflow-hidden rounded-3xl sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                        {tone === 'success' ? (
                            <CheckCircle2 className="size-5 text-emerald-600" />
                        ) : tone === 'danger' ? (
                            <XCircle className="size-5 text-destructive" />
                        ) : (
                            <CircleAlert className="size-5 text-amber-600" />
                        )}
                        {overallLabel(context?.result.status ?? '')}
                    </DialogTitle>
                    <DialogDescription>
                        {context ? (
                            <>
                                站点「{context.siteName}」· 账号「{context.accountName}」
                            </>
                        ) : (
                            '同步结果'
                        )}
                    </DialogDescription>
                </DialogHeader>

                {context ? (
                    <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
                        <div
                            className={cn(
                                'rounded-2xl border px-3 py-2.5 text-sm',
                                toneBadgeClass(tone),
                            )}
                        >
                            {context.result.message || '同步已完成'}
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <Metric icon={Layers3} label="上游分组" value={context.result.group_count} />
                            <Metric icon={KeyRound} label="源密钥" value={context.result.token_count} />
                            <Metric icon={Layers3} label="模型" value={context.result.model_count} />
                            <Metric icon={ExternalLink} label="投影渠道" value={context.result.channel_count} />
                        </div>

                        {groups.length > 0 ? (
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">按上游分组</span>
                                    {counts.synced > 0 ? <Badge variant="outline" className={toneBadgeClass('success')}>更新 {counts.synced}</Badge> : null}
                                    {counts.missingKey > 0 ? <Badge variant="outline" className={toneBadgeClass('warning')}>缺密钥 {counts.missingKey}</Badge> : null}
                                    {counts.suspended > 0 ? <Badge variant="outline" className={toneBadgeClass('danger')}>暂停 {counts.suspended}</Badge> : null}
                                    {counts.stale > 0 ? <Badge variant="outline" className={toneBadgeClass('warning')}>沿用历史 {counts.stale}</Badge> : null}
                                    {counts.empty > 0 ? <Badge variant="outline" className={toneBadgeClass('muted')}>清空 {counts.empty}</Badge> : null}
                                    {counts.removed > 0 ? <Badge variant="outline" className={toneBadgeClass('muted')}>移除 {counts.removed}</Badge> : null}
                                    {counts.failed > 0 ? <Badge variant="outline" className={toneBadgeClass('danger')}>失败 {counts.failed}</Badge> : null}
                                </div>

                                <div className="max-h-[40vh] space-y-2 overflow-y-auto rounded-2xl border border-border/70 bg-card/60 p-2">
                                    {sortedGroups.map((group) => {
                                        const meta = groupStatusMeta(group);
                                        return (
                                            <div
                                                key={group.group_key}
                                                className="rounded-2xl border border-border/60 bg-background/70 px-3 py-2.5"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className={cn('size-2 shrink-0 rounded-full', toneDotClass(meta.tone))} />
                                                            <span className="truncate text-sm font-medium text-foreground">
                                                                {group.group_name || group.group_key}
                                                            </span>
                                                        </div>
                                                        <div className="mt-0.5 pl-4 font-mono text-[11px] text-muted-foreground">
                                                            {group.group_key}
                                                        </div>
                                                    </div>
                                                    <Badge variant="outline" className={cn('shrink-0 rounded-full', toneBadgeClass(meta.tone))}>
                                                        {meta.label}
                                                    </Badge>
                                                </div>
                                                <div className="mt-1.5 pl-4 text-xs leading-5 text-muted-foreground">
                                                    <div>{meta.hint}</div>
                                                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                                                        <span>模型 {group.model_count}</span>
                                                        <span>{group.has_key ? '有源密钥' : '无源密钥'}</span>
                                                        {group.authoritative ? <span>权威同步</span> : <span>非权威</span>}
                                                        {group.projection_suspended ? (
                                                            <span className="inline-flex items-center gap-1 text-destructive">
                                                                <CirclePause className="size-3" />
                                                                投影暂停
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
                                本次同步未返回分组明细
                            </div>
                        )}
                    </div>
                ) : null}

                <DialogFooter className="gap-2 sm:justify-between">
                    <div className="text-xs text-muted-foreground">
                        {needsKeyAction
                            ? '有上游分组缺少调用密钥。可前往站点渠道补齐源密钥。'
                            : '可在站点渠道查看投影与模型详情。'}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose}>
                            关闭
                        </Button>
                        {context && onGoFixKeys ? (
                            <Button
                                type="button"
                                className="rounded-2xl"
                                variant={needsKeyAction ? 'default' : 'secondary'}
                                onClick={() => onGoFixKeys(context)}
                            >
                                <ExternalLink className="size-4" />
                                {needsKeyAction ? '去补齐源密钥' : '查看站点渠道'}
                            </Button>
                        ) : null}
                        {context && canOfferRoutes && onGoRoutes ? (
                            <Button
                                type="button"
                                className="rounded-2xl"
                                onClick={() => onGoRoutes(context)}
                            >
                                生成/查看对外分组
                            </Button>
                        ) : null}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Compact toast-friendly one-liner; detailed breakdown goes into the dialog. */
export function formatSyncResultToast(result: SiteSyncResult) {
    const groups = result.group_results ?? [];
    const counts = summarizeGroups(groups);
    const parts = [result.message || overallLabel(result.status)];
    parts.push(`${result.group_count} 分组`);
    parts.push(`${result.token_count} 源密钥`);
    parts.push(`${result.model_count} 模型`);
    if (counts.missingKey > 0) parts.push(`缺密钥 ${counts.missingKey}`);
    if (counts.suspended > 0) parts.push(`暂停 ${counts.suspended}`);
    if (counts.stale > 0) parts.push(`沿用历史 ${counts.stale}`);
    return parts.join(' · ');
}

export function syncResultNeedsDetail(result: SiteSyncResult) {
    if (result.status === 'failed' || result.status === 'partial') return true;
    const groups = result.group_results ?? [];
    if (groups.length === 0) return false;
    return groups.some(
        (group) =>
            group.projection_suspended ||
            group.status === 'missing_key' ||
            group.status === 'failed' ||
            group.status === 'unresolved' ||
            !group.has_key,
    );
}
