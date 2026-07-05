import { assertBatchTransition, assertTicketTransition, decideApprovalEntry } from './workflow.mjs'

const CLOSED_STATUSES = new Set(['completed', 'closed'])

export function reportLogisticsException({ input, waybills, tickets, approvalRules }) {
  const waybill = waybills.find((item) => item.waybillNo === input.waybillNo)
  if (!waybill) {
    throw new Error('V2 运单不存在，不能发起异常上报')
  }

  const duplicate = tickets.find((ticket) =>
    ticket.waybillNo === input.waybillNo &&
    ticket.exceptionCategory === 'logistics' &&
    ticket.exceptionType === input.exceptionType &&
    !CLOSED_STATUSES.has(ticket.status)
  )
  if (duplicate) {
    throw new Error('同类型未关闭工单已存在')
  }

  const ticket = {
    id: `TL-${Date.now()}`,
    waybillNo: input.waybillNo,
    source: 'manual_report',
    exceptionCategory: 'logistics',
    exceptionType: input.exceptionType,
    status: 'pending_review',
    amount: Number(input.amount ?? waybill.amount ?? 0),
    reporterId: input.reporterId,
    reporter: input.reporterId,
    version: 1,
  }

  return {
    ...ticket,
    status: decideApprovalEntry(ticket, approvalRules),
  }
}

export function approveTicket({ ticket, actor, decision, opinion, expectedVersion, idempotencyKey }) {
  if (ticket.status === 'rejected') {
    throw new Error('工单需要重新提交后才能审批')
  }

  if (ticket.reporterId && ticket.reporterId === actor.id) {
    throw new Error('上报人不能审批自己提交的工单')
  }

  if (ticket.version !== expectedVersion) {
    throw new Error('该工单已被处理，请刷新')
  }

  const level = ticket.status === 'level2_reviewing' ? 'level2' : 'level1'
  const requiredRole = level === 'level2' ? 'level2_approver' : 'level1_approver'
  if (!actor.roles?.includes(requiredRole)) {
    throw new Error('当前账号没有对应审批权限')
  }

  const approvalRecord = {
    id: `approval-${Date.now()}`,
    ticketId: ticket.id,
    approverId: actor.id,
    approvalLevel: level,
    result: decision,
    opinion,
    idempotencyKey,
    ticketVersionBefore: ticket.version,
  }
  const nextStatus = decision === 'approved' ? 'executing' : 'rejected'
  assertTicketTransition(ticket.status, nextStatus, { decision })

  return {
    ticket: {
      ...ticket,
      status: nextStatus,
      version: ticket.version + 1,
    },
    approvalRecord,
  }
}

export function resubmitRejectedTicket({
  ticket,
  actor,
  reason,
  maxResubmitCount = 2,
}) {
  if (ticket.status !== 'rejected') {
    throw new Error('仅已拒绝工单可以重新提交')
  }

  if (ticket.reporterId && ticket.reporterId !== actor.id) {
    throw new Error('仅原上报人可以重新提交该工单')
  }

  const currentCount = Number(ticket.resubmitCount || 0)
  if (currentCount >= maxResubmitCount) {
    throw new Error('超过重新提交次数上限')
  }

  const nextStatus = ticket.exceptionCategory === 'quality'
    ? 'level2_reviewing'
    : 'level1_reviewing'
  const nextVersion = Number(ticket.version || 1) + 1
  assertTicketTransition(ticket.status, nextStatus, { action: 'resubmit' })

  return {
    ticket: {
      ...ticket,
      status: nextStatus,
      currentApprover: nextStatus === 'level2_reviewing' ? '二级审批' : '一级审批',
      resubmitCount: currentCount + 1,
      version: nextVersion,
    },
    event: {
      id: `resubmit-${ticket.id}-${nextVersion}`,
      ticketId: ticket.id,
      eventType: 'ticket_resubmitted',
      actorId: actor.id,
      detail: {
        reason,
        resubmitCount: currentCount + 1,
      },
    },
  }
}

export function fastReleaseQualityTicket({ ticket, actor, reason }) {
  if (!actor.roles?.includes('quality_manager')) {
    throw new Error('仅品控主管可操作误判快速放行')
  }

  if (ticket.exceptionCategory !== 'quality') {
    throw new Error('仅品控工单支持快速放行')
  }
  assertTicketTransition(ticket.status, 'completed', { action: 'fast_release' })
  assertBatchTransition('qc_hold', 'qc_released', { action: 'fast_release' })

  return {
    ticket: {
      ...ticket,
      status: 'completed',
      version: Number(ticket.version || 1) + 1,
    },
    batchStatus: 'qc_released',
    approvalRecord: {
      id: `approval-fast-${Date.now()}`,
      ticketId: ticket.id,
      approverId: actor.id,
      approvalLevel: 'qc_fast_release',
      result: 'fast_released',
      opinion: reason,
      ticketVersionBefore: ticket.version,
    },
  }
}
