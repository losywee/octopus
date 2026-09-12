'use client';

import { useMemo, useState } from 'react';
import { BookMarked, FolderTree, Plus, Sparkles, Waypoints } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { GroupCard } from './Card';
import { PublicModelDialog } from './PublicModelDialog';
import { usePublicModelPending, useSeedPublicModels } from '@/api/endpoints/public-model';
import { useGroupList, useRunGroupAutoGroup } from '@/api/endpoints/group';
import { toast } from '@/components/common/Toast';
import { useSearchStore, useToolbarViewOptionsStore } from '@/components/modules/toolbar';
import { VirtualizedGrid } from '@/components/common/VirtualizedGrid';
import { Button } from '@/components/ui/button';
import { MorphingDialog, MorphingDialogContainer, MorphingDialogContent } from '@/components/ui/morphing-dialog';
import { CreateDialogContent as GroupCreateContent } from '@/components/modules/group/Create';
import { GroupAutoGroupDialogContent } from '@/components/modules/group/AutoGroupDialog';
import { useNavStore } from '@/components/modules/navbar';
import { cn } from '@/lib/utils';
import { inferModelFamily, MODEL_FAMILY_OPTIONS, type ModelFamilyId } from '@/lib/model-family';

export function Group() {
    const { data: groups, isLoading } = useGroupList();
    const pageKey = 'group' as const;
    const searchTerm = useSearchStore((s) => s.getSearchTerm(pageKey));
    const sortField = useToolbarViewOptionsStore((s) => s.getSortField(pageKey));
    const sortOrder = useToolbarViewOptionsStore((s) => s.getSortOrder(pageKey));
    const setActiveItem = useNavStore((s) => s.setActiveItem);
    const t = useTranslations('group');
    const [createOpen, setCreateOpen] = useState(false);
    const [autoGroupOpen, setAutoGroupOpen] = useState(false);
    const [dictOpen, setDictOpen] = useState(false);
    const { data: pendingModels } = usePublicModelPending(true);
    const pendingCount = pendingModels?.length ?? 0;
    const seedMut = useSeedPublicModels();
    const runAutoGroup = useRunGroupAutoGroup();
    const seedAndApply = async () => {
        try {
            const r = await seedMut.mutateAsync();
            await runAutoGroup.mutateAsync({});
            toast.success(`预置 ${r.created} 个规范名，并已重新自动分组`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '预置/入组失败';
            toast.error(msg);
        }
    };
    const [family, setFamily] = useState<ModelFamilyId>('all');

    const sortedGroups = useMemo(() => {
        if (!groups) return [];
        return [...groups].sort((a, b) => {
            if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
            if (a.pinned && b.pinned) {
                const ta = a.pinned_at ? new Date(a.pinned_at).getTime() : 0;
                const tb = b.pinned_at ? new Date(b.pinned_at).getTime() : 0;
                if (ta !== tb) return tb - ta;
            }
            const diff = sortField === 'name'
                ? a.name.localeCompare(b.name)
                : (a.id || 0) - (b.id || 0);
            return sortOrder === 'asc' ? diff : -diff;
        });
    }, [groups, sortField, sortOrder]);

    const familyCounts = useMemo(() => {
        const counts: Partial<Record<ModelFamilyId, number>> = { all: sortedGroups.length };
        for (const g of sortedGroups) {
            const f = inferModelFamily(g.name);
            counts[f] = (counts[f] ?? 0) + 1;
        }
        return counts;
    }, [sortedGroups]);

    const visibleGroups = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        return sortedGroups.filter((g) => {
            if (family !== 'all' && inferModelFamily(g.name) !== family) return false;
            if (!term) return true;
            return g.name.toLowerCase().includes(term);
        });
    }, [sortedGroups, searchTerm, family]);

    const dialogs = (
        <>
            <MorphingDialog open={createOpen} onOpenChange={setCreateOpen}>
                <MorphingDialogContainer>
                    <MorphingDialogContent className="flex max-h-[calc(100vh-2rem)] w-fit max-w-full flex-col overflow-hidden rounded-3xl bg-card px-6 py-4 text-card-foreground custom-shadow">
                        <GroupCreateContent />
                    </MorphingDialogContent>
                </MorphingDialogContainer>
            </MorphingDialog>
            <MorphingDialog open={autoGroupOpen} onOpenChange={setAutoGroupOpen}>
                <MorphingDialogContainer>
                    <MorphingDialogContent className="flex max-h-[calc(100vh-2rem)] w-fit max-w-full flex-col overflow-hidden rounded-3xl bg-card px-6 py-4 text-card-foreground custom-shadow">
                        <GroupAutoGroupDialogContent />
                    </MorphingDialogContent>
                </MorphingDialogContainer>
            </MorphingDialog>
            <PublicModelDialog open={dictOpen} onOpenChange={setDictOpen} />
        </>
    );

    const shell = (body: React.ReactNode) => (
        <div className="flex h-full min-h-0 flex-col gap-3 pb-24 md:pb-4">
            <section className="flex-none rounded-3xl border border-border/70 bg-card/80 p-3 sm:p-4 custom-shadow">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">路由工作台</div>
                        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                            对外分组名 = 客户端 <span className="font-mono">model</span>。
                            上游杂乱 id 通过「规范模型/别名」归入同一分组；自动分组优先用别名，再回退归一化。
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" className="h-8 rounded-2xl" onClick={() => setCreateOpen(true)}>
                            <Plus className="size-3.5" />
                            新建分组
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 rounded-2xl" onClick={() => setAutoGroupOpen(true)}>
                            <Sparkles className="size-3.5" />
                            自动分组
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-8 rounded-2xl"
                            disabled={seedMut.isPending || runAutoGroup.isPending}
                            onClick={() => void seedAndApply()}
                        >
                            {seedMut.isPending || runAutoGroup.isPending ? '处理中…' : '预置+入组'}
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 rounded-2xl" onClick={() => setDictOpen(true)}>
                            <BookMarked className="size-3.5" />
                            规范/别名
                            {pendingCount > 0 ? (
                                <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                    {pendingCount}
                                </span>
                            ) : null}
                        </Button>
                    </div>
                </div>

                <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
                    {MODEL_FAMILY_OPTIONS.map((opt) => {
                        const count = familyCounts[opt.id] ?? 0;
                        if (opt.id !== 'all' && count === 0) return null;
                        const active = family === opt.id;
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => setFamily(opt.id)}
                                className={cn(
                                    'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition',
                                    active
                                        ? 'border-primary/40 bg-primary/10 text-primary'
                                        : 'border-border/70 bg-background/70 text-muted-foreground hover:bg-muted/50',
                                )}
                            >
                                {opt.label}
                                <span className="ml-1 tabular-nums opacity-70">{count}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <div className="min-h-0 flex-1">{body}</div>
            {dialogs}
        </div>
    );

    if (!isLoading && (groups?.length ?? 0) === 0) {
        return shell(
            <div className="flex h-full min-h-[20rem] items-center justify-center p-4">
                <div className="w-full max-w-lg rounded-3xl border border-dashed border-border/80 bg-card/70 p-8 text-center">
                    <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Waypoints className="size-7" />
                    </div>
                    <h2 className="text-xl font-semibold text-foreground">{t('emptyState.title')}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('emptyState.description')}</p>
                    <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                        <Button className="rounded-2xl" onClick={() => setCreateOpen(true)}>
                            <Plus className="size-4" />
                            {t('emptyState.create')}
                        </Button>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setDictOpen(true)}>
                            <BookMarked className="size-4" />
                            先建规范名
                        </Button>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setAutoGroupOpen(true)}>
                            <Sparkles className="size-4" />
                            {t('emptyState.autoGroup')}
                        </Button>
                        <Button variant="ghost" className="rounded-2xl" onClick={() => setActiveItem('site')}>
                            <FolderTree className="size-4" />
                            {t('emptyState.goConnect')}
                        </Button>
                    </div>
                </div>
            </div>,
        );
    }

    if (visibleGroups.length === 0) {
        return shell(
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-3xl border border-dashed border-border/70 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
                当前厂商筛选/搜索下没有分组
            </div>,
        );
    }

    return shell(
        <VirtualizedGrid
            items={visibleGroups}
            columns={{ default: 1, md: 2, lg: 3 }}
            estimateItemHeight={520}
            getItemKey={(group, index) => group.id ?? `group-${index}`}
            renderItem={(group) => <GroupCard group={group} />}
        />,
    );
}
