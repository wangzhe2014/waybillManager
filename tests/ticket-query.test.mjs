import assert from 'node:assert/strict'
import test from 'node:test'
import { queryTickets } from '../src/lib/server/ticket-query.mjs'

const rows = [
  {
    id: 'T-001',
    waybillNo: 'PS2512220005001',
    exceptionType: 'lost',
    status: 'level1_reviewing',
    currentApprover: 'level1-a',
  },
  {
    id: 'T-002',
    waybillNo: 'PS2512220005002',
    exceptionType: 'damaged',
    status: 'level2_reviewing',
    currentApprover: 'level2-a',
  },
  {
    id: 'T-003',
    waybillNo: 'HN202607030018',
    exceptionType: 'damaged',
    status: 'level2_reviewing',
    currentApprover: 'level2-b',
  },
]

test('filters tickets by status, waybill, type and approver before paginating', () => {
  const result = queryTickets(rows, {
    status: 'level2_reviewing',
    waybillNo: '202607',
    exceptionType: 'damage',
    approver: 'level2',
    page: 1,
    pageSize: 1,
  })

  assert.equal(result.total, 1)
  assert.equal(result.page, 1)
  assert.equal(result.pageSize, 1)
  assert.equal(result.totalPages, 1)
  assert.deepEqual(result.tickets.map((ticket) => ticket.id), ['T-003'])
})

test('clamps invalid pagination values to safe defaults', () => {
  const result = queryTickets(rows, {
    page: -2,
    pageSize: 500,
  })

  assert.equal(result.page, 1)
  assert.equal(result.pageSize, 100)
  assert.equal(result.totalPages, 1)
  assert.deepEqual(result.tickets.map((ticket) => ticket.id), ['T-001', 'T-002', 'T-003'])
})
