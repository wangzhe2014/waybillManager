import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { fastReleaseQualityTicket } from '@/lib/core/ticket-service.mjs'

export async function POST(request: NextRequest, { params }: { params: { ticketId: string } }) {
  const payload = await request.json().catch(() => null)
  const store = getStore()
  const ticket = await store.findTicketById(params.ticketId)
  if (!ticket) {
    return NextResponse.json({ error: '工单不存在' }, { status: 404 })
  }

  const reason = String(payload?.reason || '').trim()
  if (!reason) {
    return NextResponse.json({ error: '快速放行必须填写复核原因' }, { status: 400 })
  }

  try {
    const result = fastReleaseQualityTicket({
      ticket,
      actor: actorFromRequest(request, payload),
      reason,
    })

    Object.assign(ticket, {
      ...result.ticket,
      currentApprover: '品控主管快速放行',
    })
    await store.updateTicket(ticket)
    const approvalRecord = await store.insertApprovalRecord(result.approvalRecord)
    await store.updateScansBatchStatus(ticket.id, 'qc_released')

    return NextResponse.json({
      ticket,
      batchStatus: result.batchStatus,
      approvalRecord,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '快速放行失败'
    const status = message.includes('仅品控主管') ? 403 : 409
    return NextResponse.json({ error: message }, { status })
  }
}

function actorFromRequest(request: NextRequest, payload: any) {
  const rolesHeader = request.headers.get('x-user-roles') || ''
  const roles = Array.isArray(payload?.roles)
    ? payload.roles.map(String)
    : rolesHeader.split(',').map((role) => role.trim()).filter(Boolean)

  return {
    id: String(payload?.actorId || request.headers.get('x-user-id') || 'anonymous'),
    roles,
  }
}
