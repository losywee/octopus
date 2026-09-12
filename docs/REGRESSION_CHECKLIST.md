# 关键路径回归清单（Phase C5）

> 发版或大改 relay / 站点 / 自动分组 / 健康检查前，按本清单冒烟。

## 1. 站点 → 源密钥 → 投影

- [ ] 新增站点账号（Access Token）并同步，结果对话框能按上游分组展示
- [ ] 缺源密钥分组显示「缺源密钥」引导：快捷创建 / 粘贴 / 暂不投影
- [ ] 粘贴明文源密钥后投影恢复；脱敏值被拒绝
- [ ] 同步 partial/failed 时自动弹出同步明细

## 2. 对外分组 / 自动分组

- [ ] 精确匹配 + 归一化：`gpt-4o-2024-08-06` / `openai/gpt-4o` 挂到 `gpt-4o`
- [ ] create_missing：无同名对外分组时自动创建（仅 Exact）
- [ ] 「一键生成对外分组」对投影渠道强制 create-missing
- [ ] 客户端 `model=对外分组名` 可成功转发

## 3. 超时

- [ ] 设置 → 可靠性 → 非流式请求超时：0=不限制；设 30 后非流式慢上游应失败而非无限挂起
- [ ] 流式仍只受分组「首字超时」约束（非流式超时不作用于 stream）

## 4. 选路与熔断

- [ ] 日志 attempt 含 `reason`（mode/order/priority|weight/sticky）
- [ ] Failover：高优先级失败后落到低优先级
- [ ] 连续失败触发熔断后请求跳过该 channel/key（status=circuit_break）
- [ ] 分组健康检查失败会写入熔断；成功探活清除熔断
- [ ] 首页「运行态 · 熔断」条显示 open/half_open 条目

## 4. 协议与日志

- [ ] OpenAI Chat 流式 / 非流式
- [ ] Anthropic 流式（若有渠道）
- [ ] 日志费用/token 正常；多 attempt 展示选路原因与错误分离

## 5. 自动化命令

```bash
go test ./internal/op/ -run 'Normalize|CreateMissing|EnsurePublic|AutoGroup' -count=1
go test ./internal/grouphealth/ -count=1
go test ./internal/relay/balancer/ -count=1
go test ./internal/relay/ -count=1
go build -o /dev/null .
cd web && pnpm exec tsc --noEmit
```

## 6. 已知边界

- 健康检查写入熔断**不**写 relay 日志 / 统计（合成流量）
- 历史日志无 `reason` 字段属正常
- Fuzzy/Regex 不会 create_missing / 不用归一化建组名

## 渠道状态刷新（更新后）

- [ ] 更新普通渠道密钥/BaseURL 后：熔断清零、近1h失败率清空、粘性会话清空
- [ ] 启用/停用渠道后同上
- [ ] 站点源密钥保存/快捷创建后：投影渠道运行态刷新，首页/渠道详情不再显示旧熔断
- [ ] 渠道详情「运行态」面板可手动刷新，粘性数量可见
- [ ] 历史累计成功/失败统计可不变（预期）

## 推送前本地门禁（必须）

```bash
bash scripts/pre-push-check.sh
```

至少包含：
1. `go test ./...`
2. `cd web && pnpm exec tsc --noEmit`
3. `cd web && pnpm run lint`（0 errors）
4. `bash scripts/build.sh release`（与远端 release job 一致）
5. 可选：podman/docker 构建 `Dockerfile.debian` 冒烟

未通过门禁不要 push master。

