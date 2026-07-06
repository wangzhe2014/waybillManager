import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSupabaseStore,
  mapIntegrationLogToRow,
  mapRowToApprovalRule,
  mapRowToQualityRule,
  mapRowToTicket,
  mapScanToRow,
  mapSnapshotToRow,
  mapTicketToRow,
} from '../src/lib/server/supabase-store.mjs'

test('maps waybill snapshots to Supabase snake_case rows', () => {
  const row = mapSnapshotToRow({
    waybillNo: 'PS2512220005001',
    storeName: '海口龙湖天街店',
    receiverName: '林晓',
    receiverPhone: '13800002190',
    receiverAddress: '海南省海口市龙华区龙湖天街',
    amount: 2680,
    skuCount: 2,
    skuSummary: [{ skuCode: 'ZBWP10086' }],
    source: 'v2_realtime',
    syncedAt: '2026-07-03 10:00:00',
  })

  assert.deepEqual(row, {
    waybill_no: 'PS2512220005001',
    store_name: '海口龙湖天街店',
    receiver_name: '林晓',
    receiver_phone: '13800002190',
    receiver_address: '海南省海口市龙华区龙湖天街',
    amount: 2680,
    sku_summary: [{ skuCode: 'ZBWP10086' }],
    source: 'v2_realtime',
    synced_at: '2026-07-03 10:00:00',
  })
})

test('maps tickets between domain objects and Supabase rows', () => {
  const ticket = {
    id: 'TL-001',
    waybillNo: 'PS2512220005001',
    source: 'manual_report',
    exceptionCategory: 'logistics',
    exceptionType: 'lost',
    severity: 'medium',
    status: 'level2_reviewing',
    amount: 2680,
    reporterId: 'operator-1',
    reporter: '客服-李月',
    currentApprover: '二级审批',
    skuCode: 'ZBWP10086',
    batchNo: 'BATCH-HK-0703-A',
    createdAt: '2026-07-03 10:00:00',
    dueAt: '2026-07-03 22:00:00',
    version: 3,
    resubmitCount: 1,
  }

  assert.deepEqual(mapTicketToRow(ticket), {
    ticket_no: 'TL-001',
    waybill_no: 'PS2512220005001',
    source: 'manual_report',
    exception_category: 'logistics',
    exception_type: 'lost',
    severity: 'medium',
    status: 'level2_reviewing',
    amount: 2680,
    reporter_id: 'operator-1',
    current_approver_id: '二级审批',
    sku_code: 'ZBWP10086',
    batch_no: 'BATCH-HK-0703-A',
    version: 3,
    resubmit_count: 1,
    due_at: '2026-07-03 22:00:00',
  })

  assert.deepEqual(mapRowToTicket({
    ticket_no: 'TL-001',
    waybill_no: 'PS2512220005001',
    source: 'manual_report',
    exception_category: 'logistics',
    exception_type: 'lost',
    severity: 'medium',
    status: 'level2_reviewing',
    amount: '2680.00',
    reporter_id: 'operator-1',
    current_approver_id: '二级审批',
    sku_code: 'ZBWP10086',
    batch_no: 'BATCH-HK-0703-A',
    created_at: '2026-07-03T02:00:00.000Z',
    due_at: '2026-07-03T14:00:00.000Z',
    version: 3,
    resubmit_count: 1,
  }), {
    id: 'TL-001',
    waybillNo: 'PS2512220005001',
    source: 'manual_report',
    exceptionCategory: 'logistics',
    exceptionType: 'lost',
    severity: 'medium',
    status: 'level2_reviewing',
    amount: 2680,
    reporterId: 'operator-1',
    reporter: 'operator-1',
    currentApprover: '二级审批',
    skuCode: 'ZBWP10086',
    batchNo: 'BATCH-HK-0703-A',
    createdAt: '2026-07-03T02:00:00.000Z',
    dueAt: '2026-07-03T14:00:00.000Z',
    version: 3,
    resubmitCount: 1,
  })
})

