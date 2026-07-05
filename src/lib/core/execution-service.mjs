export function resolveExecutionApprovalRecordId({ approvalRecordId, detail }) {
  const explicitId = String(approvalRecordId || '').trim()
  if (explicitId) return explicitId

  const approvedRecords = [...(detail?.approvals || [])]
    .filter((record) => String(record.result || '') === 'approved')
    .sort((left, right) => timestampOf(right) - timestampOf(left))

  const latestApproved = approvedRecords[0]
  const recoveredId = latestApproved?.id || latestApproved?.approval_record_id || latestApproved?.approvalRecordId
  if (!recoveredId) {
    throw new Error('缺少审批通过记录，无法执行联动')
  }

  return String(recoveredId)
}

function timestampOf(record) {
  const value = record.createdAt || record.created_at || ''
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}
