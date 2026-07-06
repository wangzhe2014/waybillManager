const CLOSED_STATUSES = ['completed', 'closed']

function clampPositiveInteger(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 1) return fallback
  return Math.floor(number)
}

export function createSupabaseStore(client) {
  return {
    async upsertWaybillSnapshot(snapshot) {
      const { data, error } = await client
        .from('waybill_snapshots')
        .upsert(mapSnapshotToRow(snapshot), { onConflict: 'waybill_no' })
        .select('*')
        .single()
      if (error) throw error
      return mapRowToSnapshot(data)
    },

    async appendIntegrationLog(log) {
      const { data, error } = await client
        .from('integration_logs')
        .insert(mapIntegrationLogToRow(log))
        .select('*')
        .single()
      if (error) throw error
      return mapRowToIntegrationLog(data)
    },

    async findOpenTicket(params) {
      let query = client
        .from('exception_tickets')
        .select('*')
        .eq('waybill_no', params.waybillNo)
        .eq('exception_category', params.exceptionCategory)
        .not('status', 'in', `(${CLOSED_STATUSES.join(',')})`)
        .limit(1)

      if (params.exceptionType) query = query.eq('exception_type', params.exceptionType)
      if (params.skuCode) query = query.eq('sku_code', params.skuCode)
      if (params.batchNo) query = query.eq('batch_no', params.batchNo)

      const { data, error } = await query.maybeSingle()
      if (error) throw error
      return data ? mapRowToTicket(data) : null
    },

    async findOpenQualityTicketByBatch(params) {
      const { data, error } = await client
        .from('exception_tickets')
        .select('*')
        .eq('exception_category', 'quality')
        .eq('sku_code', params.skuCode)
        .eq('batch_no', params.batchNo)
        .not('status', 'in', `(${CLOSED_STATUSES.join(',')})`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ? mapRowToTicket(data) : null
    },

    async findTicketById(ticketId) {
      const { data, error } = await client
        .from('exception_tickets')
        .select('*')
        .eq('ticket_no', ticketId)
        .maybeSingle()
      if (error) throw error
      return data ? mapRowToTicket(data) : null
    },

    async getTicketDetail(ticketId) {
      const { data: ticketRow, error: ticketError } = await client
        .from('exception_tickets')
        .select('*')
        .eq('ticket_no', ticketId)
        .maybeSingle()
      if (ticketError) throw ticketError
      if (!ticketRow) return null

      const ticketDbId = ticketRow.id
      const [
        approvals,
        scans,
        compensations,
        inventoryMovements,
        events,
      ] = await Promise.all([
        selectRows(client, 'approval_records', ticketDbId),
        selectRows(client, 'scan_records', ticketDbId),
        selectRows(client, 'compensation_records', ticketDbId),
        selectRows(client, 'inventory_movements', ticketDbId),
        selectRows(client, 'ticket_events', ticketDbId),
      ])

      return {
        ticket: mapRowToTicket(ticketRow),
        approvals,
        scans: scans.map(mapRowToScan),
        compensations,
        inventoryMovements,
        events,
      }
    },

    async insertTicket(ticket) {
      const { data, error } = await client
        .from('exception_tickets')
        .insert(mapTicketToRow(ticket))
        .select('*')
        .single()
      if (error) throw error
      return mapRowToTicket(data)
    },

    async insertScanRecord(scan) {
      const row = mapScanToRow(scan)
      if (scan.ticketId && !isUuid(scan.ticketId)) {
        row.ticket_id = await resolveTicketDbId(client, scan.ticketId)
      }

      const { data, error } = await client
        .from('scan_records')
        .insert(row)
        .select('*')
        .single()
      if (error) throw error
      return mapRowToScan(data)
    },

    async listScanRecords(options = {}) {
      const { page, pageSize, from, to } = paginationRange(options)
      const { data, error, count } = await client
        .from('scan_records')
        .select('*', { count: 'exact' })
        .order('scanned_at', { ascending: false })
        .range(from, to)
      if (error) throw error
      return {
        scans: (data || []).map(mapRowToScan),
        total: Number(count || 0),
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(Number(count || 0) / pageSize)),
      }
    },

    async lockInventoryBatch(batch) {
      const ticketDbId = batch.ticketId
        ? isUuid(batch.ticketId)
          ? batch.ticketId
          : await resolveTicketDbId(client, batch.ticketId)
        : null
      const { data, error } = await client
        .from('inventory_batches')
        .upsert({
          sku_code: batch.skuCode,
          sku_name: batch.skuName || '',
          batch_no: batch.batchNo,
          quantity: Number(batch.quantity || 0),
          status: batch.status || 'qc_hold',
          locked_by_ticket_id: ticketDbId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'sku_code,batch_no' })
        .select('*')
        .single()
      if (error) throw error
      return data
    },

    async recordQualityScanTransaction({ ticket, scan, batch, existingTicketId }) {
      const scanRow = mapScanToRow(scan)
      const batchRow = batch
        ? {
            sku_code: batch.skuCode,
            sku_name: batch.skuName || '',
            batch_no: batch.batchNo,
            quantity: Number(batch.quantity || 0),
            status: batch.status || 'qc_hold',
            ticket_no: batch.ticketId || existingTicketId || scan.ticketId || null,
          }
        : null
      const { data, error } = await client.rpc('record_quality_scan_transaction', {
        p_ticket: ticket ? mapTicketToRow(ticket) : null,
        p_scan: scanRow,
        p_batch: batchRow,
        p_existing_ticket_no: existingTicketId || null,
      })
      if (error) throw error
      return {
        ticket: data?.ticket ? mapRowToTicket(data.ticket) : null,
        scan: data?.scan ? mapRowToScan(data.scan) : null,
        batch: data?.batch || null,
      }
    },

    async listTickets() {
      const { data, error } = await client
        .from('exception_tickets')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapRowToTicket)
    },

    async listIntegrationLogs(options = { page: 1, pageSize: 10 }) {
      if (typeof options === 'number') {
        const { data, error } = await client
          .from('integration_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(options)
        if (error) throw error
        return (data || []).map(mapRowToIntegrationLog)
      }

      const pageSize = clampPositiveInteger(options.pageSize, 10)
      const requestedPage = clampPositiveInteger(options.page, 1)
      const from = (requestedPage - 1) * pageSize
      const to = from + pageSize - 1
      let query = client
        .from('integration_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (options.requestId) query = query.ilike('request_id', `%${options.requestId}%`)
      if (options.endpoint) query = query.ilike('endpoint', `%${options.endpoint}%`)

      const { data, error, count } = await query.range(from, to)
      if (error) throw error
      const total = Number(count || 0)
      return {
        logs: (data || []).map(mapRowToIntegrationLog),
        total,
        page: requestedPage,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      }
    },

    async listOverdueTickets(nowIso) {
      const { data, error } = await client
        .from('exception_tickets')
        .select('*')
        .in('status', ['pending_review', 'level1_reviewing', 'level2_reviewing'])
        .lte('due_at', nowIso)
        .order('due_at', { ascending: true })
      if (error) throw error
      return (data || []).map(mapRowToTicket)
    },

    async listApprovalRules() {
      const { data, error } = await client
        .from('approval_rules')
        .select('*')
        .eq('enabled', true)
        .order('min_amount', { ascending: false })
      if (error) throw error
      return (data || []).map(mapRowToApprovalRule)
    },

    async listAllApprovalRules() {
      const { data, error } = await client
        .from('approval_rules')
        .select('*')
        .order('min_amount', { ascending: false })
      if (error) throw error
      return (data || []).map(mapRowToApprovalRule)
    },

    async listQualityRules() {
      const { data, error } = await client
        .from('quality_rules')
        .select('*')
        .eq('enabled', true)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapRowToQualityRule)
    },

    async listAllQualityRules() {
      const { data, error } = await client
        .from('quality_rules')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapRowToQualityRule)
    },

    async upsertApprovalRule(rule) {
      const { data, error } = await client
        .from('approval_rules')
        .upsert(mapApprovalRuleToRow(rule), { onConflict: 'code' })
        .select('*')
        .single()
      if (error) throw error
      return mapRowToApprovalRule(data)
    },

    async upsertQualityRule(rule) {
      const { data, error } = await client
        .from('quality_rules')
        .upsert(mapQualityRuleToRow(rule), { onConflict: 'code' })
        .select('*')
        .single()
      if (error) throw error
      return mapRowToQualityRule(data)
    },

    async disableRule(mode, code) {
      const table = mode === 'approval' ? 'approval_rules' : 'quality_rules'
      const mapper = mode === 'approval' ? mapRowToApprovalRule : mapRowToQualityRule
      const { data, error } = await client
        .from(table)
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq('code', code)
        .select('*')
        .maybeSingle()
      if (error) throw error
      return data ? mapper(data) : null
    },

    async updateTicket(ticket) {
      const { data, error } = await client
        .from('exception_tickets')
        .update(mapTicketUpdateToRow(ticket))
        .eq('ticket_no', ticket.id)
        .select('*')
        .single()
      if (error) throw error
      return mapRowToTicket(data)
    },

    async insertApprovalRecord(record) {
      const ticketDbId = isUuid(record.ticketId)
        ? record.ticketId
        : await resolveTicketDbId(client, record.ticketId)
      const { data, error } = await client
        .from('approval_records')
        .insert({
          ...mapApprovalRecordToRow(record),
          ticket_id: ticketDbId,
        })
        .select('*')
        .single()
      if (error) throw error
      return data
    },

    async approveTicketTransition({ ticket, approvalRecord }) {
      const { data, error } = await client.rpc('approve_ticket_transition', {
        p_ticket_no: ticket.id,
        p_next_status: ticket.status,
        p_current_approver_id: ticket.currentApprover || null,
        p_next_version: Number(ticket.version || 1),
        p_approver_id: approvalRecord.approverId,
        p_approval_level: approvalRecord.approvalLevel,
        p_result: approvalRecord.result,
        p_opinion: approvalRecord.opinion || '',
        p_idempotency_key: approvalRecord.idempotencyKey || approvalRecord.id,
        p_ticket_version_before: Number(approvalRecord.ticketVersionBefore || 1),
      })
      if (error) throw error
      return {
        ticket: mapRowToTicket(data.ticket),
        approvalRecord: data.approvalRecord,
      }
    },

    async approveAndExecuteTicketTransition({ ticket, approvalRecord, execution }) {
      const { data, error } = await client.rpc('approve_and_execute_ticket_transition', {
        p_ticket_no: ticket.id,
        p_next_status: ticket.status,
        p_current_approver_id: ticket.currentApprover || null,
        p_next_version: Number(ticket.version || 1),
        p_approver_id: approvalRecord.approverId,
        p_approval_level: approvalRecord.approvalLevel,
        p_result: approvalRecord.result,
        p_opinion: approvalRecord.opinion || '',
        p_idempotency_key: approvalRecord.idempotencyKey || approvalRecord.id,
        p_ticket_version_before: Number(approvalRecord.ticketVersionBefore || 1),
        p_action: execution.action,
        p_actor_id: execution.actorId || approvalRecord.approverId || 'system',
      })
      if (error) throw error
      return {
        ticket: mapRowToTicket(data.ticket),
        approvalRecord: data.approvalRecord,
        execution: data.execution,
      }
    },

    async insertTicketEvent(event) {
      const ticketDbId = isUuid(event.ticketId)
        ? event.ticketId
        : await resolveTicketDbId(client, event.ticketId)
      const { data, error } = await client
        .from('ticket_events')
        .insert({
          ticket_id: ticketDbId,
          event_type: event.eventType || event.event_type,
          actor_id: event.actorId || event.actor_id,
          detail: event.detail || {},
        })
        .select('*')
        .single()
      if (error) throw error
      return data
    },

    async updateScansBatchStatus(ticketId, batchStatus) {
      const ticketDbId = isUuid(ticketId) ? ticketId : await resolveTicketDbId(client, ticketId)
      const { data, error } = await client
        .from('scan_records')
        .update({ batch_status: batchStatus })
        .eq('ticket_id', ticketDbId)
        .select('*')
      if (error) throw error
      return (data || []).map(mapRowToScan)
    },

    async completeTicketExecution(params) {
      const { data, error } = await client.rpc('complete_ticket_execution', {
        p_ticket_no: params.ticketId,
        p_approval_record_id: params.approvalRecordId,
        p_action: params.action,
        p_actor_id: params.actorId,
      })
      if (error) throw error
      return data
    },

    async listCompensationRecords(limit = 100) {
      const { data, error } = await client
        .from('compensation_records')
        .select('*, exception_tickets(ticket_no, waybill_no, exception_category, exception_type)')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data || []
    },

    async listInventoryMovements(limit = 100) {
      const { data, error } = await client
        .from('inventory_movements')
        .select('*, exception_tickets(ticket_no, waybill_no, exception_category, exception_type)')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data || []
    },
  }
}

