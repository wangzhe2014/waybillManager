import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { resolveExecutionApprovalRecordId } from '@/lib/core/execution-service.mjs'

const ALLOWED_ACTIONS = new Set([
  'customer_compensation',
  'reship',
  'return_to_stock',
  'release',
  'return_supplier',
  'repurchase',
  'downgrade',
])

export async function POST(request: NextRequest, { params }: { params: { ticketId: string } }) {
  const payload = await request.json().catch(() => null)
  const action = String(payload?.action || '').trim()
  const approvalRecordId = String(payload?.approvalRecordId || '').trim()

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: '执行动作不合法' }, { status: 400 })
  }

  try {
    const store = getStore()
    const resolvedApprovalRecordId = resolveExecutionApprovalRecordId({
      approvalRecordId,
      detail: approvalRecordId ? null : await store.getTicketDetail(params.ticketId),
    })

    const result = await store.completeTicketExecution({
      ticketId: params.ticketId,
      approvalRecordId: resolvedApprovalRecordId,
      action,
      actorId: String(payload?.actorId || request.headers.get('x-user-id') || 'system'),
    })

    return NextResponse.json({ result })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '执行联动失败',
    }, { status: 500 })
  }
}
