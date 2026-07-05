const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

export function queryTickets(tickets, params = {}) {
  const page = positiveInt(params.page, DEFAULT_PAGE)
  const pageSize = Math.min(positiveInt(params.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
  const filtered = tickets.filter((ticket) => matchesTicket(ticket, params))
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize

  return {
    tickets: filtered.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
  }
}

export function queryParamsFromSearch(searchParams) {
  return {
    status: valueOrUndefined(searchParams.get('status')),
    waybillNo: valueOrUndefined(searchParams.get('waybillNo')),
    exceptionType: valueOrUndefined(searchParams.get('exceptionType')),
    approver: valueOrUndefined(searchParams.get('approver')),
    page: searchParams.get('page'),
    pageSize: searchParams.get('pageSize') || searchParams.get('limit'),
  }
}

function matchesTicket(ticket, params) {
  return matchesExact(ticket.status, params.status, 'all') &&
    matchesContains(ticket.waybillNo, params.waybillNo) &&
    matchesContains(ticket.exceptionType, params.exceptionType) &&
    matchesContains(ticket.currentApprover, params.approver)
}

function matchesExact(value, expected, ignoredValue) {
  if (!expected || expected === ignoredValue) return true
  return String(value || '') === String(expected)
}

function matchesContains(value, expected) {
  if (!expected) return true
  return String(value || '').toLowerCase().includes(String(expected).toLowerCase())
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function valueOrUndefined(value) {
  return value && value.trim() ? value.trim() : undefined
}
