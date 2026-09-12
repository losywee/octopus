'use client';

import { Cable, ChevronRight, Layers3, Radio, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNavStore } from '@/components/modules/navbar';
import { useChannelTabStore } from '@/components/modules/channel/tab-store';

export function SettingQuickLinks() {
    const t = useTranslations('setting.quickLinks');
    const setActiveItem = useNavStore((s) => s.setActiveItem);
    const setChannelTab = useChannelTabStore((s) => s.setActiveTab);

    const links = [
        {
            id: 'channel-site',
            icon: Layers3,
            title: t('siteChannel'),
            desc: t('siteChannelDesc'),
            onClick: () => {
                setChannelTab('site');
                setActiveItem('channel');
            },
        },
        {
            id: 'channel-manual',
            icon: Radio,
            title: t('manualChannel'),
            desc: t('manualChannelDesc'),
            onClick: () => {
                setChannelTab('manual');
                setActiveItem('channel');
            },
        },
        {
            id: 'model',
            icon: Sparkles,
            title: t('pricing'),
            desc: t('pricingDesc'),
            onClick: () => setActiveItem('model'),
        },
        {
            id: 'connect',
            icon: Cable,
            title: t('connect'),
            desc: t('connectDesc'),
            onClick: () => setActiveItem('site'),
        },
    ] as const;

    return (
        <div className="rounded-3xl border border-border bg-card p-6 space-y-4">
            <div>
                <h2 className="text-lg font-bold text-card-foreground">{t('title')}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t('hint')}</p>
            </div>
            <div className="grid gap-2">
                {links.map((link) => {
                    const Icon = link.icon;
                    return (
                        <button
                            key={link.id}
                            type="button"
                            onClick={link.onClick}
                            className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-background/50 px-3 py-2.5 text-left transition hover:bg-muted/50"
                        >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <Icon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-foreground">{link.title}</span>
                                <span className="block text-[11px] text-muted-foreground">{link.desc}</span>
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
