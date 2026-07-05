-- 规模化验收数据：生成 220 条异常工单，覆盖不同状态、异常类型和来源。
-- 仅用于考试/演示环境。脚本只清理 DEMO- 前缀数据，不影响真实业务工单。

DELETE FROM ticket_events
WHERE ticket_id IN (
  SELECT id FROM exception_tickets WHERE ticket_no LIKE 'DEMO-%'
);

DELETE FROM approval_records
WHERE ticket_id IN (
  SELECT id FROM exception_tickets WHERE ticket_no LIKE 'DEMO-%'
);

DELETE FROM scan_records
WHERE ticket_id IN (
  SELECT id FROM exception_tickets WHERE ticket_no LIKE 'DEMO-%'
);

DELETE FROM inventory_movements
WHERE ticket_id IN (
  SELECT id FROM exception_tickets WHERE ticket_no LIKE 'DEMO-%'
);

DELETE FROM compensation_records
WHERE ticket_id IN (
  SELECT id FROM exception_tickets WHERE ticket_no LIKE 'DEMO-%'
);

DELETE FROM exception_tickets WHERE ticket_no LIKE 'DEMO-%';
DELETE FROM waybill_snapshots WHERE waybill_no LIKE 'DEMO-WB-%';

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
  'DEMO-WB-' || lpad(series::text, 4, '0'),
  '演示门店-' || ((series % 18) + 1),
  '演示收货人-' || series,
  '1380000' || lpad((series % 10000)::text, 4, '0'),
  '演示地址-' || series,
  CASE WHEN series % 5 = 0 THEN 1680 ELSE 300 + (series % 9) * 90 END,
  jsonb_build_array(
    jsonb_build_object(
      'skuCode', 'DEMO-SKU-' || lpad((series % 40)::text, 3, '0'),
      'skuName', '演示商品-' || (series % 40),
      'skuQuantity', 1 + (series % 6)
    )
  ),
  CASE WHEN series % 4 = 0 THEN 'local_cache' ELSE 'v2_realtime' END,
  now() - (series || ' minutes')::interval
FROM generate_series(1, 220) AS series;

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
  'DEMO-TK-' || lpad(series::text, 4, '0'),
  'DEMO-WB-' || lpad(series::text, 4, '0'),
  CASE WHEN series % 3 = 0 THEN 'scan_triggered' ELSE 'manual_report' END,
  CASE WHEN series % 3 = 0 THEN 'quality' ELSE 'logistics' END,
  CASE
    WHEN series % 3 = 0 THEN (ARRAY['数量不符', '外观破损', '规格不符', '标签错误', '批次异常'])[(series % 5) + 1]
    ELSE (ARRAY['丢件', '破损', '客户拒收', '超时未签收', '地址错误'])[(series % 5) + 1]
  END,
  CASE WHEN series % 3 = 0 THEN 'DEMO-SKU-' || lpad((series % 40)::text, 3, '0') ELSE NULL END,
  CASE WHEN series % 3 = 0 THEN 'DEMO-BATCH-' || lpad((series % 25)::text, 3, '0') ELSE NULL END,
  CASE WHEN series % 7 = 0 THEN 'high' WHEN series % 4 = 0 THEN 'medium' ELSE 'low' END,
  (ARRAY['level1_reviewing', 'level2_reviewing', 'executing', 'completed', 'closed'])[(series % 5) + 1],
  CASE WHEN series % 5 = 0 THEN 1680 ELSE 300 + (series % 9) * 90 END,
  'demo-operator-' || ((series % 12) + 1),
  CASE
    WHEN series % 5 = 0 THEN NULL
    WHEN series % 2 = 0 THEN 'level2-demo'
    ELSE 'level1-demo'
  END,
  series % 3,
  1 + (series % 4),
  now() + (((series % 48) - 24) || ' hours')::interval,
  now() - (series || ' minutes')::interval,
  now() - (series || ' minutes')::interval
FROM generate_series(1, 220) AS series;

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
  '演示扫描异常：' || ticket.exception_type,
  CASE WHEN ticket.status IN ('completed', 'closed') THEN 'qc_released' ELSE 'qc_hold' END,
  NULL,
  ticket.id,
  ticket.created_at
FROM exception_tickets ticket
WHERE ticket.ticket_no LIKE 'DEMO-%'
  AND ticket.exception_category = 'quality';
