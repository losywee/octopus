# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Go module path: `github.com/xuanli27/octopus`（fork 自 bestruirui/octopus，保留 Hureru 分支的 Sites/协议转换等增强）。

## 开发命令

### 后端 (Go)
```bash
go run main.go start                # 启动服务 (默认 0.0.0.0:8080)
go run main.go start --config path  # 指定配置文件
go build ./...                      # 编译检查
go vet ./...                        # 静态检查
go test ./...                       # 运行所有测试
go test -race ./internal/relay/...  # 并发检测（relay 含大量 goroutine，改动后建议跑）
```

### ⚠️ Go 构建前置条件

`static/static.go` 使用 `//go:embed all:out` 嵌入前端产物，**`static/out/` 不存在时 `go build`/`go vet`/`go test` 全部失败**（报 `pattern all:out: no matching files found`）。`static/out/` 在 `.gitignore` 中，由前端构建生成。纯后端开发时可先建占位文件：

```bash
mkdir -p static/out && printf '<html></html>' > static/out/index.html
```

### 前端 (Next.js)
```bash
cd web
pnpm install                        # 安装依赖
pnpm dev                            # 开发服务器 (localhost:3000)
NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:8080" pnpm dev  # 指定后端地址
pnpm build                          # 生产构建 (输出到 web/out/)
pnpm lint                           # ESLint 检查
```

### 完整构建
```bash
cd web && pnpm install && pnpm build && cd ..
mv web/out static/
go run main.go start
```

### 跨平台发布
```bash
./scripts/build.sh build linux x86_64   # 构建指定平台
./scripts/build.sh release              # 构建所有平台
```

### Docker
```bash
docker compose up -d
```

## 架构概览

Octopus 是一个 **LLM API 聚合与负载均衡服务**。Go 后端 (Gin + GORM) 提供 API 代理和管理接口，Next.js 前端提供管理面板。

**术语（写 UI/文档时必遵）**：见 `docs/TERMINOLOGY.md`。
- **对外分组 (Group)** = 客户端 `model` 名
- **上游分组** = 中转站 `group_key`
- **源密钥** = 上游调用 Token（投影进渠道）
- **访问密钥** = 客户端 `sk-octopus-*`

**启动流程**: `main.go` → `cmd/start.go` → 初始化 Config → DB → Cache → HTTP Server → Background Tasks

**请求流**: Gin Router → Middleware (Auth/CORS/Logger) → Handler → Op (业务逻辑) → DB/Cache

**API 代理流**: Request → Inbound Transformer (协议转换) → Relay → Balancer (负载均衡/熔断) → 外部 LLM API → Outbound Transformer → Response

## 后端关键模块 (`internal/`)

| 模块 | 职责 |
|------|------|
| `conf/` | Viper 配置管理，env 前缀 `OCTOPUS_`，默认读取 `data/config.json` |
| `db/` | GORM 数据库层，支持 SQLite(默认)/MySQL/PostgreSQL，`db/migrate/` 含编号迁移（003–017 等，需幂等） |
| `model/` | 数据模型定义 (Channel, Group, User, APIKey, Setting, Stats, Site 等)；含纯函数逻辑如 `APIKey.ModelAllowed`（允许/禁止列表） |
| `op/` | **业务逻辑层 (Service)**，包含内存缓存管理，Handler 调用此层而非直接操作 DB。统计先写内存、定时批量落库（`stats.go`）；站点模型小时级统计独立持久化（`stats_site_model.go`，含方言安全 upsert） |
| `server/handlers/` | HTTP 请求处理器，按资源分文件 |
| `server/middleware/` | Auth (JWT + API Key)、CORS、Logger、Static 等中间件 |
| `server/router/` | 自定义路由框架，链式注册: `NewGroupRouter(path).Use(mw).AddRoute(route)` |
| `server/auth/` | JWT 生成/验证（secret 持久化在 DB），API Key 格式 `sk-octopus-*` |
| `server/resp/` | 统一响应格式 `{code, message, data}` |
| `relay/` | API 代理核心（详见下节） |
| `transformer/` | 协议转换适配器，`inbound/` 解析请求，`outbound/` 格式化响应，支持 OpenAI Chat/Responses/Anthropic/Gemini/Volcengine；核心是 StreamEvent 流水线（`model/stream_event.go`）与流聚合（`model/stream_aggregator.go`） |
| `sitesync/` | 站点管理子系统：定时同步、签到、余额/收益查询、站点渠道投影（含声明式自动分组对账）、AnyRouter/sub2api 适配、路由探测 |
| `grouphealth/` | 分组健康检查（手动触发探活，渠道可用 `skip_health_probe` 跳过） |
| `outlierwindow/` | 被动离群退役的滑动窗口统计（仅站点投影渠道，默认关闭） |
| `webdav/` | WebDAV 备份/恢复客户端 |
| `task/` | 后台定时任务（统计持久化、模型同步、价格更新、站点同步/签到、WebDAV 备份）；`Update(interval<=0)` 会删除任务，重新启用需 `Register` |
| `client/` | LLM 提供商 HTTP 客户端封装 |
| `helper/` | 模型列表拉取（多路径探测 `/models`、`/v1/models`、`/api/v1/models`、`/v1beta/models`）、价格同步等外部交互 |
| `update/` | 自更新（GitHub release 下载 + zip 解压，zip-slip 已防护） |
| `apperror/` | 统一应用错误类型 |
| `utils/log/` | Zap 结构化日志 |
| `utils/cache/` | 分片缓存 (16 shard, xxhash)，**Get 返回值拷贝**——读改写需自行加锁 |
| `utils/safe/` | 带 panic recovery 与命名标签的 goroutine 封装，后台 goroutine 必须用它 |
| `utils/shutdown/` | 信号处理（SIGINT/SIGTERM/SIGHUP → 优雅关停 + 缓存落盘） |

