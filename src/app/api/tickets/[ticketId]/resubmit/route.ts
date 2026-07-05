import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { resubmitRejectedTicket } from '@/lib/core/ticket-service.mjs'

export async function POST(request: NextRequest, { params }: { params: { ticketId: string } }) {
  const payload = await request.json().catch(() => null)
  const reason = String(payload?.reason || '').trim()
  if (!reason) {
    return NextResponse.json({ error: '缺少重新提交说明' }, { status: 400 })
  }

  const store = getStore()
  const ticket = await store.findTicketById(params.ticketId)
  if (!ticket) {
    return NextResponse.json({ error: '工单不存在' }, { status: 404 })
  }

  try {
    const result = resubmitRejectedTicket({
      ticket,
      actor: {
        id: String(payload?.actorId || request.headers.get('x-user-id') || 'anonymous'),
        roles: Array.isArray(payload?.roles) ? payload.roles.map(String) : [],
      },
      reason,
    })

    await store.updateTicket(result.ticket)
    if ('insertTicketEvent' in store && typeof store.insertTicketEvent === 'function') {
      await store.insertTicketEvent(result.event)
    }

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '重新提交失败'
    const status = message.includes('次数上限')
      ? 409
      : message.includes('仅原上报人')
        ? 403
        : 400
    return NextResponse.json({ error: message }, { status })
  }
}
