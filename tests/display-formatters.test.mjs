import assert from 'node:assert/strict'
import test from 'node:test'
import {
  approvalLevelText,
  approvalResultText,
  batchStatusText,
  eventDetailText,
  inventoryMovementText,
  traceTicketText,
} from '../src/lib/core/display-formatters.mjs'

test('display formatters render workflow codes as Chinese business labels', () => {
  assert.equal(batchStatusText('qc_hold'), '品控暂扣')
  assert.equal(inventoryMovementText('stock_out'), '库存出库')
  assert.equal(approvalLevelText('level2_reviewing'), '二级审批')
  assert.equal(approvalResultText('fast_released'), '快速放行')
})

test('trace ticket text prefers business ticket number over technical id', () => {
  assert.equal(
    traceTicketText({
      ticket_id: 'c33de2c3-2d0c-48d7-bb73-2e0d830f13b4',
      exception_tickets: {
        ticket_no: 'TQ-202607070001',
        waybill_no: 'PS2604210008',
      },
    }),
    'TQ-202607070001 / PS2604210008'
  )
})

test('event detail formatter translates execution action and batch status', () => {
  assert.equal(
    eventDetailText(JSON.stringify({ action: 'return_supplier', batchStatus: 'returned_supplier' })),
    '动作：退回供应商；批次状态：退供应商'
  )
})
