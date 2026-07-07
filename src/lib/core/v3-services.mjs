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

  const skuValidation = normalizeSkuValidation(v2Result.data)
  if (v2Result.status !== 'success') {
    throw new Error(`V2 SKU 归属校验失败：${v2Result.error || `HTTP ${v2Result.statusCode}`}`)
  }
  if (!skuValidation) {
    throw new Error('V2 SKU 归属校验失败：V2 返回格式不符合接口契约')
  }
  if (!skuValidation.valid) {
    throw new Error(`V2 SKU 归属校验失败：SKU ${input.skuCode} 不属于运单 ${input.waybillNo}`)
  }

  const scanContext = await upsertScanWaybillSnapshot({
    input,
    skuValidation,
    store,
    v2Client,
    now,
  })
  const qualityFacts = deriveQualityScanFacts({
    input,
    skuValidation,
    waybill: scanContext?.waybill || null,
  })
  const scanForRules = {
    ...input,
    ...qualityFacts.fields,
  }

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
    scan: scanForRules,
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
      skuName: input.skuName || skuValidation.skuName || '',
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
    skuName: input.skuName || skuValidation.skuName || '',
    batchNo: input.batchNo,
    operator: input.operator || input.operatorId || '扫描员',
    result: resolved.result,
    batchStatus: resolved.batchStatus,
    ticketId: ticket?.id,
    matchedRuleId: resolved.matchedRule?.id || ticket?.matchedRuleId,
    abnormalDescription: joinDescriptions(input.abnormalDescription, qualityFacts.description),
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

function normalizeSkuValidation(payload) {
  const value = payload && typeof payload === 'object' && 'data' in payload
    ? payload.data
    : payload
  if (!value || typeof value !== 'object' || typeof value.valid !== 'boolean') return null
  return value
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
      return {
        snapshot: await store.upsertWaybillSnapshot(toSnapshot(detailResult.data, now())),
        waybill: detailResult.data,
      }
    }
  }

  return {
    snapshot: await store.upsertWaybillSnapshot(toMinimalScanSnapshot({
    input,
    skuValidation,
    syncedAt: now(),
    })),
    waybill: null,
  }
}

function deriveQualityScanFacts({ input, skuValidation, waybill }) {
  const skuDetail = findSkuDetail(waybill, skuValidation?.skuCode || input.skuCode)
  const fields = {}
  const descriptions = []

  const expectedQuantity = numberOrNull(firstDefined(
    skuDetail?.skuQuantity,
    skuDetail?.quantity,
    skuValidation?.skuQuantity
  ))
  const actualQuantity = numberOrNull(firstDefined(
    input.actualQuantity,
    input.scannedQuantity,
    input.quantity
  ))
  if (expectedQuantity && expectedQuantity > 0 && actualQuantity !== null) {
    fields.quantityDiffRate = Math.abs(actualQuantity - expectedQuantity) / expectedQuantity
    if (fields.quantityDiffRate > 0) {
      descriptions.push(`数量差异率：${formatPercent(fields.quantityDiffRate)}（期望 ${expectedQuantity}，实际 ${actualQuantity}）`)
    }
  } else if (input.quantityDiffRate !== undefined) {
    fields.quantityDiffRate = Number(input.quantityDiffRate)
  }

  const expectedSpec = normalizeText(firstDefined(skuDetail?.skuSpec, skuDetail?.spec, skuValidation?.skuSpec))
  const actualSpec = normalizeText(firstDefined(input.actualSpec, input.scannedSpec, input.skuSpec))
  if (expectedSpec && actualSpec) {
    fields.specMismatch = expectedSpec !== actualSpec
    if (fields.specMismatch) descriptions.push(`规格不符：期望 ${expectedSpec}，实际 ${actualSpec}`)
  } else if (input.specMismatch !== undefined) {
    fields.specMismatch = toBoolean(input.specMismatch)
  }

  const expectedLabelSku = normalizeText(firstDefined(skuDetail?.skuCode, skuValidation?.skuCode, input.skuCode))
  const actualLabelSku = normalizeText(firstDefined(input.labelSkuCode, input.scannedLabelSkuCode, input.labelCode))
  if (expectedLabelSku && actualLabelSku) {
    fields.labelError = expectedLabelSku !== actualLabelSku
    if (fields.labelError) descriptions.push(`标签错误：期望 ${expectedLabelSku}，实际 ${actualLabelSku}`)
  } else if (input.labelError !== undefined) {
    fields.labelError = toBoolean(input.labelError)
  }

  fields.batchException = deriveBatchException({ input, skuValidation, skuDetail, waybill })
  if (fields.batchException) descriptions.push('批次异常：是')

  if (input.damageLevel !== undefined) fields.damageLevel = Number(input.damageLevel || 0)

  return {
    fields,
    description: descriptions.join('；'),
  }
}

function findSkuDetail(waybill, skuCode) {
  const skus = Array.isArray(waybill?.skus) ? waybill.skus : []
  return skus.find((sku) => normalizeText(sku?.skuCode) === normalizeText(skuCode)) || null
}

function deriveBatchException({ input, skuValidation, skuDetail, waybill }) {
  if (input.batchException !== undefined) return toBoolean(input.batchException)

  const batchNo = normalizeText(input.batchNo)
  const exceptionBatchNos = [
    ...arrayValue(skuValidation?.exceptionBatchNos),
    ...arrayValue(skuValidation?.abnormalBatchNos),
    ...arrayValue(skuValidation?.frozenBatchNos),
    ...arrayValue(skuValidation?.blockedBatchNos),
    ...arrayValue(skuValidation?.recalledBatchNos),
    ...arrayValue(skuDetail?.exceptionBatchNos),
    ...arrayValue(skuDetail?.abnormalBatchNos),
    ...arrayValue(skuDetail?.frozenBatchNos),
    ...arrayValue(skuDetail?.blockedBatchNos),
    ...arrayValue(skuDetail?.recalledBatchNos),
    ...arrayValue(waybill?.exceptionBatchNos),
    ...arrayValue(waybill?.abnormalBatchNos),
    ...arrayValue(waybill?.frozenBatchNos),
    ...arrayValue(waybill?.blockedBatchNos),
    ...arrayValue(waybill?.recalledBatchNos),
  ].map(normalizeText)

  if (batchNo && exceptionBatchNos.includes(batchNo)) return true

  const batchStatus = normalizeText(firstDefined(
    skuValidation?.batchStatus,
    skuDetail?.batchStatus,
    waybill?.batchStatus
  )).toLowerCase()
  return Boolean(batchStatus && !['available', 'normal', 'ok', 'pass', 'passed', 'qc_released'].includes(batchStatus))
}

function joinDescriptions(...parts) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join('；')
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '')
}

function normalizeText(value) {
  return String(value || '').trim()
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return ['true', '1', 'yes', '是'].includes(String(value || '').trim().toLowerCase())
}

function arrayValue(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim())
  return []
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 10000) / 100}%`
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
