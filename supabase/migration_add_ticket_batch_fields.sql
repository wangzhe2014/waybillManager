-- 已执行过 schema.sql 的数据库可单独运行本迁移。

ALTER TABLE exception_tickets
ADD COLUMN IF NOT EXISTS sku_code TEXT,
ADD COLUMN IF NOT EXISTS batch_no TEXT;

CREATE INDEX IF NOT EXISTS idx_exception_tickets_quality_batch
ON exception_tickets(waybill_no, sku_code, batch_no, status);
