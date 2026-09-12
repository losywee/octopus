# Octopus 大改进计划

> 目标：把「站点 → 源密钥 → 投影渠道 → 对外分组 → 可诊断路由」做成低心智负担的自动化闭环。  
> 原则：每个 PR 一个主题；先打通主链路，再增强智能选路；默认智能、高级可配。

## 1. 背景与问题

当前系统能力已经覆盖：

- 多协议转发（OpenAI Chat / Responses / Anthropic）
- 分组负载均衡、熔断、重试、会话粘性
- 站点同步与 projected site channel
- 自动分组（仅挂载到**已有** Group）

主要痛点：

1. 站点接入概念重（账号凭证 ≠ 源密钥，站点分组 ≠ 对外分组）
2. 自动分组不会创建缺失 Group，接完站仍要大量手工
3. 路由决策可解释性不足（为什么选了这个 channel/key）
4. 巨型模块拖慢迭代（`site-channel/index.tsx`、`relay.go`、`sitesync/*`）

## 2. 总体路线（三阶段）

```text
Phase A  接得上   →  缺源密钥可补齐、缺对外分组可创建、状态可读、术语统一 ✅
Phase B  少手工   →  归一化 / 一键对外分组 / 接入状态条 ✅
Phase C  稳得住   →  健康联动熔断 / 运行态看板 / site-channel 拆分 / relay 拆分 / 回归清单 ✅
Phase B  少手工   →  同步后一键可用、别名归一、投影自动入组
Phase C  稳得住   →  健康联动熔断、运行态看板、模块拆分与回归加固
```

### Phase A — 接得上（当前进行）

| ID | 主题 | 状态 | 说明 |
|----|------|------|------|
| A1 | Auto Group 支持 create_missing（精确匹配） | ✅ 已完成 | 模型无对应对外分组时自动创建 |
| A2 | 站点缺 Key 引导闭环 | ✅ 已完成 | 快捷创建 / 粘贴已有 Key / 暂不投影 + 状态条 |
| A3 | 同步结果可读性 | ✅ 已完成 | 同步结果对话框：按上游分组展示成功/缺密钥/暂停等 |
| A4 | 路由决策最小可解释 | ✅ 已完成 | ChannelAttempt.reason + 日志 UI 展示选路原因 |
| A5 | 术语与文档统一 | ✅ 已完成 | 术语表 + USAGE/README/locale/错误文案对齐 |

### Phase B — 少手工

| ID | 主题 | 状态 |
|----|------|------|
| B1 | 模型别名/归一化（`gpt-4o-2024-08-06` → `gpt-4o`） | ✅ 已完成 |
| B2 | 投影成功后一键「生成/更新对外分组」 | ✅ 已完成 |
| B3 | 站点接入向导（4 步状态条） | ✅ 已完成 |
| B4 | Auto Group 策略扩展（alias / 前缀剥离） | ✅ 已完成（并入 B1 归一化） |

### Phase C — 稳得住

| ID | 主题 | 状态 |
|----|------|------|
| C1 | Group Health 与 balancer 联动（失败自动降权） | ✅ 已完成 |
| C2 | Group/Channel 运行态看板 | ✅ 已完成（熔断运行态 API + 首页条） |
| C3 | 拆分 `site-channel/index.tsx` | ✅ 基本完成（~3400→~630 行；Panel/Dialog/Card/Table 已拆） |
| C4 | 拆分 `relay` 关键路径（stream / retry / metrics） | ✅ 已完成（relay.go → handler / forward / stream） |
| C5 | 关键路径回归测试清单固化 | ✅ 已完成 |

## 3. 架构目标态

```text
[客户端]
   model = 对外分组名
        │
        ▼
[Relay + Balancer]
   选路 / 熔断 / 粘性 / 重试
   记录 route reason + attempts
        │
        ▼
[Channel / ChannelKey]
   真实上游模型名 + 源密钥
        ▲
        │ 投影
[Site Account]
   AccessToken(管理) + SiteUserGroup + SiteToken(源密钥)
   同步模型 / 代建 Key / 投影渠道
        │
        ▼
[Auto Group]
   attach 已有分组
   create_missing 创建缺失分组（可选）
```

## 4. A1 详细设计：Auto Group Create Missing

### 4.1 行为

新增全局设置：`auto_group_create_missing_enabled`（bool，默认 `false`）

当渠道执行自动分组且模式为 **Exact（精确匹配）** 时：

1. 先按现有逻辑 reconcile 已有 Group
2. 若开关开启：对渠道每个模型名
   - 若已存在同名（忽略大小写）Group → 跳过创建
   - 否则创建 `Group{Name: modelName, Mode: RoundRobin}`，并加入 `GroupItem{channel, modelName}`

