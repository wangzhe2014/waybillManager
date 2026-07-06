import { decideApprovalEntry, resolveQualityScan } from './workflow.mjs'

const CLOSED_STATUSES = new Set(['completed', 'closed'])

const DEFAULT_TIMEOUT_HOURS = {
  level1_reviewing: 24,
  level2_reviewing: 12,
  qc_hold: 2,
}

export async function reportLogisticsExceptionWithV2({
  input,
  actor,
  approvalRules,
  store,
  v2Client,
  now = () => new Date(),
  idFactory = createId,
}) {
  if (!input?.waybillNo || !input?.exceptionType) {
    throw new Error('缺少运单号或异常类型')
  }

  const v2Result = await v2Client.getWaybillDetail(input.waybillNo)
  await writeIntegrationLog(store, {
    ...v2Result,
    endpoint: `GET /api/v3/shipments/${input.waybillNo}`,
  })

  if (v2Result.status !== 'success' || !v2Result.data) {
    throw new Error(`V2 运单实时校验失败：${v2Result.error || `HTTP ${v2Result.statusCode}`}`)
  }

  const snapshot = await store.upsertWaybillSnapshot(toSnapshot(v2Result.data, now()))
  const duplicate = await store.findOpenTicket({
    waybillNo: input.waybillNo,
    exceptionCategory: 'logistics',
    exceptionType: input.exceptionType,
  })
  if (duplicate) {
    throw new Error('同类型未关闭工单已存在')
  }

  const baseTicket = {
    id: idFactory('TL'),
    waybillNo: input.waybillNo,
    source: 'manual_report',
    exceptionCategory: 'logistics',
    exceptionType: input.exceptionType,
    amount: Number(input.amount ?? snapshot.amount ?? 0),
    reporterId: actor.id,
    reporter: actor.name || actor.id,
    description: input.description || '',
    version: 1,
    createdAt: formatDate(now()),
  }
  const status = decideApprovalEntry(baseTicket, approvalRules)
  const ticket = {
    ...baseTicket,
    status,
    currentApprover: currentApproverFor(status),
    dueAt: formatDate(addHours(now(), DEFAULT_TIMEOUT_HOURS[status] || 24)),
  }

  return store.insertTicket(ticket)
}

export async function processQualityScanWithV2({
  input,
  qualityRules,
  store,
  v2Client,
  now = () => new Date(),
  idFactory = createId,
}) {
  if (!input?.waybillNo || !input?.skuCode || !input?.batchNo) {
    throw new Error('缺少运单号、SKU 或批次号')
  }

  const v2Result = await v2Client.validateWaybillSku(input.waybillNo, input.skuCode)
  await writeIntegrationLog(store, {
    ...v2Result,
    endpoint: `GET /api/v3/shipments/${input.waybillNo}/skus/${input.skuCode}/validate`,
  })

  if (v2Result.status !== 'success' || !v2Result.data?.valid) {
    throw new Error(`V2 SKU 归属校验失败：${v2Result.error || `HTTP ${v2Result.statusCode}`}`)
  }

  await upsertScanWaybillSnapshot({
    input,
    skuValidation: v2Result.data,
    store,
    v2Client,
    now,
  })

  const openTicket = typeof store.findOpenQualityTicketByBatch === 'function'
    ? await store.findOpenQualityTicketByBatch({
        skuCode: input.skuCode,
        batchNo: input.batchNo,
      })
    : await store.findOpenTicket({
        waybillNo: input.waybillNo,
        exceptionCategory: 'quality',
        skuCode: input.skuCode,
        batchNo: input.batchNo,
      })

  const resolved = resolveQualityScan({
    scan: input,
    qualityRules,
    openQualityTickets: openTicket ? [openTicket] : [],
  })

  let ticket = resolved.ticket
  if (ticket && !resolved.reusedOpenTicket) {
    const status = ticket.status || 'level2_reviewing'
    ticket = {
      ...ticket,
      id: idFactory('TQ'),
      amount: Number(input.amount || 0),
      reporterId: input.operatorId || input.operator || 'scanner',
      reporter: input.operator || input.operatorId || '扫描员',
      currentApprover: currentApproverFor(status),
      createdAt: formatDate(now()),
      dueAt: formatDate(addHours(now(), DEFAULT_TIMEOUT_HOURS.qc_hold)),
      version: 1,
    }
  }

  const batch = ticket && resolved.result === 'abnormal'
    ? {
      skuCode: input.skuCode,
      skuName: input.skuName || v2Result.data.skuName || '',
      batchNo: input.batchNo,
      status: 'qc_hold',
      ticketId: ticket.id,
      updatedAt: formatDate(now()),
    }
    : null

  const scanPayload = {
    id: idFactory('SCAN'),
    waybillNo: input.waybillNo,
    skuCode: input.skuCode,
    skuName: input.skuName || v2Result.data.skuName || '',
    batchNo: input.batchNo,
    operator: input.operator || input.operatorId || '扫描员',
    result: resolved.result,
    batchStatus: resolved.batchStatus,
    ticketId: ticket?.id,
    matchedRuleId: resolved.matchedRule?.id || ticket?.matchedRuleId,
    abnormalDescription: input.abnormalDescription || '',
    scannedAt: formatDate(now()),
  }

  if (ticket && resolved.result === 'abnormal' && typeof store.recordQualityScanTransaction === 'function') {
    const txResult = await store.recordQualityScanTransaction({
      ticket: resolved.reusedOpenTicket ? null : ticket,
      scan: scanPayload,
      batch,
      existingTicketId: resolved.reusedOpenTicket ? ticket.id : undefined,
    })

    return {
      ...resolved,
      scan: txResult.scan,
      ticket: txResult.ticket || ticket,
    }
  }

  if (ticket && !resolved.reusedOpenTicket) {
    ticket = await store.insertTicket(ticket)
  }

  if (batch && typeof store.lockInventoryBatch === 'function') {
    await store.lockInventoryBatch(batch)
  }

  const scan = await store.insertScanRecord(scanPayload)

  return {
    ...resolved,
    scan,
    ticket,
  }
}

