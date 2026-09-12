'use client';

import {
    Check,
    CirclePause,
    MoreHorizontal,
    Plus,
    RefreshCw,
    Search,
    Settings,
    SlidersHorizontal,
    Waypoints,
} from 'lucide-react';
import type { SiteChannelAccount, SiteChannelGroup } from '@/api/endpoints/site-channel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
    getGroupStatusBadge,
    QUICK_FILTER_OPTIONS,
    SITE_GROUP_FILTER_ALL_VALUE,
    STALE_MODEL_SYNC_STATUSES,
} from './model-helpers';
import type { SiteChannelQuickFilter } from './ui-store';

type Props = {
    account: SiteChannelAccount;
    activeGroup: SiteChannelGroup | null;
    activeGroupValue: string;
    activeGroupLabel: string;
    activeGroupProjectionSuspended: boolean;
    activeGroupSuspensionReason: string;
    modelSearchTerm: string;
    activeQuickFilterCount: number;
    quickFilters: SiteChannelQuickFilter[];
    compactMode: boolean;
    projectionTogglePending: boolean;
    resetRoutesPending: boolean;
    hasPendingChanges: boolean;
    onGroupFilterChange: (value: string) => void;
    onSearchChange: (value: string) => void;
    onAddManualModels: () => void;
    onToggleProjection: () => void;
    onToggleQuickFilter: (key: SiteChannelQuickFilter) => void;
    onClearQuickFilters: () => void;
    onOpenAdvanced: () => void;
    onToggleCompactMode: () => void;
    onResetRoutes: () => void;
};

