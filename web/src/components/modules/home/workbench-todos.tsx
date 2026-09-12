'use client';

import { useMemo } from 'react';
import {
    AlertTriangle,
    ChevronRight,
    KeyRound,
    ShieldAlert,
    Waypoints,
} from 'lucide-react';
import { useSiteChannelList } from '@/api/endpoints/site-channel';
import { useRuntimeOverview } from '@/api/endpoints/runtime';
import { useGroupList } from '@/api/endpoints/group';
import { useNavStore } from '@/components/modules/navbar';
import { useChannelTabStore } from '@/components/modules/channel/tab-store';
import { useToolbarViewOptionsStore } from '@/components/modules/toolbar/view-options-store';
import { cn } from '@/lib/utils';

type TodoItem = {
    id: string;
    title: string;
    detail: string;
    tone: 'amber' | 'red' | 'blue';
    icon: React.ComponentType<{ className?: string }>;
    onClick: () => void;
};

export function WorkbenchTodos() {
    const setActiveItem = useNavStore((s) => s.setActiveItem);
    const setChannelTab = useChannelTabStore((s) => s.setActiveTab);
    const setLogStatus = useToolbarViewOptionsStore((s) => s.setLogStatus);
    const { data: siteCards } = useSiteChannelList({ includeHistory: false });
    const { data: runtime } = useRuntimeOverview(true);
    const { data: groups } = useGroupList();

    const todos = useMemo(() => {
        const items: TodoItem[] = [];

        let missingKeyGroups = 0;
        let projectedWithoutPublicHint = 0;
        if (siteCards) {
            for (const card of siteCards) {
                for (const acc of card.accounts) {
                    for (const g of acc.groups) {
                        if (!g.has_keys && !g.projection_disabled) missingKeyGroups += 1;
                        if (g.has_projected_channel) projectedWithoutPublicHint += 1;
                    }
                }
            }
        }

        if (missingKeyGroups > 0) {
            items.push({
                id: 'missing-keys',
                title: `${missingKeyGroups} 个上游分组缺源密钥`,
                detail: '补齐后才能稳定投影与转发',
                tone: 'amber',
                icon: KeyRound,
                onClick: () => {
                    setChannelTab('site');
                    setActiveItem('channel');
                },
            });
        }

        const open = runtime?.open_circuits ?? 0;
        const unhealthy = runtime?.unhealthy_count ?? 0;
        if (open > 0) {
            items.push({
                id: 'circuits',
                title: `${open} 路熔断中`,
                detail: '可在运行态查看冷却，或到流量查看近期失败',
                tone: 'red',
                icon: ShieldAlert,
                onClick: () => {
                    setLogStatus('error');
                    setActiveItem('log');
                },
            });
        } else if (unhealthy > 0) {
            items.push({
                id: 'unhealthy',
                title: `${unhealthy} 个渠道近 1h 失败偏高`,
                detail: '建议查看日志与渠道健康',
                tone: 'amber',
                icon: AlertTriangle,
                onClick: () => {
                    setLogStatus('error');
                    setActiveItem('log');
                },
            });
        }

        const groupCount = groups?.length ?? 0;
        if (projectedWithoutPublicHint > 0 && groupCount === 0) {
            items.push({
                id: 'no-groups',
                title: '尚无对外分组',
                detail: '已有投影渠道时，可到路由页或站点渠道一键生成',
                tone: 'blue',
                icon: Waypoints,
                onClick: () => setActiveItem('group'),
            });
        }

        return items.slice(0, 4);
    }, [siteCards, runtime, groups, setActiveItem, setChannelTab, setLogStatus]);

    if (todos.length === 0) {
        return (
            <section className="rounded-3xl border border-border/70 bg-card/70 px-4 py-3 text-sm text-muted-foreground custom-shadow">
                <div className="flex items-center gap-2 font-medium text-foreground">
                    <span className="inline-flex size-2 rounded-full bg-emerald-500" />
                    工作台
                </div>
                <p className="mt-1 text-xs">暂无待办。接入站点、补齐源密钥、配置对外分组后，问题会汇总在这里。</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setActiveItem('site')}
                        className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60"
                    >
                        去接入
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveItem('group')}
                        className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60"
                    >
                        去路由
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setLogStatus('error');
                            setActiveItem('log');
                        }}
                        className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60"
                    >
                        看流量
                    </button>
                </div>
            </section>
        );
    }

    return (
        <section className="rounded-3xl border border-border/70 bg-card/70 p-3 custom-shadow">
            <div className="mb-2 flex items-center justify-between px-1">
                <div className="text-sm font-semibold text-foreground">工作台 · 待办</div>
                <span className="text-[11px] text-muted-foreground">{todos.length} 项</span>
            </div>
            <div className="grid gap-2">
                {todos.map((todo) => {
                    const Icon = todo.icon;
                    return (
                        <button
                            key={todo.id}
                            type="button"
                            onClick={todo.onClick}
                            className={cn(
                                'flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition hover:bg-muted/40',
                                todo.tone === 'red' && 'border-destructive/25 bg-destructive/5',
                                todo.tone === 'amber' && 'border-amber-500/25 bg-amber-500/5',
                                todo.tone === 'blue' && 'border-primary/20 bg-primary/5',
                            )}
                        >
                            <span
                                className={cn(
                                    'flex size-9 shrink-0 items-center justify-center rounded-xl',
                                    todo.tone === 'red' && 'bg-destructive/10 text-destructive',
                                    todo.tone === 'amber' && 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                                    todo.tone === 'blue' && 'bg-primary/10 text-primary',
                                )}
                            >
                                <Icon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-foreground">{todo.title}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">{todo.detail}</span>
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