test('resolves business ticket number before inserting scan records', async () => {
  const calls = []
  const fakeClient = {
    from(table) {
      if (table === 'exception_tickets') {
        return {
          select() {
            return this
          },
          eq(column, value) {
            calls.push({ table, column, value })
            return this
          },
          async single() {
            return { data: { id: '11111111-1111-4111-8111-111111111111' }, error: null }
          },
        }
      }

      if (table === 'scan_records') {
        return {
          insert(row) {
            calls.push({ table, row })
            return this
          },
          select() {
            return this
          },
          async single() {
            return {
              data: {
                id: 'scan-db-id',
                waybill_no: 'PS2512220005001',
                sku_code: 'ZBWP10086',
                batch_no: 'BATCH-HK-0703-A',
                operator_id: '王磊',
                result: 'abnormal',
                batch_status: 'qc_hold',
                ticket_id: '11111111-1111-4111-8111-111111111111',
                matched_rule_id: null,
                abnormal_description: '外箱破损',
                scanned_at: '2026-07-03 10:00:00',
              },
              error: null,
            }
          },
        }
      }

      throw new Error(`unexpected table ${table}`)
    },
  }

  await createSupabaseStore(fakeClient).insertScanRecord({
    id: 'SCAN-001',
    waybillNo: 'PS2512220005001',
    skuCode: 'ZBWP10086',
    skuName: '冷链牛肉卷',
    batchNo: 'BATCH-HK-0703-A',
    operator: '王磊',
    result: 'abnormal',
    batchStatus: 'qc_hold',
    ticketId: 'TQ-001',
    matchedRuleId: undefined,
    abnormalDescription: '外箱破损',
    scannedAt: '2026-07-03 10:00:00',
  })

  const insertCall = calls.find((call) => call.table === 'scan_records')
  assert.equal(insertCall.row.ticket_id, '11111111-1111-4111-8111-111111111111')
})

test('lists scan records with pagination ordered by latest scan time', async () => {
  const calls = []
  const fakeClient = {
    from(table) {
      assert.equal(table, 'scan_records')
      return {
        select(columns, options) {
          calls.push({ method: 'select', columns, options })
          return this
        },
        order(column, options) {
          calls.push({ method: 'order', column, options })
          return this
        },
        range(from, to) {
          calls.push({ method: 'range', from, to })
          return this
        },
        then(resolve) {
          resolve({
            data: [{
              id: 'SCAN-002',
              waybill_no: 'PS2512220005002',
              sku_code: 'SKU-2',
              sku_name: '商品 2',
              batch_no: 'BATCH-2',
              operator_id: '张三',
              result: 'passed',
              batch_status: 'available',
              ticket_id: null,
              exception_tickets: null,
              matched_rule_id: null,
              abnormal_description: null,
              scanned_at: '2026-07-05T10:00:00.000Z',
            }],
            count: 21,
            error: null,
          })
        },
      }
    },
  }

  const result = await createSupabaseStore(fakeClient).listScanRecords({ page: 2, pageSize: 10 })

  assert.deepEqual(calls, [
    { method: 'select', columns: '*, exception_tickets(ticket_no, exception_type)', options: { count: 'exact' } },
    { method: 'order', column: 'scanned_at', options: { ascending: false } },
    { method: 'range', from: 10, to: 19 },
  ])
  assert.equal(result.scans[0].id, 'SCAN-002')
  assert.equal(result.scans[0].batchStatus, 'available')
  assert.equal(result.total, 21)
  assert.equal(result.totalPages, 3)
})

test('listScanRecords exposes business ticket number for scan list display', async () => {
  const fakeClient = {
    from() {
      return {
        select() { return this },
        order() { return this },
        range() { return this },
        then(resolve) {
          resolve({
            data: [{
              id: 'SCAN-003',
              waybill_no: 'PS2512220005003',
              sku_code: 'SKU-3',
              batch_no: 'BATCH-3',
              operator_id: 'scanner',
              result: 'abnormal',
              batch_status: 'qc_hold',
              ticket_id: '11111111-1111-4111-8111-111111111111',
              exception_tickets: {
                ticket_no: 'TQ-001',
                exception_type: '外观破损',
              },
              matched_rule_id: null,
              abnormal_description: null,
              scanned_at: '2026-07-05T10:00:00.000Z',
            }],
            count: 1,
            error: null,
          })
        },
      }
    },
  }

  const result = await createSupabaseStore(fakeClient).listScanRecords({ page: 1, pageSize: 10 })

  assert.equal(result.scans[0].ticketId, '11111111-1111-4111-8111-111111111111')
  assert.equal(result.scans[0].ticketNo, 'TQ-001')
  assert.equal(result.scans[0].ticketExceptionType, '外观破损')
})

