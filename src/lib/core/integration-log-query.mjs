export function filterAndPaginateIntegrationLogs(logs, options = {}) {
  const pageSize = clampPositiveInteger(options.pageSize, 10)
  const requestedPage = clampPositiveInteger(options.page, 1)
  const requestIdKeyword = normalize(options.requestId)
  const endpointKeyword = normalize(options.endpoint)

  const filtered = logs.filter((log) => {
    const requestId = normalize(log.requestId || log.request_id || '')
    const endpoint = normalize(log.endpoint || '')
    const requestIdMatched = !requestIdKeyword || requestId.includes(requestIdKeyword)
    const endpointMatched = !endpointKeyword || endpoint.includes(endpointKeyword)
    return requestIdMatched && endpointMatched
  })

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, totalPages)
  const start = (page - 1) * pageSize

  return {
    logs: filtered.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  }
}

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function clampPositiveInteger(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 1) return fallback
  return Math.floor(number)
}
