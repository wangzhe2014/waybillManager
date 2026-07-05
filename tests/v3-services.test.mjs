import assert from 'node:assert/strict'
import test from 'node:test'
import {
  processQualityScanWithV2,
  reportLogisticsExceptionWithV2,
} from '../src/lib/core/v3-services.mjs'

function createMemoryStore(seed = {}) {
  const state = {
    snapshots: seed.snapshots || [],
    tickets: seed.tickets || [],
    scans: seed.scans || [],
    batches: [],
    logs: [],
    transactionCalls: [],
  }

  return {
    state,
    async upsertWaybillSnapshot(snapshot) {
      state.snapshots = [
        snapshot,
        ...state.snapshots.filter((item) => item.waybillNo !== snapshot.waybillNo),
      ]
      return snapshot
    },
    async appendIntegrationLog(log) {
      state.logs.push(log)
      return log
    },
    async findOpenTicket({ waybillNo, exceptionCategory, exceptionType, skuCode, batchNo }) {
      return state.tickets.find((ticket) => {
        const sameWaybill = ticket.waybillNo === waybillNo
        const sameCategory = ticket.exceptionCategory === exceptionCategory
        const sameType = !exceptionType || ticket.exceptionType === exceptionType
        const sameSku = !skuCode || ticket.skuCode === skuCode
        const sameBatch = !batchNo || ticket.batchNo === batchNo
        const isOpen = !['completed', 'closed'].includes(ticket.status)
        return sameWaybill && sameCategory && sameType && sameSku && sameBatch && isOpen
      }) || null
    },
    async findOpenQualityTicketByBatch({ skuCode, batchNo }) {
      return state.tickets.find((ticket) =>
        ticket.exceptionCategory === 'quality' &&
        ticket.skuCode === skuCode &&
        ticket.batchNo === batchNo &&
        !['completed', 'closed'].includes(ticket.status)
      ) || null
    },
    async insertTicket(ticket) {
      state.tickets.unshift(ticket)
      return ticket
    },
    async insertScanRecord(scan) {
      state.scans.unshift(scan)
      return scan
    },
    async lockInventoryBatch(batch) {
      state.batches.unshift(batch)
      return batch
    },
    async recordQualityScanTransaction({ ticket, scan, batch }) {
      state.transactionCalls.push({ ticket, scan, batch })
      if (ticket) {
        state.tickets.unshift(ticket)
      }
      if (batch) {
        state.batches.unshift(batch)
      }
      state.scans.unshift(scan)
      return {
        ticket: ticket || state.tickets.find((item) => item.id === scan.ticketId) || null,
        scan,
        batch: batch || null,
      }
    },
  }
}

const approvalRules = [
  { minAmount: 0, maxAmount: 999.99, level: 'level1_reviewing' },
  { minAmount: 1000, level: 'level2_reviewing' },
]

test('manual logistics report calls V2 before creating a ticket and writes snapshot/logs', async () => {
  const store = createMemoryStore()
  const v2Client = {
    async getWaybillDetail(waybillNo) {
      assert.equal(waybillNo, 'PS2512220005001')
      return {
        data: {
          waybillNo,
          storeName: '海口龙湖天街店',
          receiverName: '林晓',
          receiverPhone: '13800002190',
          receiverAddress: '海南省海口市龙华区龙湖天街',
          amount: 2680,
          skus: [{ skuCode: 'ZBWP10086', skuName: '冷链牛肉卷', skuQuantity: 4 }],
        },
        requestId: 'req-report-ok',
        status: 'success',
        statusCode: 200,
        durationMs: 41,
      }
    },
  }

  const ticket = await reportLogisticsExceptionWithV2({
    input: {
      waybillNo: 'PS2512220005001',
      exceptionType: 'lost',
      description: '配送途中丢件',
      amount: 2680,
    },
    actor: { id: 'operator-1', name: '客服-李月' },
    approvalRules,
    store,
    v2Client,
    now: () => new Date('2026-07-03T02:00:00.000Z'),
    idFactory: (prefix) => `${prefix}-fixed`,
  })

  assert.equal(ticket.id, 'TL-fixed')
  assert.equal(ticket.status, 'level2_reviewing')
  assert.equal(ticket.source, 'manual_report')
  assert.equal(store.state.snapshots[0].waybillNo, 'PS2512220005001')
  assert.equal(store.state.logs[0].requestId, 'req-report-ok')
  assert.equal(store.state.logs[0].status, 'success')
})

test('manual logistics report does not create a ticket when V2 validation fails', async () => {
  const store = createMemoryStore()
  const v2Client = {
    async getWaybillDetail() {
      return {
        data: null,
        requestId: 'req-report-404',
        status: 'failed',
        statusCode: 404,
        durationMs: 36,
        error: '运单不存在',
      }
    },
  }

  await assert.rejects(
    () => reportLogisticsExceptionWithV2({
      input: { waybillNo: 'NOT-EXIST', exceptionType: 'lost' },
      actor: { id: 'operator-1', name: '客服-李月' },
      approvalRules,
      store,
      v2Client,
      now: () => new Date('2026-07-03T02:00:00.000Z'),
      idFactory: (prefix) => `${prefix}-fixed`,
    }),
    /V2 运单实时校验失败/
  )

  assert.equal(store.state.tickets.length, 0)
  assert.equal(store.state.logs[0].status, 'failed')
  assert.equal(store.state.logs[0].statusCode, 404)
})

