import { NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'

export async function GET() {
  try {
    const store = getStore()
    const records = 'listInventoryMovements' in store
      ? await store.listInventoryMovements(100)
      : []
    return NextResponse.json({ records })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '读取库存流水失败',
    }, { status: 500 })
  }
}
