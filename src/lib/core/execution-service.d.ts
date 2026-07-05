export function resolveExecutionApprovalRecordId(params: {
  approvalRecordId?: string
  detail?: {
    approvals?: Record<string, unknown>[]
  } | null
}): string
