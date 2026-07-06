import assert from 'node:assert/strict'
import test from 'node:test'
import { processTimeoutAutoFlowJob } from '../src/lib/core/timeout-job.mjs'

test('timeout auto flow job writes an integration log when manually executed', async () => {
  const logs = []
  const tickets = [
    {
      id: 'TL-LOG-001',
      status: 'level1_reviewing',
      version: 1,
      currentApprover: '一级审批',
      dueAt: '2026-07-03T10:00:00.000Z',
    },
  ]
  const approvals = []
  const store = {
    async listOverdueTickets() {
      return tickets
    },
    async updateTicket(ticket) {
      tickets[0] = ticket
      return ticket
    },
    async insertApprovalRecord(record) {
      approvals.push(record)
      return record
    },
    async appendIntegrationLog(log) {
      logs.push(log)
      return log
    },
  }

  const result = await processTimeoutAutoFlowJob({
    store,
    now: new Date('2026-07-03T12:00:00.000Z'),
    trigger: 'manual',
    requestId: 'task-timeout-test',
  })

  assert.equal(result.processed, 1)
  assert.equal(logs.length, 1)
  assert.equal(logs[0].requestId, 'task-timeout-test')
  assert.equal(logs[0].endpoint, '/api/timeouts/process')
  assert.equal(logs[0].status, 'success')
  assert.equal(logs[0].statusCode, 200)
  assert.match(logs[0].message, /处理 1 条/)
  assert.match(logs[0].requestDigest, /trigger=manual/)
})
