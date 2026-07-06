import { NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { getErrorMessage } from '@/lib/server/error-message'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(_request: Request, { params }: { params: { ticketId: string } }) {
  try {
    const detail = await getStore().getTicketDetail(params.ticketId)
    if (!detail) {
      return NextResponse.json({ error: '工单不存在' }, { status: 404 })
    }

    return NextResponse.json({ detail })
  } catch (error) {
    return NextResponse.json({
      error: getErrorMessage(error, '读取工单详情失败'),
    }, { status: 500 })
  }
}
