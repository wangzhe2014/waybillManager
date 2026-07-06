-- Reset V3 business data only.
-- WARNING: Run this only on the V3 test/acceptance database.
-- Keeps base configuration tables:
--   - approval_rules
--   - quality_rules
-- Clears runtime/business tables so manual acceptance testing starts clean.

BEGIN;

TRUNCATE TABLE
  ticket_events,
  scan_records,
  inventory_movements,
  compensation_records,
  approval_records,
  inventory_batches,
  exception_tickets,
  integration_logs,
  waybill_snapshots
RESTART IDENTITY CASCADE;

COMMIT;
