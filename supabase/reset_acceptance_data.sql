-- V3 acceptance reset data.
-- WARNING: This script truncates all V3 business data. Run it only on the V3 test database.

BEGIN;

TRUNCATE TABLE
  ticket_events,
  scan_records,
  inventory_movements,
  compensation_records,
  approval_records,
  inventory_batches,
  exception_tickets,
  approval_rules,
  quality_rules,
  integration_logs,
  waybill_snapshots
RESTART IDENTITY CASCADE;

INSERT INTO approval_rules (code, name, min_amount, max_amount, target_status, enabled)
VALUES
  ('amount-level-1', '小额一级审批', 0, 999.99, 'level1_reviewing', TRUE),
  ('amount-level-2', '大额二级审批', 1000, NULL, 'level2_reviewing', TRUE),
  ('amount-disabled', '停用金额规则', 3000, 4999.99, 'level2_reviewing', FALSE),
  ('amount-boundary-500', '边界金额五百', 500, 500, 'level1_reviewing', TRUE),
  ('amount-custom-01', '自定义金额规则01', 100, 199.99, 'level1_reviewing', TRUE),
  ('amount-custom-02', '自定义金额规则02', 200, 299.99, 'level1_reviewing', TRUE),
  ('amount-custom-03', '自定义金额规则03', 300, 399.99, 'level1_reviewing', TRUE),
  ('amount-custom-04', '自定义金额规则04', 400, 499.99, 'level1_reviewing', TRUE),
  ('amount-custom-05', '自定义金额规则05', 500, 599.99, 'level1_reviewing', TRUE),
  ('amount-custom-06', '自定义金额规则06', 600, 699.99, 'level1_reviewing', TRUE),
  ('amount-custom-07', '自定义金额规则07', 700, 799.99, 'level1_reviewing', TRUE),
  ('amount-custom-08', '自定义金额规则08', 800, 899.99, 'level1_reviewing', TRUE);

INSERT INTO quality_rules (code, name, subtype, severity, condition, auto_create_ticket, entry_level, enabled)
VALUES
  ('QR-DAMAGE-03', '外观破损暂扣', '外观破损', 'high', '{"field":"damageLevel","operator":"gte","value":3}'::jsonb, TRUE, 'level2_reviewing', TRUE),
  ('QR-QTY-DIFF-02', '数量不符暂扣', '数量不符', 'medium', '{"field":"quantityDiffRate","operator":"gte","value":0.02}'::jsonb, TRUE, 'level1_reviewing', TRUE),
  ('QR-LABEL-01', '标签错误暂扣', '标签错误', 'medium', '{"field":"labelError","operator":"eq","value":true}'::jsonb, TRUE, 'level1_reviewing', TRUE),
  ('QR-BATCH-01', '批次异常暂扣', '批次异常', 'high', '{"field":"batchException","operator":"eq","value":true}'::jsonb, TRUE, 'level2_reviewing', TRUE),
  ('QR-SPEC-01', '规格不符暂扣', '规格不符', 'medium', '{"field":"specMismatch","operator":"eq","value":true}'::jsonb, TRUE, 'level1_reviewing', TRUE),
  ('QR-DISABLED-01', '停用品控规则', '停用规则', 'low', '{"field":"damageLevel","operator":"gte","value":9}'::jsonb, TRUE, 'level1_reviewing', FALSE),
  ('QR-CUSTOM-01', '自定义品控规则01', '自定义异常01', 'medium', '{"field":"damageLevel","operator":"gte","value":1}'::jsonb, TRUE, 'level1_reviewing', TRUE),
  ('QR-CUSTOM-02', '自定义品控规则02', '自定义异常02', 'medium', '{"field":"damageLevel","operator":"gte","value":2}'::jsonb, TRUE, 'level1_reviewing', TRUE),
  ('QR-CUSTOM-03', '自定义品控规则03', '自定义异常03', 'high', '{"field":"damageLevel","operator":"gte","value":3}'::jsonb, TRUE, 'level2_reviewing', TRUE),
  ('QR-CUSTOM-04', '自定义品控规则04', '自定义异常04', 'high', '{"field":"damageLevel","operator":"gte","value":4}'::jsonb, TRUE, 'level2_reviewing', TRUE),
  ('QR-CUSTOM-05', '自定义品控规则05', '自定义异常05', 'medium', '{"field":"damageLevel","operator":"gte","value":5}'::jsonb, TRUE, 'level2_reviewing', TRUE);

