-- Approval success and downstream execution in one database transaction.
-- Run this after migration_enforce_execution_status.sql.

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