Fuzzy / Regex **不**自动创建分组（命名不可判定，避免噪声）。

### 4.2 API / UI

- 复用现有 Setting 读写
- Auto Group 配置接口附带该开关（`GroupAutoGroupConfig`）
- 前端自动分组对话框增加开关

### 4.3 验收

- 渠道有 `gpt-4o,gpt-4o-mini`，无对应 Group，Exact + 开关开 → 自动创建两个 Group 并挂载
- 开关关 → 行为与现网一致
- Fuzzy/Regex + 开关开 → 仍不创建新 Group

## 5. 后续阶段验收（摘要）

- **A 完成**：新账号从加站到首次成功请求 < 10 分钟
- **B 完成**：常见 NewAPI 站同步后主流模型无需手建 Group
- **C 完成**：上游抖动可自动降级；UI 能解释切走原因

## 6. 开发约定

- 每个主题独立提交 / PR
- 先测后改：关键逻辑补表驱动测试
- 大文件改动前优先抽取 pure function
- 不在本计划外横向扩张新平台适配，除非阻塞主链路

## 7. 进度日志

| 日期 | 项 | 说明 |
|------|----|------|
| 2026-03-23 | 计划创建 | 建立三阶段路线 |
| 2026-03-23 | A1 完成 | create_missing 后端 + 设置 + 测试 + 前端开关；`go test ./internal/op -run AutoGroup` 通过 |
| 2026-03-23 | A2 完成 | MissingKeyGuideDialog：快捷创建 / 粘贴 / 暂不投影；缺密钥入口与暂停提示统一 |
| 2026-03-23 | A3 完成 | SyncResultDialog：同步后展示分组明细，可跳转站点渠道补密钥 |
| 2026-03-23 | A4 完成 | attempt.reason（mode/order/priority/weight/sticky）；日志详情与 tooltip 展示 |
| 2026-03-23 | A5 完成 | docs/TERMINOLOGY.md；USAGE/README 与 zh/en/zh_hant 关键错误文案统一 |
| 2026-03-23 | B1/B4 完成 | 模型名归一化（前缀/日期后缀）；精确匹配 + create_missing 共用 |
| 2026-03-23 | B2 完成 | POST ensure-public-groups + 站点渠道「一键生成对外分组」 |
| 2026-03-23 | B3 完成 | SiteChannelOnboardingPipeline 四步状态条 |
| 2026-03-23 | C1 完成 | 健康探活结果写入 circuit breaker |
| 2026-03-23 | C2 完成 | GET /api/v1/runtime/overview + 首页 RuntimeCircuitStrip |
| 2026-03-23 | C5 完成 | docs/REGRESSION_CHECKLIST.md |
| 2026-03-23 | C3 部分 | site-channel 组件桶 + 已拆对话框/状态条；index 仍待继续拆 |
| 2026-03-23 | C3 续 | 抽出 model-helpers / HistorySummary / table-parts / ModelTable；index ~2640 行 |
| 2026-03-23 | C3 完成 | 再拆 SiteAccountPanel / SiteChannelDialog / SiteCard；index ~630 行 |
| 2026-03-23 | C4 完成 | `relay.go` 拆为 `relay.go` + `relay_forward.go` + `relay_stream.go`；SSE helper 并入 `heartbeat.go` |
| 2026-03-23 | 优化续 | SiteAccountPanel 再拆 Advanced/Manual/SourceKeys 对话框；模型搜索 150ms 防抖；源密钥文案统一 |
| 2026-03-23 | 优化续2 | 再拆 GroupStatusAlerts / AccountActionChips；Panel ~1113 行；文案「源密钥」统一 |
| 2026-03-23 | 优化续3 | 再拆 AccountTabs / AccountToolbar；Panel ~900 行；工具栏文案「上游分组」 |
| 2026-03-23 | 优化续4 | 抽出 useSiteAccountPanel hook；Panel 渲染层 ~197 行 |
| 2026-03-23 | 产品+可靠性 | 设置 `relay_request_timeout` 非流式超时；运行态看板补渠道失败率 |
| 2026-03-23 | 产品+可靠性2 | 失败率改为近 1h 滑动窗口；attempt 标注 timeout=first_token/request |
| 2026-07-24 | IA 方案A | 主导航改为 概览/接入/路由/流量/设置；渠道与价格收入「更多」；首页工作台待办 |
| 2026-07-24 | IA 深化 | 日志 cancel/timeout chip；路由空状态；接入进度条；设置快捷入口；运行态跳转流量 |
