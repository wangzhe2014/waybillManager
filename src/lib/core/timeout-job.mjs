import { processOverdueTicket } from './timeout-service.mjs'

export async function processTimeoutAutoFlowJob({
  store,
  now = new Date(),
  trigger = 'manual',
  requestId = createTimeoutJobRequestId(now),
}) {
  const startedAt = Date.now()
  const overdueTickets = await store.listOverdueTickets(now.toISOString())
  const results = []

  for (const ticket of overdueTickets) {
    const processed = processOverdueTicket({ ticket, now })
    if (!processed) continue

    await store.updateTicket(processed.ticket)
    const approvalRecord = await store.insertApprovalRecord(processed.approvalRecord)
    results.push({
      ticket: processed.ticket,
      approvalRecord,
    })
  }

  const durationMs = Math.max(0, Date.now() - startedAt)
  await store.appendIntegrationLog({
    id: requestId,
    requestId,
    endpoint: '/api/timeouts/process',
    status: 'success',
    statusCode: 200,
    durationMs,
    message: `超时自动流转完成，处理 ${results.length} 条工单`,
    requestDigest: `trigger=${trigger}; overdue=${overdueTickets.length}; processed=${results.length}`,
    createdAt: now.toISOString(),
  })

  return {
    processed: results.length,
    executedAt: now.toISOString(),
    requestId,
    results,
  }
}

function createTimeoutJobRequestId(now) {
  return `task-timeout-${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
}
