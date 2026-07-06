import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { approveTicket } from '@/lib/core/ticket-service.mjs'
import { resolveAutoExecutionAction } from '@/lib/core/workflow.mjs'
import { getErrorMessage } from '@/lib/server/error-message'

export async function POST(request: NextRequest, { params }: { params: { ticketId: string } }) {
  const payload = await request.json().catch(() => null)
  const store = getStore()
  const ticket = await store.findTicketById(params.ticketId)
  if (!ticket) {
    return NextResponse.json({ error: '工单不存在' }, { status: 404 })
  }

  if (!payload?.idempotencyKey && !request.headers.get('idempotency-key')) {
    return NextResponse.json({ error: '缺少幂等键 idempotencyKey' }, { status: 400 })
  }

  if (!['level1_reviewing', 'level2_reviewing'].includes(ticket.status)) {
    return NextResponse.json({ error: '当前状态不可审批' }, { status: 409 })
  }

  try {
    const actor = actorFromRequest(request, payload)
    const result = approveTicket({
      ticket,
      actor,
      decision: payload?.decision === 'rejected' ? 'rejected' : 'approved',
      opinion: String(payload?.opinion || ''),
      expectedVersion: Number(payload?.expectedVersion),
      idempotencyKey: String(payload?.idempotencyKey || request.headers.get('idempotency-key')),
    })

    const nextTicket = {
      ...result.ticket,
      currentApprover: result.ticket.status === 'rejected' ? '等待重新提交' : '自动执行联动中',
    }
    const executionAction = result.approvalRecord.result === 'approved'
      ? resolveAutoExecutionAction(ticket)
      : ''
    const transition = result.approvalRecord.result === 'approved'
      ? await store.approveAndExecuteTicketTransition({
          ticket: nextTicket,
          approvalRecord: result.approvalRecord,
          execution: {
            action: executionAction,
            actorId: actor.id,
          },
        })
      : await store.approveTicketTransition({
          ticket: nextTicket,
          approvalRecord: result.approvalRecord,
        })

    return NextResponse.json({
      ticket: transition.ticket,
      approvalRecord: transition.approvalRecord,
      execution: 'execution' in transition ? transition.execution : null,
    })
  } catch (error) {
    const message = getErrorMessage(error, '审批失败')
    const status = message.includes('已被处理') ? 409 : message.includes('权限') || message.includes('不能审批自己') ? 403 : 400
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
