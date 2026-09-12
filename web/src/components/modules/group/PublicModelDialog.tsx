'use client';

import { useMemo, useRef, useState } from 'react';
import { BookMarked, Plus, Sparkles, Trash2 } from 'lucide-react';
import {
    useCreatePublicModel,
    useDeletePublicModel,
    usePublicModelList,
    usePublicModelPending,
    useSeedPublicModels,
    useAssignPublicModelAlias,
    useExportPublicModels,
    useImportPublicModels,
    useUpdatePublicModel,
    type PublicModel,
    type PublicModelPendingItem,
} from '@/api/endpoints/public-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/common/Toast';
import { useRunGroupAutoGroup } from '@/api/endpoints/group';
import { cn } from '@/lib/utils';
import { inferModelFamily } from '@/lib/model-family';

function aliasesText(m: PublicModel) {
    return (m.aliases ?? []).map((a) => a.alias).join(', ');
}

export function PublicModelDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
    const { data: rows, isLoading } = usePublicModelList();
    const { data: pending, isLoading: pendingLoading } = usePublicModelPending(open);
    const createMut = useCreatePublicModel();
    const updateMut = useUpdatePublicModel();
    const deleteMut = useDeletePublicModel();
    const seedMut = useSeedPublicModels();
    const assignMut = useAssignPublicModelAlias();
    const exportMut = useExportPublicModels();
    const importMut = useImportPublicModels();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const runAutoGroup = useRunGroupAutoGroup();

    const [tab, setTab] = useState<'dict' | 'pending'>('dict');
    const [name, setName] = useState('');
    const [aliases, setAliases] = useState('');
    const [note, setNote] = useState('');
    const [editing, setEditing] = useState<PublicModel | null>(null);
    const [dictQuery, setDictQuery] = useState('');

    const sorted = useMemo(() => {
        const q = dictQuery.trim().toLowerCase();
        const list = [...(rows ?? [])].sort((a, b) => a.name.localeCompare(b.name));
        if (!q) return list;
        return list.filter((m) => {
            if (m.name.toLowerCase().includes(q)) return true;
            if ((m.note || '').toLowerCase().includes(q)) return true;
            return (m.aliases ?? []).some((a) => a.alias.toLowerCase().includes(q));
        });
    }, [rows, dictQuery]);

    const applyToGroups = () => {
        runAutoGroup.mutate(
            {},
            {
                onSuccess: () => toast.success('已按字典/归一化重新自动分组'),
                onError: (e) => toast.error(e.message || '自动分组失败'),
            },
        );
    };

    function resetForm() {
        setName('');
        setAliases('');
        setNote('');
        setEditing(null);
    }

    const parseAliases = () =>
        aliases
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean);

    const onSubmit = () => {
        const n = name.trim();
        if (!n) {
            toast.error('请填写规范名（对外 model）');
            return;
        }
        const aliasList = parseAliases();
        if (editing) {
            updateMut.mutate(
                { id: editing.id, name: n, note, aliases: aliasList, enabled: true },
                {
                    onSuccess: () => {
                        toast.success('已更新规范模型');
                        resetForm();
                    },
                    onError: (e) => toast.error(e.message || '更新失败'),
                },
            );
            return;
        }
        createMut.mutate(
            { name: n, note, aliases: aliasList },
            {
                onSuccess: () => {
                    toast.success('已添加规范模型');
                    resetForm();
                },
                onError: (e) => toast.error(e.message || '创建失败'),
            },
        );
    };

    const applyPending = (item: PublicModelPendingItem, asNew: boolean) => {
        const suggested = (item.suggested_public || '').trim();
        if (asNew) {
            setTab('dict');
            setEditing(null);
            setName(suggested || item.upstream);
            setAliases(item.upstream);
            setNote(item.channel_name ? `来自渠道 ${item.channel_name}` : '');
            return;
        }
        // Prefer currently editing public name, then suggestion, then ask user via form.
        const targetName =
            (editing?.name || '').trim() ||
            suggested ||
            sorted.find((m) => m.name.toLowerCase() === item.upstream.toLowerCase())?.name ||
            '';
        if (!targetName) {
            setTab('dict');
            setEditing(null);
            setName('');
            setAliases(item.upstream);
            toast.success('请填写要并入的规范名后保存');
            return;
        }
        assignMut.mutate(
            { public: targetName, alias: item.upstream },
            {
                onSuccess: (row) => toast.success(`已将 ${item.upstream} 并入 ${row.name}`),
                onError: (e) => toast.error(e.message || '合并失败'),
            },
        );
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) resetForm();
                onOpenChange(v);
            }}
        >
            <DialogContent className="flex max-h-[88vh] max-w-4xl flex-col overflow-hidden rounded-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BookMarked className="size-5" />
                        规范模型 / 别名
                    </DialogTitle>
                    <DialogDescription>
                        规范名 = 客户端 model / 对外分组名。别名 = 上游真实 id。自动分组优先按别名归入；未归类的上游名显示在「待归类」。
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-2xl border border-border/70 p-0.5">
                        <button
                            type="button"
                            onClick={() => setTab('dict')}
                            className={cn(
                                'rounded-xl px-3 py-1.5 text-xs font-medium',
                                tab === 'dict' ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                            )}
                        >
                            字典 {sorted.length}
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab('pending')}
                            className={cn(
                                'rounded-xl px-3 py-1.5 text-xs font-medium',
                                tab === 'pending' ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                            )}
                        >
                            待归类 {pending?.length ?? 0}
                        </button>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-2xl"
                        disabled={seedMut.isPending}
                        onClick={() =>
                            seedMut.mutate(undefined, {
                                onSuccess: (r) => toast.success(`已写入常用规范名 ${r.created} 个`),
                                onError: (e) => toast.error(e.message || '预置失败'),
                            })
                        }
                    >
                        <Sparkles className="size-3.5" />
                        预置常用
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-2xl"
                        disabled={exportMut.isPending}
                        onClick={() =>
                            exportMut.mutate(undefined, {
                                onSuccess: async (items) => {
                                    const text = JSON.stringify({ items }, null, 2);
                                    try {
                                        await navigator.clipboard.writeText(text);
                                    } catch {
                                        // ignore clipboard failures; still download
                                    }
                                    try {
                                        const blob = new Blob([text], { type: 'application/json' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `octopus-public-models-${new Date().toISOString().slice(0, 10)}.json`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    } catch {
                                        // ignore
                                    }
                                    toast.success(`已导出 ${items.length} 条（剪贴板 + 文件）`);
                                },
                                onError: (e) => toast.error(e.message || '导出失败'),
                            })
                        }
                    >
                        导出
                    </Button>
                    <input
                        id="import-public-models-file"
                        ref={fileInputRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            try {
                                const text = await file.text();
                                const parsed = JSON.parse(text) as { items?: Array<{ name: string; aliases?: string[]; note?: string }> } | Array<{ name: string }>;
                                const items = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
                                if (!items.length) {
                                    toast.error('JSON 无有效 items');
                                    return;
                                }
                                importMut.mutate(items, {
                                    onSuccess: (r) => toast.success(`导入完成：新建 ${r.created} / 更新 ${r.updated} / 跳过 ${r.skipped}`),
                                    onError: (err) => toast.error(err.message || '导入失败'),
                                });
                            } catch {
                                toast.error('无法解析该 JSON 文件');
                            }
                        }}
                    />
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-2xl"
                        disabled={importMut.isPending}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        导入
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        className="ml-auto h-8 rounded-2xl"
                        disabled={runAutoGroup.isPending}
                        onClick={applyToGroups}
                    >
                        {runAutoGroup.isPending ? '入组中…' : '应用字典到分组'}
                    </Button>
                </div>

                {tab === 'dict' ? (
                    <Input
                        value={dictQuery}
                        onChange={(e) => setDictQuery(e.target.value)}
                        placeholder="搜索规范名 / 别名…"
                        className="h-9 rounded-2xl"
                    />
                ) : null}

                {tab === 'dict' ? (
                    <div className="grid min-h-0 flex-1 gap-4 overflow-hidden md:grid-cols-2">
                        <div className="space-y-2 overflow-y-auto pr-1">
                            {isLoading ? (
                                <div className="text-xs text-muted-foreground">加载中…</div>
                            ) : sorted.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
                                    还没有规范模型。可点「预置常用」，或手动添加 gpt-4o / claude-3.5-sonnet。
                                </div>
                            ) : (
                                sorted.map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => {
                                            setEditing(m);
                                            setName(m.name);
                                            setAliases(aliasesText(m));
                                            setNote(m.note || '');
                                        }}
                                        className={cn(
                                            'w-full rounded-2xl border px-3 py-2.5 text-left transition hover:bg-muted/40',
                                            editing?.id === m.id ? 'border-primary/40 bg-primary/5' : 'border-border/70',
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-semibold">{m.name}</span>
                                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                                {inferModelFamily(m.name)}
                                            </span>
                                        </div>
                                        <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                                            {aliasesText(m) || '无别名'}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/10 p-3">
                            <div className="text-sm font-medium">{editing ? `编辑 #${editing.id}` : '新建规范模型'}</div>
                            <label className="grid gap-1.5 text-xs text-muted-foreground">
                                规范名
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="claude-3.5-sonnet"
                                    className="h-10 rounded-2xl font-mono text-xs"
                                />
                            </label>
                            <label className="grid gap-1.5 text-xs text-muted-foreground">
                                别名（逗号/换行）
                                <textarea
                                    value={aliases}
                                    onChange={(e) => setAliases(e.target.value)}
                                    placeholder={'claude-3-5-sonnet-20241022\nanthropic/claude-3.5-sonnet'}
                                    className="min-h-28 rounded-2xl border border-border bg-background px-3 py-2 font-mono text-xs"
                                />
                            </label>
                            <label className="grid gap-1.5 text-xs text-muted-foreground">
                                备注
                                <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-10 rounded-2xl" />
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    className="rounded-2xl"
                                    onClick={onSubmit}
                                    disabled={createMut.isPending || updateMut.isPending}
                                >
                                    <Plus className="size-4" />
                                    {editing ? '保存' : '创建'}
                                </Button>
                                {editing ? (
                                    <>
                                        <Button type="button" variant="outline" className="rounded-2xl" onClick={resetForm}>
                                            取消编辑
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            className="rounded-2xl"
                                            disabled={deleteMut.isPending}
                                            onClick={() =>
                                                deleteMut.mutate(editing.id, {
                                                    onSuccess: () => {
                                                        toast.success('已删除');
                                                        resetForm();
                                                    },
                                                    onError: (e) => toast.error(e.message || '删除失败'),
                                                })
                                            }
                                        >
                                            <Trash2 className="size-4" />
                                            删除
                                        </Button>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                        {(pending ?? []).some((p) => !!p.suggested_public) ? (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-muted/20 px-3 py-2">
                                <div className="text-[11px] text-muted-foreground">
                                    可将「归一化建议」一键写入字典（例如 gpt-4o-2024-08-06 → gpt-4o）
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 rounded-xl text-[11px]"
                                    disabled={assignMut.isPending}
                                    onClick={async () => {
                                        const items = (pending ?? []).filter((p) => p.suggested_public);
                                        let ok = 0;
                                        for (const item of items) {
                                            try {
                                                await assignMut.mutateAsync({
                                                    public: item.suggested_public!,
                                                    alias: item.upstream,
                                                });
                                                ok += 1;
                                            } catch {
                                                // continue
                                            }
                                        }
                                        toast.success(`已接纳 ${ok}/${items.length} 条建议`);
                                    }}
                                >
                                    一键接纳建议
                                </Button>
                            </div>
                        ) : null}
                        {pendingLoading ? (
                            <div className="text-xs text-muted-foreground">扫描渠道模型中…</div>
                        ) : (pending?.length ?? 0) === 0 ? (
                            <div className="rounded-2xl border border-dashed border-border/70 px-3 py-8 text-center text-xs text-muted-foreground">
                                没有待归类上游模型（均已命中字典，或渠道尚未配置模型）。
                            </div>
                        ) : (
                            pending!.map((item) => (
                                <div
                                    key={`${item.channel_id}-${item.upstream}`}
                                    className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card/60 px-3 py-2.5 sm:flex-row sm:items-center"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate font-mono text-xs font-semibold text-foreground">
                                            {item.upstream}
                                        </div>
                                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                                            渠道：{item.channel_name || item.channel_id}
                                            {item.suggested_public ? ` · 建议 ${item.suggested_public}` : ''}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-1.5">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-7 rounded-xl text-[11px]"
                                            onClick={() => applyPending(item, false)}
                                        >
                                            并入已有
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="h-7 rounded-xl text-[11px]"
                                            onClick={() => applyPending(item, true)}
                                        >
                                            新建规范名
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button type="button" variant="outline" className="rounded-2xl" onClick={() => onOpenChange(false)}>
                        关闭
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