/** Group select + search + primary action buttons for a site account panel. */
export function AccountToolbar({
    account,
    activeGroup,
    activeGroupValue,
    activeGroupLabel,
    activeGroupProjectionSuspended,
    activeGroupSuspensionReason,
    modelSearchTerm,
    activeQuickFilterCount,
    quickFilters,
    compactMode,
    projectionTogglePending,
    resetRoutesPending,
    hasPendingChanges,
    onGroupFilterChange,
    onSearchChange,
    onAddManualModels,
    onToggleProjection,
    onToggleQuickFilter,
    onClearQuickFilters,
    onOpenAdvanced,
    onToggleCompactMode,
    onResetRoutes,
}: Props) {
    return (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={activeGroupValue} onValueChange={onGroupFilterChange}>
                    <SelectTrigger className="h-8 w-full rounded-2xl border-border/70 bg-background/80 sm:w-[18rem]">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="text-xs text-muted-foreground">上游分组</span>
                            <span className="truncate text-sm font-medium">{activeGroupLabel}</span>
                        </div>
                    </SelectTrigger>
                    <SelectContent align="start" className="rounded-2xl border border-border/70 bg-card">
                        <SelectItem value={SITE_GROUP_FILTER_ALL_VALUE} className="rounded-xl py-2">
                            <div className="flex w-full min-w-0 items-center justify-between gap-3">
                                <span className="truncate">全部上游分组</span>
                                <span className="text-[11px] text-muted-foreground">{account.groups.length} 组</span>
                            </div>
                        </SelectItem>
                        {account.groups.map((group) => {
                            const statusBadge = getGroupStatusBadge(group);
                            return (
                                <SelectItem key={group.group_key} value={group.group_key} className="rounded-xl py-2">
                                    <div className="flex w-full min-w-0 items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate">{group.group_name || group.group_key}</div>
                                            <div className="text-[11px] text-muted-foreground">
                                                {group.models.length} 模型 · 源密钥 {group.enabled_key_count}/{group.key_count}
                                                {group.projection_disabled ? ' · 不投影' : ''}
                                                {group.projection_suspended
                                                    ? ' · 已暂停'
                                                    : STALE_MODEL_SYNC_STATUSES.includes(group.model_sync_status)
                                                      ? ' · 沿用历史'
                                                      : ''}
                                                {group.masked_pending_key_count > 0
                                                    ? ` · 待补全 ${group.masked_pending_key_count}`
                                                    : ''}
                                                {group.has_projected_channel
                                                    ? ` · 投影 ${group.projected_keys.length}`
                                                    : ''}
                                            </div>
                                        </div>
                                        {statusBadge ? (
                                            <span className={statusBadge.className}>{statusBadge.label}</span>
                                        ) : null}
                                    </div>
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>

                <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={modelSearchTerm}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="搜索模型名称、上游分组..."
                        className="h-8 rounded-2xl pl-9"
                    />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className="h-8 rounded-2xl px-3"
                    onClick={onAddManualModels}
                    disabled={!activeGroup}
                    title={activeGroup ? undefined : '请先选择具体上游分组'}
                >
                    <Plus className="size-4" />
                    添加
                </Button>

                <Button
                    type="button"
                    variant="outline"
                    className={cn(
                        'h-8 rounded-2xl px-3',
                        activeGroup?.projection_disabled &&
                            'border-amber-500/30 bg-amber-500/10 text-amber-800 hover:bg-amber-500/15 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100',
                        activeGroupProjectionSuspended &&
                            'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15',
                    )}
                    onClick={onToggleProjection}
                    disabled={!activeGroup || activeGroupProjectionSuspended || projectionTogglePending}
                    title={
                        !activeGroup
                            ? '请先选择具体上游分组'
                            : activeGroupProjectionSuspended
                              ? `系统已暂停投影：${activeGroupSuspensionReason || '最近模型同步失败，请重新同步恢复'}`
                              : activeGroup.projection_disabled
                                ? '恢复生成投影渠道并显示到分组编辑'
                                : '停止生成投影渠道并从分组编辑中移除'
                    }
                >
                    {activeGroupProjectionSuspended ? (
                        <CirclePause className="size-4" />
                    ) : (
                        <Waypoints className={cn('size-4', projectionTogglePending && 'animate-spin')} />
                    )}
                    {activeGroupProjectionSuspended
                        ? '已暂停'
                        : activeGroup?.projection_disabled
                          ? '不投影'
                          : '投影'}
                </Button>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button type="button" variant="outline" className="h-8 rounded-2xl px-3">
                            <SlidersHorizontal className="size-4" />
                            {activeQuickFilterCount > 0 ? `筛选(${activeQuickFilterCount})` : '筛选'}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-60 rounded-2xl border border-border/70 bg-card p-3 shadow-xl">
                        <div className="space-y-3">
                            <div className="text-xs font-medium text-muted-foreground">快速筛选</div>
                            <div className="grid gap-2">
                                {QUICK_FILTER_OPTIONS.map((option) => {
                                    const active = quickFilters.includes(option.key);
                                    return (
                                        <button
                                            key={option.key}
                                            type="button"
                                            onClick={() => onToggleQuickFilter(option.key)}
                                            className={cn(
                                                'flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition',
                                                active
                                                    ? 'border-primary/30 bg-primary/10 text-foreground'
                                                    : 'border-border bg-background hover:bg-muted/60',
                                            )}
                                        >
                                            <span>{option.label}</span>
                                            {active ? <Check className="size-4 text-primary" /> : null}
                                        </button>
                                    );
                                })}
                            </div>
                            {activeQuickFilterCount > 0 ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 rounded-xl px-2"
                                    onClick={onClearQuickFilters}
                                >
                                    清空筛选
                                </Button>
                            ) : null}
                        </div>
                    </PopoverContent>
                </Popover>

                <Button
                    type="button"
                    variant="outline"
                    className="h-8 rounded-2xl px-3"
                    onClick={onOpenAdvanced}
                    disabled={!activeGroup || activeGroup.projected_channels.length === 0}
                    title={
                        !activeGroup
                            ? '请先选择具体上游分组'
                            : activeGroup.projected_channels.length === 0
                              ? '当前上游分组暂无投影渠道'
                              : undefined
                    }
                >
                    <Settings className="size-4" />
                    高级
                </Button>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button type="button" variant="outline" className="h-8 rounded-2xl px-3">
                            <MoreHorizontal className="size-4" />
                            更多
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64 rounded-2xl border border-border/70 bg-card p-2 shadow-xl">
                        <div className="space-y-1">
                            <button
                                type="button"
                                onClick={onToggleCompactMode}
                                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-muted/60"
                            >
                                <div>
                                    <div className="text-sm font-medium text-foreground">紧凑模式</div>
                                    <div className="text-[11px] text-muted-foreground">压缩模型卡片和表格行高</div>
                                </div>
                                {compactMode ? <Check className="size-4 text-primary" /> : null}
                            </button>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            className="mt-2 h-8 w-full justify-start rounded-xl px-3"
                            onClick={onResetRoutes}
                            disabled={resetRoutesPending || hasPendingChanges}
                        >
                            <RefreshCw className={cn('size-4', resetRoutesPending && 'animate-spin')} />
                            {resetRoutesPending ? '重置中...' : '重置模型端点格式'}
                        </Button>
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
}
