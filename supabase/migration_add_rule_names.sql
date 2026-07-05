ALTER TABLE approval_rules
ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE quality_rules
ADD COLUMN IF NOT EXISTS name TEXT;

UPDATE approval_rules
SET name = CASE
  WHEN code = 'amount-level-1' THEN '小额一级审批'
  WHEN code = 'amount-level-2' THEN '大额二级审批'
  ELSE COALESCE(name, code)
END
WHERE name IS NULL OR name = '';

UPDATE quality_rules
SET name = CASE
  WHEN code = 'QR-DAMAGE-03' THEN '外观破损暂扣'
  WHEN code = 'QR-QTY-DIFF-02' THEN '数量不符暂扣'
  WHEN code = 'QR-LABEL-01' THEN '标签错误暂扣'
  ELSE COALESCE(name, subtype, code)
END
WHERE name IS NULL OR name = '';
