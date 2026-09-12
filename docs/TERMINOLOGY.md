# Octopus 术语表（中英对照）

> 目标：全项目统一说法，降低「组 / Key」混用带来的理解成本。  
> UI、错误文案、USAGE、README 均以此为准。

## 1. 四类最易混的概念

| 中文（首选） | 英文 / 代码 | 是什么 | 不是什么 |
|--------------|-------------|--------|----------|
| **对外分组** | Group / public model group | Octopus 对外暴露的模型名；客户端请求的 `model` 必须等于它 | 不是上游中转站里的用户组 |
| **上游分组** | Site user group / `group_key` | 中转站账号下的套餐/分组（如 `default`、`vip`） | 不是 Octopus 负载均衡分组 |
| **源密钥** | Source key / SiteToken | 上游站点的**调用** Token（常 `sk-...`），投影进渠道后用于转发 | 不是登录用 Access Token，也不是 `sk-octopus-*` |
| **访问密钥** | Octopus API Key | 客户端调 Octopus 的密钥（`sk-octopus-...`），在「设置 → API 密钥」创建 | 不是上游站点密钥 |

补充：

| 中文（首选） | 说明 |
|--------------|------|
| **管理凭证** | 站点账号登录/同步用的 Access Token、用户名密码等，用于同步模型、签到、代建源密钥 |
| **投影渠道 / 托管渠道** | 由站点同步自动生成的渠道，随站点维护 |
| **普通渠道** | 手动添加的渠道（自有 Base URL + 源密钥） |
| **选路原因** | 日志里 `attempt.reason`，说明为何选中该候选（mode/order/priority/weight/sticky） |

## 2. 请求链路（用术语串起来）

```text
客户端
  访问密钥 sk-octopus-...
  model = 对外分组名
        │
        ▼
Octopus Relay / Balancer
  在「对外分组」内按策略选渠道
  日志记录选路原因 + 尝试结果
        │
        ▼
投影渠道 / 普通渠道
  使用「源密钥」调用上游
  实际 model = GroupItem.model_name
        ▲
        │ 投影
站点账号
  管理凭证（同步/签到/代建）
  上游分组 + 源密钥 + 模型列表
```

## 3. UI 文案约定

| 场景 | 推荐说法 | 避免 |
|------|----------|------|
| 分组页 / 导航 | 对外分组（可简称「分组」并在说明里点明） | 与「上游分组」混写为「分组」且无上下文 |
| 站点渠道缺 Token | 缺源密钥 / 补齐源密钥 | 笼统「缺 Key」「待建 Key」 |
| 站点账号 Access Token | 管理凭证 / Access Token | 「站点 Key」 |
| 设置里 sk-octopus | 访问密钥 / API 密钥 | 与源密钥都叫 API Key 且无前缀 |
| 同步结果 | 上游分组 · 源密钥 · 投影渠道 | 「Key / 分组」不区分层级 |

## 4. 错误文案模板

- 缺源密钥：`上游分组「{groupKey}」没有可用的源密钥。请先创建或粘贴该分组的源密钥，再重新同步。`
- 创建源密钥失败：`创建源密钥失败，请检查站点管理凭证或稍后重试。`
- 更新源密钥失败：`更新源密钥失败，请检查输入后重试。`
- 无可用对外分组：`模型不存在或未配置可用的对外分组。`

## 5. 英文对照（界面 en）

| zh | en |
|----|----|
| 对外分组 | Public group / model group |
| 上游分组 | Upstream group / site group |
| 源密钥 | Source key |
| 访问密钥 | Access key / Octopus API key |
| 管理凭证 | Management credential |
| 投影渠道 | Projected channel |
| 选路原因 | Route reason |

## 6. 模型名归一化（自动分组）

精确匹配可选开启「归一化模型名」：

- 去掉已知供应商前缀：`openai/gpt-4o` → `gpt-4o`
- 去掉日期/快照后缀：`gpt-4o-2024-08-06` → `gpt-4o`
- **对外分组名**用归一化结果；**GroupItem.model_name** 仍保留上游真实模型 id

## 7. 维护规则

1. 新增文案涉及「组 / Key」时，先查本表再写。
2. 同一屏幕内若同时出现两类「组」或「Key」，必须加定语（对外 / 上游；源 / 访问）。
3. 改术语时同步：`docs/TERMINOLOGY.md`、`USAGE_zh.md`、locale、相关 toast/错误映射。