## relay/ 核心行为

- **请求流**: Inbound Transformer → Balancer（RoundRobin/Random/Failover/Weighted + 熔断 Open/HalfOpen/Closed，指数退避）→ 外部 LLM API → Outbound Transformer → Response；支持重试、路由学习、取消传播。
- **取消归一化** (`cancel.go`): 客户端断开时判定成功/失败——所有 choice 都有 `finish_reason` 记为成功（严格）；"已交付内容 + 有用量" 也记为成功（软完成，兼容不发 finish_reason 的上游）；无内容无用量的中途取消记为失败。
- **Key 级模型控制** (`model_allow.go`): 复用 `model.APIKey.ModelAllowed`，`ModelListMode` 为 `allow`（默认，白名单）/`deny`（黑名单）。
- **WS 中继** (`ws_*.go`): 上游 WS 连接池（健康退避、preferred conn 亲和）、DB 支持的响应亲和（`previous_response_id` 续传）、OpenAI Responses 透传。改动连接池时注意 checkout/preflight/put 的并发语义。
- **早期心跳** (`heartbeat.go`): 流式请求在首 token 前按设置发送 SSE 心跳注释；`Hand()`/`Stop()` 通过 `done` channel 与后台 goroutine 建立 happens-before。

## 前端关键模式 (`web/src/`)

- **状态管理**: Zustand (本地/持久化状态) + TanStack React Query (服务端数据缓存，30s 自动刷新)
- **UI**: shadcn/ui + Radix UI 原语 + TailwindCSS v4 + Framer Motion 动画；大列表用 `components/common/VirtualizedGrid.tsx`（虚拟滚动，空白区滚轮事件会转发）
- **路由**: 自定义 SPA 路由 (`route/config.tsx` 定义，`ContentLoader` 动态加载)，**不使用** Next.js 文件路由
- **API 层**: `api/client.ts` 基于 fetch 的 HTTP 客户端，`api/endpoints/` 按功能导出 React Query hooks（`stats.ts` 含模型维度统计/排行、缓存 token 字段）
- **i18n**: next-intl，翻译文件位于 `public/locale/{en,zh_hans,zh_hant}.json`，**新增文案三个文件都要加**
- **构建**: SSG 静态导出 (`output: "export"`)，嵌入到 Go 二进制的 `static/` 目录

## 配置

运行时配置 `data/config.json`（首次运行自动生成），所有字段可通过 `OCTOPUS_` 前缀环境变量覆盖:
- `OCTOPUS_SERVER_PORT`, `OCTOPUS_SERVER_HOST`
- `OCTOPUS_DATABASE_TYPE` (sqlite/mysql/postgres), `OCTOPUS_DATABASE_PATH`
- `OCTOPUS_LOG_LEVEL`

数据库运行时设置 (CORS、心跳、熔断、自动分组、站点同步周期等) 存储在 `Setting` 模型中，通过 `op/setting.go` 缓存访问；key 定义见 `internal/model/setting.go`，改 `Validate()` 时注意与 `task.Update` 的交互（interval<=0 会删任务）。

## 关键测试位置

- `internal/relay/cancel_test.go` — 取消归一化（严格/软完成）
- `internal/relay/heartbeat_test.go` — 早期心跳（注意：断言前需 `hb.Stop()` 同步，否则 `-race` 报数据竞争）
- `internal/op/projected_channel_auto_group_test.go` — 自动分组声明式对账
- `internal/op/stats_site_model_upsert_test.go` — 方言安全 upsert
- `internal/model/apikey_test.go` — Key 允许/禁止列表
- `internal/helper/fetch_test.go` — 多路径模型列表探测

## 贡献规范

- 每个 PR 只包含一个变更主题（一个功能或一个 BUG 修复）
- AI 辅助代码需完成人工审查后提交
