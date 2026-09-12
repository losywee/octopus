'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Link2, PackageOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAPIKeyList } from '@/api/endpoints/apikey';
import { useGroupList } from '@/api/endpoints/group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/common/Toast';
import { cn } from '@/lib/utils';

function normalizeBase(url: string) {
    return url.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

export function SettingAccessBundle() {
    const t = useTranslations('setting.accessBundle');
    const { data: keys } = useAPIKeyList();
    const { data: groups } = useGroupList();
    const enabledKeys = useMemo(() => (keys ?? []).filter((k) => k.enabled !== false && k.api_key), [keys]);
    const [keyId, setKeyId] = useState<string>('');
    const [baseUrl, setBaseUrl] = useState(() => {
        if (typeof window === 'undefined') return 'http://127.0.0.1:8080';
        return window.location.origin;
    });
    const [copied, setCopied] = useState<string | null>(null);

    const selectedKey = useMemo(() => {
        if (keyId) return enabledKeys.find((k) => String(k.id) === keyId) ?? enabledKeys[0];
        return enabledKeys[0];
    }, [enabledKeys, keyId]);

    const modelNames = useMemo(() => (groups ?? []).map((g) => g.name).filter(Boolean).slice(0, 20), [groups]);
    const base = normalizeBase(baseUrl || 'http://127.0.0.1:8080');
    const sampleModel = modelNames[0] || 'gpt-4o';
    const apiKey = selectedKey?.api_key || 'sk-octopus-...';

    const curl = `curl ${base}/v1/chat/completions \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${sampleModel}","messages":[{"role":"user","content":"hi"}]}'`;

    const copy = async (label: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(label);
            toast.success(t('copied'));
            window.setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
        } catch {
            toast.error(t('copyFailed'));
        }
    };

    return (
        <div className="rounded-3xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-start gap-3">
                <PackageOpen className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                    <h2 className="text-lg font-bold text-card-foreground">{t('title')}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{t('hint')}</p>
                </div>
            </div>

            <label className="grid gap-1.5 text-xs text-muted-foreground">
                {t('baseUrl')}
                <div className="flex gap-2">
                    <Input
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="http://127.0.0.1:8080"
                        className="h-10 rounded-2xl font-mono text-xs"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        className="h-10 shrink-0 rounded-2xl"
                        onClick={() => {
                            if (typeof window !== 'undefined') setBaseUrl(window.location.origin);
                        }}
                    >
                        <Link2 className="size-4" />
                        {t('useCurrent')}
                    </Button>
                </div>
            </label>

            <label className="grid gap-1.5 text-xs text-muted-foreground">
                {t('apiKey')}
                {enabledKeys.length > 0 ? (
                    <Select value={String(selectedKey?.id ?? '')} onValueChange={setKeyId}>
                        <SelectTrigger className="h-10 rounded-2xl">
                            <SelectValue placeholder={t('pickKey')} />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                            {enabledKeys.map((k) => (
                                <SelectItem key={k.id} value={String(k.id)} className="rounded-xl">
                                    {k.name || `Key #${k.id}`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <div className="rounded-2xl border border-dashed border-border/70 px-3 py-3 text-xs text-muted-foreground">
                        {t('noKey')}
                    </div>
                )}
            </label>

            <div className="grid gap-2">
                <CopyRow
                    label={t('fields.base')}
                    value={`${base}/v1`}
                    copied={copied === 'base'}
                    onCopy={() => copy('base', `${base}/v1`)}
                />
                <CopyRow
                    label={t('fields.key')}
                    value={apiKey}
                    mono
                    sensitive
                    copied={copied === 'key'}
                    onCopy={() => copy('key', apiKey)}
                    disabled={!selectedKey}
                />
                <CopyRow
                    label={t('fields.models')}
                    value={modelNames.join(', ') || t('noModels')}
                    copied={copied === 'models'}
                    onCopy={() => copy('models', modelNames.join('\n'))}
                    disabled={modelNames.length === 0}
                />
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{t('curl')}</span>
                    <Button type="button" size="sm" variant="outline" className="h-7 rounded-xl" onClick={() => copy('curl', curl)}>
                        {copied === 'curl' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        {t('copy')}
                    </Button>
                </div>
                <pre className="overflow-x-auto rounded-2xl border border-border/70 bg-muted/30 p-3 text-[11px] leading-5 text-foreground">
                    {curl}
                </pre>
            </div>
        </div>
    );
}

function CopyRow({
    label,
    value,
    onCopy,
    copied,
    mono,
    sensitive,
    disabled,
}: {
    label: string;
    value: string;
    onCopy: () => void;
    copied: boolean;
    mono?: boolean;
    sensitive?: boolean;
    disabled?: boolean;
}) {
    return (
        <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/60 px-3 py-2">
            <div className="min-w-0 flex-1">
                <div className="text-[11px] text-muted-foreground">{label}</div>
                <div className={cn('truncate text-sm text-foreground', mono && 'font-mono text-xs')}>
                    {sensitive && value.startsWith('sk-') ? `${value.slice(0, 12)}…` : value}
                </div>
            </div>
            <Button type="button" size="icon" variant="ghost" className="size-8 rounded-xl" onClick={onCopy} disabled={disabled}>
                {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
            </Button>
        </div>
    );
}