async function selectRows(client, table, ticketDbId) {
  const orderColumn = table === 'scan_records' ? 'scanned_at' : 'created_at'
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('ticket_id', ticketDbId)
    .order(orderColumn, { ascending: true })
  if (error) throw error
  return data || []
}

async function resolveTicketDbId(client, ticketNo) {
  const { data, error } = await client
    .from('exception_tickets')
    .select('id')
    .eq('ticket_no', ticketNo)
    .single()
  if (error) throw error
  return data.id
}

export function mapSnapshotToRow(snapshot) {
  return {
    waybill_no: snapshot.waybillNo,
    store_name: snapshot.storeName || '',
    receiver_name: snapshot.receiverName || '',
    receiver_phone: snapshot.receiverPhone || '',
    receiver_address: snapshot.receiverAddress || '',
    amount: Number(snapshot.amount || 0),
    sku_summary: snapshot.skuSummary || [],
    source: snapshot.source || 'v2_realtime',
    synced_at: snapshot.syncedAt,
  }
}

export function mapRowToSnapshot(row) {
  return {
    waybillNo: row.waybill_no,
    storeName: row.store_name || '',
    receiverName: row.receiver_name || '',
    receiverPhone: row.receiver_phone || '',
    receiverAddress: row.receiver_address || '',
    amount: Number(row.amount || 0),
    skuCount: Array.isArray(row.sku_summary) ? row.sku_summary.length : 0,
    skuSummary: row.sku_summary || [],
    source: row.source || 'local_cache',
    syncedAt: row.synced_at,
  }
}

