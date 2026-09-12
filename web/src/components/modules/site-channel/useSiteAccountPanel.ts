'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/common/Toast';
import { useSettingStore } from '@/stores/setting';
import {
    type SiteChannelAccount,
    type SiteChannelGroup,
    type SiteModelDisableUpdateRequest,
    type SiteModelRouteType,
    type SiteModelRouteUpdateRequest,
    useCreateSiteChannelKey,
    useEnsureSitePublicGroups,
    useAddSiteManualModels,
    useDeleteSiteManualModel,
    useResetSiteChannelModelRoutes,
    useUpdateSiteProjectedChannelSettings,
    useUpdateSiteGroupProjection,
    useUpdateSiteSourceKeys,
    useUpdateSiteChannelModelDisabled,
    useUpdateSiteChannelModelRoutes,
} from '@/api/endpoints/site-channel';
import { useEnableSiteAccount } from '@/api/endpoints/site';
import { isSupportedRouteType } from './constants';
import { translateSiteMessage } from '../site/site-message';
import type { SiteChannelTableHandle } from './ModelTable';
import {
    getBaseGroupKey,
    makeModelKey,
    removeKeys,
    addPendingKeys,
    removePendingKeys,
    matchesQuickFilters,
    sortModels,
    QUICK_FILTER_OPTIONS,
    SITE_GROUP_FILTER_ALL_VALUE,
    STALE_MODEL_SYNC_STATUSES,
} from './model-helpers';
import {
    SITE_GROUP_FILTER_ALL,
    createGroupFilter,
    type SiteChannelGroupFilter,
    type SiteSourceKeyFormItem,
    type SiteModelView,
    buildPasteSourceKeyPayload,
    buildSourceKeyFormItems,
    buildSourceKeyUpdatePayload,
    filterGroups,
    flattenAccountModels,
    getErrorMessage,
    isMaskedTokenValue,
    isSameGroupFilter,
    matchesMaskedToken,
} from './utils';
import type { PendingJump, SiteChannelJumpTarget } from '@/stores/jump';

type SiteChannelPendingJump = PendingJump & { target: SiteChannelJumpTarget };
import {
    DEFAULT_SITE_CHANNEL_PANEL_PREFERENCES,
    type SiteChannelQuickFilter,
    type SiteChannelTableSort,
    type SiteChannelTableSortField,
    useSiteChannelPanelViewStore,
} from './ui-store';


export type SiteAccountPanelParams = {
    siteId: number;
    account: SiteChannelAccount;
    accounts: SiteChannelAccount[];
    activeAccountId: number | null;
    onSelectAccount: (accountId: number) => void;
    highlightedAccountId: number | null;
    registerAccountTabRef: (accountId: number, node: HTMLButtonElement | null) => void;
    jumpRequest: SiteChannelPendingJump | null;
    onJumpHandled: (requestId: number) => void;
    onNavigateToChannel: (channelId: number) => void;
};

