import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/server/mock-db'
import { getStore } from '@/lib/server/store'
import { queryParamsFromSearch, queryTickets } from '@/lib/server/ticket-query.mjs'
import { createV2Client } from '@/lib/v2-client'
import { reportLogisticsExceptionWithV2 } from '@/lib/core/v3-services.mjs'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const store = getStore()
    const tickets = 'listTickets' in store ? await store.listTickets() : db.tickets
    const result = queryTickets(tickets, queryParamsFromSearch(request.nextUrl.searchParams))
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '读取工单列表失败',
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null)
  if (!payload?.waybillNo || !payload?.exceptionType) {
    return NextResponse.json({ error: '缺少运单号或异常类型' }, { status: 400 })
  }

  try {
    const actorName = String(payload.reporter || request.headers.get('x-user-name') || '操作员')
    const actorId = String(payload.reporterId || request.headers.get('x-user-id') || actorName)
    const store = getStore()
    const ticket = await reportLogisticsExceptionWithV2({
      input: payload,
      actor: { id: actorId, name: actorName },
      approvalRules: await store.listApprovalRules(),
      store,
      v2Client: createV2Client(),
    })

    return NextResponse.json({ ticket }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '异常上报失败'
    const status = message.includes('同类型未关闭工单') ? 409 : message.includes('V2 运单实时校验失败') ? 424 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
