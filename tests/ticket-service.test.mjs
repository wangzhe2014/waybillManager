import assert from 'node:assert/strict'
import test from 'node:test'
import {
  approveTicket,
  fastReleaseQualityTicket,
  reportLogisticsException,
  resubmitRejectedTicket,
} from '../src/lib/core/ticket-service.mjs'

const waybills = [
  { waybillNo: 'PS2512220005001', amount: 2680 },
  { waybillNo: 'HN202607030018', amount: 420 },
]

test('report logistics exception validates real waybill and prevents duplicate open ticket', () => {
  const existingTickets = [
    {
      id: 'TL-001',
      waybillNo: 'HN202607030018',
      source: 'manual_report',
      exceptionCategory: 'logistics',
      exceptionType: 'lost',
      status: 'level1_reviewing',
    },
  ]

  assert.throws(
    () => reportLogisticsException({
      input: { waybillNo: 'NOT-EXIST', exceptionType: 'lost', reporterId: 'u1', amount: 10 },
      waybills,
      tickets: [],
      approvalRules: [{ minAmount: 0, maxAmount: 999.99, level: 'level1_reviewing' }],
    }),
    /V2 运单不存在/
  )

  assert.throws(
    () => reportLogisticsException({
      input: { waybillNo: 'HN202607030018', exceptionType: 'lost', reporterId: 'u2', amount: 100 },
      waybills,
      tickets: existingTickets,
      approvalRules: [{ minAmount: 0, maxAmount: 999.99, level: 'level1_reviewing' }],
    }),
    /同类型未关闭工单/
  )

  const ticket = reportLogisticsException({
    input: { waybillNo: 'HN202607030018', exceptionType: 'address_error', reporterId: 'u2', amount: 100 },
    waybills,
    tickets: existingTickets,
    approvalRules: [{ minAmount: 0, maxAmount: 999.99, level: 'level1_reviewing' }],
  })

  assert.equal(ticket.status, 'level1_reviewing')
  assert.equal(ticket.source, 'manual_report')
})

test('approve ticket rejects self approval and stale version conflicts', () => {
  const ticket = {
    id: 'TL-002',
    waybillNo: 'HN202607030018',
    reporterId: 'reporter-1',
    status: 'level1_reviewing',
    version: 2,
    amount: 420,
  }

  assert.throws(
    () => approveTicket({
      ticket,
      actor: { id: 'reporter-1', roles: ['level1_approver'] },
      decision: 'approved',
      opinion: '同意',
      expectedVersion: 2,
      idempotencyKey: 'idem-1',
    }),
    /上报人不能审批自己提交的工单/
  )

  assert.throws(
    () => approveTicket({
      ticket,
      actor: { id: 'approver-1', roles: ['level1_approver'] },
      decision: 'approved',
      opinion: '同意',
      expectedVersion: 1,
      idempotencyKey: 'idem-2',
    }),
    /该工单已被处理/
  )

  const approved = approveTicket({
    ticket,
    actor: { id: 'approver-1', roles: ['level1_approver'] },
    decision: 'approved',
    opinion: '同意',
    expectedVersion: 2,
    idempotencyKey: 'idem-3',
  })

  assert.equal(approved.ticket.status, 'executing')
  assert.equal(approved.ticket.version, 3)
  assert.equal(approved.approvalRecord.approvalLevel, 'level1')
})

test('rejected tickets must be resubmitted before approval and enforce resubmit limit', () => {
  const rejectedTicket = {
    id: 'TL-REJECTED',
    waybillNo: 'HN202607030018',
    reporterId: 'reporter-1',
    reporter: 'reporter-1',
    source: 'manual_report',
    exceptionCategory: 'logistics',
    exceptionType: 'address_error',
    status: 'rejected',
    currentApprover: '等待重新提交',
    amount: 420,
    version: 3,
    resubmitCount: 1,
  }

  assert.throws(
    () => approveTicket({
      ticket: rejectedTicket,
      actor: { id: 'approver-1', roles: ['level1_approver'] },
      decision: 'approved',
      opinion: '同意',
      expectedVersion: 3,
      idempotencyKey: 'idem-rejected-direct',
    }),
    /需要重新提交后才能审批/
  )

  const resubmitted = resubmitRejectedTicket({
    ticket: rejectedTicket,
    actor: { id: 'reporter-1' },
    reason: '补充客户改址凭证',
    maxResubmitCount: 2,
  })

  assert.equal(resubmitted.ticket.status, 'level1_reviewing')
  assert.equal(resubmitted.ticket.resubmitCount, 2)
  assert.equal(resubmitted.ticket.version, 4)
  assert.equal(resubmitted.event.eventType, 'ticket_resubmitted')

  assert.throws(
    () => resubmitRejectedTicket({
      ticket: { ...rejectedTicket, resubmitCount: 2 },
      actor: { id: 'reporter-1' },
      reason: '再次补充',
      maxResubmitCount: 2,
    }),
    /超过重新提交次数上限/
  )
})

test('fast release requires quality supervisor and closes quality ticket', () => {
  const ticket = {
    id: 'TQ-001',
    waybillNo: 'PS2512220005001',
    exceptionCategory: 'quality',
    status: 'level2_reviewing',
    version: 1,
  }

  assert.throws(
    () => fastReleaseQualityTicket({
      ticket,
      actor: { id: 'normal-user', roles: ['operator'] },
      reason: '误判',
    }),
    /仅品控主管可操作/
  )

  const released = fastReleaseQualityTicket({
    ticket,
    actor: { id: 'qc-manager', roles: ['quality_manager'] },
    reason: '外包装轻微压痕，不影响商品',
  })

  assert.equal(released.ticket.status, 'completed')
  assert.equal(released.batchStatus, 'qc_released')
  assert.equal(released.approvalRecord.result, 'fast_released')
})
