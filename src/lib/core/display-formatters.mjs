export function integrationLogStatusText(status) {
  const labels = {
    success: '成功',
    failed: '失败',
    degraded: '降级',
  }
  return labels[status] || status
}

export function batchStatusText(status) {
  const labels = {
    available: '可用',
    qc_hold: '品控暂扣',
    qc_released: '已放行',
    returned_supplier: '退供应商',
    repurchasing: '重采购',
    downgraded: '降级处理',
  }
  return labels[status] || status
}

export function traceTicketText(record) {
  const nestedTicket = record.exception_tickets || {}
  const ticketNo = firstRecordValue(record, ['ticketNo', 'ticket_no'])
    || firstRecordValue(nestedTicket, ['ticket_no'])
    || firstRecordValue(record, ['ticketId', 'ticket_id'])
  const waybillNo = firstRecordValue(record, ['waybillNo', 'waybill_no'])
    || firstRecordValue(nestedTicket, ['waybill_no'])
  return [ticketNo, waybillNo].filter(Boolean).join(' / ') || '-'
}

export function compensationDirectionText(value) {
  const labels = {
    customer_compensation: '赔付客户',
    supplier_recovery: '向供应商追偿',
  }
  return labels[value] || value || '-'
}

export function compensationStatusText(value) {
  const labels = {
    pending_payment: '待支付',
    pending_reconciliation: '待对账',
    paid: '已支付',
    reconciled: '已对账',
  }
  return labels[value] || value || '-'
}

export function inventoryMovementText(value) {
  const labels = {
    stock_out: '库存出库',
    stock_in: '退货入库',
    status_change: '批次状态变更',
    qc_release: '品控放行',
    qc_close: '品控关闭',
  }
  return labels[value] || value || '-'
}

export function approvalLevelText(value) {
  const labels = {
    level1: '一级审批',
    level2: '二级审批',
    level1_reviewing: '一级审批',
    level2_reviewing: '二级审批',
    qc_fast_release: '品控主管快速放行',
  }
  return labels[value] || value || '-'
}

export function approvalResultText(value) {
  const labels = {
    approved: '通过',
    rejected: '驳回',
    fast_released: '快速放行',
    auto_escalated: '超时自动升级',
    auto_rejected: '超时自动驳回',
  }
  return labels[value] || value || '-'
}

export function scanResultText(value) {
  const labels = {
    passed: '正常通过',
    abnormal: '异常暂扣',
  }
  return labels[value] || value || '-'
}

export function ticketEventText(value) {
  const labels = {
    ticket_created: '工单创建',
    ticket_approved: '审批通过',
    ticket_rejected: '审批驳回',
    ticket_resubmitted: '工单重新提交',
    ticket_completed: '工单完成',
    ticket_closed: '工单关闭',
    ticket_fast_released: '品控快速放行',
    timeout_auto_escalated: '超时自动升级',
    timeout_auto_rejected: '超时自动驳回',
    execution_completed: '执行联动完成',
  }
  return labels[value] || value || '-'
}

export function eventDetailText(value) {
  if (!value || value === '-') return '-'
  try {
    const detail = JSON.parse(value)
    const parts = []
    if (detail.reason) parts.push(`原因：${String(detail.reason)}`)
    if (detail.resubmitCount !== undefined) parts.push(`重提次数：${String(detail.resubmitCount)}`)
    if (detail.action) parts.push(`动作：${executionActionText(String(detail.action))}`)
    if (detail.batchStatus) parts.push(`批次状态：${batchStatusText(String(detail.batchStatus))}`)
    if (detail.processed !== undefined) parts.push(`处理数量：${String(detail.processed)}`)
    if (detail.trigger) parts.push(`触发方式：${String(detail.trigger)}`)
    return parts.length > 0 ? parts.join('；') : value
  } catch {
    return value
  }
}

export function executionActionText(value) {
  const labels = {
    customer_compensation: '赔付客户',
    reship: '重新发货',
    return_to_stock: '退货入库',
    release: '放行货物',
    return_supplier: '退回供应商',
    repurchase: '重新采购',
    downgrade: '降级处理',
  }
  return labels[value] || value || '-'
}

export function formatMetricTime(value) {
  if (!value || value === '-') return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function recordValue(row, keys) {
  for (const key of keys) {
    const value = row[key]
    if (value === null || value === undefined || value === '') continue
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
  return '-'
}

export function firstRecordValue(row, keys) {
  for (const key of keys) {
    const value = row[key]
    if (value === null || value === undefined || value === '') continue
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
  return ''
}
