import { assertTicketTransition } from './workflow.mjs'

export function processOverdueTicket({ ticket, now = new Date() }) {
  if (!['pending_review', 'level1_reviewing', 'level2_reviewing'].includes(ticket.status)) {
    return null
  }

  const isLevel2Timeout = ticket.status === 'level2_reviewing'
  const result = isLevel2Timeout ? 'auto_rejected' : 'auto_escalated'
  const nextStatus = isLevel2Timeout ? 'closed' : 'level2_reviewing'
  const currentApprover = isLevel2Timeout ? '二级超时自动驳回' : '二级审批超时兜底'
  const versionBefore = Number(ticket.version || 1)
  assertTicketTransition(ticket.status, nextStatus, { action: 'timeout' })

  return {
    ticket: {
      ...ticket,
      status: nextStatus,
      currentApprover,
      version: versionBefore + 1,
    },
    approvalRecord: {
      id: `timeout-${ticket.id}-${versionBefore}-${result}`,
      ticketId: ticket.id,
      approverId: 'system-timeout',
      approvalLevel: 'level2',
      result,
      opinion: isLevel2Timeout
        ? '二级审批超时，系统按规则自动驳回并关闭工单。'
        : '审批超时，系统按规则自动升级至二级审批。',
      idempotencyKey: `timeout-${ticket.id}-${versionBefore}-${result}`,
      ticketVersionBefore: versionBefore,
      createdAt: now.toISOString(),
    },
  }
}
