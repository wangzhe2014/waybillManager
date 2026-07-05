-- Add atomic quality scan transaction RPC.
-- Safe to rerun: CREATE OR REPLACE keeps existing data.

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