export function useSiteAccountPanel({
    siteId,
    account,
    accounts,
    activeAccountId,
    onSelectAccount,
    highlightedAccountId,
    registerAccountTabRef,
    jumpRequest,
    onJumpHandled,
    onNavigateToChannel,
}: SiteAccountPanelParams) {
    const t = useTranslations();
    const locale = useSettingStore((state) => state.locale);
    const [activeFilter, setActiveFilter] = useState<SiteChannelGroupFilter>(SITE_GROUP_FILTER_ALL);
    const [pendingRouteOverrides, setPendingRouteOverrides] = useState<Record<string, SiteModelRouteType>>({});
    const [pendingDisabledOverrides, setPendingDisabledOverrides] = useState<Record<string, boolean>>({});
    const [pendingModelKeys, setPendingModelKeys] = useState<Set<string>>(new Set());
    const [selectedModelKeys, setSelectedModelKeys] = useState<Set<string>>(new Set());
    const [missingKeyGroup, setMissingKeyGroup] = useState<SiteChannelGroup | null>(null);
    const [editingProjectedGroup, setEditingProjectedGroup] = useState<SiteChannelGroup | null>(null);
    const [editingAdvancedGroup, setEditingAdvancedGroup] = useState<SiteChannelGroup | null>(null);
    const [selectedAdvancedChannelId, setSelectedAdvancedChannelId] = useState<number | null>(null);
    const [advancedForm, setAdvancedForm] = useState<Record<number, { param_override: string }>>({});
    const [addingManualGroup, setAddingManualGroup] = useState<SiteChannelGroup | null>(null);
    const [manualModelsInput, setManualModelsInput] = useState('');
    const [manualModelRouteType, setManualModelRouteType] = useState<SiteModelRouteType>('openai_chat');
    const [sourceKeyForm, setSourceKeyForm] = useState<SiteSourceKeyFormItem[]>([]);
    const [visibleSourceKeyRows, setVisibleSourceKeyRows] = useState<Record<string, boolean>>({});
    const [highlightedModelKey, setHighlightedModelKey] = useState<string | null>(null);
    const [modelSearchTerm, setModelSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [bulkMoveTarget, setBulkMoveTarget] = useState<SiteModelRouteType>('openai_chat');
    const [deletingManualModelKey, setDeletingManualModelKey] = useState<string | null>(null);
    const tableHandleRef = useRef<SiteChannelTableHandle | null>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearchTerm(modelSearchTerm), 150);
        return () => window.clearTimeout(timer);
    }, [modelSearchTerm]);
    const panelKey = `${siteId}:${account.account_id}`;

    const panelPreferences = useSiteChannelPanelViewStore(
        (state) => state.panels[panelKey] ?? DEFAULT_SITE_CHANNEL_PANEL_PREFERENCES,
    );
    const setCompactMode = useSiteChannelPanelViewStore((state) => state.setCompactMode);
    const setQuickFilters = useSiteChannelPanelViewStore((state) => state.setQuickFilters);
    const setTableSort = useSiteChannelPanelViewStore((state) => state.setTableSort);

    const createKeyMutation = useCreateSiteChannelKey(siteId, account.account_id);
    const ensurePublicGroupsMutation = useEnsureSitePublicGroups(siteId, account.account_id);
    const sourceKeyMutation = useUpdateSiteSourceKeys(siteId, account.account_id);
    const advancedMutation = useUpdateSiteProjectedChannelSettings(siteId, account.account_id);
    const groupProjectionMutation = useUpdateSiteGroupProjection(siteId, account.account_id);
    const addManualModelsMutation = useAddSiteManualModels(siteId, account.account_id);
    const deleteManualModelMutation = useDeleteSiteManualModel(siteId, account.account_id);
    const routeMutation = useUpdateSiteChannelModelRoutes(siteId, account.account_id);
    const disabledMutation = useUpdateSiteChannelModelDisabled();
    const resetMutation = useResetSiteChannelModelRoutes(siteId, account.account_id);
    const enableSiteAccount = useEnableSiteAccount();

    const translateSiteError = useCallback(
        (error: unknown, fallback: string) => translateSiteMessage(locale, getErrorMessage(error, fallback), t),
        [locale, t],
    );

    const forcedModelKey =
        jumpRequest?.target.kind === 'site-channel-model' &&
        jumpRequest.target.siteId === siteId &&
        jumpRequest.target.accountId === account.account_id
            ? makeModelKey(getBaseGroupKey(jumpRequest.target.groupKey), jumpRequest.target.modelName)
            : null;

    const visibleGroups = useMemo(
        () => filterGroups(account.groups, activeFilter),
        [account.groups, activeFilter],
    );

    const scopedModels = useMemo(() => {
        return flattenAccountModels(account, activeFilter).map((model) => {
            const modelKey = makeModelKey(model.group_key, model.model_name);
            const nextRouteType = pendingRouteOverrides[modelKey];
            const nextDisabled = pendingDisabledOverrides[modelKey];

            return {
                ...model,
                route_type: nextRouteType ?? model.route_type,
                route_source: nextRouteType ? 'manual_override' : model.route_source,
                manual_override: nextRouteType ? true : model.manual_override,
                disabled: nextDisabled ?? model.disabled,
            };
        });
    }, [account, activeFilter, pendingRouteOverrides, pendingDisabledOverrides]);

    const filteredModels = useMemo(() => {
        const normalizedSearch = debouncedSearchTerm.trim().toLowerCase();

        return scopedModels.filter((model) => {
            const modelKey = makeModelKey(model.group_key, model.model_name);
            // Pin the jump target across the whole highlight window: forcedModelKey holds it
            // while jumpRequest is live, then highlightedModelKey keeps it pinned after the
            // request is cleared until the ring fades (~1.8s). Without this the row would be
            // dropped the instant onJumpHandled clears jumpRequest when an active search /
            // quick-filter excludes it, leaving the highlight on an unmounted row.
            if (forcedModelKey === modelKey || highlightedModelKey === modelKey) return true;

            const matchesSearch =
                !normalizedSearch ||
                model.model_name.toLowerCase().includes(normalizedSearch) ||
                (model.group_name || model.group_key).toLowerCase().includes(normalizedSearch);

            if (!matchesSearch) return false;

            return matchesQuickFilters(model, panelPreferences.quickFilters);
        });
    }, [scopedModels, debouncedSearchTerm, panelPreferences.quickFilters, forcedModelKey, highlightedModelKey]);

    const visibleModels = useMemo(
        () => sortModels(filteredModels, panelPreferences.tableSort),
        [filteredModels, panelPreferences.tableSort],
    );

    const visibleModelMap = useMemo(
        () =>
            new Map(
                visibleModels.map((model) => [makeModelKey(model.group_key, model.model_name), model] as const),
            ),
        [visibleModels],
    );

    // Scope key for the models list; changing filter / search / quick-filters tells the
    // virtualized table to scroll back to the top (see SiteChannelTableView resetKey).
    const modelsScopeKey = `${account.account_id}|${activeFilter.kind}|${activeFilter.kind === 'group' ? activeFilter.groupKey : ''}|${modelSearchTerm}|${panelPreferences.quickFilters.join(',')}`;

    const selectedModels = useMemo(
        () => Array.from(selectedModelKeys).map((key) => visibleModelMap.get(key)).filter((model): model is SiteModelView => !!model),
        [selectedModelKeys, visibleModelMap],
    );
    const hasPendingChanges = pendingModelKeys.size > 0 || routeMutation.isPending || disabledMutation.isPending || advancedMutation.isPending || addManualModelsMutation.isPending || deleteManualModelMutation.isPending;

    useEffect(() => {
        if (!jumpRequest || jumpRequest.target.kind !== 'site-channel-model') return;
        const target = jumpRequest.target;
        if (target.siteId !== siteId || target.accountId !== account.account_id) return;

        const targetGroupKey = getBaseGroupKey(target.groupKey);
        const targetFilter = createGroupFilter(targetGroupKey);
        if (!isSameGroupFilter(activeFilter, targetFilter)) {
            const frameId = window.requestAnimationFrame(() => {
                setActiveFilter(targetFilter);
            });
            return () => window.cancelAnimationFrame(frameId);
        }

        const modelKey = makeModelKey(targetGroupKey, target.modelName);

        const timer = window.setTimeout(() => {
            // forcedModelKey keeps the target in visibleModels even when it doesn't match
            // the active search / quick-filters, so the virtualizer can always find it.
            tableHandleRef.current?.scrollToModelKey(modelKey);
            setHighlightedModelKey(modelKey);
            window.setTimeout(() => {
                setHighlightedModelKey((current) => (current === modelKey ? null : current));
            }, 1800);
            onJumpHandled(jumpRequest.requestId);
        }, 80);

        return () => window.clearTimeout(timer);
    }, [jumpRequest, siteId, account.account_id, activeFilter, onJumpHandled]);

    const setSelectionForKeys = useCallback((modelKeys: string[], checked: boolean) => {
        if (modelKeys.length === 0) return;

        setSelectedModelKeys((current) => {
            const next = new Set(current);
            for (const modelKey of modelKeys) {
                if (checked) {
                    next.add(modelKey);
                } else {
                    next.delete(modelKey);
                }
            }
            return next;
        });
    }, []);

    const handleToggleModelSelection = useCallback((modelKey: string, checked: boolean) => {
        setSelectionForKeys([modelKey], checked);
    }, [setSelectionForKeys]);

    const handleToggleAllVisible = useCallback((checked: boolean) => {
        setSelectionForKeys(
            visibleModels.map((model) => makeModelKey(model.group_key, model.model_name)),
            checked,
        );
    }, [visibleModels, setSelectionForKeys]);

    const allVisibleSelected = useMemo(
        () =>
            visibleModels.length > 0 &&
            visibleModels.every((model) =>
                selectedModelKeys.has(makeModelKey(model.group_key, model.model_name)),
            ),
        [visibleModels, selectedModelKeys],
    );

    const applyRouteChange = useCallback((models: SiteModelView[], nextRouteType: SiteModelRouteType) => {
        const eligibleModels = models.filter((model) => {
            const modelKey = makeModelKey(model.group_key, model.model_name);
            return !pendingModelKeys.has(modelKey) && !model.disabled && model.route_type !== nextRouteType;
        });

        if (eligibleModels.length === 0) return;

        const modelKeys = eligibleModels.map((model) => makeModelKey(model.group_key, model.model_name));
        const payload: SiteModelRouteUpdateRequest[] = eligibleModels.map((model) => ({
            group_key: model.group_key,
            model_name: model.model_name,
            route_type: nextRouteType,
        }));

        setPendingRouteOverrides((current) => {
            const next = { ...current };
            for (const modelKey of modelKeys) {
                next[modelKey] = nextRouteType;
            }
            return next;
        });
        setPendingModelKeys((current) => addPendingKeys(current, modelKeys));

        routeMutation.mutate(payload, {
            onSuccess: () => {
                setPendingRouteOverrides((current) => removeKeys(current, modelKeys));
                toast.success(payload.length === 1 ? '模型请求端点格式已更新' : `已更新 ${payload.length} 个模型的请求端点格式`);
            },
            onError: (error) => {
                setPendingRouteOverrides((current) => removeKeys(current, modelKeys));
                toast.error(translateSiteError(error, '更新模型请求端点格式失败'));
            },
            onSettled: () => {
                setPendingModelKeys((current) => removePendingKeys(current, modelKeys));
            },
        });
    }, [pendingModelKeys, routeMutation, translateSiteError]);

    const applyDisabledChange = useCallback((models: SiteModelView[], nextDisabled: boolean) => {
        const eligibleModels = models.filter((model) => {
            const modelKey = makeModelKey(model.group_key, model.model_name);
            return !pendingModelKeys.has(modelKey) && model.disabled !== nextDisabled;
        });

        if (eligibleModels.length === 0) return;

        const modelKeys = eligibleModels.map((model) => makeModelKey(model.group_key, model.model_name));
        const payload: SiteModelDisableUpdateRequest[] = eligibleModels.map((model) => ({
            group_key: model.group_key,
            model_name: model.model_name,
            disabled: nextDisabled,
        }));

        setPendingDisabledOverrides((current) => {
            const next = { ...current };
            for (const modelKey of modelKeys) {
                next[modelKey] = nextDisabled;
            }
            return next;
        });
        setPendingModelKeys((current) => addPendingKeys(current, modelKeys));

        disabledMutation.mutate({ siteId, accountId: account.account_id, payload }, {
            onSuccess: () => {
                setPendingDisabledOverrides((current) => removeKeys(current, modelKeys));
                toast.success(payload.length === 1 ? (nextDisabled ? '模型已禁用' : '模型已启用') : `${payload.length} 个模型已${nextDisabled ? '禁用' : '启用'}`);
            },
            onError: (error) => {
                setPendingDisabledOverrides((current) => removeKeys(current, modelKeys));
                toast.error(translateSiteError(error, '更新模型禁用状态失败'));
            },
            onSettled: () => {
                setPendingModelKeys((current) => removePendingKeys(current, modelKeys));
            },
        });
    }, [pendingModelKeys, disabledMutation, siteId, account.account_id, translateSiteError]);

    const handleOpenMissingKeyGuide = (group: SiteChannelGroup) => {
        setMissingKeyGroup(group);
    };

    const handleToggleGroupProjection = (group: SiteChannelGroup) => {
        const nextDisabled = !group.projection_disabled;
        groupProjectionMutation.mutate({
            group_key: group.group_key,
            projection_disabled: nextDisabled,
        }, {
            onSuccess: () => {
                toast.success(nextDisabled ? '已停止生成该分组的投影渠道' : '已恢复生成该分组的投影渠道');
            },
            onError: (error) => {
                toast.error(translateSiteError(error, '更新分组投影状态失败'));
            },
        });
    };

    const missingKeyGuidePending =
        createKeyMutation.isPending || sourceKeyMutation.isPending || groupProjectionMutation.isPending;

    const handleCloseMissingKeyGuide = () => {
        if (missingKeyGuidePending) return;
        setMissingKeyGroup(null);
    };

    const handleMissingKeyCreate = ({ name }: { name?: string }) => {
        if (!missingKeyGroup) return;

        createKeyMutation.mutate(
            {
                group_key: missingKeyGroup.group_key,
                name,
            },
            {
                onSuccess: () => {
                    toast.success(`上游分组「${missingKeyGroup.group_name || missingKeyGroup.group_key}」已创建源密钥并完成同步 · 投影/运行态将刷新`);
                    setMissingKeyGroup(null);
                },
                onError: (error) => {
                    toast.error(translateSiteError(error, '快捷创建源密钥失败'));
                },
            },
        );
    };

    const handleMissingKeyPaste = ({ token, name }: { token: string; name?: string }) => {
        if (!missingKeyGroup) return;

        sourceKeyMutation.mutate(
            buildPasteSourceKeyPayload(missingKeyGroup.group_key, token, name),
            {
                onSuccess: () => {
                    toast.success(`上游分组「${missingKeyGroup.group_name || missingKeyGroup.group_key}」已保存源密钥并投影 · 运行态将刷新`);
                    setMissingKeyGroup(null);
                },
                onError: (error) => {
                    toast.error(translateSiteError(error, '保存源密钥失败'));
                },
            },
        );
    };

    const handleMissingKeySkip = () => {
        if (!missingKeyGroup) return;

        groupProjectionMutation.mutate(
            {
                group_key: missingKeyGroup.group_key,
                projection_disabled: true,
            },
            {
                onSuccess: () => {
                    toast.success(`已暂停上游分组「${missingKeyGroup.group_name || missingKeyGroup.group_key}」的投影`);
                    setMissingKeyGroup(null);
                },
                onError: (error) => {
                    toast.error(translateSiteError(error, '暂停投影失败'));
                },
            },
        );
    };

    const handleOpenProjectedKeys = (group: SiteChannelGroup) => {
        const items = buildSourceKeyFormItems(group);
        setEditingProjectedGroup(group);
        setSourceKeyForm(items);
        setVisibleSourceKeyRows({});
    };

    const handleCloseProjectedKeys = () => {
        if (sourceKeyMutation.isPending) return;
        setEditingProjectedGroup(null);
        setSourceKeyForm([]);
        setVisibleSourceKeyRows({});
    };

    const handleOpenAdvancedSettings = (group: SiteChannelGroup) => {
        const form: Record<number, { param_override: string }> = {};
        group.projected_channels.forEach((channel) => {
            form[channel.channel_id] = {
                param_override: channel.param_override ?? '',
            };
        });
        setEditingAdvancedGroup(group);
        setSelectedAdvancedChannelId(group.projected_channels[0]?.channel_id ?? null);
        setAdvancedForm(form);
    };

    const handleCloseAdvancedSettings = () => {
        if (advancedMutation.isPending) return;
        setEditingAdvancedGroup(null);
        setSelectedAdvancedChannelId(null);
        setAdvancedForm({});
    };

    const handleOpenAddManualModels = (group: SiteChannelGroup) => {
        setAddingManualGroup(group);
        setManualModelsInput('');
        setManualModelRouteType('openai_chat');
    };

    const handleCloseAddManualModels = () => {
        if (addManualModelsMutation.isPending) return;
        setAddingManualGroup(null);
        setManualModelsInput('');
    };

    const parseManualModelNames = () => Array.from(new Set(manualModelsInput
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)));

    const handleAddManualModels = () => {
        if (!addingManualGroup) return;
        const names = parseManualModelNames();
        if (names.length === 0) {
            toast.error('请填写模型名称');
            return;
        }
        const existing = new Set(addingManualGroup.models.map((model) => model.model_name));
        const duplicated = names.filter((name) => existing.has(name));
        if (duplicated.length > 0) {
            toast.error(`模型已存在：${duplicated.join(', ')}`);
            return;
        }
        addManualModelsMutation.mutate({
            group_key: addingManualGroup.group_key,
            models: names.map((name) => ({ model_name: name, route_type: manualModelRouteType })),
        }, {
            onSuccess: () => {
                toast.success(`已添加 ${names.length} 个自定义模型`);
                handleCloseAddManualModels();
            },
            onError: (error) => {
                toast.error(translateSiteError(error, '添加自定义模型失败'));
            },
        });
    };

    const handleDeleteManualModel = (model: SiteModelView) => {
        if (model.source !== 'manual') return;
        const modelKey = makeModelKey(model.group_key, model.model_name);
        if (deletingManualModelKey === modelKey) return;
        setDeletingManualModelKey(modelKey);
        deleteManualModelMutation.mutate({ group_key: model.group_key, model_name: model.model_name }, {
            onSuccess: () => toast.success('自定义模型已删除'),
            onError: (error) => toast.error(translateSiteError(error, '删除自定义模型失败')),
            onSettled: () => setDeletingManualModelKey((current) => (current === modelKey ? null : current)),
        });
    };

    const handleAdvancedParamChange = (channelId: number, value: string) => {
        setAdvancedForm((current) => ({
            ...current,
            [channelId]: { ...(current[channelId] ?? { param_override: '' }), param_override: value },
        }));
    };

    const validateAdvancedSettings = () => {
        for (const item of Object.values(advancedForm)) {
            const value = item.param_override.trim();
            if (!value) continue;
            try {
                const parsed = JSON.parse(value) as unknown;
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    return false;
                }
            } catch {
                return false;
            }
        }
        return true;
    };

    const handleSaveAdvancedSettings = () => {
        if (!editingAdvancedGroup) return;
        if (!validateAdvancedSettings()) {
            toast.error(t('siteChannel.advanced.invalidParamOverride'));
            return;
        }
        const payload = editingAdvancedGroup.projected_channels.map((channel) => ({
            channel_id: channel.channel_id,
            auto_group: channel.auto_group,
            param_override: advancedForm[channel.channel_id]?.param_override?.trim() ?? '',
        }));
        advancedMutation.mutate(payload, {
            onSuccess: () => {
                toast.success(t('siteChannel.advanced.saved'));
                handleCloseAdvancedSettings();
            },
            onError: (error) => {
                toast.error(translateSiteError(error, t('siteChannel.advanced.saveFailed')));
            },
        });
    };

    const handleToggleProjectedKeyVisibility = (item: SiteSourceKeyFormItem, index: number) => {
        const rowId = `${item.id ?? 'new'}-${index}`;
        setVisibleSourceKeyRows((current) => ({
            ...current,
            [rowId]: !current[rowId],
        }));
    };

    const handleProjectedKeyFieldChange = (index: number, patch: Partial<SiteSourceKeyFormItem>) => {
        setSourceKeyForm((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
    };

    const handleAddProjectedKeyRow = () => {
        setSourceKeyForm((current) => ([
            ...current,
            {
                enabled: true,
                token: '',
                is_new: true,
                name: '',
                value_status: 'ready',
            },
        ]));
    };

    const handleRemoveProjectedKeyRow = (index: number) => {
        setSourceKeyForm((current) => current.filter((_, itemIndex) => itemIndex !== index));
    };

    const handleSaveProjectedKeys = () => {
        if (!editingProjectedGroup) return;
        const originalById = new Map(editingProjectedGroup.source_keys.map((key) => [key.id, key] as const));
        for (const item of sourceKeyForm) {
            if (!item.id) continue;
            const original = originalById.get(item.id);
            if (!original) continue;
            if (original.value_status !== 'masked_pending') continue;
            const trimmed = item.token.trim();
            if (trimmed === (original.token ?? '').trim()) continue;
            if (!trimmed) continue;
            if (isMaskedTokenValue(trimmed)) {
                toast.error(`Key #${item.id} 仍是脱敏值，必须填写完整 Key`);
                return;
            }
            if (!matchesMaskedToken(trimmed, original.token)) {
                toast.error(`Key #${item.id} 与已同步的脱敏值不匹配，请核对输入`);
                return;
            }
        }
        const payload = buildSourceKeyUpdatePayload(editingProjectedGroup.group_key, editingProjectedGroup.source_keys, sourceKeyForm);
        if (!payload.keys_to_add?.length && !payload.keys_to_update?.length && !payload.keys_to_delete?.length) {
            toast.error('没有需要保存的 Key 变更');
            return;
        }
        sourceKeyMutation.mutate(payload, {
            onSuccess: () => {
                toast.success(`上游分组「${editingProjectedGroup.group_name || editingProjectedGroup.group_key}」的源密钥已更新，并已重新投影 · 运行态将刷新`);
                setEditingProjectedGroup(null);
                setSourceKeyForm([]);
                setVisibleSourceKeyRows({});
            },
            onError: (error) => {
                toast.error(translateSiteError(error, '更新源密钥失败'));
            },
        });
    };

    const handleToggleDisabled = (model: SiteModelView) => {
        applyDisabledChange([model], !model.disabled);
    };

    const handleResetRoutes = () => {
        resetMutation.mutate(undefined, {
            onSuccess: () => {
                setPendingRouteOverrides({});
                toast.success('模型请求端点格式已重置');
            },
            onError: (error) => {
                toast.error(translateSiteError(error, '重置模型端点格式失败'));
            },
        });
    };

    const toggleQuickFilter = (filter: SiteChannelQuickFilter) => {
        const next = panelPreferences.quickFilters.includes(filter)
            ? panelPreferences.quickFilters.filter((item) => item !== filter)
            : QUICK_FILTER_OPTIONS.map((item) => item.key).filter((key) => key === filter || panelPreferences.quickFilters.includes(key));

        setQuickFilters(panelKey, next);
    };

    const handleSortChange = (field: SiteChannelTableSortField) => {
        const nextSort: SiteChannelTableSort = {
            field,
            order:
                panelPreferences.tableSort.field === field && panelPreferences.tableSort.order === 'asc'
                    ? 'desc'
                    : 'asc',
        };
        setTableSort(panelKey, nextSort);
    };
    const activeGroupValue = activeFilter.kind === 'all' ? SITE_GROUP_FILTER_ALL_VALUE : activeFilter.groupKey;
    const activeGroup = activeFilter.kind === 'group'
        ? account.groups.find((group) => group.group_key === activeFilter.groupKey) ?? null
        : null;
    const activeGroupLabel = activeGroup ? (activeGroup.group_name || activeGroup.group_key) : '全部分组';
    const activeGroupProjectionSuspended = activeGroup?.projection_suspended === true;
    const activeGroupProjectionStale = activeGroup && !activeGroupProjectionSuspended && STALE_MODEL_SYNC_STATUSES.includes(activeGroup.model_sync_status);
    const activeGroupSuspensionReason = activeGroup?.projection_suspend_reason || activeGroup?.model_sync_message || '';
    const activeGroupStaleReason = activeGroup?.model_sync_message || '';
    const activeQuickFilterCount = panelPreferences.quickFilters.length;
    const pendingKeyGroups = useMemo(
        () => visibleGroups.filter((group) => !group.has_keys),
        [visibleGroups],
    );
    const projectedGroups = useMemo(
        () => visibleGroups.filter((group) => group.has_projected_channel),
        [visibleGroups],
    );
    const unsupportedRouteCount = useMemo(
        () => visibleModels.filter((model) => !isSupportedRouteType(model.route_type)).length,
        [visibleModels],
    );

    const handleGroupFilterChange = useCallback((value: string) => {
        setActiveFilter(value === SITE_GROUP_FILTER_ALL_VALUE ? SITE_GROUP_FILTER_ALL : createGroupFilter(value));
    }, []);

    const handleClearQuickFilters = useCallback(() => {
        setQuickFilters(panelKey, []);
    }, [panelKey, setQuickFilters]);

    const handleFocusAttention = useCallback(() => {
        if (panelPreferences.quickFilters.includes('attention')) return;
        const next = QUICK_FILTER_OPTIONS
            .map((item) => item.key)
            .filter((key) => key === 'attention' || panelPreferences.quickFilters.includes(key));
        setQuickFilters(panelKey, next);
    }, [panelKey, panelPreferences.quickFilters, setQuickFilters]);

    return {
        // identity / nav
        siteId,
        account,
        accounts,
        activeAccountId,
        onSelectAccount,
        highlightedAccountId,
        registerAccountTabRef,
        onNavigateToChannel,

        // table
        tableHandleRef,
        visibleModels,
        modelsScopeKey,
        allVisibleSelected,
        pendingModelKeys,
        selectedModelKeys,
        highlightedModelKey,
        panelPreferences,
        panelKey,

        // toolbar derived
        activeGroup,
        activeGroupValue,
        activeGroupLabel,
        activeGroupProjectionSuspended,
        activeGroupSuspensionReason,
        activeGroupProjectionStale,
        activeGroupStaleReason,
        modelSearchTerm,
        activeQuickFilterCount,
        hasPendingChanges,

        // chips derived
        pendingKeyGroups,
        projectedGroups,
        unsupportedRouteCount,
        selectedModels,
        bulkMoveTarget,
        missingKeyGroup,
        missingKeyGuidePending,

        // dialogs
        editingProjectedGroup,
        editingAdvancedGroup,
        selectedAdvancedChannelId,
        advancedForm,
        addingManualGroup,
        manualModelsInput,
        manualModelRouteType,
        sourceKeyForm,
        visibleSourceKeyRows,

        // mutations pending
        createKeyMutation,
        sourceKeyMutation,
        groupProjectionMutation,
        advancedMutation,
        addManualModelsMutation,
        ensurePublicGroupsMutation,
        enableSiteAccount,
        resetMutation,

        // handlers
        setModelSearchTerm,
        setBulkMoveTarget,
        setSelectedModelKeys,
        setSelectedAdvancedChannelId,
        setManualModelsInput,
        setManualModelRouteType,
        setCompactMode,
        translateSiteError,

        handleToggleModelSelection,
        handleToggleAllVisible,
        handleSortChange,
        handleToggleDisabled,
        handleDeleteManualModel,
        applyRouteChange,
        applyDisabledChange,

        handleGroupFilterChange,
        handleOpenAddManualModels,
        handleToggleGroupProjection,
        toggleQuickFilter,
        handleClearQuickFilters,
        handleOpenAdvancedSettings,
        handleResetRoutes,
        handleFocusAttention,

        handleOpenMissingKeyGuide,
        handleCloseMissingKeyGuide,
        handleMissingKeyCreate,
        handleMissingKeyPaste,
        handleMissingKeySkip,

        handleOpenProjectedKeys,
        handleCloseProjectedKeys,
        handleToggleProjectedKeyVisibility,
        handleProjectedKeyFieldChange,
        handleAddProjectedKeyRow,
        handleRemoveProjectedKeyRow,
        handleSaveProjectedKeys,

        handleCloseAdvancedSettings,
        handleAdvancedParamChange,
        handleSaveAdvancedSettings,

        handleCloseAddManualModels,
        handleAddManualModels,

    };
}
