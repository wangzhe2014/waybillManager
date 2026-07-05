import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDashboardTicketReason,
  countDueSoonTickets,
  selectDashboardKeyTickets,
} from '../src/lib/core/dashboard-service.mjs'

test('selects up to five active key tickets for dashboard summary', () => {
  const tickets = [
    { id: 'CLOSED', status: 'closed', dueAt: '2026-07-05T08:00:00.000Z', createdAt: '2026-07-01T08:00:00.000Z' },
    { id: 'DONE', status: 'completed', dueAt: '2026-07-05T08:00:00.000Z', createdAt: '2026-07-01T08:00:00.000Z' },
    { id: 'L1-LATE', status: 'level1_reviewing', dueAt: '2026-07-05T08:10:00.000Z', createdAt: '2026-07-01T08:00:00.000Z' },
    { id: 'L2-SOON', status: 'level2_reviewing', dueAt: '2026-07-05T08:20:00.000Z', createdAt: '2026-07-01T08:00:00.000Z' },
    { id: 'EXEC', status: 'executing', dueAt: '2026-07-05T12:00:00.000Z', createdAt: '2026-07-04T08:00:00.000Z' },
    { id: 'QUALITY', status: 'level2_reviewing', exceptionCategory: 'quality', dueAt: '2026-07-05T14:00:00.000Z', createdAt: '2026-07-04T09:00:00.000Z' },
    { id: 'REJECTED', status: 'rejected', dueAt: '2026-07-06T08:00:00.000Z', createdAt: '2026-07-04T10:00:00.000Z' },
    { id: 'LOW', status: 'level1_reviewing', dueAt: '2026-07-07T08:00:00.000Z', createdAt: '2026-07-04T11:00:00.000Z' },
  ]

  assert.deepEqual(
    selectDashboardKeyTickets(tickets, { limit: 5 }).map((ticket) => ticket.id),
    ['L1-LATE', 'L2-SOON', 'EXEC', 'QUALITY', 'REJECTED']
  )
})

test('counts active tickets due within the configured window', () => {
  const tickets = [
    { id: 'OVERDUE', status: 'level1_reviewing', dueAt: '2026-07-05T07:50:00.000Z' },
    { id: 'SOON', status: 'level2_reviewing', dueAt: '2026-07-05T09:30:00.000Z' },
    { id: 'LATER', status: 'executing', dueAt: '2026-07-05T12:30:00.000Z' },
    { id: 'DONE', status: 'completed', dueAt: '2026-07-05T08:30:00.000Z' },
    { id: 'BAD', status: 'level1_reviewing', dueAt: 'not-a-date' },
  ]

  assert.equal(
    countDueSoonTickets(tickets, {
      now: '2026-07-05T08:00:00.000Z',
      windowHours: 2,
    }),
    2
  )
})

test('explains why a dashboard ticket is considered key', () => {
  assert.equal(
    getDashboardTicketReason({
      status: 'level2_reviewing',
      exceptionCategory: 'quality',
      amount: 800,
      dueAt: '2026-07-05T08:20:00.000Z',
    }, {
      now: '2026-07-05T08:00:00.000Z',
      windowHours: 2,
    }),
    '即将超时'
  )

  assert.equal(
    getDashboardTicketReason({
      status: 'level2_reviewing',
      exceptionCategory: 'quality',
      amount: 800,
      dueAt: '2026-07-05T14:00:00.000Z',
    }, {
      now: '2026-07-05T08:00:00.000Z',
      windowHours: 2,
    }),
    '品控风险'
  )
})
