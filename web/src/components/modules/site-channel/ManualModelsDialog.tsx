'use client';

import type { SiteChannelGroup, SiteModelRouteType } from '@/api/endpoints/site-channel';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SITE_ROUTE_COLUMN_ORDER } from './constants';
import { routeTypeLabel } from './utils';

type Props = {
    group: SiteChannelGroup | null;
    modelsInput: string;
    routeType: SiteModelRouteType;
    pending: boolean;
    onClose: () => void;
    onModelsInputChange: (value: string) => void;
    onRouteTypeChange: (value: SiteModelRouteType) => void;
    onSubmit: () => void;
};

export function ManualModelsDialog({
    group,
    modelsInput,
    routeType,
    pending,
    onClose,
    onModelsInputChange,
    onRouteTypeChange,
    onSubmit,
}: Props) {
    return (
        <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold">添加自定义模型</DialogTitle>
                    <DialogDescription>
                        批量添加到上游分组 {group?.group_name || group?.group_key || '-'}。同组已存在的模型不能重复添加。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <label className="grid gap-1.5 text-xs text-muted-foreground">
                        模型名称（支持换行或逗号分隔）
                        <textarea
                            value={modelsInput}
                            onChange={(event) => onModelsInputChange(event.target.value)}
                            placeholder={'gpt-4o\ngpt-4.1-mini'}
                            disabled={pending}
                            className="min-h-36 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                    </label>
                    <label className="grid gap-1.5 text-xs text-muted-foreground">
                        端点格式
                        <Select
                            value={routeType}
                            onValueChange={(value) => onRouteTypeChange(value as SiteModelRouteType)}
                            disabled={pending}
                        >
                            <SelectTrigger className="h-10 rounded-xl bg-background">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                                {SITE_ROUTE_COLUMN_ORDER.map((item) => (
                                    <SelectItem key={item} value={item}>
                                        {routeTypeLabel(item)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" className="rounded-xl" onClick={onClose} disabled={pending}>
                        取消
                    </Button>
                    <Button type="button" className="rounded-xl" onClick={onSubmit} disabled={pending || !group}>
                        {pending ? '添加中...' : '添加'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
