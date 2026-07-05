import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveExecutionApprovalRecordId } from '../src/lib/core/execution-service.mjs'

test('uses explicit approval record id for execution when provided', () => {
  assert.equal(
    resolveExecutionApprovalRecordId({
      approvalRecordId: 'approval-explicit',
      detail: { approvals: [] },
    }),
    'approval-explicit'
  )
})

test('recovers latest approved approval record id from ticket detail', () => {
  const approvalRecordId = resolveExecutionApprovalRecordId({
    approvalRecordId: '',
    detail: {
      approvals: [
        { id: 'approval-old', result: 'approved', created_at: '2026-07-03T10:00:00.000Z' },
        { id: 'approval-rejected', result: 'rejected', created_at: '2026-07-03T11:00:00.000Z' },
        { id: 'approval-new', result: 'approved', created_at: '2026-07-03T12:00:00.000Z' },
      ],
    },
  })

  assert.equal(approvalRecordId, 'approval-new')
})

test('requires an approved approval record before execution', () => {
  assert.throws(
    () => resolveExecutionApprovalRecordId({
      approvalRecordId: '',
      detail: {
        approvals: [{ id: 'approval-rejected', result: 'rejected' }],
      },
    }),
    /缺少审批通过记录/
  )
})
