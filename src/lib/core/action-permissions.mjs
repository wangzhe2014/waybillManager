export function getTicketActionBlockReason({ ticket, actor, action, maxResubmitCount = 2 }) {
  const roles = actor?.roles || []
  const actorId = actor?.actorId || actor?.id || ''
  const reporterId = ticket?.reporterId || ticket?.reporter || ''

  if (action === 'approve' || action === 'reject') {
    if (!['level1_reviewing', 'level2_reviewing'].includes(ticket?.status)) {
      return '仅审批中工单可以审批'
    }
    if (reporterId && reporterId === actorId) {
      return '上报人不能审批自己提交的工单'
    }

    const isLevel2 = ticket.status === 'level2_reviewing'
    const requiredRole = isLevel2 ? 'level2_approver' : 'level1_approver'
    if (!roles.includes(requiredRole)) {
      return isLevel2 ? '需要二级审批权限' : '需要一级审批权限'
    }
    return ''
  }

  if (action === 'resubmit') {
    if (ticket?.status !== 'rejected') {
      return '仅已拒绝工单可以重新提交'
    }
    if (reporterId && reporterId !== actorId) {
      return '仅原上报人可以重新提交'
    }
    if (Number(ticket?.resubmitCount || 0) >= maxResubmitCount) {
      return '已超过重新提交次数上限'
    }
    return ''
  }

  if (action === 'fast_release') {
    if (ticket?.exceptionCategory !== 'quality') {
      return '仅品控工单可快速放行'
    }
    if (!roles.includes('quality_manager')) {
      return '仅品控主管可快速放行'
    }
    return ''
  }

  if (action === 'execute') {
    if (ticket?.status !== 'executing') {
      return '仅执行中工单可以执行联动'
    }
    return ''
  }

  return ''
}

export function buildApprovalWorkbench({ tickets, actor }) {
  const allPendingRows = tickets.filter((ticket) =>
    ['level1_reviewing', 'level2_reviewing', 'rejected'].includes(ticket.status)
  )
  const executingRows = tickets.filter((ticket) => ticket.status === 'executing')
  const pendingRows = allPendingRows.filter((ticket) => canHandlePendingTicket(ticket, actor))
  const approvableCount = allPendingRows.filter((ticket) =>
    ticket.status !== 'rejected' &&
    !getTicketActionBlockReason({ ticket, actor, action: 'approve' })
  ).length
  const fastReleaseCount = allPendingRows.filter((ticket) =>
    ticket.exceptionCategory === 'quality' &&
    !getTicketActionBlockReason({ ticket, actor, action: 'fast_release' })
  ).length

  return {
    pendingRows,
    allPendingRows,
    executingRows,
    metrics: {
      mineCount: pendingRows.length,
      approvableCount,
      fastReleaseCount,
    },
  }
}

function canHandlePendingTicket(ticket, actor) {
  if (ticket.status === 'rejected') {
    return !getTicketActionBlockReason({ ticket, actor, action: 'resubmit' })
  }
  if (!getTicketActionBlockReason({ ticket, actor, action: 'approve' })) {
    return true
  }
  return ticket.exceptionCategory === 'quality' &&
    !getTicketActionBlockReason({ ticket, actor, action: 'fast_release' })
}
