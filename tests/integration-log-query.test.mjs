import assert from 'node:assert/strict'
import test from 'node:test'
import { filterAndPaginateIntegrationLogs } from '../src/lib/core/integration-log-query.mjs'

const logs = [
  { requestId: 'req-timeout-001', endpoint: '/api/timeouts/process', createdAt: '2026-07-03T12:00:00.000Z' },
  { requestId: 'req-v2-001', endpoint: 'GET /api/v3/shipments/WB-001', createdAt: '2026-07-03T11:00:00.000Z' },
  { requestId: 'req-timeout-002', endpoint: '/api/timeouts/process', createdAt: '2026-07-03T10:00:00.000Z' },
  { requestId: 'req-scan-001', endpoint: 'GET /api/v3/shipments/WB-001/skus/SKU-1/validate', createdAt: '2026-07-03T09:00:00.000Z' },
]

test('filters integration logs by request id and endpoint keyword', () => {
  const result = filterAndPaginateIntegrationLogs(logs, {
    requestId: 'timeout',
    endpoint: 'process',
    page: 1,
    pageSize: 10,
  })

  assert.equal(result.total, 2)
  assert.deepEqual(result.logs.map((log) => log.requestId), ['req-timeout-001', 'req-timeout-002'])
})

test('paginates integration logs with stable page info', () => {
  const result = filterAndPaginateIntegrationLogs(logs, {
    page: 2,
    pageSize: 2,
  })

  assert.equal(result.total, 4)
  assert.equal(result.page, 2)
  assert.equal(result.pageSize, 2)
  assert.equal(result.totalPages, 2)
  assert.deepEqual(result.logs.map((log) => log.requestId), ['req-timeout-002', 'req-scan-001'])
})