function toSnapshot(waybill, syncedAt) {
  return {
    waybillNo: waybill.waybillNo,
    storeName: waybill.storeName || '',
    receiverName: waybill.receiverName || '',
    receiverPhone: waybill.receiverPhone || '',
    receiverAddress: waybill.receiverAddress || '',
    amount: Number(waybill.amount || 0),
    skuCount: Array.isArray(waybill.skus) ? waybill.skus.length : 0,
    skuSummary: waybill.skus || [],
    source: 'v2_realtime',
    syncedAt: formatDate(syncedAt),
  }
}

async function upsertScanWaybillSnapshot({ input, skuValidation, store, v2Client, now }) {
  if (typeof v2Client.getWaybillDetail === 'function') {
    const detailResult = await v2Client.getWaybillDetail(input.waybillNo)
    await writeIntegrationLog(store, {
      ...detailResult,
      endpoint: `GET /api/v3/shipments/${input.waybillNo}`,
    })

    if (detailResult.status === 'success' && detailResult.data) {
      return store.upsertWaybillSnapshot(toSnapshot(detailResult.data, now()))
    }
  }

  return store.upsertWaybillSnapshot(toMinimalScanSnapshot({
    input,
    skuValidation,
    syncedAt: now(),
  }))
}

function toMinimalScanSnapshot({ input, skuValidation, syncedAt }) {
  const skuCode = skuValidation?.skuCode || input.skuCode
  const skuName = skuValidation?.skuName || input.skuName || ''

  return {
    waybillNo: skuValidation?.waybillNo || input.waybillNo,
    storeName: '',
    receiverName: '',
    receiverPhone: '',
    receiverAddress: '',
    amount: Number(input.amount || 0),
    skuCount: skuCode ? 1 : 0,
    skuSummary: skuCode
      ? [{
          skuCode,
          skuName,
          skuQuantity: Number(input.quantity || input.skuQuantity || 0),
        }]
      : [],
    source: 'v2_realtime',
    syncedAt: formatDate(syncedAt),
  }
}

async function writeIntegrationLog(store, result) {
  return store.appendIntegrationLog({
    id: createId('LOG'),
    requestId: result.requestId,
    endpoint: result.endpoint,
    requestDigest: result.requestDigest || digestEndpoint(result.endpoint),
    status: result.status,
    statusCode: Number(result.statusCode || 0),
    durationMs: Number(result.durationMs || 0),
    message: result.error || (result.status === 'success' ? 'V2 接口调用成功' : 'V2 接口调用失败'),
    errorMessage: result.error,
    createdAt: formatDate(new Date()),
  })
}

function digestEndpoint(endpoint) {
  return String(endpoint || '')
    .replace(/^GET\s+/, '')
    .replace(/\/skus\/([^/]+)\/validate$/, '/skus/$1/validate')
}

function currentApproverFor(status) {
  if (status === 'level2_reviewing') return '二级审批'
  if (status === 'level1_reviewing') return '一级审批'
  return '待分配'
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

function formatDate(date) {
  return date.toLocaleString('zh-CN', { hour12: false })
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}
