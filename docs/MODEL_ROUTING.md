# 模型路由总览（对外分组 · 规范名 · 别名）

## 一句话

- **对外统一名** = 客户端 `model` = `Group.Name`（建议与规范模型字典一致）
- **上游真实 id** = `GroupItem.model_name`（永远原样转发给渠道）
- **别名表**把杂乱上游 id 映射到规范名，再入组

## 三层结构（不要再叠第四套黑盒规则）

```
上游模型 id（渠道/站点投影）
    │
    ├─① 归一化 NormalizePublicModelName（机械）
    │     去供应商前缀、日期后缀、3-5→3.5 等
    │
    ├─② 规范模型字典 PublicModel + Alias（可运营）
    │     gpt-4o  ← gpt-4o-all, openai/gpt-4o-2024-08-06
    │
    └─③ 对外分组 Group + Items（运行时选路）
          负载均衡 / 熔断 / 粘性 / 超时
```

匹配优先级（自动分组 · 精确模式）：

1. 别名表精确匹配  
2. 归一化后命中字典 / 分组名  
3. 分组 `match_regex`（专家）  
4. 否则：待归类 / 或 create-missing 用归一化名建组  

## 厂商筛选（UI）

路由页厂商 chip（Claude / OpenAI / …）是**浏览用启发式**（`inferModelFamily`），  
**不是**第二套数据模型。真·分类请用规范名与分组名本身。

以后若要可配置：再把 family 做成 setting JSON；默认不必。

## 推荐操作流

1. **规范/别名**：维护 10～30 个常用 public name + 别名  
2. **自动分组**：精确 + 归一化开；create-missing 按需  
3. **一键生成对外分组**：投影渠道批量入组  
4. **路由页厂商 chip**：浏览，不负责正确性  

## 不做

- 不用 fuzzy 当默认（易把 gpt-4 / gpt-4o 糊在一起）  
- 不转发时把上游 model 改写成规范名  
- 不让每个上游 id 自动变一个对外 model  

## 导入 / 导出

- `GET /api/v1/public-models/export` → `[{ name, aliases, note, enabled }]`
- `POST /api/v1/public-models/import` body `{ "items": [ ... ] }`（按 name 合并别名）
- UI：路由 → 规范/别名 → 导出（剪贴板+文件）/ 导入（选 JSON 文件）

## API

- `GET/POST /api/v1/public-models`
- `PUT/DELETE /api/v1/public-models/:id`
- `POST /api/v1/public-models/resolve` `{ "upstreams": ["..."] }`
