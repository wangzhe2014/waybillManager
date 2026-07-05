import { NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'

export async function GET() {
  try {
    const store = getStore()
    const records = 'listCompensationRecords' in store
      ? await store.listCompensationRecords(100)
      : []
    return NextResponse.json({ records })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '读取赔付记录失败',
    }, { status: 500 })
  }
}