test('quality scan validates SKU through V2 and reuses an open quality ticket for the same batch', async () => {
  const openTicket = {
    id: 'TQ-open',
    waybillNo: 'PS2512220005001',
    skuCode: 'ZBWP10086',
    batchNo: 'BATCH-HK-0703-A',
    source: 'scan_triggered',
    exceptionCategory: 'quality',
    exceptionType: 'appearance_damage',
    status: 'level2_reviewing',
  }
  const store = createMemoryStore({ tickets: [openTicket] })
  const v2Client = {
    async validateWaybillSku(waybillNo, skuCode) {
      assert.equal(waybillNo, 'PS2512220005001')
      assert.equal(skuCode, 'ZBWP10086')
      return {
        data: {
          valid: true,
          waybillNo,
          skuCode,
          skuName: '冷链牛肉卷',
        },
        requestId: 'req-scan-ok',
        status: 'success',
        statusCode: 200,
        durationMs: 52,
      }
    },
  }

  const result = await processQualityScanWithV2({
    input: {
      waybillNo: 'PS2512220005001',
      skuCode: 'ZBWP10086',
      batchNo: 'BATCH-HK-0703-A',
      operator: '扫描员-王磊',
      abnormalDescription: '外箱破损，破损等级 4',
      damageLevel: 4,
    },
    qualityRules: [{
      id: 'QR-DAMAGE-03',
      subtype: 'appearance_damage',
      severity: 'high',
      condition: { field: 'damageLevel', operator: 'gte', value: 3 },
      entryLevel: 'level2_reviewing',
    }],
    store,
    v2Client,
    now: () => new Date('2026-07-03T02:00:00.000Z'),
    idFactory: (prefix) => `${prefix}-fixed`,
  })

  assert.equal(result.reusedOpenTicket, true)
  assert.equal(result.ticket.id, 'TQ-open')
  assert.equal(store.state.tickets.length, 1)
  assert.equal(store.state.scans[0].ticketId, 'TQ-open')
  assert.equal(store.state.scans[0].batchStatus, 'qc_hold')
  assert.equal(store.state.batches[0].skuCode, 'ZBWP10086')
  assert.equal(store.state.batches[0].batchNo, 'BATCH-HK-0703-A')
  assert.equal(store.state.batches[0].status, 'qc_hold')
  assert.equal(store.state.batches[0].ticketId, 'TQ-open')
  assert.equal(store.state.logs[0].requestId, 'req-scan-ok')
})

test('quality scan reuses an open quality ticket for the same SKU batch across waybills', async () => {
  const openTicket = {
    id: 'TQ-open-batch',
    waybillNo: 'PS2512220005001',
    skuCode: 'ZBWP10086',
    batchNo: 'BATCH-HK-0703-A',
    source: 'scan_triggered',
    exceptionCategory: 'quality',
    exceptionType: 'appearance_damage',
    status: 'level2_reviewing',
  }
  const store = createMemoryStore({ tickets: [openTicket] })
  const v2Client = {
    async validateWaybillSku(waybillNo, skuCode) {
      assert.equal(waybillNo, 'PS2512220005999')
      assert.equal(skuCode, 'ZBWP10086')
      return {
        data: {
          valid: true,
          waybillNo,
          skuCode,
          skuName: '冷链牛肉卷',
        },
        requestId: 'req-scan-cross-waybill',
        status: 'success',
        statusCode: 200,
        durationMs: 48,
      }
    },
  }

  const result = await processQualityScanWithV2({
    input: {
      waybillNo: 'PS2512220005999',
      skuCode: 'ZBWP10086',
      batchNo: 'BATCH-HK-0703-A',
      operator: '扫描员-王磊',
      damageLevel: 4,
    },
    qualityRules: [{
      id: 'QR-DAMAGE-03',
      subtype: 'appearance_damage',
      severity: 'high',
      condition: { field: 'damageLevel', operator: 'gte', value: 3 },
      entryLevel: 'level2_reviewing',
    }],
    store,
    v2Client,
    now: () => new Date('2026-07-03T02:00:00.000Z'),
    idFactory: (prefix) => `${prefix}-fixed`,
  })

  assert.equal(result.reusedOpenTicket, true)
  assert.equal(result.ticket.id, 'TQ-open-batch')
  assert.equal(store.state.tickets.length, 1)
  assert.equal(store.state.scans[0].ticketId, 'TQ-open-batch')
})

test('abnormal quality scan uses a single store transaction entrypoint', async () => {
  const store = createMemoryStore()
  store.insertTicket = async () => {
    throw new Error('insertTicket should not be called outside the scan transaction')
  }
  store.lockInventoryBatch = async () => {
    throw new Error('lockInventoryBatch should not be called outside the scan transaction')
  }
  store.insertScanRecord = async () => {
    throw new Error('insertScanRecord should not be called outside the scan transaction')
  }
  const v2Client = {
    async validateWaybillSku() {
      return {
        data: {
          valid: true,
          waybillNo: 'PS2512220005001',
          skuCode: 'ZBWP10086',
          skuName: '冷链牛肉卷',
        },
        requestId: 'req-scan-transaction',
        status: 'success',
        statusCode: 200,
        durationMs: 40,
      }
    },
  }

  const result = await processQualityScanWithV2({
    input: {
      waybillNo: 'PS2512220005001',
      skuCode: 'ZBWP10086',
      batchNo: 'BATCH-HK-0703-TX',
      operator: '扫描员-王磊',
      damageLevel: 4,
    },
    qualityRules: [{
      id: 'QR-DAMAGE-03',
      subtype: 'appearance_damage',
      severity: 'high',
      condition: { field: 'damageLevel', operator: 'gte', value: 3 },
      entryLevel: 'level2_reviewing',
    }],
    store,
    v2Client,
    now: () => new Date('2026-07-03T02:00:00.000Z'),
    idFactory: (prefix) => `${prefix}-fixed`,
  })

  assert.equal(store.state.transactionCalls.length, 1)
  assert.equal(result.ticket.id, 'TQ-fixed')
  assert.equal(result.scan.ticketId, 'TQ-fixed')
})
