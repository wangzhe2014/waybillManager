const CLOSED_STATUSES = new Set(['completed', 'closed'])
const DEFAULT_DUE_SOON_WINDOW_HOURS = 2

const STATUS_PRIORITY = {
  executing: 70,
  level2_reviewing: 60,
  level1_reviewing: 50,
  pending_review: 40,
  rejected: 30,
}

export function selectDashboardKeyTickets(tickets, { limit = 5 } = {}) {
  return [...tickets]
    .filter((ticket) => !CLOSED_STATUSES.has(ticket.status))
    .sort(compareDashboardTicket)
    .slice(0, limit)
}

export function countDueSoonTickets(tickets, { now = new Date(), windowHours = DEFAULT_DUE_SOON_WINDOW_HOURS } = {}) {
  return tickets.filter((ticket) => isDueSoonTicket(ticket, { now, windowHours })).length
}

export function getDashboardTicketReason(ticket, { now = new Date(), windowHours = DEFAULT_DUE_SOON_WINDOW_HOURS } = {}) {
  if (isDueSoonTicket(ticket, { now, windowHours })) return '即将超时'
  if (ticket.exceptionCategory === 'quality') return '品控风险'
  if (ticket.status === 'executing') return '执行联动'
  if (ticket.status === 'level2_reviewing') return '二级审批'
  if (ticket.status === 'rejected') return '退回重提'
  if (Number(ticket.amount || 0) >= 1000) return '高金额'
  return '待处理'
}

function isDueSoonTicket(ticket, { now, windowHours }) {
  if (!ticket || CLOSED_STATUSES.has(ticket.status)) return false
  const dueAt = timestamp(ticket.dueAt)
  if (dueAt === Number.MAX_SAFE_INTEGER) return false
  const nowTime = timestamp(now)
  const windowEnd = nowTime + Number(windowHours || 0) * 60 * 60 * 1000
  return dueAt <= windowEnd
}

function compareDashboardTicket(left, right) {
  const dueDiff = timestamp(left.dueAt) - timestamp(right.dueAt)
  if (dueDiff !== 0) return dueDiff

  const priorityDiff = ticketPriority(right) - ticketPriority(left)
  if (priorityDiff !== 0) return priorityDiff

  return timestamp(right.createdAt) - timestamp(left.createdAt)
}

function ticketPriority(ticket) {
  const base = STATUS_PRIORITY[ticket.status] || 0
  return ticket.exceptionCategory === 'quality' ? base + 5 : base
}

function timestamp(value) {
  const parsed = new Date(value || '').getTime()
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}
