export type TraceQueryParams = {
  page?: number
  pageSize?: number
  keyword?: string
  direction?: string
  status?: string
  movementType?: string
}

export function traceParamsFromSearch(searchParams: URLSearchParams): TraceQueryParams
export function queryTraceRecords(records: Array<Record<string, unknown>>, params?: TraceQueryParams): {
  records: Array<Record<string, unknown>>
  total: number
  page: number
  pageSize: number
  totalPages: number
}
