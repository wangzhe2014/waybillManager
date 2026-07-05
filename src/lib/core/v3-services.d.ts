import type { ExceptionTicket, IntegrationLog, ScanRecord, WaybillSnapshot } from '@/types'

type V2Result<T> = {
  data: T | null
  requestId: string
  status: 'success' | 'failed'
  statusCode: number
  durationMs: number
  error?: string
}

type V2Client = {
  getWaybillDetail(waybillNo: string): Promise<V2Result<{
    waybillNo: string
    storeName?: string
    receiverName?: string
    receiverPhone?: string
    receiverAddress?: string
    amount?: number
    skus?: unknown[]
  }>>
  validateWaybillSku(waybillNo: string, skuCode: string): Promise<V2Result<{
    valid: boolean
    waybillNo: string
    skuCode: string
    skuName?: string
  }>>
}

type Store = {
  upsertWaybillSnapshot(snapshot: WaybillSnapshot): Promise<WaybillSnapshot>
  appendIntegrationLog(log: IntegrationLog): Promise<IntegrationLog>
  findOpenTicket(params: {
    waybillNo: string
    exceptionCategory: string
    exceptionType?: string
    skuCode?: string
    batchNo?: string
  }): Promise<ExceptionTicket | null>
  findOpenQualityTicketByBatch?(params: {
    skuCode: string
    batchNo: string
  }): Promise<ExceptionTicket | null>
  insertTicket(ticket: ExceptionTicket): Promise<ExceptionTicket>
  insertScanRecord(scan: ScanRecord): Promise<ScanRecord>
  lockInventoryBatch?(batch: Record<string, unknown>): Promise<Record<string, unknown>>
  recordQualityScanTransaction?(params: {
    ticket: ExceptionTicket | null
    scan: ScanRecord
    batch: Record<string, unknown> | null
    existingTicketId?: string
  }): Promise<{
    ticket: ExceptionTicket | null
    scan: ScanRecord
    batch: Record<string, unknown> | null
  }>
}

export function reportLogisticsExceptionWithV2(params: {
  input: Record<string, unknown>
  actor: { id: string; name?: string }
  approvalRules: Array<Record<string, unknown>>
  store: Store
  v2Client: V2Client
  now?: () => Date
  idFactory?: (prefix: string) => string
}): Promise<ExceptionTicket>

export function processQualityScanWithV2(params: {
  input: Record<string, unknown>
  qualityRules: Array<Record<string, unknown>>
  store: Store
  v2Client: V2Client
  now?: () => Date
  idFactory?: (prefix: string) => string
}): Promise<{
  result: 'passed' | 'abnormal'
  batchStatus: ScanRecord['batchStatus']
  ticket: ExceptionTicket | null
  scan: ScanRecord
  reusedOpenTicket: boolean
  matchedRule: Record<string, unknown> | null
}>
