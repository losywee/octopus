'use client';

import { CircleAlert, KeyRound, Waypoints } from 'lucide-react';
import type { SiteChannelGroup, SiteModelRouteType } from '@/api/endpoints/site-channel';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SITE_ROUTE_COLUMN_ORDER } from './constants';
import type { SiteModelView } from './utils';
import { routeTypeLabel } from './utils';

type Props = {
    groups: SiteChannelGroup[];
    pendingKeyGroups: SiteChannelGroup[];
    projectedGroups: SiteChannelGroup[];
    unsupportedRouteCount: number;
    selectedModels: SiteModelView[];
    bulkMoveTarget: SiteModelRouteType;
    hasPendingChanges: boolean;
    ensurePublicGroupsPending: boolean;
    missingKeyGuidePending: boolean;
    activeMissingKeyGroupKey?: string | null;
    onEnsurePublicGroups: () => void;
    onOpenMissingKeyGuide: (group: SiteChannelGroup) => void;
    onOpenProjectedKeys: (group: SiteChannelGroup) => void;
    onFocusAttention: () => void;
    onBulkMoveTargetChange: (value: SiteModelRouteType) => void;
    onBulkMove: () => void;
    onBulkEnable: () => void;
    onBulkDisable: () => void;
    onClearSelection: () => void;
};

/** Status chips + bulk actions under the account toolbar. */
export function AccountActionChips({
    groups,
    pendingKeyGroups,
    projectedGroups,
    unsupportedRouteCount,
    selectedModels,
    bulkMoveTarget,
    hasPendingChanges,
    ensurePublicGroupsPending,
    missingKeyGuidePending,
    activeMissingKeyGroupKey,
    onEnsurePublicGroups,
    onOpenMissingKeyGuide,
    onOpenProjectedKeys,
    onFocusAttention,
    onBulkMoveTargetChange,
    onBulkMove,
    onBulkEnable,
    onBulkDisable,
    onClearSelection,
}: Props) {
    const selectedVisibleCount = selectedModels.length;
    const hasProjected = groups.some((g) => g.has_projected_channel);
    const hasMaskedPending = groups.some(
        (group) => group.masked_pending_key_count > 0 && group.enabled_key_count === 0,
    );
    const visible =
        pendingKeyGroups.length > 0 ||
        projectedGroups.length > 0 ||
        unsupportedRouteCount > 0 ||
        selectedVisibleCount > 0 ||
        hasProjected;

    if (!visible) return null;

    return (
        <div className="flex min-h-8 flex-wrap items-center gap-2">
            {hasProjected ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    disabled={ensurePublicGroupsPending}
                    onClick={onEnsurePublicGroups}
                >
                    <Waypoints className={cn('size-3.5', ensurePublicGroupsPending && 'animate-spin')} />
                    {ensurePublicGroupsPending ? '生成对外分组中...' : '一键生成对外分组'}
                </Button>
            ) : null}

            {pendingKeyGroups.length > 0 ? (
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className="inline-flex h-8 items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-medium text-amber-800 transition hover:bg-amber-500/15 dark:text-amber-200"
                        >
                            <CircleAlert className="size-3.5" />
                            缺源密钥 {pendingKeyGroups.length} 组
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 rounded-2xl border border-amber-500/30 bg-card p-3 shadow-xl">
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">
                                上游分组缺少调用密钥。可快捷创建、粘贴已有密钥，或暂不投影。
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {pendingKeyGroups.map((group) => (
                                    <Button
                                        key={group.group_key}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full border-amber-500/30 bg-white/60 text-amber-800 hover:bg-white dark:bg-background/40 dark:text-amber-200"
                                        onClick={() => onOpenMissingKeyGuide(group)}
                                        disabled={missingKeyGuidePending}
                                    >
                                        {group.group_name || group.group_key}
                                        <span className="text-[10px] text-amber-700/80 dark:text-amber-200/80">
                                            {missingKeyGuidePending && activeMissingKeyGroupKey === group.group_key
                                                ? '处理中...'
                                                : '去处理'}
                                        </span>
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            ) : null}

            {hasMaskedPending ? (
                <button
                    type="button"
                    onClick={onFocusAttention}
                    className="inline-flex h-8 items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-medium text-amber-800 transition hover:bg-amber-500/15 dark:text-amber-200"
                >
                    <CircleAlert className="size-3.5" />
                    待补全明文源密钥
                </button>
            ) : null}

            {projectedGroups.length > 0 ? (
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className="inline-flex h-8 items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 text-xs font-medium text-foreground transition hover:bg-muted/60"
                        >
                            <KeyRound className="size-3.5 text-primary" />
                            源密钥 {projectedGroups.length} 组
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 rounded-2xl border border-border/70 bg-card p-3 shadow-xl">
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">上游分组源密钥管理</div>
                            <div className="flex flex-wrap gap-2">
                                {projectedGroups.map((group) => (
                                    <Button
                                        key={`projected-${group.group_key}`}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full"
                                        onClick={() => onOpenProjectedKeys(group)}
                                    >
                                        {group.group_name || group.group_key}
                                        <span className="text-[10px] text-muted-foreground">
                                            {group.projected_keys.length} Keys
                                        </span>
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            ) : null}

            {unsupportedRouteCount > 0 ? (
                <button
                    type="button"
                    onClick={onFocusAttention}
                    className="inline-flex h-8 items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-medium text-amber-800 transition hover:bg-amber-500/15 dark:text-amber-200"
                >
                    <CircleAlert className="size-3.5" />
                    未识别端点 {unsupportedRouteCount}
                </button>
            ) : null}

            {selectedVisibleCount > 0 ? (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-foreground">已选 {selectedVisibleCount} 个</span>
                    <Select
                        value={bulkMoveTarget}
                        onValueChange={(value) => onBulkMoveTargetChange(value as SiteModelRouteType)}
                    >
                        <SelectTrigger className="h-7 w-[10rem] rounded-xl text-xs">
                            <SelectValue placeholder="目标端点" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            {SITE_ROUTE_COLUMN_ORDER.map((routeType) => (
                                <SelectItem key={routeType} value={routeType}>
                                    {routeTypeLabel(routeType)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        type="button"
                        size="sm"
                        className="h-7 rounded-xl px-2 text-xs"
                        onClick={onBulkMove}
                        disabled={hasPendingChanges}
                    >
                        移动
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-xl px-2 text-xs"
                        onClick={onBulkEnable}
                        disabled={hasPendingChanges}
                    >
                        启用
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-xl px-2 text-xs"
                        onClick={onBulkDisable}
                        disabled={hasPendingChanges}
                    >
                        停用
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-xl px-2 text-xs"
                        onClick={onClearSelection}
                    >
                        清空
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
