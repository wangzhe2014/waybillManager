# 运单全流程管理系统 V3

V3 是独立于 V2 万能导入系统的运单全生命周期管理平台，覆盖扫描品控、异常上报、分级审批、执行联动、接口监控和需求假设文档。

## 技术栈

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Supabase 独立数据库

## 本地运行

```bash
npm install
npm run dev -- -p 3001
```

默认访问：

```text
http://localhost:3001
```

## 环境变量

```env
NEXT_PUBLIC_SUPABASE_URL=your_v3_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_v3_supabase_anon_key
V2_API_BASE_URL=http://localhost:3000
V2_API_KEY=service_to_service_key
CRON_SECRET=random_timeout_job_secret
```

V2 项目对应需要配置同一个服务间密钥：

```env
V2_SERVICE_API_KEY=service_to_service_key
```

不要提交真实密钥。

## 主要文件

- `src/app/page.tsx`：V3 主工作台。
- `src/lib/core/workflow.mjs`：核心状态机、品控规则和执行联动纯业务逻辑。
- `src/lib/core/ticket-service.mjs`：异常上报、审批冲突、自批校验、快速放行业务逻辑。
- `src/app/api/tickets/route.ts`：工单列表与物流异常上报 API。
- `src/app/api/scan/route.ts`：扫描品控 API，命中规则后创建/复用工单并暂扣批次。
- `src/lib/v2-client.ts`：V2 HTTP API 客户端封装。
- `supabase/schema.sql`：V3 独立数据库 schema。
- `docs/v2-interface-contract.md`：V3/V2 接口契约。
- `docs/系统间接口文档.md`：早期接口契约草稿。
- `docs/需求理解与假设说明.md`：考试强制交付文档。

## V2 对接状态

V3 侧已按 HTTP API 对接方式封装 `src/lib/v2-client.ts`。V2 侧已在 `D:\trae\importOrder` 新增只读 `/api/v3/*` 路由，不改动原 `/api/shipments` 导入流程。

## 当前实现状态

- 前端工作台已接入关键 API：工单列表、接口日志、扫描品控、物流异常上报、审批、快速放行、赔付记录和库存流水；页面初始态不再依赖 demo 数据追加展示。
- `/api/tickets` 新建物流异常时会调用 V2 运单详情接口做实时真实性校验，成功后写入本地快照与接口日志；V2 未配置或调用失败时不会创建工单。
- `/api/scan` 扫描品控时会调用 V2 SKU 归属校验接口，读取 `quality_rules` 可配置规则，命中后创建或复用未关闭品控工单，并追加扫描记录。
- `/api/tickets/:ticketId/approve` 已接入审批核心校验：版本冲突、自批禁止、角色权限与幂等键必填；审批通过后自动触发库存/赔付/批次状态联动。
- `/api/tickets/:ticketId/fast-release` 已接入品控主管权限和复核原因校验，放行后解锁关联扫描批次。
- `/api/tickets/:ticketId/execute` 保留为补偿/重试入口；主流程由审批通过接口自动调用执行联动。
- `/api/compensations` 和 `/api/inventory-movements` 已提供赔付记录、库存流水独立查询入口。
- `/api/tickets/:ticketId` 已提供工单详情接口，返回工单、审批记录、扫描记录、赔付记录、库存流水和事件日志，前端工单追踪页可直接查看审计轨迹。
- `/api/tickets` 已支持 `status`、`waybillNo`、`exceptionType`、`approver`、`page`、`pageSize` 查询参数，前端已接入筛选和分页。
- `/api/rules` 已支持读取、保存和停用审批/品控规则；前端规则配置中心已接入新增、编辑、启停操作。
- 前端已提供当前身份切换器，审批和快速放行会使用所选身份的 `actorId` 与角色权限。
- `/api/timeouts/process` 已提供超时自动流转入口，可由 GitHub Actions Schedule 等外部调度器或手工 POST 触发；待审/一级超时升级二级，二级超时自动关闭驳回并写审批记录。
- `supabase/seed.sql` 提供默认审批规则和品控规则，可在执行 `supabase/schema.sql` 后运行。
- 已建库环境需追加执行 `supabase/migration_add_quality_scan_transaction.sql`，用于品控异常扫码的“建单/锁批次/写扫描记录”单事务 RPC。
- 如果数据库已执行过旧版 `schema.sql`，需要额外执行 `supabase/migration_add_ticket_batch_fields.sql`，为品控工单补 `sku_code` 和 `batch_no` 字段。
- `supabase/seed_demo_tickets.sql` 可生成 220 条 `DEMO-` 前缀工单，用于验证列表筛选、统计和规模化展示。
- 当前已支持 `getStore()` 自动选择 Supabase 仓储或本地 mock。

## 检查命令

```bash
npm test
npm run typecheck
npm run build
```

`npm run build` 用于最终生产构建验证；如本机耗时过长，可先以 `npm test` 和 `npm run typecheck` 作为快速验收。

## 外部定时任务

当前 Vercel 配置不依赖内置 Cron，超时自动流转由 GitHub Actions Schedule 等外部调度器调用 V3 接口。

- 工作流文件：`.github/workflows/v3-timeout-processor.yml`
- 调度频率：每 5 分钟
- 触发接口：`POST /api/timeouts/process`
- GitHub Secrets：
  - `V3_TIMEOUT_URL`：生产环境完整接口地址，例如 `https://your-v3-domain/api/timeouts/process`
  - `CRON_SECRET`：与 V3 部署环境中的 `CRON_SECRET` 或 `TIMEOUT_CRON_SECRET` 保持一致
- 鉴权方式：请求头 `Authorization: Bearer <secret>` 或 `x-cron-secret: <secret>` 任一匹配即可执行。
- 手动触发：GitHub Actions 页面可使用 `workflow_dispatch` 立即执行一次。
- 日志查询：左侧“接口监控”页支持按 `requestId`、接口路径搜索，并按每页 10 条分页展示。
- 执行日志：后台或手动触发都会写入 `integration_logs`，接口监控日志表可看到 `/api/timeouts/process` 的执行记录。
