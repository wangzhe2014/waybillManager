import { normalizeV2BaseUrl } from './v2-url.mjs'
import { requestJsonWithRetry } from './v2-retry.mjs'

export interface V2RequestOptions {
  path: string
  requestId?: string
  timeoutMs?: number
}

export interface V2WaybillSku {
  skuCode: string
  skuName: string
  skuQuantity: number
  skuSpec?: string
  remark?: string
}

export interface V2WaybillDetail {
  waybillNo: string
  storeName: string
  receiverName: string
  receiverPhone: string
  receiverAddress: string
  amount: number
  amountSource?: string
  createdAt?: string
  skus: V2WaybillSku[]
  requestId?: string
}

export interface V2SkuValidation {
  valid: boolean
  waybillNo: string
  skuCode: string
  skuName?: string
  requestId?: string
}

export interface V2CallResult<T> {
  data: T | null
  requestId: string
  status: 'success' | 'failed'
  statusCode: number
  durationMs: number
  error?: string
}

export async function callV2<T>({ path, requestId = createRequestId(), timeoutMs = 3000 }: V2RequestOptions): Promise<V2CallResult<T>> {
  const baseUrl = normalizeV2BaseUrl(process.env.V2_API_BASE_URL)
  const apiKey = process.env.V2_API_KEY
  const startedAt = Date.now()

  if (!baseUrl || !apiKey) {
    return {
      data: null,
      requestId,
      status: 'failed',
      statusCode: 503,
      durationMs: Date.now() - startedAt,
      error: 'V2_API_BASE_URL 或 V2_API_KEY 未配置',
    }
  }

  try {
    const { response, payload } = await requestJsonWithRetry({
      url: `${baseUrl}${path}`,
      timeoutMs,
      maxRetries: 2,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Request-ID': requestId,
      },
    })
    return {
      data: response.ok ? payload as T : null,
      requestId,
      status: response.ok ? 'success' : 'failed',
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      error: response.ok ? undefined : payload?.error || `V2 HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      data: null,
      requestId,
      status: 'failed',
      statusCode: error instanceof DOMException && error.name === 'AbortError' ? 504 : 500,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'V2 调用失败',
    }
  }
}

export function createV2Client() {
  return {
    getWaybillDetail(waybillNo: string) {
      return callV2<V2WaybillDetail>({
        path: `/api/v3/shipments/${encodeURIComponent(waybillNo)}`,
      })
    },
    validateWaybillSku(waybillNo: string, skuCode: string) {
      return callV2<V2SkuValidation>({
        path: `/api/v3/shipments/${encodeURIComponent(waybillNo)}/skus/${encodeURIComponent(skuCode)}/validate`,
      })
    },
    syncWaybills(updatedAfter: string, limit = 200) {
      const params = new URLSearchParams({ updatedAfter, limit: String(limit) })
      return callV2<{ data: V2WaybillDetail[]; count: number }>({
        path: `/api/v3/shipments?${params.toString()}`,
      })
    },
  }
}

export function isV2ApiConfigured() {
  return Boolean(process.env.V2_API_BASE_URL && process.env.V2_API_KEY)
}

function createRequestId() {
  return `req_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}
