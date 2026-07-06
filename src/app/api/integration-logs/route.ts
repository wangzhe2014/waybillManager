import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/server/mock-db'
import { filterAndPaginateIntegrationLogs } from '@/lib/core/integration-log-query.mjs'
import { getStore } from '@/lib/server/store'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const options = {
    requestId: searchParams.get('requestId') || '',
    endpoint: searchParams.get('endpoint') || '',
    page: Number(searchParams.get('page') || 1),
    pageSize: Number(searchParams.get('pageSize') || 10),
  }

  try {
    const store = getStore()
    if ('listIntegrationLogs' in store) {
      const result = await store.listIntegrationLogs(options)
      if (Array.isArray(result)) {
        return NextResponse.json(filterAndPaginateIntegrationLogs(result, options))
      }
      return NextResponse.json(result)
    }
    return NextResponse.json(filterAndPaginateIntegrationLogs(db.logs, options))
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '读取接口日志失败',
    }, { status: 500 })
  }
}
