import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildApprovalWorkbench,
  getTicketActionBlockReason,
} from '../src/lib/core/action-permissions.mjs'

const level1Ticket = {
  id: 'TL-001',
  status: 'level1_reviewing',
  reporterId: 'operator-demo',
  exceptionCategory: 'logistics',
  resubmitCount: 0,
}

test('blocks approval when actor lacks the required approval role', () => {
  assert.equal(
    getTicketActionBlockReason({
      ticket: level1Ticket,
      actor: { actorId: 'operator-other', roles: ['operator'] },
      action: 'approve',
    }),
    '需要一级审批权限'
  )
})

test('blocks reporter from approving own ticket', () => {
  assert.equal(
    getTicketActionBlockReason({
      ticket: level1Ticket,
      actor: { actorId: 'operator-demo', roles: ['level1_approver'] },
      action: 'approve',
    }),
    '上报人不能审批自己提交的工单'
  )
})

test('allows matching approver who is not the reporter', () => {
  assert.equal(
    getTicketActionBlockReason({
      ticket: level1Ticket,
      actor: { actorId: 'approver-level1-demo', roles: ['level1_approver'] },
      action: 'approve',
    }),
    ''
  )
})

test('blocks resubmit by non-reporter and after retry limit', () => {
  assert.equal(
    getTicketActionBlockReason({
      ticket: { ...level1Ticket, status: 'rejected', resubmitCount: 0 },
      actor: { actorId: 'approver-level1-demo', roles: ['level1_approver'] },
      action: 'resubmit',
    }),
    '仅原上报人可以重新提交'
  )

  assert.equal(
    getTicketActionBlockReason({
      ticket: { ...level1Ticket, status: 'rejected', resubmitCount: 2 },
      actor: { actorId: 'operator-demo', roles: ['operator'] },
      action: 'resubmit',
    }),
    '已超过重新提交次数上限'
  )
})

test('blocks fast release unless actor is quality manager on quality ticket', () => {
  assert.equal(
    getTicketActionBlockReason({
      ticket: { ...level1Ticket, exceptionCategory: 'quality' },
      actor: { actorId: 'approver-level2-demo', roles: ['level2_approver'] },
      action: 'fast_release',
    }),
    '仅品控主管可快速放行'
  )

  assert.equal(
    getTicketActionBlockReason({
      ticket: { ...level1Ticket, exceptionCategory: 'quality' },
      actor: { actorId: 'quality-manager-demo', roles: ['quality_manager'] },
      action: 'fast_release',
    }),
    ''
  )
})

test('builds approval workbench from the current actor permissions', () => {
  const tickets = [
    { id: 'L1', status: 'level1_reviewing', reporterId: 'operator-demo', exceptionCategory: 'logistics' },
    { id: 'L2', status: 'level2_reviewing', reporterId: 'operator-demo', exceptionCategory: 'logistics' },
    { id: 'Q1', status: 'level2_reviewing', reporterId: 'operator-demo', exceptionCategory: 'quality' },
    { id: 'R1', status: 'rejected', reporterId: 'operator-demo', exceptionCategory: 'logistics', resubmitCount: 0 },
    { id: 'EX', status: 'executing', reporterId: 'operator-demo', exceptionCategory: 'logistics' },
  ]

  assert.deepEqual(
    buildApprovalWorkbench({
      tickets,
      actor: { actorId: 'approver-level2-demo', roles: ['level2_approver'] },
    }),
    {
      pendingRows: [tickets[1], tickets[2]],
      allPendingRows: tickets.slice(0, 4),
      executingRows: [tickets[4]],
      metrics: {
        mineCount: 2,
        approvableCount: 2,
        fastReleaseCount: 0,
      },
    }
  )

  assert.deepEqual(
    buildApprovalWorkbench({
      tickets,
      actor: { actorId: 'quality-manager-demo', roles: ['quality_manager'] },
    }).metrics,
    {
      mineCount: 1,
      approvableCount: 0,
      fastReleaseCount: 1,
    }
  )
})
