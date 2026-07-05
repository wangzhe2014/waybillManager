import type { IntegrationLog } from '@/types'

export function buildMonitoringSummary(logs: IntegrationLog[]): {
  lastSyncAt: string
  successRate: number
  degradedCount: number
}