test('locks inventory batch by resolving business ticket number', async () => {
  const calls = []
  const fakeClient = {
    from(table) {
      if (table === 'exception_tickets') {
        return {
          select() { return this },
          eq(column, value) {
            calls.push({ table, column, value })
            return this
          },
          async single() {
            return { data: { id: '11111111-1111-4111-8111-111111111111' }, error: null }
          },
        }
      }

      if (table === 'inventory_batches') {
        return {
          upsert(row, options) {
            calls.push({ table, row, options })
            return this
          },
          select() { return this },
          async single() {
            return {
              data: {
                id: 'batch-db-id',
                sku_code: 'ZBWP10086',
                batch_no: 'BATCH-HK-0703-A',
                status: 'qc_hold',
              },
              error: null,
            }
          },
        }
      }

      throw new Error(`unexpected table ${table}`)
    },
  }

  await createSupabaseStore(fakeClient).lockInventoryBatch({
    skuCode: 'ZBWP10086',
    skuName: '冷链牛肉卷',
    batchNo: 'BATCH-HK-0703-A',
    status: 'qc_hold',
    ticketId: 'TQ-001',
  })

  const upsertCall = calls.find((call) => call.table === 'inventory_batches')
  assert.equal(upsertCall.options.onConflict, 'sku_code,batch_no')
  assert.equal(upsertCall.row.locked_by_ticket_id, '11111111-1111-4111-8111-111111111111')
  assert.equal(upsertCall.row.status, 'qc_hold')
})

test('maps scan records and integration logs to Supabase rows', () => {
  assert.deepEqual(mapScanToRow({
    id: 'SCAN-001',
    waybillNo: 'PS2512220005001',
    skuCode: 'ZBWP10086',
    skuName: '冷链牛肉卷',
    batchNo: 'BATCH-HK-0703-A',
    operator: '王磊',
    result: 'abnormal',
    batchStatus: 'qc_hold',
    ticketId: 'TQ-001',
    matchedRuleId: 'QR-DAMAGE-03',
    abnormalDescription: '外箱破损',
    scannedAt: '2026-07-03 10:00:00',
  }), {
    waybill_no: 'PS2512220005001',
    sku_code: 'ZBWP10086',
    batch_no: 'BATCH-HK-0703-A',
    operator_id: '王磊',
    result: 'abnormal',
    abnormal_description: '外箱破损',
    batch_status: 'qc_hold',
    matched_rule_id: null,
    ticket_id: null,
    scanned_at: '2026-07-03 10:00:00',
  })

  assert.deepEqual(mapIntegrationLogToRow({
    id: 'LOG-001',
    requestId: 'req-1',
    endpoint: 'GET /api/v3/shipments/PS2512220005001',
    status: 'success',
    statusCode: 200,
    durationMs: 80,
    message: 'ok',
    requestDigest: 'waybill=PS2512220005001',
    errorMessage: undefined,
    createdAt: '2026-07-03 10:00:00',
  }), {
    request_id: 'req-1',
    endpoint: 'GET /api/v3/shipments/PS2512220005001',
    request_digest: 'waybill=PS2512220005001',
    status: 'success',
    status_code: 200,
    duration_ms: 80,
    error_message: null,
    created_at: '2026-07-03 10:00:00',
  })
})

test('maps configurable approval and quality rules from Supabase rows', () => {
  assert.deepEqual(mapRowToApprovalRule({
    code: 'amount-level-2',
    name: '大额二级审批',
    min_amount: '1000.00',
    max_amount: null,
    target_status: 'level2_reviewing',
    enabled: true,
  }), {
    code: 'amount-level-2',
    name: '大额二级审批',
    minAmount: 1000,
    maxAmount: null,
    level: 'level2_reviewing',
    enabled: true,
  })

  assert.deepEqual(mapRowToQualityRule({
    id: '11111111-1111-4111-8111-111111111111',
    code: 'QR-DAMAGE-03',
    name: '外观破损暂扣',
    subtype: '外观破损',
    severity: 'high',
    condition: { field: 'damageLevel', operator: 'gte', value: 3 },
    entry_level: 'level2_reviewing',
    enabled: true,
  }), {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'QR-DAMAGE-03',
    name: '外观破损暂扣',
    subtype: '外观破损',
    severity: 'high',
    condition: { field: 'damageLevel', operator: 'gte', value: 3 },
    entryLevel: 'level2_reviewing',
    enabled: true,
  })
})

