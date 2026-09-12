'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCompletionStore } from './completion-store';
import {
    ExternalLink,
    KeyRound,
    RefreshCw,
} from 'lucide-react';
import { SiteCard } from './SiteCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VirtualizedGrid } from '@/components/common/VirtualizedGrid';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/common/Toast';
import { cn } from '@/lib/utils';
import type { ToolbarSortField, ToolbarSortOrder } from '@/components/modules/toolbar/view-options-store';
import { useSettingStore } from '@/stores/setting';
import {
    type SiteChannelCard,
    type SiteSourceKeyUpdateRequest,
    useSiteChannelList,
    useUpdateAnySiteSourceKeys,
} from '@/api/endpoints/site-channel';
import { translateSiteMessage } from '../site/site-message';
import {
    type PendingCompletionSite,
    buildSiteTokenManagementUrl,
    collectPendingCompletionSites,
    getErrorMessage,
    isMaskedTokenValue,
    matchesMaskedToken,
    platformLabel,
} from './utils';
import { useJumpStore, type JumpTarget, type PendingJump, type SiteChannelJumpTarget, isSiteChannelJumpTarget } from '@/stores/jump';

type SiteChannelPendingJump = PendingJump & { target: SiteChannelJumpTarget };
type UnifiedCompletionInputState = Record<number, string>;
type UnifiedCompletionErrorState = Record<string, string>;

function makeAccountKey(siteId: number, accountId: number) {
    return `${siteId}:${accountId}`;
}

