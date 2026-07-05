import { NextResponse } from 'next/server'
import { db } from '@/lib/server/mock-db'
import { getStore } from '@/lib/server/store'

export async function GET() {
  try {
    const store = getStore()
    if ('listIntegrationLogs' in store) {
      return NextResponse.json({ logs: await store.listIntegrationLogs() })
    }
    return NextResponse.json({ logs: db.logs })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '读取接口日志失败',
    }, { status: 500 })
  }
}
