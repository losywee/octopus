'use client';

import { useMemo, useState } from 'react';
import { CircleAlert, KeyRound, Link2, PauseCircle, RefreshCw, WandSparkles } from 'lucide-react';
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
import type { SiteChannelGroup } from '@/api/endpoints/site-channel';
import { cn } from '@/lib/utils';
import { isMaskedTokenValue } from './utils';

export type MissingKeyGuideAction = 'create' | 'paste' | 'skip';

type Props = {
    open: boolean;
    group: SiteChannelGroup | null;
    accountName: string;
    createPending?: boolean;
    pastePending?: boolean;
    skipPending?: boolean;
    onClose: () => void;
    onCreate: (input: { name?: string }) => void;
    onPaste: (input: { token: string; name?: string }) => void;
    onSkip: () => void;
};

type StepState = 'done' | 'current' | 'todo' | 'blocked';

function stepClass(state: StepState) {
    switch (state) {
        case 'done':
            return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        case 'current':
            return 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200';
        case 'blocked':
            return 'border-destructive/30 bg-destructive/10 text-destructive';
        default:
            return 'border-border/70 bg-muted/40 text-muted-foreground';
    }
}

function Pipeline({ group }: { group: SiteChannelGroup }) {
    const hasKeys = group.has_keys && group.enabled_key_count > 0;
    const projected = group.has_projected_channel;
    const suspended = group.projection_suspended || group.projection_disabled;

    const steps: Array<{ key: string; label: string; state: StepState; hint?: string }> = [
        { key: 'sync', label: '已同步上游分组', state: 'done' },
        {
            key: 'key',
            label: '源密钥',
            state: hasKeys ? 'done' : 'current',
            hint: hasKeys ? `${group.enabled_key_count} 可用` : '待创建或粘贴',
        },
        {
            key: 'project',
            label: '投影渠道',
            state: suspended ? 'blocked' : projected ? 'done' : hasKeys ? 'current' : 'todo',
            hint: suspended ? '已暂停' : projected ? '已生成' : hasKeys ? '同步后生成' : '需先有 Key',
        },
        {
            key: 'ready',
            label: '可调用',
            state: hasKeys && projected && !suspended ? 'done' : 'todo',
            hint: hasKeys && projected && !suspended ? '就绪' : '完成前两步',
        },
    ];

    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {steps.map((step, index) => (
                <div
                    key={step.key}
                    className={cn('rounded-2xl border px-2.5 py-2 text-[11px]', stepClass(step.state))}
                >
                    <div className="font-medium">
                        {index + 1}. {step.label}
                    </div>
                    {step.hint ? <div className="mt-0.5 opacity-80">{step.hint}</div> : null}
                </div>
            ))}
        </div>
    );
}

