export function traceParamsFromSearch(searchParams) {
  return {
    page: Number(searchParams.get('page') || 1),
    pageSize: Number(searchParams.get('pageSize') || 10),
    keyword: String(searchParams.get('keyword') || '').trim(),
    direction: String(searchParams.get('direction') || '').trim(),
    status: String(searchParams.get('status') || '').trim(),
    movementType: String(searchParams.get('movementType') || '').trim(),
  }
}

export function queryTraceRecords(records, params = {}) {
  const page = Math.max(1, Number(params.page || 1))
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize || 10)))
  const keyword = String(params.keyword || '').trim().toLowerCase()
  const direction = String(params.direction || '').trim()
  const status = String(params.status || '').trim()
  const movementType = String(params.movementType || '').trim()

  const filtered = records
    .filter((record) => {
      if (!keyword) return true
      return [
        recordValue(record, ['ticketNo', 'ticket_no', 'ticketId', 'ticket_id']),
        recordValue(record, ['waybillNo', 'waybill_no']),
        nestedTicketValue(record, ['ticket_no']),
        nestedTicketValue(record, ['waybill_no']),
      ].some((value) => value.toLowerCase().includes(keyword))
    })
    .filter((record) => !direction || recordValue(record, ['direction']) === direction)
    .filter((record) => !status || recordValue(record, ['status']) === status)
    .filter((record) => !movementType || recordValue(record, ['movementType', 'movement_type']) === movementType)
    .sort((left, right) => recordTime(right) - recordTime(left))

  const from = (page - 1) * pageSize
  return {
    records: filtered.slice(from, from + pageSize),
    total: filtered.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
  }
}

function recordValue(record, keys) {
  for (const key of keys) {
    const value = record[key]
    if (value === null || value === undefined || value === '') continue
    return String(value)
  }
  return ''
}

function nestedTicketValue(record, keys) {
  const ticket = record.exception_tickets || {}
  return recordValue(ticket, keys)
}

function recordTime(record) {
  const value = recordValue(record, ['createdAt', 'created_at'])
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}
