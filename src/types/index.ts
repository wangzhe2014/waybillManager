export type TicketSource = 'manual_report' | 'scan_triggered'
export type ExceptionCategory = 'logistics' | 'quality'
export type TicketStatus =
  | 'pending_review'
  | 'level1_reviewing'
  | 'level2_reviewing'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'closed'

export interface WaybillSnapshot {
  waybillNo: string
  storeName: string
  receiverName: string
  receiverPhone: string
  receiverAddress: string
  amount: number
  skuCount: number
  skuSummary?: unknown[]
  source: 'v2_realtime' | 'local_cache'
  syncedAt: string
}

export interface ExceptionTicket {
  id: string
  waybillNo: string
  source: TicketSource
  exceptionCategory: ExceptionCategory
  exceptionType: string
  status: TicketStatus
  amount: number
  reporterId?: string
  reporter: string
  currentApprover: string
  description?: string
  skuCode?: string
  batchNo?: string
  severity?: string
  createdAt: string
  dueAt: string
  version: number
  resubmitCount?: number
}

export interface ScanRecord {
  id: string
  waybillNo: string
  skuCode: string
  skuName: string
  batchNo: string
  operator: string
  result: 'passed' | 'abnormal'
  batchStatus: 'available' | 'qc_hold' | 'qc_released' | 'returned_supplier' | 'repurchasing' | 'downgraded'
  ticketId?: string
  matchedRuleId?: string
  abnormalDescription?: string
  scannedAt: string
}

export interface IntegrationLog {
  id: string
  requestId: string
  endpoint: string
  status: 'success' | 'failed' | 'degraded'
  statusCode: number
  durationMs: number
  message: string
  requestDigest?: string
  errorMessage?: string
  createdAt: string
}

export interface TicketDetail {
  ticket: ExceptionTicket
  approvals: Record<string, unknown>[]
  scans: ScanRecord[]
  compensations: Record<string, unknown>[]
  inventoryMovements: Record<string, unknown>[]
  events: Record<string, unknown>[]
}
