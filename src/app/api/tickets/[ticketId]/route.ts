import { NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'

export async function GET(_request: Request, { params }: { params: { ticketId: string } }) {
  try {
    const detail = await getStore().getTicketDetail(params.ticketId)
    if (!detail) {
      return NextResponse.json({ error: '工单不存在' }, { status: 404 })
    }

    return NextResponse.json({ detail })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '读取工单详情失败',
    }, { status: 500 })
  }
}
