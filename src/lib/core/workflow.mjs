const OPEN_TICKET_STATUSES = new Set([
  'pending_review',
  'level1_reviewing',
  'level2_reviewing',
  'rejected',
  'executing',
])

const QUALITY_ACTION_BATCH_STATUS = {
  release: 'qc_released',
  return_supplier: 'returned_supplier',
  repurchase: 'repurchasing',
  downgrade: 'downgraded',
}

const LOGISTICS_ACTION_MOVEMENT = {
  customer_compensation: 'none',
  reship: 'stock_out',
  return_to_stock: 'stock_in',
}

const LOGISTICS_AUTO_ACTION_BY_TYPE = {
  丢件: 'customer_compensation',
  破损: 'customer_compensation',
  客户拒收: 'return_to_stock',
  超时未签收: 'reship',
  收货地址错误: 'reship',
  地址错误: 'reship',
}

const QUALITY_AUTO_ACTION_BY_TYPE = {
  数量不符: 'repurchase',
  外观破损: 'return_supplier',
  规格不符: 'repurchase',
  标签错误: 'downgrade',
  批次异常: 'return_supplier',
}

const TICKET_TRANSITIONS = {
  pending_review: ['level1_reviewing', 'level2_reviewing', 'closed'],
  level1_reviewing: ['level2_reviewing', 'executing', 'rejected', 'completed'],
  level2_reviewing: ['executing', 'rejected', 'closed', 'completed'],
  rejected: ['level1_reviewing', 'level2_reviewing', 'closed'],
  executing: ['completed'],
  completed: [],
  closed: [],
}

const BATCH_TRANSITIONS = {
  available: ['qc_hold'],
  qc_hold: ['qc_released', 'returned_supplier', 'repurchasing', 'downgraded'],
  qc_released: [],
  returned_supplier: [],
  repurchasing: [],
  downgraded: [],
}

export function assertTicketTransition(fromStatus, toStatus, context = {}) {
  const allowed = TICKET_TRANSITIONS[fromStatus] || []
  if (!allowed.includes(toStatus)) {
    throw new Error(`非法工单状态流转：${fromStatus} -> ${toStatus}`)
  }

  if (fromStatus === 'rejected' && !['resubmit', 'auto_close'].includes(context.action)) {
    throw new Error('非法工单状态流转：拒绝后必须重新提交或关闭')
  }

  if (toStatus === 'completed' && !['execute', 'fast_release'].includes(context.action)) {
    throw new Error('非法工单状态流转：完成状态必须由执行联动或快速放行产生')
  }

  if (['level1_reviewing', 'level2_reviewing'].includes(fromStatus) && toStatus === 'completed' && context.action !== 'fast_release') {
    throw new Error('非法工单状态流转：审批中工单只能通过快速放行直接完成')
  }
}

export function assertBatchTransition(fromStatus, toStatus, context = {}) {
  const allowed = BATCH_TRANSITIONS[fromStatus] || []
  if (!allowed.includes(toStatus)) {
    throw new Error(`非法批次状态流转：${fromStatus} -> ${toStatus}`)
  }

  if (fromStatus === 'qc_hold' && toStatus === 'qc_released' && !['fast_release', 'release'].includes(context.action)) {
    throw new Error('非法批次状态流转：暂扣批次只能通过快速放行或执行放行解锁')
  }
}

export function decideApprovalEntry(ticket, approvalRules) {
  if (ticket.source === 'scan_triggered' || ticket.exceptionCategory === 'quality') {
    return 'level2_reviewing'
  }

  const amount = Number(ticket.amount || 0)
  const matchedRule = [...approvalRules]
    .sort((left, right) => Number(right.minAmount || 0) - Number(left.minAmount || 0))
    .find((rule) => {
      const min = Number(rule.minAmount || 0)
      const max = rule.maxAmount === undefined || rule.maxAmount === null
        ? Number.POSITIVE_INFINITY
        : Number(rule.maxAmount)
      return amount >= min && amount <= max
    })

  return matchedRule?.level || 'level1_reviewing'
}

export function resolveQualityScan({ scan, qualityRules, openQualityTickets }) {
  const existingTicket = openQualityTickets.find((ticket) =>
    ticket.exceptionCategory === 'quality' &&
    ticket.skuCode === scan.skuCode &&
    ticket.batchNo === scan.batchNo &&
    OPEN_TICKET_STATUSES.has(ticket.status)
  )

  if (existingTicket) {
    return {
      result: 'abnormal',
      batchStatus: 'qc_hold',
      ticket: existingTicket,
      reusedOpenTicket: true,
      matchedRule: existingTicket.matchedRule || null,
    }
  }

  const matchedRule = qualityRules.find((rule) => evaluateRuleCondition(scan, rule.condition))
  if (!matchedRule) {
    return {
      result: 'passed',
      batchStatus: 'available',
      ticket: null,
      reusedOpenTicket: false,
      matchedRule: null,
    }
  }

  const ticket = createTicketFromScan({ scan, matchedRule })
  return {
    result: 'abnormal',
    batchStatus: 'qc_hold',
    ticket,
    reusedOpenTicket: false,
    matchedRule,
  }
}

