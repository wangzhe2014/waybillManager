import type { IntegrationLog } from '@/types'

export function processTimeoutAutoFlowJob(params: {
  store: {
    listOverdueTickets(nowIso: string): Promise<Array<Record<string, unknown>>>
    updateTicket(ticket: Record<string, unknown>): Promise<Record<string, unknown>>
    insertApprovalRecord(record: Record<string, unknown>): Promise<Record<string, unknown>>
    appendIntegrationLog(log: IntegrationLog): Promise<IntegrationLog>
  }
  now?: Date
  trigger?: 'manual' | 'cron'
  requestId?: string
}): Promise<{
  processed: number
  executedAt: string
  requestId: string
  results: Array<Record<string, unknown>>
}>