INSERT INTO waybill_snapshots (
  waybill_no,
  store_name,
  receiver_name,
  receiver_phone,
  receiver_address,
  amount,
  sku_summary,
  source,
  synced_at
)
SELECT
  'ACC-WB-' || lpad(series::text, 4, '0'),
  '验收门店-' || ((series % 6) + 1),
  '验收收货人-' || series,
  '1381000' || lpad((series % 10000)::text, 4, '0'),
  '验收地址-' || series,
  CASE WHEN series % 4 = 0 THEN 1688 ELSE 120 + (series % 8) * 110 END,
  jsonb_build_array(
    jsonb_build_object(
      'skuCode', 'ACC-SKU-' || lpad((series % 12)::text, 3, '0'),
      'skuName', '验收商品-' || (series % 12),
      'skuQuantity', 1 + (series % 4)
    )
  ),
  CASE WHEN series % 5 = 0 THEN 'local_cache' ELSE 'v2_realtime' END,
  now() - (series || ' minutes')::interval
FROM generate_series(1, 36) AS series;

INSERT INTO exception_tickets (
  ticket_no,
  waybill_no,
  source,
  exception_category,
  exception_type,
  sku_code,
  batch_no,
  severity,
  status,
  amount,
  reporter_id,
  current_approver_id,
  resubmit_count,
  version,
  due_at,
  created_at,
  updated_at
)
SELECT
  'ACC-TK-' || lpad(series::text, 4, '0'),
  'ACC-WB-' || lpad(series::text, 4, '0'),
  CASE WHEN series % 3 = 0 THEN 'scan_triggered' ELSE 'manual_report' END,
  CASE WHEN series % 3 = 0 THEN 'quality' ELSE 'logistics' END,
  CASE
    WHEN series % 3 = 0 THEN (ARRAY['数量不符', '外观破损', '规格不符', '标签错误', '批次异常'])[(series % 5) + 1]
    ELSE (ARRAY['丢件', '破损', '客户拒收', '超时未签收', '地址错误'])[(series % 5) + 1]
  END,
  CASE WHEN series % 3 = 0 THEN 'ACC-SKU-' || lpad((series % 12)::text, 3, '0') ELSE NULL END,
  CASE WHEN series % 3 = 0 THEN 'ACC-BATCH-' || lpad((series % 9)::text, 3, '0') ELSE NULL END,
  CASE WHEN series % 6 = 0 THEN 'high' WHEN series % 2 = 0 THEN 'medium' ELSE 'low' END,
  (ARRAY['level1_reviewing', 'level2_reviewing', 'executing', 'completed', 'rejected', 'closed'])[(series % 6) + 1],
  CASE WHEN series % 4 = 0 THEN 1688 ELSE 120 + (series % 8) * 110 END,
  'reporter-' || ((series % 5) + 1),
  CASE
    WHEN (ARRAY['level1_reviewing', 'level2_reviewing', 'executing', 'completed', 'rejected', 'closed'])[(series % 6) + 1] = 'level1_reviewing' THEN 'level1_approver'
    WHEN (ARRAY['level1_reviewing', 'level2_reviewing', 'executing', 'completed', 'rejected', 'closed'])[(series % 6) + 1] = 'level2_reviewing' THEN 'level2_approver'
    WHEN (ARRAY['level1_reviewing', 'level2_reviewing', 'executing', 'completed', 'rejected', 'closed'])[(series % 6) + 1] = 'executing' THEN 'executor'
    ELSE NULL
  END,
  series % 3,
  1 + (series % 4),
  now() + (((series % 36) - 12) || ' hours')::interval,
  now() - (series || ' minutes')::interval,
  now() - (series || ' minutes')::interval
FROM generate_series(1, 36) AS series;

INSERT INTO inventory_batches (sku_code, sku_name, batch_no, quantity, status, locked_by_ticket_id)
SELECT DISTINCT ON (ticket.sku_code, ticket.batch_no)
  ticket.sku_code,
  '验收商品-' || ticket.sku_code,
  ticket.batch_no,
  80,
  CASE WHEN ticket.status IN ('completed', 'closed') THEN 'qc_released' ELSE 'qc_hold' END,
  CASE WHEN ticket.status IN ('completed', 'closed') THEN NULL ELSE ticket.id END