test('loads ticket detail by business ticket number with audit records', async () => {
  const calls = []
  const orderCalls = []
  const fakeClient = {
    from(table) {
      calls.push(table)
      if (table === 'exception_tickets') {
        return {
          select() { return this },
          eq() { return this },
          async maybeSingle() {
            return {
              data: {
                id: '11111111-1111-4111-8111-111111111111',
                ticket_no: 'TL-001',
                waybill_no: 'PS2512220005001',
                source: 'manual_report',
                exception_category: 'logistics',
                exception_type: 'lost',
                severity: 'high',
                status: 'completed',
                amount: '2680.00',
                reporter_id: 'operator-1',
                current_approver_id: null,
                created_at: '2026-07-03T02:00:00.000Z',
                due_at: '2026-07-03T14:00:00.000Z',
                version: 5,
              },
              error: null,
            }
          },
        }
      }

      return {
        select() { return this },
        eq() { return this },
        order(column, options) {
          orderCalls.push({ table, column, options })
          return this
        },
        async then(resolve) {
          const dataByTable = {
            approval_records: [{ id: 'approval-1', result: 'approved' }],
            scan_records: [{ id: 'scan-1', waybill_no: 'PS2512220005001', sku_code: 'SKU-1', batch_no: 'BATCH-1', operator_id: 'op', result: 'abnormal', batch_status: 'qc_hold', scanned_at: '2026-07-03T02:00:00.000Z' }],
            compensation_records: [{ id: 'pay-1', direction: 'customer_compensation' }],
            inventory_movements: [{ id: 'move-1', movement_type: 'stock_out' }],
            ticket_events: [{ id: 'event-1', event_type: 'execution_completed' }],
          }
          return resolve({ data: dataByTable[table] || [], error: null })
        },
      }
    },
  }

  const detail = await createSupabaseStore(fakeClient).getTicketDetail('TL-001')

  assert.equal(detail.ticket.id, 'TL-001')
  assert.equal(detail.approvals.length, 1)
  assert.equal(detail.scans.length, 1)
  assert.equal(detail.compensations.length, 1)
  assert.equal(detail.inventoryMovements.length, 1)
  assert.equal(detail.events.length, 1)
  assert.deepEqual(orderCalls, [
    { table: 'approval_records', column: 'created_at', options: { ascending: true } },
    { table: 'scan_records', column: 'scanned_at', options: { ascending: true } },
    { table: 'compensation_records', column: 'created_at', options: { ascending: true } },
    { table: 'inventory_movements', column: 'created_at', options: { ascending: true } },
    { table: 'ticket_events', column: 'created_at', options: { ascending: true } },
  ])
})

test('approves ticket through a single Supabase RPC transition', async () => {
  const calls = []
  const fakeClient = {
    async rpc(name, params) {
      calls.push({ name, params })
      return {
        data: {
          ticket: {
            ticket_no: 'TL-001',
            waybill_no: 'PS2512220005001',
            source: 'manual_report',
            exception_category: 'logistics',
            exception_type: 'lost',
            severity: 'medium',
            status: 'executing',
            amount: '2680.00',
            reporter_id: 'operator-1',
            current_approver_id: '执行联动中',
            created_at: '2026-07-03T02:00:00.000Z',
            due_at: '2026-07-03T14:00:00.000Z',
            version: 4,
            resubmit_count: 0,
          },
          approvalRecord: {
            id: 'approval-1',
            result: 'approved',
          },
        },
        error: null,
      }
    },
  }

  const result = await createSupabaseStore(fakeClient).approveTicketTransition({
    ticket: {
      id: 'TL-001',
      status: 'executing',
      currentApprover: '执行联动中',
      version: 4,
    },
    approvalRecord: {
      ticketId: 'TL-001',
      approverId: 'approver-1',
      approvalLevel: 'level1',
      result: 'approved',
      opinion: '同意处理',
      idempotencyKey: 'idem-1',
      ticketVersionBefore: 3,
    },
  })

  assert.equal(calls[0].name, 'approve_ticket_transition')
  assert.equal(calls[0].params.p_ticket_no, 'TL-001')
  assert.equal(calls[0].params.p_next_status, 'executing')
  assert.equal(calls[0].params.p_idempotency_key, 'idem-1')
  assert.equal(result.ticket.status, 'executing')
  assert.equal(result.approvalRecord.id, 'approval-1')
})

