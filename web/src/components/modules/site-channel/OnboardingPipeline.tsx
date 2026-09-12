'use client';

import { CheckCircle2, Circle, CircleAlert, KeyRound, Layers3, Link2 } from 'lucide-react';
import type { SiteChannelAccount } from '@/api/endpoints/site-channel';
import { cn } from '@/lib/utils';

type StepState = 'done' | 'current' | 'todo' | 'blocked';

function stepClass(state: StepState) {
    switch (state) {
        case 'done':
            return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300';
        case 'current':
            return 'border-primary/40 bg-primary/10 text-primary';
        case 'blocked':
            return 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200';
        default:
            return 'border-border/70 bg-muted/30 text-muted-foreground';
    }
}

function iconFor(state: StepState) {
    if (state === 'done') return CheckCircle2;
    if (state === 'blocked') return CircleAlert;
    return Circle;
}

export function deriveOnboardingSteps(account: SiteChannelAccount) {
    const groups = account.groups ?? [];
    const hasGroups = groups.length > 0;
    const missingKeyCount = groups.filter((g) => !g.has_keys).length;
    const projectedCount = groups.filter((g) => g.has_projected_channel).length;
    const suspendedCount = groups.filter((g) => g.projection_suspended).length;
    const readyProjected = projectedCount > 0 && missingKeyCount === 0;

    const steps: Array<{ key: string; label: string; hint: string; state: StepState }> = [
        {
            key: 'sync',
            label: '同步上游',
            hint: hasGroups ? `${groups.length} 个上游分组` : '尚未同步到上游分组',
            state: hasGroups ? 'done' : 'current',
        },
        {
            key: 'source-key',
            label: '源密钥',
            hint:
                missingKeyCount > 0
                    ? `${missingKeyCount} 组缺源密钥`
                    : hasGroups
                      ? '源密钥已就绪'
                      : '同步后补齐',
            state: !hasGroups ? 'todo' : missingKeyCount > 0 ? 'blocked' : 'done',
        },
        {
            key: 'project',
            label: '投影渠道',
            hint:
                suspendedCount > 0
                    ? `${suspendedCount} 组投影暂停`
                    : projectedCount > 0
                      ? `${projectedCount} 组已投影`
                      : missingKeyCount > 0
                        ? '需先补源密钥'
                        : '等待投影',
            state: projectedCount > 0 && suspendedCount === 0
                ? 'done'
                : suspendedCount > 0 || (hasGroups && missingKeyCount === 0 && projectedCount === 0)
                  ? 'current'
                  : missingKeyCount > 0
                    ? 'todo'
                    : 'todo',
        },
        {
            key: 'public-group',
            label: '对外分组',
            hint: readyProjected ? '可一键生成/更新' : '投影就绪后生成',
            state: readyProjected ? 'current' : 'todo',
        },
    ];

    return steps;
}

type Props = {
    account: SiteChannelAccount;
    className?: string;
};

/** Compact 4-step site onboarding strip for a site-channel account panel. */
export function SiteChannelOnboardingPipeline({ account, className }: Props) {
    const steps = deriveOnboardingSteps(account);
    const icons = [Link2, KeyRound, Layers3, Layers3] as const;

    return (
        <div className={cn('grid grid-cols-2 gap-2 lg:grid-cols-4', className)}>
            {steps.map((step, index) => {
                const StateIcon = iconFor(step.state);
                const StepIcon = icons[index] ?? Circle;
                return (
                    <div
                        key={step.key}
                        className={cn('rounded-2xl border px-2.5 py-2 text-[11px]', stepClass(step.state))}
                    >
                        <div className="flex items-center gap-1.5 font-medium">
                            <StepIcon className="size-3.5 shrink-0 opacity-80" />
                            <span className="truncate">
                                {index + 1}. {step.label}
                            </span>
                            <StateIcon className="ml-auto size-3.5 shrink-0 opacity-80" />
                        </div>
                        <div className="mt-0.5 pl-5 opacity-85">{step.hint}</div>
                    </div>
                );
            })}
        </div>
    );
}
