export function buildMonitoringSummary(logs) {
  if (!Array.isArray(logs) || logs.length === 0) {
    return {
      lastSyncAt: '-',
      successRate: 0,
      degradedCount: 0,
    }
  }

  const latest = [...logs].sort((left, right) => timestampOf(right) - timestampOf(left))[0]
  const successCount = logs.filter((log) => log.status === 'success').length
  const degradedCount = logs.filter((log) => log.status === 'degraded').length

  return {
    lastSyncAt: latest?.createdAt || latest?.created_at || '-',
    successRate: Math.round(successCount / logs.length * 100),
    degradedCount,
  }
}

function timestampOf(log) {
  const timestamp = new Date(log.createdAt || log.created_at || '').getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}