export function mapTicketToRow(ticket) {
  return {
    ticket_no: ticket.id,
    waybill_no: ticket.waybillNo,
    source: ticket.source,
    exception_category: ticket.exceptionCategory,
    exception_type: ticket.exceptionType,
    severity: ticket.severity || 'medium',
    status: ticket.status,
    amount: Number(ticket.amount || 0),
    reporter_id: ticket.reporterId || ticket.reporter,
    current_approver_id: ticket.currentApprover || null,
    sku_code: ticket.skuCode || null,
    batch_no: ticket.batchNo || null,
    version: Number(ticket.version || 1),
    resubmit_count: Number(ticket.resubmitCount || 0),
    due_at: ticket.dueAt,
  }
}

export function mapTicketUpdateToRow(ticket) {
  return {
    status: ticket.status,
    current_approver_id: ticket.currentApprover || null,
    version: Number(ticket.version || 1),
    resubmit_count: Number(ticket.resubmitCount || 0),
    updated_at: new Date().toISOString(),
  }
}

export function mapRowToTicket(row) {
  const reporterId = row.reporter_id || ''
  return {
    id: row.ticket_no || row.id,
    waybillNo: row.waybill_no,
    source: row.source,
    exceptionCategory: row.exception_category,
    exceptionType: row.exception_type,
    severity: row.severity || 'medium',
    status: row.status,
    amount: Number(row.amount || 0),
    reporterId,
    reporter: reporterId,
    currentApprover: row.current_approver_id || '',
    skuCode: row.sku_code || undefined,
    batchNo: row.batch_no || undefined,
    createdAt: row.created_at,
    dueAt: row.due_at,
    version: Number(row.version || 1),
    resubmitCount: Number(row.resubmit_count || 0),
  }
}

