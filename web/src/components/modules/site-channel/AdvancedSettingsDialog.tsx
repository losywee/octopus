'use client';

import { useTranslations } from 'next-intl';
import type { SiteChannelGroup, SiteProjectedChannelSettings } from '@/api/endpoints/site-channel';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { routeTypeLabel } from './utils';

type AdvancedForm = Record<number, { param_override: string }>;

type Props = {
    group: SiteChannelGroup | null;
    selectedChannelId: number | null;
    form: AdvancedForm;
    pending: boolean;
    onClose: () => void;
    onSelectChannel: (channelId: number) => void;
    onParamChange: (channelId: number, value: string) => void;
    onSave: () => void;
};

export function AdvancedSettingsDialog({
    group,
    selectedChannelId,
    form,
    pending,
    onClose,
    onSelectChannel,
    onParamChange,
    onSave,
}: Props) {
    const t = useTranslations();
    const selected =
        group?.projected_channels.find((channel) => channel.channel_id === selectedChannelId) ??
        group?.projected_channels[0] ??
        null;

    return (
        <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold">{t('siteChannel.advanced.title')}</DialogTitle>
                    <DialogDescription>
                        {t('siteChannel.advanced.description', {
                            group: group?.group_name || group?.group_key || '-',
                        })}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
                        <div className="space-y-2">
                            <div className="px-1 text-xs font-medium text-muted-foreground">
                                {t('siteChannel.advanced.channelList')}
                            </div>
                            <div className="space-y-2">
                                {group?.projected_channels.map((channel) => {
                                    const active = selected?.channel_id === channel.channel_id;
                                    return (
                                        <button
                                            key={channel.channel_id}
                                            type="button"
                                            onClick={() => onSelectChannel(channel.channel_id)}
                                            className={cn(
                                                'flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition',
                                                active
                                                    ? 'border-primary/30 bg-primary/10 text-foreground'
                                                    : 'border-border/60 bg-muted/10 hover:bg-muted/40',
                                            )}
                                        >
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium">
                                                    {routeTypeLabel(channel.route_type)}
                                                </div>
                                                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                                    #{channel.channel_id}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {selected ? (
                            <AdvancedChannelEditor
                                channel={selected}
                                form={form[selected.channel_id] ?? {
                                    param_override: selected.param_override ?? '',
                                }}
                                pending={pending}
                                onParamChange={onParamChange}
                            />
                        ) : (
                            <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/10 text-sm text-muted-foreground">
                                {t('siteChannel.advanced.empty')}
                            </div>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" className="rounded-xl" onClick={onClose} disabled={pending}>
                        {t('siteChannel.advanced.cancel')}
                    </Button>
                    <Button type="button" className="rounded-xl" onClick={onSave} disabled={pending || !group}>
                        {pending ? t('siteChannel.advanced.saving') : t('siteChannel.advanced.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AdvancedChannelEditor({
    channel,
    form,
    pending,
    onParamChange,
}: {
    channel: SiteProjectedChannelSettings;
    form: { param_override: string };
    pending: boolean;
    onParamChange: (channelId: number, value: string) => void;
}) {
    const t = useTranslations();
    return (
        <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{routeTypeLabel(channel.route_type)}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                        #{channel.channel_id} · {channel.channel_name}
                    </div>
                </div>
            </div>
            <label className="grid gap-2 text-sm">
                <span className="font-medium">{t('siteChannel.advanced.paramOverride')}</span>
                <textarea
                    value={form.param_override}
                    onChange={(event) => onParamChange(channel.channel_id, event.target.value)}
                    placeholder={t('siteChannel.advanced.paramOverridePlaceholder')}
                    disabled={pending}
                    className="min-h-40 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
            </label>
        </div>
    );
}
