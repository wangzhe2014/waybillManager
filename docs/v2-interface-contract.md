# V3 调用 V2 系统间接口文档

## 对接原则

V3 与 V2 独立部署、独立数据库。V3 不直连 V2 Supabase，只通过 HTTP API 获取运单和 SKU 数据。每次调用都携带服务间鉴权头和请求追踪 ID，V3 将调用结果写入 `integration_logs`。

## 鉴权

```http
Authorization: Bearer <V2_API_KEY>
X-Request-ID: req_20260703_094210_7b1c
```

V3 环境变量使用 `V2_API_BASE_URL` 和 `V2_API_KEY`。V2 项目需要配置同值的 `V2_SERVICE_API_KEY`。不在代码、文档或日志中写入真实密钥。

## V2 新增接口

### 1. 增量同步运单列表

`GET /api/v3/shipments?updatedAfter=2026-07-03T00:00:00.000Z&limit=200`

兼容别名：`GET /api/v3/shipments/sync?updatedAfter=...&limit=200`

用于 V3 初始化或定时刷新本地运单快照。V2 当前 `shipments` 表没有 `updated_at`，短期按 `created_at` 增量；正式二开建议补 `updated_at` 字段。

响应示例：

```json
{
  "data": [
    {
      "waybillNo": "PS2512220005001",
      "storeName": "海口龙湖天街店",
      "receiverName": "林晓",
      "receiverPhone": "13800002190",
      "receiverAddress": "海南省海口市龙华区龙湖天街",
      "amount": 4,
      "amountSource": "sku_quantity_total",
      "createdAt": "2026-07-03T08:20:00.000Z",
      "skus": [
        {
          "skuCode": "ZBWP10086",
          "skuName": "冷链牛肉卷",
          "skuQuantity": 4,
          "skuSpec": "500g",
          "remark": ""
        }
      ]
    }
  ],
  "count": 1,
  "requestId": "req_20260703_094210_7b1c"
}
```

说明：V2 现有导入表没有真实金额字段，`amount` 暂按 SKU 数量合计回填并通过 `amountSource` 标明来源。若考试或生产要求真实赔付金额，需要 V2 补金额列或由 V3 工单上报时填写。

### 2. 获取运单详情

`GET /api/v3/shipments/:externalCode`

用于 V3 发起异常上报前实时校验运单存在，并获取 SKU 明细生成本地快照。

成功响应同单条运单详情，并额外返回 `requestId`。运单不存在返回 `404`：

```json
{
  "error": "运单不存在",
  "requestId": "req_20260703_094210_7b1c"
}
```

### 3. 校验 SKU 归属

`GET /api/v3/shipments/:externalCode/skus/:skuCode/validate`

用于扫描录入时确认 SKU 属于指定运单，避免扫入无关货物。

响应示例：

```json
{
  "valid": true,
  "waybillNo": "PS2512220005001",
  "skuCode": "ZBWP10086",
  "skuName": "冷链牛肉卷",
  "requestId": "req_20260703_094210_7b1c"
}
```

## 超时与重试

- 单次超时：3000ms。
- 重试：最多 2 次，只重试 GET 或带幂等键的 POST。
- 降级：V2 不可用时，工单详情可展示本地快照并标注同步时间；新异常发起和扫描归属校验属于关键真实性动作，V2 不可用时不允许创建新工单。

## V2 二开边界

新增 `/api/v3/*` 路由，不改动原 `/api/shipments` 行为，避免影响既有万能导入系统。字段采用向后兼容策略：读取时兼容 V1 回退列和 V2 新列；后续新增字段只增不删。

当前沙箱只能写入 V3 项目目录，V2 项目 `D:\trae\importOrder` 的实际文件写入需切换到包含两个项目的工作区或重新获得写入审批后执行。