export function mapScanToRow(scan) {
  return {
    waybill_no: scan.waybillNo,
    sku_code: scan.skuCode,
    batch_no: scan.batchNo,
    operator_id: scan.operator,
    result: scan.result,
    abnormal_description: scan.abnormalDescription || null,
    batch_status: scan.batchStatus,
    matched_rule_id: isUuid(scan.matchedRuleId) ? scan.matchedRuleId : null,
    ticket_id: isUuid(scan.ticketId) ? scan.ticketId : null,
    scanned_at: scan.scannedAt,
  }
}

export function mapRowToScan(row) {
  return {
    id: row.id,
    waybillNo: row.waybill_no,
    skuCode: row.sku_code,
    skuName: '',
    batchNo: row.batch_no,
    operator: row.operator_id,
    result: row.result,
    batchStatus: row.batch_status,
    ticketId: row.ticket_id || undefined,
    matchedRuleId: row.matched_rule_id || undefined,
    abnormalDescription: row.abnormal_description || undefined,
    scannedAt: row.scanned_at,
  }
}

export function mapIntegrationLogToRow(log) {
  return {
    request_id: log.requestId,
    endpoint: log.endpoint,
    request_digest: log.requestDigest || null,
    status: log.status,
    status_code: Number(log.statusCode || 0),
    duration_ms: Number(log.durationMs || 0),
    error_message: log.errorMessage || null,
    created_at: log.createdAt,
  }
}

