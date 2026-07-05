import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMonitoringSummary } from '../src/lib/core/monitoring-service.mjs'

test('builds monitoring summary from integration logs', () => {
  const summary = buildMonitoringSummary([
    { status: 'success', createdAt: '2026-07-05T10:00:00.000Z' },
    { status: 'failed', createdAt: '2026-07-05T11:00:00.000Z' },
    { status: 'degraded', createdAt: '2026-07-05T12:00:00.000Z' },
    { status: 'success', createdAt: '2026-07-05T09:00:00.000Z' },
  ])

  assert.equal(summary.lastSyncAt, '2026-07-05T12:00:00.000Z')
  assert.equal(summary.successRate, 50)
  assert.equal(summary.degradedCount, 1)
})

test('returns empty monitoring summary for no logs', () => {
  assert.deepEqual(buildMonitoringSummary([]), {
    lastSyncAt: '-',
    successRate: 0,
    degradedCount: 0,
  })
})