export function createTicketFromScan({ scan, matchedRule }) {
  const stableId = [
    'ticket',
    scan.waybillNo,
    scan.skuCode,
    scan.batchNo,
    matchedRule.id,
  ].filter(Boolean).join('-')

  return {
    id: stableId,
    source: 'scan_triggered',
    exceptionCategory: 'quality',
    exceptionType: matchedRule.subtype,
    severity: matchedRule.severity,
    status: matchedRule.entryLevel || 'level2_reviewing',
    waybillNo: scan.waybillNo,
    skuCode: scan.skuCode,
    batchNo: scan.batchNo,
    matchedRule,
  }
}

export function executeApprovedTicket({ ticket, action }) {
  if (!ticket.approvedRecordId) {
    throw new Error('approvedRecordId is required to keep downstream actions traceable')
  }
  assertTicketTransition(ticket.status || 'executing', 'completed', { action: 'execute' })

  if (ticket.exceptionCategory === 'quality') {
    const batchStatus = QUALITY_ACTION_BATCH_STATUS[action] || 'qc_released'
    assertBatchTransition('qc_hold', batchStatus, { action })
    const compensation = action === 'release'
      ? null
      : {
          ticketId: ticket.id,
          approvalRecordId: ticket.approvedRecordId,
          amount: Number(ticket.amount || 0),
          direction: 'supplier_recovery',
          status: 'pending_reconciliation',
        }

    return {
      ticket: { ...ticket, status: 'completed' },
      batchStatus,
      inventoryMovement: {
        ticketId: ticket.id,
        approvalRecordId: ticket.approvedRecordId,
        skuCode: ticket.skuCode,
        batchNo: ticket.batchNo,
        movementType: action === 'return_supplier' ? 'stock_out' : 'status_change',
        quantityDelta: resolveInventoryQuantityDelta({
          movementType: action === 'return_supplier' ? 'stock_out' : 'status_change',
          ticket,
        }),
      },
      compensation,
    }
  }

  const movementType = LOGISTICS_ACTION_MOVEMENT[action] || 'none'
  return {
    ticket: { ...ticket, status: 'completed' },
    batchStatus: null,
    inventoryMovement: movementType === 'none'
      ? null
      : {
          ticketId: ticket.id,
          approvalRecordId: ticket.approvedRecordId,
          waybillNo: ticket.waybillNo,
          movementType,
          quantityDelta: resolveInventoryQuantityDelta({ movementType, ticket }),
        },
    compensation: action === 'customer_compensation'
      ? {
          ticketId: ticket.id,
          approvalRecordId: ticket.approvedRecordId,
          amount: Number(ticket.amount || 0),
          direction: 'customer_compensation',
          status: 'pending_payment',
        }
      : null,
  }
}

export function resolveInventoryQuantityDelta({ movementType, ticket = {} }) {
  const quantity = Math.max(1, Number(
    ticket.inventoryQuantity
    ?? ticket.quantity
    ?? ticket.skuQuantity
    ?? 1
  ) || 1)

  if (movementType === 'stock_out') return -quantity
  if (movementType === 'stock_in') return quantity
  return 0
}

export function resolveAutoExecutionAction(ticket = {}) {
  const exceptionType = String(ticket.exceptionType || '')
  if (ticket.exceptionCategory === 'quality') {
    return QUALITY_AUTO_ACTION_BY_TYPE[exceptionType] || 'return_supplier'
  }

  return LOGISTICS_AUTO_ACTION_BY_TYPE[exceptionType] || 'customer_compensation'
}

function evaluateRuleCondition(scan, condition = {}) {
  const actual = scan[condition.field]
  const expected = condition.value

  switch (condition.operator) {
    case 'eq':
      return actual === expected
    case 'gt':
      return Number(actual) > Number(expected)
    case 'gte':
      return Number(actual) >= Number(expected)
    case 'lt':
      return Number(actual) < Number(expected)
    case 'lte':
      return Number(actual) <= Number(expected)
    case 'includes':
      return String(actual || '').includes(String(expected || ''))
    default:
      return false
  }
}
