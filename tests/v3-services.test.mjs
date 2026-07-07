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

test('quality scan reports a clear business error when V2 returns valid false with HTTP 200', async () => {
  const store = createMemoryStore()
  const v2Client = {
    async validateWaybillSku(waybillNo, skuCode) {
      return {
        data: {
          valid: false,
          waybillNo,
          skuCode,
        },
        requestId: 'req-scan-invalid',
        status: 'success',
        statusCode: 200,
        durationMs: 28,
      }
    },
  }

  await assert.rejects(
    () => processQualityScanWithV2({
      input: {
        waybillNo: 'PS2512220005001',
        skuCode: 'SKU-NOT-IN-WAYBILL',
        batchNo: 'BATCH-HK-0703-A',
        operator: '扫描员-王磊',
      },
      qualityRules: [],
      store,
      v2Client,
    }),
    /SKU SKU-NOT-IN-WAYBILL 不属于运单 PS2512220005001/
  )
  assert.equal(store.state.tickets.length, 0)
  assert.equal(store.state.scans.length, 0)
  assert.equal(store.state.logs[0].statusCode, 200)
})

test('quality scan accepts V2 SKU validation payload wrapped by data', async () => {
  const store = createMemoryStore()
  const v2Client = {
    async validateWaybillSku(waybillNo, skuCode) {
      return {
        data: {
          data: {
            valid: true,
            waybillNo,
            skuCode,
            skuName: '冷链牛肉卷',
          },
        },
        requestId: 'req-scan-wrapped',
        status: 'success',
        statusCode: 200,
        durationMs: 32,
      }
    },
    async getWaybillDetail() {
      return {
        data: null,
        requestId: 'req-detail-skip',
        status: 'failed',
        statusCode: 404,
        durationMs: 20,
        error: '测试跳过详情',
      }
    },
  }

  await processQualityScanWithV2({
    input: {
      waybillNo: 'PS2512220005001',
      skuCode: 'ZBWP10086',
      batchNo: 'BATCH-HK-0703-WRAPPED',
      operator: '扫描员-王磊',
      damageLevel: 0,
    },
    qualityRules: [],
    store,
    v2Client,
  })

  assert.equal(store.state.scans.length, 1)
  assert.equal(store.state.scans[0].skuName, '冷链牛肉卷')
})

test('quality scan derives quantity difference from V2 SKU detail before matching rules', async () => {
  const store = createMemoryStore()
  const v2Client = {
    async validateWaybillSku(waybillNo, skuCode) {
      return {
        data: {
          valid: true,
          waybillNo,
          skuCode,
          skuName: '冷链牛肉卷',
        },
        requestId: 'req-sku-qty',
        status: 'success',
        statusCode: 200,
        durationMs: 30,
      }
    },
    async getWaybillDetail(waybillNo) {
      return {
        data: {
          waybillNo,
          storeName: '海口龙湖天街店',
          receiverName: '林晓',
          amount: 4,
          skus: [{ skuCode: 'ZBWP10086', skuName: '冷链牛肉卷', skuQuantity: 4 }],
        },
        requestId: 'req-detail-qty',
        status: 'success',
        statusCode: 200,
        durationMs: 41,
      }
    },
  }

  const result = await processQualityScanWithV2({
    input: {
      waybillNo: 'PS2512220005001',
      skuCode: 'ZBWP10086',
      batchNo: 'BATCH-HK-0703-QTY',
      operator: '扫描员-王磊',
      actualQuantity: 3,
      damageLevel: 0,
    },
    qualityRules: [{
      id: 'QR-QTY-DIFF-02',
      subtype: '数量不符',
      severity: 'medium',
      condition: { field: 'quantityDiffRate', operator: 'gte', value: 0.02 },
      entryLevel: 'level1_reviewing',
    }],
    store,
    v2Client,
    idFactory: (prefix) => `${prefix}-qty`,
  })

  assert.equal(result.result, 'abnormal')
  assert.equal(result.ticket.exceptionType, '数量不符')
  assert.equal(result.scan.matchedRuleId, 'QR-QTY-DIFF-02')
  assert.match(result.scan.abnormalDescription, /数量差异率：25%/)
})

