'use client';

import { motion } from 'motion/react';
import { Power } from 'lucide-react';
import type { SiteChannelAccount } from '@/api/endpoints/site-channel';
import { cn } from '@/lib/utils';

type Props = {
    accounts: SiteChannelAccount[];
    activeAccountId: number | null;
    highlightedAccountId: number | null;
    currentAccount: SiteChannelAccount;
    enablePending: boolean;
    onSelectAccount: (accountId: number) => void;
    registerAccountTabRef: (accountId: number, node: HTMLButtonElement | null) => void;
    onToggleEnabled: () => void;
};

/** Multi-account tabs + enable/disable chip (shown when account count ≥ 2). */
export function AccountTabs({
    accounts,
    activeAccountId,
    highlightedAccountId,
    currentAccount,
    enablePending,
    onSelectAccount,
    registerAccountTabRef,
    onToggleEnabled,
}: Props) {
    if (accounts.length < 2) return null;

    return (
        <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
            <div className="-mb-px max-w-full overflow-x-auto">
                <div className="flex min-w-max items-baseline gap-5 px-0.5 pb-1">
                    {accounts.map((acc) => {
                        const isActive = acc.account_id === activeAccountId;
                        return (
                            <button
                                key={acc.account_id}
                                ref={(node) => registerAccountTabRef(acc.account_id, node)}
                                type="button"
                                onClick={() => onSelectAccount(acc.account_id)}
                                className={cn(
                                    'relative inline-flex items-baseline gap-1.5 pb-1 text-sm font-medium transition-colors',
                                    isActive
                                        ? 'text-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                    highlightedAccountId === acc.account_id &&
                                        'rounded-md ring-2 ring-primary/35 ring-offset-2 ring-offset-background',
                                )}
                            >
                                <span className="truncate">{acc.account_name}</span>
                                <span
                                    className={cn(
                                        'size-1.5 shrink-0 rounded-full',
                                        acc.enabled ? 'bg-emerald-500' : 'bg-destructive',
                                    )}
                                    aria-hidden
                                />
                                {isActive ? (
                                    <motion.span
                                        layoutId="site-account-tab-underline"
                                        className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-primary"
                                        transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
                                    />
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </div>

            <button
                type="button"
                onClick={onToggleEnabled}
                disabled={enablePending}
                className={cn(
                    'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition hover:opacity-80',
                    currentAccount.enabled
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-destructive/30 bg-destructive/10 text-destructive',
                )}
            >
                <Power className={cn('size-3', enablePending && 'animate-spin')} />
                {currentAccount.enabled ? '账号启用' : '账号停用'}
            </button>
        </div>
    );
}
