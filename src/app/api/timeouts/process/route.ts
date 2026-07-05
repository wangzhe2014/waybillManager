import { NextRequest, NextResponse } from 'next/server'
import { processOverdueTicket } from '@/lib/core/timeout-service.mjs'
import { getStore } from '@/lib/server/store'

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}))
  const now = payload?.now ? new Date(String(payload.now)) : new Date()
  if (Number.isNaN(now.getTime())) {
    return NextResponse.json({ error: 'now 参数不是有效时间' }, { status: 400 })
  }

  try {
    const store = getStore()
    const overdueTickets = await store.listOverdueTickets(now.toISOString())
    const results = []

    for (const ticket of overdueTickets) {
      const processed = processOverdueTicket({ ticket, now })
      if (!processed) continue

      await store.updateTicket(processed.ticket)
      const approvalRecord = await store.insertApprovalRecord(processed.approvalRecord)
      results.push({
        ticket: processed.ticket,
        approvalRecord,
      })
    }

    return NextResponse.json({
      processed: results.length,
      results,
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '超时任务处理失败',
    }, { status: 500 })
  }
}