function MissingKeyGuideForm({
    group,
    accountName,
    createPending,
    pastePending,
    skipPending,
    onClose,
    onCreate,
    onPaste,
    onSkip,
}: Omit<Props, 'open'>) {
    const [action, setAction] = useState<MissingKeyGuideAction>('create');
    const [name, setName] = useState('');
    const [token, setToken] = useState('');

    const pending = Boolean(createPending || pastePending || skipPending);

    const title = useMemo(() => {
        if (!group) return '补齐源密钥';
        return `补齐源密钥 · ${group.group_name || group.group_key}`;
    }, [group]);

    const pasteToken = token.trim();
    const pasteInvalid = action === 'paste' && (!pasteToken || isMaskedTokenValue(pasteToken));

    const handlePrimary = () => {
        if (!group || pending) return;
        if (action === 'create') {
            onCreate({ name: name.trim() || undefined });
            return;
        }
        if (action === 'paste') {
            if (pasteInvalid) return;
            onPaste({ token: pasteToken, name: name.trim() || undefined });
            return;
        }
        onSkip();
    };

    const primaryLabel = (() => {
        if (action === 'create') return createPending ? '创建并同步中...' : '创建并同步';
        if (action === 'paste') return pastePending ? '保存并投影中...' : '保存源密钥';
        return skipPending ? '处理中...' : '暂不投影该分组';
    })();

    return (
        <>
            <DialogHeader>
                <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
                <DialogDescription>
                    账号「{accountName}」的上游分组需要
                    <strong className="text-foreground">调用用的源密钥</strong>
                    （不是登录 Access Token，也不是 Octopus 自己的 API Key）。补齐后才能投影成可转发渠道。
                </DialogDescription>
            </DialogHeader>

            {group ? (
                <div className="space-y-4">
                    <Pipeline group={group} />

                    <div className="rounded-2xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        上游分组：
                        <span className="ml-1 font-medium text-foreground">{group.group_name || group.group_key}</span>
                        <span className="mx-1.5 text-border">·</span>
                        group_key=
                        <span className="font-mono text-foreground">{group.group_key}</span>
                        {group.model_sync_message ? (
                            <div className="mt-1 flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
                                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                                <span>{group.model_sync_message}</span>
                            </div>
                        ) : null}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        {(
                            [
                                { id: 'create' as const, icon: WandSparkles, label: '快捷创建' },
                                { id: 'paste' as const, icon: KeyRound, label: '粘贴已有' },
                                { id: 'skip' as const, icon: PauseCircle, label: '暂不投影' },
                            ] as const
                        ).map((item) => {
                            const Icon = item.icon;
                            const active = action === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    disabled={pending}
                                    onClick={() => setAction(item.id)}
                                    className={cn(
                                        'flex flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 text-xs transition',
                                        active
                                            ? 'border-primary/40 bg-primary/10 text-primary'
                                            : 'border-border/70 bg-background/70 text-muted-foreground hover:bg-muted/50',
                                    )}
                                >
                                    <Icon className="size-4" />
                                    {item.label}
                                </button>
                            );
                        })}
                    </div>

                    {action === 'create' ? (
                        <div className="space-y-3">
                            <p className="text-xs leading-5 text-muted-foreground">
                                使用账号管理凭证，在上游站点为该分组代建 Token，成功后自动同步并尝试投影。
                                适合 NewAPI / OneAPI / AnyRouter / Sub2API 等支持代建的平台。
                            </p>
                            <label className="grid gap-1.5 text-xs text-muted-foreground">
                                Key 名称（可选）
                                <Input
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder="留空时自动生成 octopus-分组-时间戳"
                                    disabled={pending}
                                    className="h-10 rounded-2xl"
                                />
                            </label>
                        </div>
                    ) : null}

                    {action === 'paste' ? (
                        <div className="space-y-3">
                            <p className="text-xs leading-5 text-muted-foreground">
                                如果你已在上游站点创建过 Token，直接粘贴完整密钥（通常以 sk- 开头）。
                                不要粘贴带 * 的脱敏值。
                            </p>
                            <label className="grid gap-1.5 text-xs text-muted-foreground">
                                源密钥
                                <Input
                                    value={token}
                                    onChange={(event) => setToken(event.target.value)}
                                    placeholder="sk-..."
                                    disabled={pending}
                                    className="h-10 rounded-2xl font-mono text-xs"
                                    autoComplete="off"
                                />
                            </label>
                            <label className="grid gap-1.5 text-xs text-muted-foreground">
                                备注名称（可选）
                                <Input
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder="例如 manual-vip"
                                    disabled={pending}
                                    className="h-10 rounded-2xl"
                                />
                            </label>
                            {pasteInvalid && pasteToken ? (
                                <div className="flex items-start gap-1.5 text-xs text-destructive">
                                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                                    看起来是脱敏值，请粘贴完整明文密钥。
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {action === 'skip' ? (
                        <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 px-3 py-3 text-xs leading-5 text-muted-foreground">
                            <div className="flex items-center gap-1.5 font-medium text-foreground">
                                <Link2 className="size-3.5" />
                                暂不投影该上游分组
                            </div>
                            <p>
                                会关闭此分组的投影生成，避免一直出现「待建 Key」。之后仍可在分组菜单里恢复投影，
                                并再补齐源密钥。
                            </p>
                        </div>
                    ) : null}
                </div>
            ) : null}

            <DialogFooter>
                <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose} disabled={pending}>
                    取消
                </Button>
                <Button
                    type="button"
                    className="rounded-2xl"
                    onClick={handlePrimary}
                    disabled={!group || pending || pasteInvalid || (action === 'paste' && !pasteToken)}
                    variant={action === 'skip' ? 'secondary' : 'default'}
                >
                    <RefreshCw className={cn('size-4', pending && 'animate-spin')} />
                    {primaryLabel}
                </Button>
            </DialogFooter>
        </>
    );
}

export function MissingKeyGuideDialog({
    open,
    group,
    accountName,
    createPending,
    pastePending,
    skipPending,
    onClose,
    onCreate,
    onPaste,
    onSkip,
}: Props) {
    const pending = Boolean(createPending || pastePending || skipPending);
    return (
        <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
            <DialogContent className="rounded-3xl sm:max-w-lg">
                {open ? (
                    <MissingKeyGuideForm
                        key={group?.group_key ?? 'closed'}
                        group={group}
                        accountName={accountName}
                        createPending={createPending}
                        pastePending={pastePending}
                        skipPending={skipPending}
                        onClose={onClose}
                        onCreate={onCreate}
                        onPaste={onPaste}
                        onSkip={onSkip}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
