import { integrationLogs, scanRecords, tickets, waybillSnapshots } from '@/lib/demo-data'
import { filterAndPaginateIntegrationLogs } from '@/lib/core/integration-log-query.mjs'
import { resolveInventoryQuantityDelta } from '@/lib/core/workflow.mjs'
import type { ExceptionTicket, IntegrationLog, ScanRecord, TicketDetail, WaybillSnapshot } from '@/types'

export const defaultApprovalRules = [
  { code: 'amount-level-1', name: '小额一级审批', minAmount: 0, maxAmount: 999.99, level: 'level1_reviewing', enabled: true },
  { code: 'amount-level-2', name: '大额二级审批', minAmount: 1000, maxAmount: null, level: 'level2_reviewing', enabled: true },
]

export const defaultQualityRules = [
  {
    id: 'QR-DAMAGE-03',
    code: 'QR-DAMAGE-03',
    name: '外观破损暂扣',
    subtype: '外观破损',
    severity: 'high',
    condition: { field: 'damageLevel', operator: 'gte', value: 3 },
    entryLevel: 'level2_reviewing',
    enabled: true,
  },
  {
    id: 'QR-QTY-DIFF-02',
    code: 'QR-QTY-DIFF-02',
    name: '数量不符暂扣',
    subtype: '数量不符',
    severity: 'medium',
    condition: { field: 'quantityDiffRate', operator: 'gte', value: 0.02 },
    entryLevel: 'level1_reviewing',
    enabled: true,
  },
  {
    id: 'QR-LABEL-01',
    code: 'QR-LABEL-01',
    name: '标签错误暂扣',
    subtype: '标签错误',
    severity: 'medium',
    condition: { field: 'labelError', operator: 'eq', value: true },
    entryLevel: 'level1_reviewing',
    enabled: true,
  },
]

type MockDb = {
  tickets: ExceptionTicket[]
  scans: ScanRecord[]
  waybills: WaybillSnapshot[]
  logs: IntegrationLog[]
  approvals: Record<string, unknown>[]
  events: Record<string, unknown>[]
  batches: Record<string, unknown>[]
  compensations: Record<string, unknown>[]
  inventoryMovements: Record<string, unknown>[]
  approvalRules: ApprovalRule[]
  qualityRules: QualityRule[]
}

type ApprovalRule = {
  code: string
  name: string
  minAmount: number
  maxAmount: number | null
  level: string
  enabled: boolean
}

type QualityRule = {
  id: string
  code: string
  name: string
  subtype: string
  severity: string
  condition: Record<string, unknown>
  entryLevel: string
  enabled: boolean
}

const globalForDb = globalThis as unknown as { __waybillV3MockDb?: MockDb }

export const db: MockDb = globalForDb.__waybillV3MockDb || {
  tickets: tickets.map((item) => ({ ...item })),
  scans: scanRecords.map((item) => ({ ...item })),
  waybills: waybillSnapshots.map((item) => ({ ...item })),
  logs: integrationLogs.map((item) => ({ ...item })),
  approvals: [],
  events: [],
  batches: [],
  compensations: [],
  inventoryMovements: [],
  approvalRules: defaultApprovalRules.map((item) => ({ ...item })),
  qualityRules: defaultQualityRules.map((item) => ({ ...item, condition: { ...item.condition } })),
}

globalForDb.__waybillV3MockDb = db

export function nowText() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