test('quality scan derives spec, label and batch exceptions from V2 data before matching rules', async () => {
  const store = createMemoryStore()
  const v2Client = {
    async validateWaybillSku(waybillNo, skuCode) {
      return {
        data: {
          valid: true,
          waybillNo,
          skuCode,
          skuName: '冷链牛肉卷',
          exceptionBatchNos: ['BATCH-FROZEN-01'],
        },
        requestId: 'req-sku-derived',
        status: 'success',
        statusCode: 200,
        durationMs: 30,
      }
    },
    async getWaybillDetail(waybillNo) {
      return {
        data: {
          waybillNo,
          storeName: '海口龙湖天街店',
          receiverName: '林晓',
          amount: 1,
          skus: [{
            skuCode: 'ZBWP10086',
            skuName: '冷链牛肉卷',
            skuQuantity: 1,
            skuSpec: '500g',
            exceptionBatchNos: ['BATCH-FROZEN-01'],
          }],
        },
        requestId: 'req-detail-derived',
        status: 'success',
        statusCode: 200,
        durationMs: 41,
      }
    },
  }

  const result = await processQualityScanWithV2({
    input: {
      waybillNo: 'PS2512220005001',
      skuCode: 'ZBWP10086',
      batchNo: 'BATCH-FROZEN-01',
      operator: '扫描员-王磊',
      actualSpec: '250g',
      labelSkuCode: 'ZBWP-WRONG',
      damageLevel: 0,
    },
    qualityRules: [{
      id: 'QR-BATCH-01',
      subtype: '批次异常',
      severity: 'high',
      condition: { field: 'batchException', operator: 'eq', value: true },
      entryLevel: 'level2_reviewing',
    }, {
      id: 'QR-SPEC-01',
      subtype: '规格不符',
      severity: 'medium',
      condition: { field: 'specMismatch', operator: 'eq', value: true },
      entryLevel: 'level1_reviewing',
    }, {
      id: 'QR-LABEL-01',
      subtype: '标签错误',
      severity: 'medium',
      condition: { field: 'labelError', operator: 'eq', value: true },
      entryLevel: 'level1_reviewing',
    }],
    store,
    v2Client,
    idFactory: (prefix) => `${prefix}-derived`,
  })

  assert.equal(result.result, 'abnormal')
  assert.equal(result.ticket.exceptionType, '批次异常')
  assert.equal(result.scan.matchedRuleId, 'QR-BATCH-01')
  assert.match(result.scan.abnormalDescription, /批次异常：是/)
  assert.match(result.scan.abnormalDescription, /规格不符：期望 500g，实际 250g/)
  assert.match(result.scan.abnormalDescription, /标签错误：期望 ZBWP10086，实际 ZBWP-WRONG/)
})

test('quality scan writes a full waybill snapshot after V2 SKU validation succeeds', async () => {
  const store = createMemoryStore()
  const v2Client = {
    async validateWaybillSku(waybillNo, skuCode) {
      return {
        data: {
          valid: true,
          waybillNo,
          skuCode,
          skuName: '冷链牛肉卷',
        },
        requestId: 'req-sku-ok',
        status: 'success',
        statusCode: 200,
        durationMs: 30,
      }
    },
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
        requestId: 'req-detail-ok',
        status: 'success',
        statusCode: 200,
        durationMs: 41,
      }
    },
  }

  await processQualityScanWithV2({
    input: {
      waybillNo: 'PS2512220005001',
      skuCode: 'ZBWP10086',
      batchNo: 'BATCH-HK-0703-SNAPSHOT',
      operator: '扫描员-王磊',
      damageLevel: 0,
    },
    qualityRules: [],
    store,
    v2Client,
    now: () => new Date('2026-07-03T02:00:00.000Z'),
    idFactory: (prefix) => `${prefix}-fixed`,
  })

  assert.equal(store.state.snapshots.length, 1)
  assert.equal(store.state.snapshots[0].waybillNo, 'PS2512220005001')
  assert.equal(store.state.snapshots[0].receiverName, '林晓')
  assert.equal(store.state.snapshots[0].amount, 2680)
  assert.equal(store.state.logs.length, 2)
  assert.equal(store.state.logs[0].requestId, 'req-sku-ok')
  assert.equal(store.state.logs[1].requestId, 'req-detail-ok')
})

test('quality scan writes a minimal snapshot when V2 detail refresh fails', async () => {
  const store = createMemoryStore()
  const v2Client = {
    async validateWaybillSku(waybillNo, skuCode) {
      return {
        data: {
          valid: true,
          waybillNo,
          skuCode,
          skuName: '冷链牛肉卷',
        },
        requestId: 'req-sku-ok',
        status: 'success',
        statusCode: 200,
        durationMs: 30,
      }
    },
    async getWaybillDetail() {
      return {
        data: null,
        requestId: 'req-detail-timeout',
        status: 'failed',
        statusCode: 504,
        durationMs: 3000,
        error: 'V2 timeout',
      }
    },
  }

  const result = await processQualityScanWithV2({
    input: {
      waybillNo: 'PS2512220005001',
      skuCode: 'ZBWP10086',
      batchNo: 'BATCH-HK-0703-MIN',
      operator: '扫描员-王磊',
      damageLevel: 0,
    },
    qualityRules: [],
    store,
    v2Client,
    now: () => new Date('2026-07-03T02:00:00.000Z'),
    idFactory: (prefix) => `${prefix}-fixed`,
  })

  assert.equal(result.scan.waybillNo, 'PS2512220005001')
  assert.equal(store.state.snapshots.length, 1)
  assert.equal(store.state.snapshots[0].waybillNo, 'PS2512220005001')
  assert.equal(store.state.snapshots[0].skuSummary[0].skuCode, 'ZBWP10086')
  assert.equal(store.state.snapshots[0].source, 'v2_realtime')
  assert.equal(store.state.logs.length, 2)
  assert.equal(store.state.logs[1].status, 'failed')
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