FROM exception_tickets ticket
WHERE ticket.ticket_no LIKE 'ACC-%'
  AND ticket.exception_category = 'quality'
ORDER BY
  ticket.sku_code,
  ticket.batch_no,
  CASE WHEN ticket.status IN ('completed', 'closed') THEN 1 ELSE 0 END,
  ticket.created_at;

INSERT INTO scan_records (
  waybill_no,
  sku_code,
  batch_no,
  operator_id,
  result,
  abnormal_description,
  batch_status,
  matched_rule_id,
  ticket_id,
  scanned_at
)
SELECT
  ticket.waybill_no,
  ticket.sku_code,
  ticket.batch_no,
  ticket.reporter_id,
  'abnormal',
  '验收扫描异常：' || ticket.exception_type,
  CASE WHEN ticket.status IN ('completed', 'closed') THEN 'qc_released' ELSE 'qc_hold' END,
  (SELECT id FROM quality_rules WHERE code = 'QR-DAMAGE-03'),
  ticket.id,
  ticket.created_at
FROM exception_tickets ticket
WHERE ticket.ticket_no LIKE 'ACC-%'
  AND ticket.exception_category = 'quality';

INSERT INTO approval_records (
  ticket_id,
  approver_id,
  approval_level,
  result,
  opinion,
  idempotency_key,
  ticket_version_before
)
SELECT
  ticket.id,
  CASE WHEN ticket.status = 'rejected' THEN 'level1_approver' ELSE COALESCE(ticket.current_approver_id, 'level2_approver') END,
  CASE WHEN ticket.status = 'level1_reviewing' THEN 'level1' ELSE 'level2' END,
  CASE WHEN ticket.status = 'rejected' THEN 'rejected' ELSE 'approved' END,
  CASE WHEN ticket.status = 'rejected' THEN '验收拒绝：资料不足' ELSE '验收通过' END,
  'acceptance-' || ticket.ticket_no || '-' || ticket.status,
  ticket.version
FROM exception_tickets ticket
WHERE ticket.ticket_no LIKE 'ACC-%'
  AND ticket.status IN ('executing', 'completed', 'rejected', 'closed');

INSERT INTO compensation_records (ticket_id, approval_record_id, amount, direction, status)
SELECT
  ticket.id,
  approval.id,
  ticket.amount,
  CASE WHEN ticket.exception_category = 'quality' THEN 'supplier_recovery' ELSE 'customer_compensation' END,
  'pending_reconciliation'
FROM exception_tickets ticket
JOIN approval_records approval ON approval.ticket_id = ticket.id
WHERE ticket.ticket_no LIKE 'ACC-%'
  AND ticket.status IN ('completed', 'closed');

INSERT INTO inventory_movements (batch_id, ticket_id, approval_record_id, movement_type, quantity_delta, remark)
SELECT
  batch.id,
  ticket.id,
  approval.id,
  CASE WHEN ticket.status = 'completed' THEN 'qc_release' ELSE 'qc_close' END,
  0,
  '验收库存联动记录'
FROM exception_tickets ticket
JOIN approval_records approval ON approval.ticket_id = ticket.id
JOIN inventory_batches batch ON batch.sku_code = ticket.sku_code AND batch.batch_no = ticket.batch_no
WHERE ticket.ticket_no LIKE 'ACC-%'
  AND ticket.exception_category = 'quality'
  AND ticket.status IN ('completed', 'closed');

INSERT INTO ticket_events (ticket_id, event_type, actor_id, detail)
SELECT
  ticket.id,
  'acceptance_seed',
  'system',
  jsonb_build_object('ticketNo', ticket.ticket_no, 'status', ticket.status)
FROM exception_tickets ticket
WHERE ticket.ticket_no LIKE 'ACC-%';

INSERT INTO integration_logs (request_id, endpoint, request_digest, status, status_code, duration_ms, error_message)
VALUES
  ('REQ-ACC-001', '/api/tickets', 'acceptance list', 'success', 200, 42, NULL),
  ('REQ-ACC-002', '/api/scan', 'acceptance scan', 'success', 200, 88, NULL),
  ('REQ-ACC-003', '/api/v2/waybills/ACC-WB-9999', 'v2 timeout', 'failed', 504, 3000, 'V2 timeout'),
  ('REQ-ACC-004', '/api/tickets/ACC-TK-0001/approve', 'approval conflict', 'degraded', 409, 120, 'version conflict');

COMMIT;
