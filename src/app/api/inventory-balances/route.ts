import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const keyword = String(request.nextUrl.searchParams.get('keyword') || '').trim().toLowerCase()
    const status = String(request.nextUrl.searchParams.get('status') || '').trim()
    const store = getStore()
    const records = 'listInventoryBatches' in store
      ? await store.listInventoryBatches(500)
      : []

    const filtered = records
      .filter((record: Record<string, unknown>) => {
        if (!keyword) return true
        return [
          recordValue(record, ['skuCode', 'sku_code']),
          recordValue(record, ['skuName', 'sku_name']),
          recordValue(record, ['batchNo', 'batch_no']),
          nestedTicketValue(record, ['ticket_no']),
          nestedTicketValue(record, ['waybill_no']),
        ].some((value) => value.toLowerCase().includes(keyword))
      })
      .filter((record: Record<string, unknown>) => !status || recordValue(record, ['status']) === status)

    return NextResponse.json({ records: filtered })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '读取库存余额失败',
    }, { status: 500 })
  }
}

function recordValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (value === null || value === undefined || value === '') continue
    return String(value)
  }
  return ''
}

function nestedTicketValue(record: Record<string, unknown>, keys: string[]) {
  const ticket = record.exception_tickets as Record<string, unknown> | undefined
  return recordValue(ticket || {}, keys)
}
