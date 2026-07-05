-- Enforce ticket state machine: downstream execution can only start from `executing`.
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
