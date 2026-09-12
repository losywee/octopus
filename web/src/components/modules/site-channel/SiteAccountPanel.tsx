'use client';

import type { SiteChannelAccount } from '@/api/endpoints/site-channel';
import { toast } from '@/components/common/Toast';
import { AccountActionChips } from './AccountActionChips';
import { AccountTabs } from './AccountTabs';
import { AccountToolbar } from './AccountToolbar';
import { AdvancedSettingsDialog } from './AdvancedSettingsDialog';
import { GroupStatusAlerts } from './GroupStatusAlerts';
import { ManualModelsDialog } from './ManualModelsDialog';
import { MissingKeyGuideDialog } from './MissingKeyGuideDialog';
import { SiteChannelOnboardingPipeline } from './OnboardingPipeline';
import { SiteChannelTableView } from './ModelTable';
import { SourceKeysDialog } from './SourceKeysDialog';
import type { PendingJump, SiteChannelJumpTarget } from '@/stores/jump';
import { useSiteAccountPanel } from './useSiteAccountPanel';

type SiteChannelPendingJump = PendingJump & { target: SiteChannelJumpTarget };

export function SiteAccountPanel(props: {
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
}) {
    const { tableHandleRef, ...p } = useSiteAccountPanel(props);

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5">
            <div className="flex flex-none flex-col gap-2 rounded-2xl border border-border/70 bg-card/70 p-2.5">
                <SiteChannelOnboardingPipeline account={p.account} />
                <AccountTabs
                    accounts={p.accounts}
                    activeAccountId={p.activeAccountId}
                    highlightedAccountId={p.highlightedAccountId}
                    currentAccount={p.account}
                    enablePending={p.enableSiteAccount.isPending}
                    onSelectAccount={p.onSelectAccount}
                    registerAccountTabRef={p.registerAccountTabRef}
                    onToggleEnabled={() =>
                        p.enableSiteAccount.mutate({
                            id: p.account.account_id,
                            enabled: !p.account.enabled,
                        })
                    }
                />

                <AccountToolbar
                    account={p.account}
                    activeGroup={p.activeGroup}
                    activeGroupValue={p.activeGroupValue}
                    activeGroupLabel={p.activeGroupLabel}
                    activeGroupProjectionSuspended={!!p.activeGroupProjectionSuspended}
                    activeGroupSuspensionReason={p.activeGroupSuspensionReason}
                    modelSearchTerm={p.modelSearchTerm}
                    activeQuickFilterCount={p.activeQuickFilterCount}
                    quickFilters={p.panelPreferences.quickFilters}
                    compactMode={!!p.panelPreferences.compactMode}
                    projectionTogglePending={p.groupProjectionMutation.isPending}
                    resetRoutesPending={p.resetMutation.isPending}
                    hasPendingChanges={p.hasPendingChanges}
                    onGroupFilterChange={p.handleGroupFilterChange}
                    onSearchChange={p.setModelSearchTerm}
                    onAddManualModels={() => p.activeGroup && p.handleOpenAddManualModels(p.activeGroup)}
                    onToggleProjection={() => p.activeGroup && p.handleToggleGroupProjection(p.activeGroup)}
                    onToggleQuickFilter={p.toggleQuickFilter}
                    onClearQuickFilters={p.handleClearQuickFilters}
                    onOpenAdvanced={() => p.activeGroup && p.handleOpenAdvancedSettings(p.activeGroup)}
                    onToggleCompactMode={() => p.setCompactMode(p.panelKey, !p.panelPreferences.compactMode)}
                    onResetRoutes={p.handleResetRoutes}
                />

                <GroupStatusAlerts
                    activeGroup={p.activeGroup}
                    projectionSuspended={!!p.activeGroupProjectionSuspended}
                    projectionStale={!!p.activeGroupProjectionStale}
                    suspensionReason={p.activeGroupSuspensionReason}
                    staleReason={p.activeGroupStaleReason}
                    missingKeyGuidePending={p.missingKeyGuidePending}
                    onOpenMissingKeyGuide={p.handleOpenMissingKeyGuide}
                />

                <AccountActionChips
                    groups={p.account.groups}
                    pendingKeyGroups={p.pendingKeyGroups}
                    projectedGroups={p.projectedGroups}
                    unsupportedRouteCount={p.unsupportedRouteCount}
                    selectedModels={p.selectedModels}
                    bulkMoveTarget={p.bulkMoveTarget}
                    hasPendingChanges={p.hasPendingChanges}
                    ensurePublicGroupsPending={p.ensurePublicGroupsMutation.isPending}
                    missingKeyGuidePending={p.missingKeyGuidePending}
                    activeMissingKeyGroupKey={p.missingKeyGroup?.group_key}
                    onEnsurePublicGroups={() => {
                        p.ensurePublicGroupsMutation.mutate(undefined, {
                            onSuccess: (result) => {
                                toast.success(result.message || '已生成/更新对外分组');
                            },
                            onError: (error) => {
                                toast.error(p.translateSiteError(error, '生成对外分组失败'));
                            },
                        });
                    }}
                    onOpenMissingKeyGuide={p.handleOpenMissingKeyGuide}
                    onOpenProjectedKeys={p.handleOpenProjectedKeys}
                    onFocusAttention={p.handleFocusAttention}
                    onBulkMoveTargetChange={p.setBulkMoveTarget}
                    onBulkMove={() => p.applyRouteChange(p.selectedModels, p.bulkMoveTarget)}
                    onBulkEnable={() => p.applyDisabledChange(p.selectedModels, false)}
                    onBulkDisable={() => p.applyDisabledChange(p.selectedModels, true)}
                    onClearSelection={() => p.setSelectedModelKeys(new Set())}
                />
            </div>

            <MissingKeyGuideDialog
                open={!!p.missingKeyGroup}
                group={p.missingKeyGroup}
                accountName={p.account.account_name}
                createPending={p.createKeyMutation.isPending}
                pastePending={p.sourceKeyMutation.isPending}
                skipPending={p.groupProjectionMutation.isPending}
                onClose={p.handleCloseMissingKeyGuide}
                onCreate={p.handleMissingKeyCreate}
                onPaste={p.handleMissingKeyPaste}
                onSkip={p.handleMissingKeySkip}
            />

            <AdvancedSettingsDialog
                group={p.editingAdvancedGroup}
                selectedChannelId={p.selectedAdvancedChannelId}
                form={p.advancedForm}
                pending={p.advancedMutation.isPending}
                onClose={p.handleCloseAdvancedSettings}
                onSelectChannel={p.setSelectedAdvancedChannelId}
                onParamChange={p.handleAdvancedParamChange}
                onSave={p.handleSaveAdvancedSettings}
            />

            <ManualModelsDialog
                group={p.addingManualGroup}
                modelsInput={p.manualModelsInput}
                routeType={p.manualModelRouteType}
                pending={p.addManualModelsMutation.isPending}
                onClose={p.handleCloseAddManualModels}
                onModelsInputChange={p.setManualModelsInput}
                onRouteTypeChange={p.setManualModelRouteType}
                onSubmit={p.handleAddManualModels}
            />

            <SourceKeysDialog
                group={p.editingProjectedGroup}
                form={p.sourceKeyForm}
                visibleRows={p.visibleSourceKeyRows}
                pending={p.sourceKeyMutation.isPending}
                onClose={p.handleCloseProjectedKeys}
                onToggleVisibility={p.handleToggleProjectedKeyVisibility}
                onFieldChange={p.handleProjectedKeyFieldChange}
                onAddRow={p.handleAddProjectedKeyRow}
                onRemoveRow={p.handleRemoveProjectedKeyRow}
                onSave={p.handleSaveProjectedKeys}
            />

            {p.visibleModels.length === 0 ? (
                <div className="flex min-h-[18rem] flex-1 items-center justify-center rounded-3xl border border-dashed border-border/70 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
                    当前筛选和搜索条件下没有匹配模型
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/70">
                    <SiteChannelTableView
                        ref={tableHandleRef}
                        models={p.visibleModels}
                        resetKey={p.modelsScopeKey}
                        allVisibleSelected={p.allVisibleSelected}
                        pendingModelKeys={p.pendingModelKeys}
                        selectedModelKeys={p.selectedModelKeys}
                        compactMode={p.panelPreferences.compactMode}
                        tableSort={p.panelPreferences.tableSort}
                        highlightedModelKey={p.highlightedModelKey}
                        onToggleModelSelection={p.handleToggleModelSelection}
                        onToggleAllVisible={p.handleToggleAllVisible}
                        onSortChange={p.handleSortChange}
                        onMoveModel={(model, nextRouteType) => p.applyRouteChange([model], nextRouteType)}
                        onToggleDisabled={p.handleToggleDisabled}
                        onDeleteManualModel={p.handleDeleteManualModel}
                        onNavigateToChannel={p.onNavigateToChannel}
                    />
                </div>
            )}
        </div>
    );
}