test('approves and executes ticket through one Supabase RPC transaction', async () => {
  const calls = []
  const fakeClient = {
    async rpc(name, params) {
      calls.push({ name, params })
      return {
        data: {
          ticket: {
            ticket_no: 'TL-001',
            waybill_no: 'PS2512220005001',
            source: 'manual_report',
            exception_category: 'logistics',
            exception_type: 'lost',
            severity: 'medium',
            status: 'completed',
            amount: '2680.00',
            reporter_id: 'operator-1',
            current_approver_id: null,
            created_at: '2026-07-03T02:00:00.000Z',
            due_at: '2026-07-03T14:00:00.000Z',
            version: 5,
            resubmit_count: 0,
          },
          approvalRecord: {
            id: 'approval-1',
            result: 'approved',
          },
          execution: {
            status: 'completed',
            action: 'customer_compensation',
          },
        },
        error: null,
      }
    },
  }

  const result = await createSupabaseStore(fakeClient).approveAndExecuteTicketTransition({
    ticket: {
      id: 'TL-001',
      status: 'executing',
      currentApprover: '执行联动中',
      version: 4,
    },
    approvalRecord: {
      ticketId: 'TL-001',
      approverId: 'approver-1',
      approvalLevel: 'level1',
      result: 'approved',
      opinion: '同意处理',
      idempotencyKey: 'idem-1',
      ticketVersionBefore: 3,
    },
    execution: {
      action: 'customer_compensation',
      actorId: 'approver-1',
    },
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'approve_and_execute_ticket_transition')
  assert.equal(calls[0].params.p_ticket_no, 'TL-001')
  assert.equal(calls[0].params.p_action, 'customer_compensation')
  assert.equal(calls[0].params.p_actor_id, 'approver-1')
  assert.equal(result.ticket.status, 'completed')
  assert.equal(result.execution.action, 'customer_compensation')
})

test('records abnormal quality scan through a single Supabase RPC transaction', async () => {
  const calls = []
  const fakeClient = {
    async rpc(name, params) {
      calls.push({ name, params })
      return {
        data: {
          ticket: {
            ticket_no: 'TQ-001',
            waybill_no: 'PS2512220005001',
            source: 'scan_triggered',
            exception_category: 'quality',
            exception_type: 'appearance_damage',
            severity: 'high',
            status: 'level2_reviewing',
            amount: '0.00',
            reporter_id: 'scanner',
            current_approver_id: '二级审批',
            sku_code: 'ZBWP10086',
            batch_no: 'BATCH-HK-0703-A',
            created_at: '2026-07-03T02:00:00.000Z',
            due_at: '2026-07-03T04:00:00.000Z',
            version: 1,
            resubmit_count: 0,
          },
          scan: {
            id: 'scan-db-id',
            waybill_no: 'PS2512220005001',
            sku_code: 'ZBWP10086',
            batch_no: 'BATCH-HK-0703-A',
            operator_id: '王磊',
            result: 'abnormal',
            batch_status: 'qc_hold',
            ticket_id: '11111111-1111-4111-8111-111111111111',
            matched_rule_id: null,
            abnormal_description: '外箱破损',
            scanned_at: '2026-07-03 10:00:00',
          },
          batch: {
            sku_code: 'ZBWP10086',
            batch_no: 'BATCH-HK-0703-A',
            status: 'qc_hold',
          },
        },
        error: null,
      }
    },
  }

  const result = await createSupabaseStore(fakeClient).recordQualityScanTransaction({
    ticket: {
      id: 'TQ-001',
      waybillNo: 'PS2512220005001',
      source: 'scan_triggered',
      exceptionCategory: 'quality',
      exceptionType: 'appearance_damage',
      severity: 'high',
      status: 'level2_reviewing',
      amount: 0,
      reporterId: 'scanner',
      reporter: 'scanner',
      currentApprover: '二级审批',
      skuCode: 'ZBWP10086',
      batchNo: 'BATCH-HK-0703-A',
      dueAt: '2026-07-03 12:00:00',
      version: 1,
    },
    scan: {
      id: 'SCAN-001',
      waybillNo: 'PS2512220005001',
      skuCode: 'ZBWP10086',
      skuName: '冷链牛肉卷',
      batchNo: 'BATCH-HK-0703-A',
      operator: '王磊',
      result: 'abnormal',
      batchStatus: 'qc_hold',
      ticketId: 'TQ-001',
      abnormalDescription: '外箱破损',
      scannedAt: '2026-07-03 10:00:00',
    },
    batch: {
      skuCode: 'ZBWP10086',
      skuName: '冷链牛肉卷',
      batchNo: 'BATCH-HK-0703-A',
      status: 'qc_hold',
      ticketId: 'TQ-001',
    },
  })

  assert.equal(calls[0].name, 'record_quality_scan_transaction')
  assert.equal(calls[0].params.p_ticket.ticket_no, 'TQ-001')
  assert.equal(calls[0].params.p_existing_ticket_no, null)
  assert.equal(calls[0].params.p_scan.waybill_no, 'PS2512220005001')
  assert.equal(calls[0].params.p_batch.sku_code, 'ZBWP10086')
  assert.equal(result.ticket.id, 'TQ-001')
  assert.equal(result.scan.ticketId, '11111111-1111-4111-8111-111111111111')
})
