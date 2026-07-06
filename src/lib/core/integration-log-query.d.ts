import type { IntegrationLog } from '@/types'

export function filterAndPaginateIntegrationLogs(
  logs: IntegrationLog[],
  options?: {
    requestId?: string
    endpoint?: string
    page?: number
    pageSize?: number
  },
): {
  logs: IntegrationLog[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
