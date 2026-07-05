import type { ExceptionTicket, IntegrationLog, ScanRecord, TicketDetail, WaybillSnapshot } from '@/types'

export function createSupabaseStore(client: unknown): {
  upsertWaybillSnapshot(snapshot: WaybillSnapshot): Promise<WaybillSnapshot>
  appendIntegrationLog(log: IntegrationLog): Promise<IntegrationLog>
  findOpenTicket(params: {
    waybillNo: string
    exceptionCategory: string
    exceptionType?: string
    skuCode?: string
    batchNo?: string
  }): Promise<ExceptionTicket | null>
  findOpenQualityTicketByBatch(params: {
    skuCode: string
    batchNo: string
  }): Promise<ExceptionTicket | null>
  findTicketById(ticketId: string): Promise<ExceptionTicket | null>
  getTicketDetail(ticketId: string): Promise<TicketDetail | null>
  insertTicket(ticket: ExceptionTicket): Promise<ExceptionTicket>
  insertScanRecord(scan: ScanRecord): Promise<ScanRecord>
  listScanRecords(options?: { page?: number; pageSize?: number }): Promise<{
    scans: ScanRecord[]
    total: number
    page: number
    pageSize: number
    totalPages: number
  }>
  lockInventoryBatch(batch: Record<string, unknown>): Promise<Record<string, unknown>>
  recordQualityScanTransaction(params: {
    ticket: ExceptionTicket | null
    scan: ScanRecord
    batch: Record<string, unknown> | null
    existingTicketId?: string
  }): Promise<{
    ticket: ExceptionTicket | null
    scan: ScanRecord
    batch: Record<string, unknown> | null
  }>
  listTickets(): Promise<ExceptionTicket[]>
  listIntegrationLogs(limit?: number): Promise<IntegrationLog[]>
  listOverdueTickets(nowIso: string): Promise<ExceptionTicket[]>
  listApprovalRules(): Promise<Array<Record<string, unknown>>>
  listQualityRules(): Promise<Array<Record<string, unknown>>>
  listAllApprovalRules(): Promise<Array<Record<string, unknown>>>
  listAllQualityRules(): Promise<Array<Record<string, unknown>>>
  upsertApprovalRule(rule: Record<string, unknown>): Promise<Record<string, unknown>>
  upsertQualityRule(rule: Record<string, unknown>): Promise<Record<string, unknown>>
  disableRule(mode: string, code: string): Promise<Record<string, unknown> | null>
  updateTicket(ticket: ExceptionTicket): Promise<ExceptionTicket>
  insertApprovalRecord(record: Record<string, unknown>): Promise<Record<string, unknown>>
  approveTicketTransition(params: {
    ticket: ExceptionTicket
    approvalRecord: Record<string, unknown>
  }): Promise<{
    ticket: ExceptionTicket
    approvalRecord: Record<string, unknown>
  }>
  approveAndExecuteTicketTransition(params: {
    ticket: ExceptionTicket
    approvalRecord: Record<string, unknown>
    execution: {
      action: string
      actorId: string
    }
  }): Promise<{
    ticket: ExceptionTicket
    approvalRecord: Record<string, unknown>
    execution: Record<string, unknown>
  }>
  insertTicketEvent(event: Record<string, unknown>): Promise<Record<string, unknown>>
  updateScansBatchStatus(ticketId: string, batchStatus: ScanRecord['batchStatus']): Promise<ScanRecord[]>
  completeTicketExecution(params: {
    ticketId: string
    approvalRecordId: string
    action: string
    actorId: string
  }): Promise<unknown>
  listCompensationRecords(limit?: number): Promise<Array<Record<string, unknown>>>
  listInventoryMovements(limit?: number): Promise<Array<Record<string, unknown>>>
}

export function mapSnapshotToRow(snapshot: WaybillSnapshot): Record<string, unknown>
export function mapRowToSnapshot(row: Record<string, unknown>): WaybillSnapshot
export function mapTicketToRow(ticket: ExceptionTicket): Record<string, unknown>
export function mapTicketUpdateToRow(ticket: ExceptionTicket): Record<string, unknown>
export function mapRowToTicket(row: Record<string, unknown>): ExceptionTicket
export function mapScanToRow(scan: ScanRecord): Record<string, unknown>
export function mapRowToScan(row: Record<string, unknown>): ScanRecord
export function mapIntegrationLogToRow(log: IntegrationLog): Record<string, unknown>
export function mapRowToIntegrationLog(row: Record<string, unknown>): IntegrationLog
export function mapApprovalRecordToRow(record: Record<string, unknown>): Record<string, unknown>
export function mapApprovalRuleToRow(record: Record<string, unknown>): Record<string, unknown>
export function mapQualityRuleToRow(record: Record<string, unknown>): Record<string, unknown>
export function mapRowToApprovalRule(row: Record<string, unknown>): Record<string, unknown>
export function mapRowToQualityRule(row: Record<string, unknown>): Record<string, unknown>
