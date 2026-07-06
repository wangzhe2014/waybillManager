-- Prepare V3 rules for manual acceptance testing.
-- WARNING: Run this only on the V3 test/acceptance database.
-- Purpose:
--   1. Remove accidental test rules that can interfere with business matching.
--   2. Restore the standard business rules required by the V3 requirements.
--   3. Add disabled acceptance-only rules so the rule list has more than 10 rows for pagination tests.

BEGIN;

-- Remove accidental rules created during UI testing.
DELETE FROM approval_rules
WHERE code IN ('amount-custom等待');

DELETE FROM quality_rules
WHERE code IN ('amount-custom');

-- Standard approval rules.
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

-- Standard quality rules required by the V3 requirements.
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

-- Disabled acceptance-only rules. They exist only to test rule-list search and pagination.
INSERT INTO approval_rules (code, name, min_amount, max_amount, target_status, enabled)
VALUES
  ('acceptance-approval-disabled-01', '验收测试审批规则01（停用）', 10000, 10000, 'level2_reviewing', FALSE),
  ('acceptance-approval-disabled-02', '验收测试审批规则02（停用）', 20000, 20000, 'level1_reviewing', FALSE)
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
    'acceptance-quality-disabled-01',
    '验收测试品控规则01（停用）',
    '验收测试异常01',
    'low',
    '{"field":"acceptanceFlag","operator":"eq","value":true}'::jsonb,
    TRUE,
    'level1_reviewing',
    FALSE
  ),
  (
    'acceptance-quality-disabled-02',
    '验收测试品控规则02（停用）',
    '验收测试异常02',
    'low',
    '{"field":"acceptanceFlag2","operator":"eq","value":true}'::jsonb,
    TRUE,
    'level2_reviewing',
    FALSE
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

COMMIT;

SELECT
  'approval_rules' AS table_name,
  count(*) AS total_count,
  count(*) FILTER (WHERE enabled) AS enabled_count
FROM approval_rules
UNION ALL
SELECT
  'quality_rules' AS table_name,
  count(*) AS total_count,
  count(*) FILTER (WHERE enabled) AS enabled_count
FROM quality_rules;
