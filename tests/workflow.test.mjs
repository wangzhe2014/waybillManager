import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createTicketFromScan,
  decideApprovalEntry,
  executeApprovedTicket,
  resolveAutoExecutionAction,
  resolveQualityScan,
  assertTicketTransition,
  assertBatchTransition,
} from '../src/lib/core/workflow.mjs'

test('routes logistics tickets to level 1 or level 2 from configurable amount rules', () => {
  const rules = [
    { minAmount: 0, maxAmount: 999.99, level: 'level1_reviewing' },
    { minAmount: 1000, level: 'level2_reviewing' },
  ]

  assert.equal(decideApprovalEntry({ amount: 280, source: 'manual_report' }, rules), 'level1_reviewing')
  assert.equal(decideApprovalEntry({ amount: 2400, source: 'manual_report' }, rules), 'level2_reviewing')
})

test('quality scan locks a batch and reuses an open ticket on duplicate scans', () => {
  const rule = {
    id: 'qr-damage-high',
    subtype: 'appearance_damage',
    severity: 'high',
    condition: { field: 'damageLevel', operator: 'gte', value: 3 },
    autoCreateTicket: true,
    entryLevel: 'level2_reviewing',
  }

  const first = resolveQualityScan({
    scan: { waybillNo: 'PS2512220005001', skuCode: 'SKU-001', batchNo: 'BATCH-01', damageLevel: 4 },
    qualityRules: [rule],
    openQualityTickets: [],
  })

  assert.equal(first.result, 'abnormal')
  assert.equal(first.batchStatus, 'qc_hold')
  assert.equal(first.ticket.status, 'level2_reviewing')
  assert.equal(first.ticket.source, 'scan_triggered')

  const duplicate = resolveQualityScan({
    scan: { waybillNo: 'PS2512220005001', skuCode: 'SKU-001', batchNo: 'BATCH-01', damageLevel: 4 },
    qualityRules: [rule],
    openQualityTickets: [first.ticket],
  })

  assert.equal(duplicate.ticket.id, first.ticket.id)
  assert.equal(duplicate.reusedOpenTicket, true)
})

test('execution creates traceable downstream records with correct compensation direction', () => {
  const qualityTicket = createTicketFromScan({
    scan: { waybillNo: 'PS2512220005001', skuCode: 'SKU-001', batchNo: 'BATCH-01' },
    matchedRule: { id: 'qr-batch', subtype: 'batch_exception', severity: 'high', entryLevel: 'level2_reviewing' },
  })

  const result = executeApprovedTicket({
    ticket: { ...qualityTicket, status: 'executing', approvedRecordId: 'approval-001', amount: 360 },
    action: 'return_supplier',
  })

  assert.equal(result.ticket.status, 'completed')
  assert.equal(result.inventoryMovement.approvalRecordId, 'approval-001')
  assert.equal(result.compensation.direction, 'supplier_recovery')
  assert.equal(result.batchStatus, 'returned_supplier')

  const logisticsResult = executeApprovedTicket({
    ticket: {
      id: 'ticket-logistics',
      source: 'manual_report',
      exceptionCategory: 'logistics',
      exceptionType: 'lost',
      status: 'executing',
      waybillNo: 'PS2512220005001',
      amount: 500,
      approvedRecordId: 'approval-002',
    },
    action: 'customer_compensation',
  })

  assert.equal(logisticsResult.compensation.direction, 'customer_compensation')
})

test('approval success resolves a deterministic downstream execution action', () => {
  assert.equal(resolveAutoExecutionAction({
    exceptionCategory: 'logistics',
    exceptionType: '收货地址错误',
  }), 'reship')
  assert.equal(resolveAutoExecutionAction({
    exceptionCategory: 'logistics',
    exceptionType: '客户拒收',
  }), 'return_to_stock')
  assert.equal(resolveAutoExecutionAction({
    exceptionCategory: 'logistics',
    exceptionType: '丢件',
  }), 'customer_compensation')
  assert.equal(resolveAutoExecutionAction({
    exceptionCategory: 'logistics',
    exceptionType: '超时未签收',
  }), 'reship')
  assert.equal(resolveAutoExecutionAction({
    exceptionCategory: 'quality',
    exceptionType: '数量不符',
  }), 'repurchase')
  assert.equal(resolveAutoExecutionAction({
    exceptionCategory: 'quality',
    exceptionType: '标签错误',
  }), 'downgrade')
  assert.equal(resolveAutoExecutionAction({
    exceptionCategory: 'quality',
    exceptionType: '外观破损',
  }), 'return_supplier')
})

test('ticket state machine rejects transitions that skip required branches', () => {
  assert.doesNotThrow(() => assertTicketTransition('level1_reviewing', 'executing', { decision: 'approved' }))
  assert.doesNotThrow(() => assertTicketTransition('level2_reviewing', 'rejected', { decision: 'rejected' }))
  assert.doesNotThrow(() => assertTicketTransition('rejected', 'level1_reviewing', { action: 'resubmit' }))
  assert.doesNotThrow(() => assertTicketTransition('executing', 'completed', { action: 'execute' }))

  assert.throws(
    () => assertTicketTransition('rejected', 'executing', { decision: 'approved' }),
    /非法工单状态流转/
  )
  assert.throws(
    () => assertTicketTransition('level1_reviewing', 'completed', { action: 'execute' }),
    /非法工单状态流转/
  )
  assert.throws(
    () => assertTicketTransition('completed', 'level1_reviewing', { action: 'resubmit' }),
    /非法工单状态流转/
  )
})

test('batch state machine separates hold, release and execution outcomes', () => {
  assert.doesNotThrow(() => assertBatchTransition('available', 'qc_hold', { action: 'quality_hold' }))
  assert.doesNotThrow(() => assertBatchTransition('qc_hold', 'qc_released', { action: 'fast_release' }))
  assert.doesNotThrow(() => assertBatchTransition('qc_hold', 'returned_supplier', { action: 'return_supplier' }))
  assert.doesNotThrow(() => assertBatchTransition('qc_hold', 'repurchasing', { action: 'repurchase' }))
  assert.doesNotThrow(() => assertBatchTransition('qc_hold', 'downgraded', { action: 'downgrade' }))

  assert.throws(
    () => assertBatchTransition('available', 'returned_supplier', { action: 'return_supplier' }),
    /非法批次状态流转/
  )
  assert.throws(
    () => assertBatchTransition('qc_hold', 'available', { action: 'manual_unlock' }),
    /非法批次状态流转/
  )
})
