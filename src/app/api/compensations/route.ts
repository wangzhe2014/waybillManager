import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { queryTraceRecords, traceParamsFromSearch } from '@/lib/server/trace-query.mjs'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const store = getStore()
    const records = 'listCompensationRecords' in store
      ? await store.listCompensationRecords(500)
      : []
    return NextResponse.json(queryTraceRecords(records, traceParamsFromSearch(request.nextUrl.searchParams)))
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '读取赔付记录失败',
    }, { status: 500 })
  }
}
