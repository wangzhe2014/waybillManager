-- V3 运单全流程管理系统独立数据库 schema
-- 说明：V3 不直接连接 V2 数据库，waybill_snapshots 仅保存通过 V2 HTTP API 获取的只读快照。
-- 注意：以下 DROP TABLE 语句用于考试/本地开发环境重置数据库；生产环境请改用迁移脚本，避免误删数据。

DROP TABLE IF EXISTS ticket_events CASCADE;
DROP TABLE IF EXISTS scan_records CASCADE;
DROP TABLE IF EXISTS inventory_movements CASCADE;
DROP TABLE IF EXISTS inventory_batches CASCADE;
DROP TABLE IF EXISTS compensation_records CASCADE;
DROP TABLE IF EXISTS approval_records CASCADE;
DROP TABLE IF EXISTS exception_tickets CASCADE;
DROP TABLE IF EXISTS approval_rules CASCADE;
DROP TABLE IF EXISTS quality_rules CASCADE;
DROP TABLE IF EXISTS integration_logs CASCADE;
DROP TABLE IF EXISTS waybill_snapshots CASCADE;

CREATE TABLE IF NOT EXISTS waybill_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waybill_no TEXT UNIQUE NOT NULL,
  store_name TEXT,
  receiver_name TEXT,
  receiver_phone TEXT,
  receiver_address TEXT,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sku_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL CHECK (source IN ('v2_realtime', 'local_cache')),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_digest TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'degraded')),
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exception_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no TEXT UNIQUE NOT NULL,
  waybill_no TEXT NOT NULL REFERENCES waybill_snapshots(waybill_no),
  source TEXT NOT NULL CHECK (source IN ('manual_report', 'scan_triggered')),
  exception_category TEXT NOT NULL CHECK (exception_category IN ('logistics', 'quality')),
  exception_type TEXT NOT NULL,
  sku_code TEXT,
  batch_no TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  reporter_id TEXT NOT NULL,
  current_approver_id TEXT,
  resubmit_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  due_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES exception_tickets(id),
  approver_id TEXT NOT NULL,
  approval_level TEXT NOT NULL CHECK (approval_level IN ('level1', 'level2', 'qc_fast_release')),
  result TEXT NOT NULL CHECK (result IN ('approved', 'rejected', 'fast_released', 'auto_escalated', 'auto_rejected')),
  opinion TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  ticket_version_before INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compensation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES exception_tickets(id),
  approval_record_id UUID NOT NULL REFERENCES approval_records(id),
  amount NUMERIC(12, 2) NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('customer_compensation', 'supplier_recovery')),
  status TEXT NOT NULL DEFAULT 'pending_reconciliation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code TEXT NOT NULL,
  sku_name TEXT NOT NULL,
  batch_no TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available',
  locked_by_ticket_id UUID REFERENCES exception_tickets(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sku_code, batch_no)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES inventory_batches(id),
  ticket_id UUID NOT NULL REFERENCES exception_tickets(id),
  approval_record_id UUID NOT NULL REFERENCES approval_records(id),
  movement_type TEXT NOT NULL,
  quantity_delta INTEGER NOT NULL DEFAULT 0,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scan_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waybill_no TEXT NOT NULL REFERENCES waybill_snapshots(waybill_no),
  sku_code TEXT NOT NULL,
  batch_no TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  device_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('passed', 'abnormal')),
  abnormal_description TEXT,
  batch_status TEXT NOT NULL,
  matched_rule_id UUID,
  ticket_id UUID REFERENCES exception_tickets(id),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quality_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT,
  subtype TEXT NOT NULL,
  severity TEXT NOT NULL,
  condition JSONB NOT NULL,
  auto_create_ticket BOOLEAN NOT NULL DEFAULT true,
  entry_level TEXT NOT NULL CHECK (entry_level IN ('level1_reviewing', 'level2_reviewing')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT,
  min_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(12, 2),
  target_status TEXT NOT NULL CHECK (target_status IN ('level1_reviewing', 'level2_reviewing')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES exception_tickets(id),
  event_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exception_tickets_waybill_no ON exception_tickets(waybill_no);
CREATE INDEX IF NOT EXISTS idx_exception_tickets_status ON exception_tickets(status);
CREATE INDEX IF NOT EXISTS idx_exception_tickets_quality_batch ON exception_tickets(waybill_no, sku_code, batch_no, status);
CREATE INDEX IF NOT EXISTS idx_scan_records_ticket_id ON scan_records(ticket_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_request_id ON integration_logs(request_id);

-- Quality scan transaction: create/reuse ticket, lock batch, append scan atomically.
CREATE OR REPLACE FUNCTION record_quality_scan_transaction(
  p_ticket JSONB,
  p_scan JSONB,
  p_batch JSONB,
  p_existing_ticket_no TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket exception_tickets%ROWTYPE;
  v_scan scan_records%ROWTYPE;
  v_batch inventory_batches%ROWTYPE;
  v_sku_code TEXT;
  v_batch_no TEXT;
  v_waybill_no TEXT;
BEGIN
  v_sku_code := COALESCE(p_batch->>'sku_code', p_scan->>'sku_code', p_ticket->>'sku_code');
  v_batch_no := COALESCE(p_batch->>'batch_no', p_scan->>'batch_no', p_ticket->>'batch_no');
  v_waybill_no := p_scan->>'waybill_no';

  IF v_sku_code IS NULL OR v_batch_no IS NULL OR v_waybill_no IS NULL THEN
    RAISE EXCEPTION 'quality scan requires waybill_no, sku_code and batch_no';
  END IF;

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
  VALUES (
    v_waybill_no,
    '',
    '',
    '',
    '',
    0,
    '[]'::jsonb,
    'v2_realtime',
    now()
  )
  ON CONFLICT (waybill_no) DO NOTHING;

  IF p_existing_ticket_no IS NOT NULL THEN
    SELECT *
    INTO v_ticket
    FROM exception_tickets
    WHERE ticket_no = p_existing_ticket_no
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'existing quality ticket % not found', p_existing_ticket_no;
    END IF;
  ELSE
    SELECT *
    INTO v_ticket
    FROM exception_tickets
    WHERE exception_category = 'quality'
      AND sku_code = v_sku_code
      AND batch_no = v_batch_no
      AND status NOT IN ('completed', 'closed')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      IF p_ticket IS NULL THEN
        RAISE EXCEPTION 'quality scan has no ticket to create';
      END IF;

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
        due_at
      )
      VALUES (
        p_ticket->>'ticket_no',
        p_ticket->>'waybill_no',
        p_ticket->>'source',
        p_ticket->>'exception_category',
        p_ticket->>'exception_type',
        p_ticket->>'sku_code',
        p_ticket->>'batch_no',
        COALESCE(p_ticket->>'severity', 'medium'),
        p_ticket->>'status',
        COALESCE((p_ticket->>'amount')::NUMERIC, 0),
        p_ticket->>'reporter_id',
        p_ticket->>'current_approver_id',
        COALESCE((p_ticket->>'resubmit_count')::INTEGER, 0),
        COALESCE((p_ticket->>'version')::INTEGER, 1),
        COALESCE((p_ticket->>'due_at')::TIMESTAMPTZ, now() + interval '2 hours')
      )
      RETURNING * INTO v_ticket;
    END IF;
  END IF;

  SELECT *
  INTO v_batch
  FROM inventory_batches
  WHERE sku_code = v_sku_code
    AND batch_no = v_batch_no
  FOR UPDATE;

  IF FOUND THEN
    IF v_batch.status = 'qc_hold'
      AND v_batch.locked_by_ticket_id IS NOT NULL
      AND v_batch.locked_by_ticket_id <> v_ticket.id THEN
      RAISE EXCEPTION 'batch %/% is locked by another open quality ticket', v_sku_code, v_batch_no;
    END IF;

    UPDATE inventory_batches
    SET
      sku_name = COALESCE(p_batch->>'sku_name', inventory_batches.sku_name),
      status = 'qc_hold',
      locked_by_ticket_id = v_ticket.id,
      updated_at = now()
    WHERE id = v_batch.id
    RETURNING * INTO v_batch;
  ELSE
    INSERT INTO inventory_batches (
      sku_code,
      sku_name,
      batch_no,
      quantity,
      status,
      locked_by_ticket_id,
      updated_at
    )
    VALUES (
      v_sku_code,
      COALESCE(p_batch->>'sku_name', ''),
      v_batch_no,
      COALESCE((p_batch->>'quantity')::INTEGER, 0),
      'qc_hold',
      v_ticket.id,
      now()
    )
    RETURNING * INTO v_batch;
  END IF;

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
  VALUES (
    v_waybill_no,
    v_sku_code,
    v_batch_no,
    p_scan->>'operator_id',
    p_scan->>'result',
    p_scan->>'abnormal_description',
    'qc_hold',
    CASE
      WHEN p_scan->>'matched_rule_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (p_scan->>'matched_rule_id')::UUID
      ELSE NULL
    END,
    v_ticket.id,
    COALESCE((p_scan->>'scanned_at')::TIMESTAMPTZ, now())
  )
  RETURNING * INTO v_scan;

  RETURN jsonb_build_object(
    'ticket', to_jsonb(v_ticket),
    'scan', to_jsonb(v_scan),
    'batch', to_jsonb(v_batch)
  );
END;
$$;

-- Approval transition is atomic: ticket status/version update and approval record insert.
CREATE OR REPLACE FUNCTION approve_ticket_transition(
  p_ticket_no TEXT,
  p_next_status TEXT,
  p_current_approver_id TEXT,
  p_next_version INTEGER,
  p_approver_id TEXT,
  p_approval_level TEXT,
  p_result TEXT,
  p_opinion TEXT,
  p_idempotency_key TEXT,
  p_ticket_version_before INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket exception_tickets%ROWTYPE;
  v_updated_ticket exception_tickets%ROWTYPE;
  v_approval approval_records%ROWTYPE;
BEGIN
  SELECT *
  INTO v_ticket
  FROM exception_tickets
  WHERE ticket_no = p_ticket_no
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket % not found', p_ticket_no;
  END IF;

  IF v_ticket.version <> p_ticket_version_before THEN
    RAISE EXCEPTION 'ticket % version conflict', p_ticket_no;
  END IF;

  UPDATE exception_tickets
  SET
    status = p_next_status,
    current_approver_id = p_current_approver_id,
    version = p_next_version,
    updated_at = now()
  WHERE id = v_ticket.id
  RETURNING * INTO v_updated_ticket;

  INSERT INTO approval_records (
    ticket_id,
    approver_id,
    approval_level,
    result,
    opinion,
    idempotency_key,
    ticket_version_before
  )
  VALUES (
    v_ticket.id,
    p_approver_id,
    p_approval_level,
    p_result,
    p_opinion,
    p_idempotency_key,
    p_ticket_version_before
  )
  RETURNING * INTO v_approval;

  RETURN jsonb_build_object(
    'ticket', to_jsonb(v_updated_ticket),
    'approvalRecord', to_jsonb(v_approval)
  );
END;
$$;

-- 审批通过后的执行联动事务入口。
-- 说明：调用方需先创建 approval_records，再把 approval_record_id 传入本函数。
CREATE OR REPLACE FUNCTION complete_ticket_execution(
  p_ticket_no TEXT,
  p_approval_record_id UUID,
  p_action TEXT,
  p_actor_id TEXT DEFAULT 'system'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket exception_tickets%ROWTYPE;
  v_direction TEXT;
  v_compensation_status TEXT;
  v_movement_type TEXT;
  v_batch_status TEXT;
BEGIN
  SELECT *
  INTO v_ticket
  FROM exception_tickets
  WHERE ticket_no = p_ticket_no
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket % not found', p_ticket_no;
  END IF;

  IF v_ticket.status <> 'executing' THEN
    RAISE EXCEPTION 'ticket % status % cannot execute', p_ticket_no, v_ticket.status;
  END IF;

  IF v_ticket.exception_category = 'quality' THEN
    v_direction := CASE
      WHEN p_action = 'release' THEN NULL
      ELSE 'supplier_recovery'
    END;

    v_compensation_status := 'pending_reconciliation';
    v_batch_status := CASE p_action
      WHEN 'return_supplier' THEN 'returned_supplier'
      WHEN 'repurchase' THEN 'repurchasing'
      WHEN 'downgrade' THEN 'downgraded'
      ELSE 'qc_released'
    END;

    UPDATE scan_records
    SET batch_status = v_batch_status
    WHERE ticket_id = v_ticket.id;

    UPDATE inventory_batches
    SET
      status = v_batch_status,
      locked_by_ticket_id = NULL,
      updated_at = now()
    WHERE locked_by_ticket_id = v_ticket.id;

    INSERT INTO inventory_movements (
      ticket_id,
      approval_record_id,
      movement_type,
      quantity_delta,
      remark
    )
    VALUES (
      v_ticket.id,
      p_approval_record_id,
      CASE WHEN p_action = 'return_supplier' THEN 'stock_out' ELSE 'status_change' END,
      0,
      concat('quality action: ', p_action)
    );

    IF v_direction IS NOT NULL THEN
      INSERT INTO compensation_records (
        ticket_id,
        approval_record_id,
        amount,
        direction,
        status
      )
      VALUES (
        v_ticket.id,
        p_approval_record_id,
        v_ticket.amount,
        v_direction,
        v_compensation_status
      );
    END IF;
  ELSE
    v_direction := CASE
      WHEN p_action = 'customer_compensation' THEN 'customer_compensation'
      ELSE NULL
    END;

    v_movement_type := CASE p_action
      WHEN 'reship' THEN 'stock_out'
      WHEN 'return_to_stock' THEN 'stock_in'
      ELSE NULL
    END;

    IF v_movement_type IS NOT NULL THEN
      INSERT INTO inventory_movements (
        ticket_id,
        approval_record_id,
        movement_type,
        quantity_delta,
        remark
      )
      VALUES (
        v_ticket.id,
        p_approval_record_id,
        v_movement_type,
        0,
        concat('logistics action: ', p_action)
      );
    END IF;

    IF v_direction IS NOT NULL THEN
      INSERT INTO compensation_records (
        ticket_id,
        approval_record_id,
        amount,
        direction,
        status
      )
      VALUES (
        v_ticket.id,
        p_approval_record_id,
        v_ticket.amount,
        v_direction,
        'pending_payment'
      );
    END IF;
  END IF;

  UPDATE exception_tickets
  SET
    status = 'completed',
    current_approver_id = NULL,
    version = version + 1,
    updated_at = now()
  WHERE id = v_ticket.id;

  INSERT INTO ticket_events (ticket_id, event_type, actor_id, detail)
  VALUES (
    v_ticket.id,
    'execution_completed',
    p_actor_id,
    jsonb_build_object('action', p_action, 'approval_record_id', p_approval_record_id)
  );

  RETURN jsonb_build_object(
    'ticketNo', p_ticket_no,
    'status', 'completed',
    'action', p_action
  );
END;
$$;

-- Approval success and downstream execution in one database transaction.
CREATE OR REPLACE FUNCTION approve_and_execute_ticket_transition(
  p_ticket_no TEXT,
  p_next_status TEXT,
  p_current_approver_id TEXT,
  p_next_version INTEGER,
  p_approver_id TEXT,
  p_approval_level TEXT,
  p_result TEXT,
  p_opinion TEXT,
  p_idempotency_key TEXT,
  p_ticket_version_before INTEGER,
  p_action TEXT,
  p_actor_id TEXT DEFAULT 'system'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_transition JSONB;
  v_execution JSONB;
  v_ticket exception_tickets%ROWTYPE;
  v_approval_record_id UUID;
BEGIN
  v_transition := approve_ticket_transition(
    p_ticket_no,
    p_next_status,
    p_current_approver_id,
    p_next_version,
    p_approver_id,
    p_approval_level,
    p_result,
    p_opinion,
    p_idempotency_key,
    p_ticket_version_before
  );

  IF p_result = 'approved' THEN
    v_approval_record_id := (v_transition->'approvalRecord'->>'id')::UUID;
    v_execution := complete_ticket_execution(
      p_ticket_no,
      v_approval_record_id,
      p_action,
      p_actor_id
    );
  ELSE
    v_execution := NULL;
  END IF;

  SELECT *
  INTO v_ticket
  FROM exception_tickets
  WHERE ticket_no = p_ticket_no;

  RETURN jsonb_build_object(
    'ticket', to_jsonb(v_ticket),
    'approvalRecord', v_transition->'approvalRecord',
    'execution', v_execution
  );
END;
$$;
