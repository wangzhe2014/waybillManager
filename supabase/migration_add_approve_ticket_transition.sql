-- Add atomic approval transition RPC for existing V3 databases.
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