function UnifiedCompletionDialog({
    open,
    onOpenChange,
    sites,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sites: PendingCompletionSite[];
}) {
    const t = useTranslations();
    const locale = useSettingStore((state) => state.locale);
    const updateSourceKeys = useUpdateAnySiteSourceKeys();
    const [inputValues, setInputValues] = useState<UnifiedCompletionInputState>({});
    const [savingAccounts, setSavingAccounts] = useState<Record<string, boolean>>({});
    const [accountErrors, setAccountErrors] = useState<UnifiedCompletionErrorState>({});

    const totalPendingCount = useMemo(
        () => sites.reduce((sum, site) => sum + site.pending_count, 0),
        [sites],
    );

    useEffect(() => {
        if (!open) return;
        if (totalPendingCount > 0) return;
        onOpenChange(false);
    }, [open, totalPendingCount, onOpenChange]);

    useEffect(() => {
        setInputValues((current) => {
            const validIds = new Set<number>();
            for (const site of sites) {
                for (const account of site.accounts) {
                    for (const item of account.items) {
                        validIds.add(item.key_id);
                    }
                }
            }

            let changed = false;
            const next: UnifiedCompletionInputState = {};
            for (const [rawId, value] of Object.entries(current)) {
                const keyId = Number(rawId);
                if (!validIds.has(keyId)) {
                    changed = true;
                    continue;
                }
                next[keyId] = value;
            }

            return changed ? next : current;
        });

        setSavingAccounts((current) => {
            const validKeys = new Set<string>();
            for (const site of sites) {
                for (const account of site.accounts) {
                    validKeys.add(makeAccountKey(site.site_id, account.account_id));
                }
            }

            let changed = false;
            const next: Record<string, boolean> = {};
            for (const [key, value] of Object.entries(current)) {
                if (!validKeys.has(key)) {
                    changed = true;
                    continue;
                }
                next[key] = value;
            }
            return changed ? next : current;
        });

        setAccountErrors((current) => {
            const validKeys = new Set<string>();
            for (const site of sites) {
                for (const account of site.accounts) {
                    validKeys.add(makeAccountKey(site.site_id, account.account_id));
                }
            }

            let changed = false;
            const next: UnifiedCompletionErrorState = {};
            for (const [key, value] of Object.entries(current)) {
                if (!validKeys.has(key)) {
                    changed = true;
                    continue;
                }
                next[key] = value;
            }
            return changed ? next : current;
        });
    }, [sites]);

    const handleInputChange = useCallback((keyId: number, value: string) => {
        setInputValues((current) => ({
            ...current,
            [keyId]: value,
        }));
    }, []);

    const handleOpenSite = useCallback((site: PendingCompletionSite) => {
        const url = buildSiteTokenManagementUrl(site.base_url, site.platform);
        if (!url) return;
        window.open(url, '_blank', 'noopener,noreferrer');
    }, []);

    const handleSaveAccount = useCallback(async (site: PendingCompletionSite, accountId: number) => {
        const account = site.accounts.find((item) => item.account_id === accountId);
        if (!account) return;

        const accountKey = makeAccountKey(site.site_id, accountId);
        const itemsToSave = account.items.filter((item) => {
            const value = inputValues[item.key_id]?.trim() ?? '';
            return value.length > 0;
        });

        if (itemsToSave.length === 0) {
            setAccountErrors((current) => ({
                ...current,
                [accountKey]: '当前账号没有可提交的待补全 Key',
            }));
            return;
        }

        for (const item of itemsToSave) {
            const value = inputValues[item.key_id]?.trim() ?? '';
            if (!value) continue;
            if (isMaskedTokenValue(value)) {
                setAccountErrors((current) => ({
                    ...current,
                    [accountKey]: `分组「${item.group_name || item.group_key}」仍是脱敏值，必须填写完整 Key`,
                }));
                return;
            }
            if (!matchesMaskedToken(value, item.token)) {
                setAccountErrors((current) => ({
                    ...current,
                    [accountKey]: `分组「${item.group_name || item.group_key}」的 Key 与已同步的脱敏值不匹配，请核对输入`,
                }));
                return;
            }
        }

        const groupedByGroupKey = new Map<string, typeof itemsToSave>();
        for (const item of itemsToSave) {
            const current = groupedByGroupKey.get(item.group_key) ?? [];
            current.push(item);
            groupedByGroupKey.set(item.group_key, current);
        }

        setSavingAccounts((current) => ({ ...current, [accountKey]: true }));
        setAccountErrors((current) => ({ ...current, [accountKey]: '' }));

        try {
            for (const [groupKey, groupItems] of groupedByGroupKey.entries()) {
                const payload: SiteSourceKeyUpdateRequest = {
                    group_key: groupKey,
                    keys_to_update: groupItems.map((item) => ({
                        id: item.key_id,
                        token: inputValues[item.key_id].trim(),
                        enabled: true,
                    })),
                };

                await updateSourceKeys.mutateAsync({
                    siteId: site.site_id,
                    accountId,
                    payload,
                });
            }

            setInputValues((current) => {
                const next = { ...current };
                for (const item of itemsToSave) {
                    delete next[item.key_id];
                }
                return next;
            });
            toast.success(`账号「${account.account_name}」的待补全 Key 已保存并恢复启用`);
        } catch (error) {
            setAccountErrors((current) => ({
                ...current,
                [accountKey]: translateSiteMessage(locale, getErrorMessage(error, `账号「${account.account_name}」保存失败`), t),
            }));
        } finally {
            setSavingAccounts((current) => ({ ...current, [accountKey]: false }));
        }
    }, [inputValues, locale, t, updateSourceKeys]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[min(92vw,72rem)] rounded-[2rem] p-0 sm:max-w-[min(92vw,72rem)]">
                <div className="flex max-h-[88vh] flex-col overflow-hidden">
                    <DialogHeader className="gap-3 border-b border-border/70 px-5 py-4 text-left sm:px-6">
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <KeyRound className="size-5 text-primary" />
                            统一补全 Key
                            <Badge variant="outline" className="h-6 px-2 text-[11px]">{totalPendingCount} 项</Badge>
                        </DialogTitle>
                        <DialogDescription>
                            同步到的脱敏 Key 不能直接继续投影，必须补全文明文 Key 才能恢复可用状态。
                        </DialogDescription>
                        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                            建议一个站点下每个分组只保留一个 Key，只创建自己需要分组的 Key，这样同步和投影会更干净。
                        </div>
                    </DialogHeader>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                        <div className="space-y-4">
                            {sites.map((site) => {
                                const targetUrl = buildSiteTokenManagementUrl(site.base_url, site.platform);

                                return (
                                    <section key={site.site_id} className="rounded-3xl border border-border/70 bg-card/70 p-4">
                                        <div className="flex flex-col gap-3 border-b border-border/60 pb-4 md:flex-row md:items-start md:justify-between">
                                            <div className="min-w-0 space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="truncate text-lg font-semibold text-foreground">{site.site_name}</div>
                                                    <Badge variant="outline" className="h-6 px-2 text-[11px]">
                                                        {platformLabel(site.platform)}
                                                    </Badge>
                                                    <Badge variant="outline" className="h-6 px-2 text-[11px] border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200">
                                                        待补全 {site.pending_count}
                                                    </Badge>
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    站点级跳转用于直接打开该站点的令牌管理页，处理更复杂的 Key 清理或分组治理。
                                                </div>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="rounded-2xl"
                                                onClick={() => handleOpenSite(site)}
                                                disabled={!targetUrl}
                                            >
                                                <ExternalLink className="size-4" />
                                                打开令牌管理
                                            </Button>
                                        </div>

                                        <div className="mt-4 space-y-3">
                                            {site.accounts.map((account) => {
                                                const accountKey = makeAccountKey(site.site_id, account.account_id);
                                                const enteredCount = account.items.filter((item) => {
                                                    const value = inputValues[item.key_id]?.trim() ?? '';
                                                    return value.length > 0;
                                                }).length;
                                                const isSaving = Boolean(savingAccounts[accountKey]);
                                                const accountError = accountErrors[accountKey];

                                                return (
                                                    <div key={account.account_id} className="rounded-2xl border border-border/60 bg-background/70 p-4">
                                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                            <div>
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <div className="text-sm font-semibold text-foreground">{account.account_name}</div>
                                                                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                                                        待补全 {account.items.length}
                                                                    </Badge>
                                                                    {enteredCount > 0 ? (
                                                                        <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-primary/30 bg-primary/10 text-primary">
                                                                            已填写 {enteredCount}
                                                                        </Badge>
                                                                    ) : null}
                                                                </div>
                                                                <div className="mt-1 text-xs text-muted-foreground">
                                                                    仅提交当前账号内已填写完整值的待补全 Key；保存后会自动启用并重新参与投影。
                                                                </div>
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                className="rounded-2xl"
                                                                onClick={() => void handleSaveAccount(site, account.account_id)}
                                                                disabled={isSaving || enteredCount === 0}
                                                            >
                                                                <RefreshCw className={cn('size-4', isSaving && 'animate-spin')} />
                                                                {isSaving ? '保存中...' : '保存本账号'}
                                                            </Button>
                                                        </div>

                                                        {accountError ? (
                                                            <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                                                {accountError}
                                                            </div>
                                                        ) : null}

                                                        <div className="mt-4 space-y-3">
                                                            {account.items.map((item) => (
                                                                <div key={item.key_id} className="rounded-2xl border border-border/60 bg-card/80 p-3">
                                                                    <div className="grid gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,14rem)_1fr]">
                                                                        <div className="space-y-1">
                                                                            <div className="text-xs text-muted-foreground">分组</div>
                                                                            <div className="truncate text-sm font-medium text-foreground">{item.group_name || item.group_key}</div>
                                                                            <div className="text-[11px] text-muted-foreground">{item.group_key}</div>
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <div className="text-xs text-muted-foreground">Key</div>
                                                                            <div className="truncate text-sm font-medium text-foreground">{item.key_name || `站点 Key #${item.key_id}`}</div>
                                                                            <div className="text-[11px] text-muted-foreground">当前值：{item.token_masked || item.token}</div>
                                                                        </div>
                                                                        <label className="grid gap-1.5 text-xs text-muted-foreground">
                                                                            输入完整 Key
                                                                            <Input
                                                                                value={inputValues[item.key_id] ?? ''}
                                                                                onChange={(event) => handleInputChange(item.key_id, event.target.value)}
                                                                                placeholder="填写完整明文 Key，保存后自动启用"
                                                                                disabled={isSaving}
                                                                                className="h-10 rounded-2xl"
                                                                            />
                                                                        </label>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    </div>

                    <DialogFooter className="border-t border-border/70 px-5 py-4 sm:px-6">
                        <Button type="button" variant="outline" className="rounded-2xl" onClick={() => onOpenChange(false)}>
                            关闭
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}



export function SiteChannelCompletionAction() {
    const { data } = useSiteChannelList();
    const [completionDialogOpen, setCompletionDialogOpen] = useState(false);

    const pendingCompletionSites = useMemo(
        () => collectPendingCompletionSites(data ?? []),
        [data],
    );
    const totalPendingCompletionCount = useMemo(
        () => pendingCompletionSites.reduce((sum, site) => sum + site.pending_count, 0),
        [pendingCompletionSites],
    );
    const effectiveCompletionDialogOpen = completionDialogOpen && totalPendingCompletionCount > 0;

    if (totalPendingCompletionCount === 0) return null;

    return (
        <>
            <Button
                type="button"
                variant="outline"
                className="h-10 rounded-2xl px-3"
                onClick={() => setCompletionDialogOpen(true)}
            >
                <KeyRound className="size-4 text-primary" />
                统一补全 Key
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    {totalPendingCompletionCount}
                </Badge>
            </Button>
            <UnifiedCompletionDialog
                open={effectiveCompletionDialogOpen}
                onOpenChange={setCompletionDialogOpen}
                sites={pendingCompletionSites}
            />
        </>
    );
}

// 新增：用于在 SiteChannelSection 中同步状态到 store
export function useCompletionStateSync() {
    const { data } = useSiteChannelList();

    const pendingCompletionSites = useMemo(
        () => collectPendingCompletionSites(data ?? []),
        [data],
    );

    const totalPendingCompletionCount = useMemo(
        () => pendingCompletionSites.reduce((sum, site) => sum + site.pending_count, 0),
        [pendingCompletionSites],
    );

    return { pendingCompletionSites, totalPendingCompletionCount };
}

export function SiteChannelSection({
    searchTerm,
    sortField,
    sortOrder,
    layout,
}: {
    searchTerm: string;
    sortField: ToolbarSortField;
    sortOrder: ToolbarSortOrder;
    layout: 'grid' | 'list';
}) {
    const t = useTranslations();
    const locale = useSettingStore((state) => state.locale);
    const { data, isLoading, error } = useSiteChannelList();
    const pendingJump = useJumpStore((state) => state.pending);
    const clearPending = useJumpStore((state) => state.clearPending);
    const requestJump = useJumpStore((state) => state.requestJump);
    const [highlightedSiteId, setHighlightedSiteId] = useState<number | null>(null);
    const siteCardRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    // 同步补全状态到 store，并暴露对话框控制
    const { pendingCompletionSites, totalPendingCompletionCount } = useCompletionStateSync();
    const setPendingCount = useCompletionStore((s) => s.setPendingCount);
    const completionDialogOpen = useCompletionStore((s) => s.dialogOpen);
    const setCompletionDialogOpen = useCompletionStore((s) => s.setDialogOpen);

    useEffect(() => {
        setPendingCount(totalPendingCompletionCount);
        // 待补全清零时主动关闭对话框，避免残留的 open 状态在新任务到来时自动重开
        if (totalPendingCompletionCount === 0) {
            setCompletionDialogOpen(false);
        }
    }, [totalPendingCompletionCount, setPendingCount, setCompletionDialogOpen]);

    const pendingSiteChannelJump = pendingJump && isSiteChannelJumpTarget(pendingJump.target)
        ? pendingJump as SiteChannelPendingJump
        : null;
    const forcedSiteId = pendingSiteChannelJump?.target.siteId ?? null;

    const registerCardRef = useCallback((siteId: number, node: HTMLDivElement | null) => {
        if (node) {
            siteCardRefs.current.set(siteId, node);
            return;
        }
        siteCardRefs.current.delete(siteId);
    }, []);

    const cards = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        return (data ?? [])
            .filter((card) => card.account_count > 0)
            .filter((card) => {
                if (card.site_id === forcedSiteId) return true;
                if (!term) return true;

                const accountNames = card.accounts.map((account) => account.account_name.toLowerCase());
                return card.site_name.toLowerCase().includes(term) || accountNames.some((name) => name.includes(term));
            })
            .sort((a, b) => {
                // Pin the jump target to the top so the virtualized list keeps
                // it mounted in the initial overscan window. Without this, the
                // jump-to-card useEffect below would no-op when the target is
                // outside the rendered window (registerCardRef never fires for
                // off-screen items, so siteCardRefs.get() returns null).
                if (forcedSiteId !== null) {
                    if (a.site_id === forcedSiteId) return -1;
                    if (b.site_id === forcedSiteId) return 1;
                }
                const diff = sortField === 'name'
                    ? a.site_name.localeCompare(b.site_name)
                    : a.site_id - b.site_id;
                return sortOrder === 'asc' ? diff : -diff;
            });
    }, [data, searchTerm, sortField, sortOrder, forcedSiteId]);
    useEffect(() => {
        if (!pendingSiteChannelJump) return;
        const node = siteCardRefs.current.get(pendingSiteChannelJump.target.siteId);
        if (!node) return;

        const timer = window.setTimeout(() => {
            node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedSiteId(pendingSiteChannelJump.target.siteId);
            window.setTimeout(() => {
                setHighlightedSiteId((current) =>
                    current === pendingSiteChannelJump.target.siteId ? null : current,
                );
            }, 1800);

            if (pendingSiteChannelJump.target.kind === 'site-channel-card') {
                clearPending(pendingSiteChannelJump.requestId);
            }
        }, 80);

        return () => window.clearTimeout(timer);
    }, [pendingSiteChannelJump, clearPending, cards.length]);

    if (isLoading) {
        return (
            <section className={cn('grid gap-4', layout === 'list' ? 'grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-3')}>
                {Array.from({ length: layout === 'list' ? 2 : 3 }).map((_, index) => (
                    <div key={index} className="h-56 animate-pulse rounded-3xl border border-border/70 bg-muted/40" />
                ))}
            </section>
        );
    }

    if (error) {
        return (
            <section className="rounded-3xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                站点渠道加载失败：{translateSiteMessage(locale, error.message, t)}
            </section>
        );
    }

    return (
        <>
            {cards.length > 0 && (
                <SiteChannelGrid
                    cards={cards}
                    layout={layout}
                    pendingSiteChannelJump={pendingSiteChannelJump}
                    highlightedSiteId={highlightedSiteId}
                    registerCardRef={registerCardRef}
                    clearPending={clearPending}
                    requestJump={requestJump}
                />
            )}
            <UnifiedCompletionDialog
                open={completionDialogOpen && totalPendingCompletionCount > 0}
                onOpenChange={setCompletionDialogOpen}
                sites={pendingCompletionSites}
            />
        </>
    );
}

function SiteChannelGrid({
    cards,
    layout,
    pendingSiteChannelJump,
    highlightedSiteId,
    registerCardRef,
    clearPending,
    requestJump,
}: {
    cards: SiteChannelCard[];
    layout: 'grid' | 'list';
    pendingSiteChannelJump: SiteChannelPendingJump | null;
    highlightedSiteId: number | null;
    registerCardRef: (siteId: number, node: HTMLDivElement | null) => void;
    clearPending: (requestId?: number) => void;
    requestJump: (target: JumpTarget) => void;
}) {
    const columnCompute = useCallback((width: number) => {
        if (layout === 'list') return 1;
        const MIN_CARD_WIDTH = 320;
        const GUTTER = 16;
        const cols = Math.floor((width + GUTTER) / (MIN_CARD_WIDTH + GUTTER));
        return Math.max(1, Math.min(6, cols));
    }, [layout]);

    const renderCard = useCallback((card: SiteChannelCard) => (
        <SiteCard
            key={card.site_id}
            card={card}
            layout={layout}
            jumpRequest={pendingSiteChannelJump?.target.siteId === card.site_id ? pendingSiteChannelJump : null}
            highlighted={highlightedSiteId === card.site_id}
            registerCardRef={registerCardRef}
            onJumpHandled={clearPending}
            requestJump={requestJump}
        />
    ), [layout, pendingSiteChannelJump, highlightedSiteId, registerCardRef, clearPending, requestJump]);

    return (
        <VirtualizedGrid
            items={cards}
            layout={layout}
            columns={columnCompute}
            estimateItemHeight={240}
            getItemKey={(card) => `site-channel-${card.site_id}`}
            renderItem={renderCard}
        />
    );
}
