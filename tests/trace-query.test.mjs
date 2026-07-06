import assert from 'node:assert/strict'
import test from 'node:test'
import { queryTraceRecords, traceParamsFromSearch } from '../src/lib/server/trace-query.mjs'

const rows = [
  { id: 'pay-1', ticketNo: 'TL-001', waybillNo: 'WB-001', direction: 'customer_compensation', status: 'pending_payment', createdAt: '2026-07-06T10:00:00.000Z' },
  { id: 'pay-2', ticketNo: 'TQ-002', waybillNo: 'WB-002', direction: 'supplier_recovery', status: 'pending_reconciliation', createdAt: '2026-07-06T09:00:00.000Z' },
  { id: 'move-1', ticketNo: 'TL-003', waybillNo: 'WB-003', movementType: 'stock_out', createdAt: '2026-07-06T08:00:00.000Z' },
  { id: 'move-2', ticketNo: 'TQ-004', waybillNo: 'WB-004', movement_type: 'status_change', created_at: '2026-07-06T07:00:00.000Z' },
]

test('filters trace records by keyword, direction, status and movement type', () => {
  assert.deepEqual(
    queryTraceRecords(rows, { keyword: 'WB-002', direction: 'supplier_recovery' }).records.map((row) => row.id),
    ['pay-2']
  )
  assert.deepEqual(
    queryTraceRecords(rows, { status: 'pending_payment' }).records.map((row) => row.id),
    ['pay-1']
  )
  assert.deepEqual(
    queryTraceRecords(rows, { movementType: 'status_change' }).records.map((row) => row.id),
    ['move-2']
  )
})

test('paginates trace records with safe defaults', () => {
  const result = queryTraceRecords(rows, { page: 2, pageSize: 2 })
  assert.deepEqual(result.records.map((row) => row.id), ['move-1', 'move-2'])
  assert.equal(result.total, 4)
  assert.equal(result.page, 2)
  assert.equal(result.pageSize, 2)
  assert.equal(result.totalPages, 2)
})

test('reads trace params from URL search params', () => {
  const params = traceParamsFromSearch(new URLSearchParams('page=3&pageSize=10&keyword=TL&direction=customer_compensation&status=pending_payment&movementType=stock_out'))
  assert.deepEqual(params, {
    page: 3,
    pageSize: 10,
    keyword: 'TL',
    direction: 'customer_compensation',
    status: 'pending_payment',
    movementType: 'stock_out',
  })
})