export function createId(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`
}

export const mockStore = {
  async upsertWaybillSnapshot(snapshot: WaybillSnapshot) {
    const nextSnapshot = { ...snapshot }
    const existingIndex = db.waybills.findIndex((item) => item.waybillNo === snapshot.waybillNo)
    if (existingIndex === -1) {
      db.waybills.unshift(nextSnapshot)
    } else {
      db.waybills[existingIndex] = nextSnapshot
    }
    return nextSnapshot
  },

  async appendIntegrationLog(log: IntegrationLog) {
    const nextLog = { ...log }
    db.logs.unshift(nextLog)
    return nextLog
  },

  async findOpenTicket(params: {
    waybillNo: string
    exceptionCategory: string
    exceptionType?: string
    skuCode?: string
    batchNo?: string
  }) {
    const closed = new Set(['completed', 'closed'])
    return db.tickets.find((ticket) => {
      const sameWaybill = ticket.waybillNo === params.waybillNo
      const sameCategory = ticket.exceptionCategory === params.exceptionCategory
      const sameType = !params.exceptionType || ticket.exceptionType === params.exceptionType
      const sameSku = !params.skuCode || ticket.skuCode === params.skuCode
      const sameBatch = !params.batchNo || ticket.batchNo === params.batchNo
      return sameWaybill && sameCategory && sameType && sameSku && sameBatch && !closed.has(ticket.status)
    }) || null
  },

  async findOpenQualityTicketByBatch(params: {
    skuCode: string
    batchNo: string
  }) {
    const closed = new Set(['completed', 'closed'])
    return db.tickets.find((ticket) =>
      ticket.exceptionCategory === 'quality' &&
      ticket.skuCode === params.skuCode &&
      ticket.batchNo === params.batchNo &&
      !closed.has(ticket.status)
    ) || null
  },

  async findTicketById(ticketId: string) {
    return db.tickets.find((ticket) => ticket.id === ticketId) || null
  },

  async getTicketDetail(ticketId: string): Promise<TicketDetail | null> {
    const ticket = db.tickets.find((item) => item.id === ticketId)
    if (!ticket) return null

    return {
      ticket,
      approvals: db.approvals.filter((record) =>
        String(record.ticketId || record.ticket_id || '') === ticketId
      ),
      scans: db.scans.filter((scan) => scan.ticketId === ticketId),
      compensations: db.compensations.filter((record) =>
        String(record.ticketId || record.ticket_id || '') === ticketId
      ),
      inventoryMovements: db.inventoryMovements.filter((record) =>
        String(record.ticketId || record.ticket_id || '') === ticketId
      ),
      events: db.events.filter((record) =>
        String(record.ticketId || record.ticket_id || '') === ticketId
      ),
    }
  },

  async insertTicket(ticket: ExceptionTicket) {
    const nextTicket = { ...ticket }
    db.tickets.unshift(nextTicket)
    return nextTicket
  },

  async insertScanRecord(scan: ScanRecord) {
    const nextScan = { ...scan }
    db.scans.unshift(nextScan)
    return nextScan
  },

  async listScanRecords(options: { page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, Number(options.page || 1))
    const pageSize = Math.min(100, Math.max(1, Number(options.pageSize || 20)))
    const from = (page - 1) * pageSize
    const sortedScans = [...db.scans]
      .sort((left, right) => new Date(right.scannedAt).getTime() - new Date(left.scannedAt).getTime())
    return {
      scans: sortedScans.slice(from, from + pageSize),
      total: sortedScans.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(sortedScans.length / pageSize)),
    }
  },

  async lockInventoryBatch(batch: Record<string, unknown>) {
    const skuCode = String(batch.skuCode || '')
    const batchNo = String(batch.batchNo || '')
    const index = db.batches.findIndex((item) =>
      String(item.skuCode || '') === skuCode && String(item.batchNo || '') === batchNo
    )
    const nextBatch = { ...batch }
    if (index === -1) db.batches.unshift(nextBatch)
    else db.batches[index] = nextBatch
    return nextBatch
  },

  async recordQualityScanTransaction(params: {
    ticket: ExceptionTicket | null
    scan: ScanRecord
    batch: Record<string, unknown> | null
    existingTicketId?: string
  }) {
    let ticket = params.ticket
    if (ticket) {
      const existing = await this.findOpenQualityTicketByBatch({
        skuCode: ticket.skuCode || '',
        batchNo: ticket.batchNo || '',
      })
      if (existing) {
        ticket = existing
      } else {
        db.tickets.unshift({ ...ticket })
      }
    } else if (params.existingTicketId || params.scan.ticketId) {
      ticket = db.tickets.find((item) => item.id === (params.existingTicketId || params.scan.ticketId)) || null
    }

    if (!ticket) {
      throw new Error('品控扫描缺少可关联工单')
    }

    if (params.batch) {
      const skuCode = String(params.batch.skuCode || '')
      const batchNo = String(params.batch.batchNo || '')
      const index = db.batches.findIndex((item) =>
        String(item.skuCode || '') === skuCode && String(item.batchNo || '') === batchNo
      )
      const existingBatch = index === -1 ? null : db.batches[index]
      if (
        existingBatch &&
        existingBatch.status === 'qc_hold' &&
        existingBatch.ticketId &&
        existingBatch.ticketId !== ticket.id
      ) {
        throw new Error('该 SKU 批次已被其他未关闭品控工单锁定')
      }

      const nextBatch = { ...params.batch, ticketId: ticket.id, status: 'qc_hold' }
      if (index === -1) db.batches.unshift(nextBatch)
      else db.batches[index] = nextBatch
    }

    const scan = { ...params.scan, ticketId: ticket.id, batchStatus: 'qc_hold' as const }
    db.scans.unshift(scan)

    return {
      ticket,
      scan,
      batch: params.batch ? { ...params.batch, ticketId: ticket.id, status: 'qc_hold' } : null,
    }
  },

  async listTickets() {
    return db.tickets
  },

  async listIntegrationLogs(options?: { requestId?: string; endpoint?: string; page?: number; pageSize?: number }) {
    if (!options) return db.logs
    return filterAndPaginateIntegrationLogs(db.logs, options)
  },

  async listOverdueTickets(nowIso: string) {
    const now = new Date(nowIso).getTime()
    return db.tickets.filter((ticket) =>
      ['pending_review', 'level1_reviewing', 'level2_reviewing'].includes(ticket.status) &&
      new Date(ticket.dueAt).getTime() <= now
    )
  },

  async listApprovalRules() {
    return db.approvalRules.filter((rule) => rule.enabled)
  },

  async listQualityRules() {
    return db.qualityRules.filter((rule) => rule.enabled)
  },

  async listAllApprovalRules() {
    return db.approvalRules
  },

  async listAllQualityRules() {
    return db.qualityRules
  },

  async upsertApprovalRule(rule: Record<string, unknown>) {
    const nextRule = {
      code: String(rule.code),
      name: String(rule.name || rule.code),
      minAmount: Number(rule.minAmount || 0),
      maxAmount: rule.maxAmount === null || rule.maxAmount === undefined || rule.maxAmount === ''
        ? null
        : Number(rule.maxAmount),
      level: String(rule.level || 'level1_reviewing'),
      enabled: rule.enabled !== false,
    }
    const index = db.approvalRules.findIndex((item) => item.code === nextRule.code)
    if (index === -1) db.approvalRules.unshift(nextRule)
    else db.approvalRules[index] = nextRule
    return nextRule
  },

  async upsertQualityRule(rule: Record<string, unknown>) {
    const nextRule = {
      id: String(rule.id || rule.code),
      code: String(rule.code),
      name: String(rule.name || rule.subtype || rule.code),
      subtype: String(rule.subtype || rule.code),
      severity: String(rule.severity || 'medium'),
      condition: (rule.condition as Record<string, unknown>) || {},
      entryLevel: String(rule.entryLevel || 'level1_reviewing'),
      enabled: rule.enabled !== false,
    }
    const index = db.qualityRules.findIndex((item) => item.code === nextRule.code)
    if (index === -1) db.qualityRules.unshift(nextRule)
    else db.qualityRules[index] = nextRule
    return nextRule
  },

  async disableRule(mode: string, code: string) {
    const rules = mode === 'approval' ? db.approvalRules : db.qualityRules
    const rule = rules.find((item) => item.code === code)
    if (!rule) return null
    rule.enabled = false
    return rule
  },

  async updateTicket(ticket: ExceptionTicket) {
    const index = db.tickets.findIndex((item) => item.id === ticket.id)
    if (index !== -1) {
      db.tickets[index] = { ...ticket }
    }
    return ticket
  },

  async insertApprovalRecord(record: Record<string, unknown>) {
    const nextRecord = { ...record }
    db.approvals.unshift(nextRecord)
    return nextRecord
  },

  async approveTicketTransition(params: {
    ticket: ExceptionTicket
    approvalRecord: Record<string, unknown>
  }) {
    await this.updateTicket(params.ticket)
    const approvalRecord = await this.insertApprovalRecord(params.approvalRecord)
    return {
      ticket: params.ticket,
      approvalRecord,
    }
  },

  async approveAndExecuteTicketTransition(params: {
    ticket: ExceptionTicket
    approvalRecord: Record<string, unknown>
    execution: { action: string; actorId: string }
  }) {
    const transition = await this.approveTicketTransition({
      ticket: params.ticket,
      approvalRecord: params.approvalRecord,
    })
    const approvalRecordId = String(transition.approvalRecord.id || transition.approvalRecord.approval_record_id || '')
    const execution = await this.completeTicketExecution({
      ticketId: transition.ticket.id,
      approvalRecordId,
      action: params.execution.action,
      actorId: params.execution.actorId,
    })
    return {
      ticket: db.tickets.find((item) => item.id === transition.ticket.id) || transition.ticket,
      approvalRecord: transition.approvalRecord,
      execution,
    }
  },

  async insertTicketEvent(event: Record<string, unknown>) {
    const nextEvent = { ...event }
    db.events.unshift(nextEvent)
    return nextEvent
  },

  async updateScansBatchStatus(ticketId: string, batchStatus: ScanRecord['batchStatus']) {
    db.scans
      .filter((scan) => scan.ticketId === ticketId)
      .forEach((scan) => {
        scan.batchStatus = batchStatus
      })
    return db.scans.filter((scan) => scan.ticketId === ticketId)
  },

  async completeTicketExecution(params: {
    ticketId: string
    approvalRecordId: string
    action: string
    actorId: string
  }) {
    const ticket = db.tickets.find((item) => item.id === params.ticketId)
    if (!ticket) {
      throw new Error('工单不存在')
    }
    if (ticket.status !== 'executing') {
      throw new Error(`工单状态 ${ticket.status} 不可执行联动`)
    }

    ticket.status = 'completed'
    ticket.currentApprover = '已完成'
    ticket.version += 1

    if (ticket.exceptionCategory === 'quality') {
      const batchStatus = params.action === 'return_supplier'
        ? 'returned_supplier'
        : params.action === 'repurchase'
          ? 'repurchasing'
          : params.action === 'downgrade'
            ? 'downgraded'
            : 'qc_released'
      db.scans
        .filter((scan) => scan.ticketId === ticket.id)
        .forEach((scan) => {
          scan.batchStatus = batchStatus
        })
      db.inventoryMovements.unshift({
        id: createId('MOVE'),
        ticketId: ticket.id,
        approvalRecordId: params.approvalRecordId,
        movementType: params.action === 'return_supplier' ? 'stock_out' : 'status_change',
        quantityDelta: resolveInventoryQuantityDelta({
          movementType: params.action === 'return_supplier' ? 'stock_out' : 'status_change',
          ticket,
        }),
        remark: `quality action: ${params.action}`,
        createdAt: new Date().toISOString(),
      })
      if (params.action !== 'release') {
        db.compensations.unshift({
          id: createId('PAY'),
          ticketId: ticket.id,
          approvalRecordId: params.approvalRecordId,
          amount: ticket.amount,
          direction: 'supplier_recovery',
          status: 'pending_reconciliation',
          createdAt: new Date().toISOString(),
        })
      }
    } else {
      const movementType = params.action === 'reship'
        ? 'stock_out'
        : params.action === 'return_to_stock'
          ? 'stock_in'
          : ''
      if (movementType) {
        db.inventoryMovements.unshift({
          id: createId('MOVE'),
          ticketId: ticket.id,
          approvalRecordId: params.approvalRecordId,
          movementType,
          quantityDelta: resolveInventoryQuantityDelta({ movementType, ticket }),
          remark: `logistics action: ${params.action}`,
          createdAt: new Date().toISOString(),
        })
      }
      if (params.action === 'customer_compensation') {
        db.compensations.unshift({
          id: createId('PAY'),
          ticketId: ticket.id,
          approvalRecordId: params.approvalRecordId,
          amount: ticket.amount,
          direction: 'customer_compensation',
          status: 'pending_payment',
          createdAt: new Date().toISOString(),
        })
      }
    }

    return {
      ticketNo: ticket.id,
      status: ticket.status,
      action: params.action,
      approvalRecordId: params.approvalRecordId,
      actorId: params.actorId,
    }
  },

  async listCompensationRecords(limit = 100) {
    return db.compensations.slice(0, limit).map((record) => enrichTraceRecord(record))
  },

  async listInventoryMovements(limit = 100) {
    return db.inventoryMovements.slice(0, limit).map((record) => enrichTraceRecord(record))
  },
}

function enrichTraceRecord(record: Record<string, unknown>) {
  const ticketId = String(record.ticketId || record.ticket_id || '')
  const ticket = db.tickets.find((item) => item.id === ticketId)
  return {
    ...record,
    ticketNo: ticket?.id || ticketId,
    waybillNo: ticket?.waybillNo || '',
    exceptionCategory: ticket?.exceptionCategory || '',
    exceptionType: ticket?.exceptionType || '',
  }
}
