'use client';

import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import type { SiteChannelGroup } from '@/api/endpoints/site-channel';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { SiteSourceKeyFormItem } from './utils';
import { hasSourceKeyChanges } from './utils';

type Props = {
    group: SiteChannelGroup | null;
    form: SiteSourceKeyFormItem[];
    visibleRows: Record<string, boolean>;
    pending: boolean;
    onClose: () => void;
    onToggleVisibility: (item: SiteSourceKeyFormItem, index: number) => void;
    onFieldChange: (index: number, patch: Partial<SiteSourceKeyFormItem>) => void;
    onAddRow: () => void;
    onRemoveRow: (index: number) => void;
    onSave: () => void;
};

function rowId(item: SiteSourceKeyFormItem, index: number) {
    return `${item.id ?? 'new'}-${index}`;
}

export function SourceKeysDialog({
    group,
    form,
    visibleRows,
    pending,
    onClose,
    onToggleVisibility,
    onFieldChange,
    onAddRow,
    onRemoveRow,
    onSave,
}: Props) {
    const canSave = !!group && hasSourceKeyChanges(group.source_keys, form);

    return (
        <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex h-[min(85vh,42rem)] max-w-3xl flex-col overflow-hidden rounded-3xl border-border/70 p-0 sm:max-w-3xl">
                <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
                    <DialogTitle className="text-lg font-semibold">管理源密钥</DialogTitle>
                    <DialogDescription>
                        上游分组 {group?.group_name || group?.group_key || '-'} 的源密钥会在保存后更新，并重新投影到托管渠道。
                    </DialogDescription>
                </DialogHeader>

                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 py-4">
                    <div className="shrink-0 rounded-2xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        投影渠道：{group?.projected_channel_ids.join(', ') || '-'}
                    </div>

                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                        {form.map((item, index) => {
                            const id = rowId(item, index);
                            const isVisible = item.is_new || Boolean(visibleRows[id]);
                            return (
                                <div key={id} className="rounded-2xl border border-border/70 bg-background/80 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-xs text-muted-foreground">
                                            {item.id ? `源密钥 #${item.id}` : '新源密钥'}
                                            {item.value_status === 'masked_pending' ? ' · 待补全' : ''}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="rounded-xl"
                                            onClick={() => onRemoveRow(index)}
                                            disabled={pending}
                                        >
                                            删除
                                        </Button>
                                    </div>
                                    <div className="mt-3 grid gap-3 md:grid-cols-[auto,1fr,12rem]">
                                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <input
                                                type="checkbox"
                                                checked={item.enabled}
                                                disabled={pending}
                                                onChange={(event) => onFieldChange(index, { enabled: event.target.checked })}
                                                className="size-4 rounded border-border bg-background align-middle accent-primary"
                                            />
                                            启用
                                        </label>
                                        <label className="grid gap-1.5 text-xs text-muted-foreground">
                                            源密钥
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type={isVisible ? 'text' : 'password'}
                                                    value={item.token}
                                                    onChange={(event) => onFieldChange(index, { token: event.target.value })}
                                                    placeholder={item.id ? '点击眼睛查看或直接修改完整密钥' : '输入新的源密钥'}
                                                    disabled={pending}
                                                    className="h-10 rounded-2xl"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon"
                                                    className="size-10 shrink-0 rounded-2xl"
                                                    onClick={() => onToggleVisibility(item, index)}
                                                    disabled={pending}
                                                    aria-label={isVisible ? '隐藏完整密钥' : '显示完整密钥'}
                                                    title={isVisible ? '隐藏完整密钥' : '显示完整密钥'}
                                                >
                                                    {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                                </Button>
                                            </div>
                                            {!isVisible && item.token_masked ? (
                                                <span className="text-[11px] text-muted-foreground">当前值：{item.token_masked}</span>
                                            ) : null}
                                        </label>
                                        <label className="grid gap-1.5 text-xs text-muted-foreground">
                                            名称
                                            <Input
                                                value={item.name}
                                                onChange={(event) => onFieldChange(index, { name: event.target.value })}
                                                placeholder="密钥名称"
                                                disabled={pending}
                                                className="h-10 rounded-2xl"
                                            />
                                        </label>
                                    </div>
                                    {item.last_sync_at ? (
                                        <div className="mt-2 text-[11px] text-muted-foreground">
                                            上次同步：{new Date(item.last_sync_at).toLocaleString()}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>

                    <Button type="button" variant="outline" className="shrink-0 rounded-2xl" onClick={onAddRow} disabled={pending}>
                        新增源密钥
                    </Button>
                </div>

                <DialogFooter className="shrink-0 border-t border-border/60 px-6 py-4">
                    <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose} disabled={pending}>
                        取消
                    </Button>
                    <Button type="button" className="rounded-2xl" onClick={onSave} disabled={pending || !canSave}>
                        <RefreshCw className={cn('size-4', pending && 'animate-spin')} />
                        {pending ? '保存中...' : '保存源密钥'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
