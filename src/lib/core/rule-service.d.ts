export type RuleDisplayRow = {
  id: string
  name: string
  condition: string
  action: string
  mode: string
  enabled: boolean
}

export function buildRuleRows(
  approvalRules?: Array<Record<string, unknown>>,
  qualityRules?: Array<Record<string, unknown>>
): RuleDisplayRow[]

export function normalizeRulePayload(payload?: Record<string, unknown>): {
  mode: 'approval' | 'quality'
  rule: Record<string, unknown>
}

export function filterAndPaginateRuleRows(
  rows?: RuleDisplayRow[],
  options?: {
    search?: string
    mode?: string
    name?: string
    code?: string
    status?: string
    page?: number
    pageSize?: number
  }
): {
  rows: RuleDisplayRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
