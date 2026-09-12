'use client';

import { CircleAlert } from 'lucide-react';
import type { SiteChannelGroup } from '@/api/endpoints/site-channel';
import { Button } from '@/components/ui/button';

type Props = {
    activeGroup: SiteChannelGroup | null;
    projectionSuspended: boolean;
    projectionStale: boolean;
    suspensionReason: string;
    staleReason: string;
    missingKeyGuidePending: boolean;
    onOpenMissingKeyGuide: (group: SiteChannelGroup) => void;
};

/** Banners for the currently selected upstream group status. */
export function GroupStatusAlerts({
    activeGroup,
    projectionSuspended,
    projectionStale,
    suspensionReason,
    staleReason,
    missingKeyGuidePending,
    onOpenMissingKeyGuide,
}: Props) {
    if (projectionSuspended) {
        return (
            <div className="flex flex-col gap-2 rounded-2xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-2">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0">
                        <div className="font-medium">该上游分组投影已暂停</div>
                        <div className="mt-0.5 break-words text-destructive/80">
                            {suspensionReason ||
                                '该分组缺少可用源密钥或上游当前无可用模型。补齐源密钥并同步成功后会自动恢复投影。'}
                        </div>
                    </div>
                </div>
                {activeGroup && !activeGroup.has_keys ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 rounded-xl border-destructive/30 bg-background/70 px-2 text-xs text-destructive hover:bg-background"
                        onClick={() => onOpenMissingKeyGuide(activeGroup)}
                        disabled={missingKeyGuidePending}
                    >
                        补齐源密钥
                    </Button>
                ) : null}
            </div>
        );
    }

    if (activeGroup && !activeGroup.has_keys) {
        return (
            <div className="flex flex-col gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-2">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0">
                        <div className="font-medium">该上游分组缺少源密钥</div>
                        <div className="mt-0.5 break-words text-amber-800/80 dark:text-amber-100/80">
                            需要上游站点的调用 Token 才能投影成可转发渠道。可快捷创建、粘贴已有密钥，或暂时不投影。
                        </div>
                    </div>
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 rounded-xl border-amber-500/30 bg-background/70 px-2 text-xs text-amber-800 hover:bg-background dark:text-amber-200"
                    onClick={() => onOpenMissingKeyGuide(activeGroup)}
                    disabled={missingKeyGuidePending}
                >
                    去处理
                </Button>
            </div>
        );
    }

    if (projectionStale) {
        return (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0">
                    <div className="font-medium">该上游分组正在沿用上次成功投影</div>
                    <div className="mt-0.5 break-words text-amber-800/80 dark:text-amber-100/80">
                        {staleReason || '最近一次同步未能确认最新模型，当前托管渠道保持启用。'}
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
