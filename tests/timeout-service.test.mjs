import assert from 'node:assert/strict'
import test from 'node:test'
import { processOverdueTicket } from '../src/lib/core/timeout-service.mjs'

test('escalates pending or level1 tickets to level2 when timed out', () => {
  const result = processOverdueTicket({
    ticket: {
      id: 'TL-001',
      status: 'level1_reviewing',
      version: 2,
      currentApprover: '一级审批',
    },
    now: new Date('2026-07-03T12:00:00.000Z'),
  })

  assert.equal(result.ticket.status, 'level2_reviewing')
  assert.equal(result.ticket.version, 3)
  assert.equal(result.ticket.currentApprover, '二级审批超时兜底')
  assert.equal(result.approvalRecord.result, 'auto_escalated')
  assert.equal(result.approvalRecord.approvalLevel, 'level2')
  assert.match(result.approvalRecord.idempotencyKey, /^timeout-TL-001-2-auto_escalated$/)
})

test('auto closes level2 tickets when timed out', () => {
  const result = processOverdueTicket({
    ticket: {
      id: 'TQ-001',
      status: 'level2_reviewing',
      version: 4,
      currentApprover: '二级审批',
    },
    now: new Date('2026-07-03T12:00:00.000Z'),
  })

  assert.equal(result.ticket.status, 'closed')
  assert.equal(result.ticket.version, 5)
  assert.equal(result.ticket.currentApprover, '二级超时自动驳回')
  assert.equal(result.approvalRecord.result, 'auto_rejected')
  assert.equal(result.approvalRecord.approvalLevel, 'level2')
})

test('ignores tickets that are not in review states', () => {
  const result = processOverdueTicket({
    ticket: { id: 'TL-002', status: 'executing', version: 1 },
    now: new Date('2026-07-03T12:00:00.000Z'),
  })

  assert.equal(result, null)
})