export function mapRowToIntegrationLog(row) {
  return {
    id: row.id,
    requestId: row.request_id,
    endpoint: row.endpoint,
    status: row.status,
    statusCode: Number(row.status_code || 0),
    durationMs: Number(row.duration_ms || 0),
    message: row.error_message || 'V2 接口调用成功',
    requestDigest: row.request_digest || undefined,
    errorMessage: row.error_message || undefined,
    createdAt: row.created_at,
  }
}

export function mapApprovalRecordToRow(record) {
  return {
    ticket_id: isUuid(record.ticketId) ? record.ticketId : null,
    approver_id: record.approverId,
    approval_level: record.approvalLevel,
    result: record.result,
    opinion: record.opinion || '',
    idempotency_key: record.idempotencyKey || record.id,
    ticket_version_before: Number(record.ticketVersionBefore || 1),
  }
}

export function mapApprovalRuleToRow(rule) {
  return {
    code: rule.code,
    name: rule.name || rule.code,
    min_amount: Number(rule.minAmount || 0),
    max_amount: rule.maxAmount === null || rule.maxAmount === undefined ? null : Number(rule.maxAmount),
    target_status: rule.level,
    enabled: rule.enabled !== false,
    updated_at: new Date().toISOString(),
  }
}

export function mapQualityRuleToRow(rule) {
  return {
    code: rule.code,
    name: rule.name || rule.subtype || rule.code,
    subtype: rule.subtype,
    severity: rule.severity || 'medium',
    condition: rule.condition || {},
    entry_level: rule.entryLevel,
    enabled: rule.enabled !== false,
    updated_at: new Date().toISOString(),
  }
}

export function mapRowToApprovalRule(row) {
  return {
    code: row.code,
    name: row.name || row.code,
    minAmount: Number(row.min_amount || 0),
    maxAmount: row.max_amount === null || row.max_amount === undefined ? null : Number(row.max_amount),
    level: row.target_status,
    enabled: Boolean(row.enabled),
  }
}

export function mapRowToQualityRule(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name || row.subtype || row.code,
    subtype: row.subtype,
    severity: row.severity,
    condition: row.condition || {},
    entryLevel: row.entry_level,
    enabled: Boolean(row.enabled),
  }
}

function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function paginationRange(options = {}) {
  const page = Math.max(1, Number(options.page || 1))
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize || 20)))
  const from = (page - 1) * pageSize
  return { page, pageSize, from, to: from + pageSize - 1 }
}
