-- V3 默认规则种子数据
-- 执行前请先运行 schema.sql。该脚本可重复执行。

INSERT INTO approval_rules (code, name, min_amount, max_amount, target_status, enabled)
VALUES
  ('amount-level-1', '小额一级审批', 0, 999.99, 'level1_reviewing', TRUE),
  ('amount-level-2', '大额二级审批', 1000, NULL, 'level2_reviewing', TRUE)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  min_amount = EXCLUDED.min_amount,
  max_amount = EXCLUDED.max_amount,
  target_status = EXCLUDED.target_status,
  enabled = EXCLUDED.enabled,
  updated_at = now();

INSERT INTO quality_rules (code, name, subtype, severity, condition, auto_create_ticket, entry_level, enabled)
VALUES
  (
    'QR-DAMAGE-03',
    '外观破损暂扣',
    '外观破损',
    'high',
    '{"field":"damageLevel","operator":"gte","value":3}'::jsonb,
    TRUE,
    'level2_reviewing',
    TRUE
  ),
  (
    'QR-QTY-DIFF-02',
    '数量不符暂扣',
    '数量不符',
    'medium',
    '{"field":"quantityDiffRate","operator":"gte","value":0.02}'::jsonb,
    TRUE,
    'level1_reviewing',
    TRUE
  ),
  (
    'QR-LABEL-01',
    '标签错误暂扣',
    '标签错误',
    'medium',
    '{"field":"labelError","operator":"eq","value":true}'::jsonb,
    TRUE,
    'level1_reviewing',
    TRUE
  ),
  (
    'QR-BATCH-01',
    '批次异常暂扣',
    '批次异常',
    'high',
    '{"field":"batchException","operator":"eq","value":true}'::jsonb,
    TRUE,
    'level2_reviewing',
    TRUE
  ),
  (
    'QR-SPEC-01',
    '规格不符暂扣',
    '规格不符',
    'medium',
    '{"field":"specMismatch","operator":"eq","value":true}'::jsonb,
    TRUE,
    'level1_reviewing',
    TRUE
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  subtype = EXCLUDED.subtype,
  severity = EXCLUDED.severity,
  condition = EXCLUDED.condition,
  auto_create_ticket = EXCLUDED.auto_create_ticket,
  entry_level = EXCLUDED.entry_level,
  enabled = EXCLUDED.enabled,
  updated_at = now();
