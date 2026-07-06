import { NextRequest, NextResponse } from 'next/server'
import { processTimeoutAutoFlowJob } from '@/lib/core/timeout-job.mjs'
import { validateCronRequest } from '@/lib/server/cron-auth.mjs'
import { getStore } from '@/lib/server/store'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  return processTimeouts(request, { allowPayloadNow: false, trigger: 'cron' })
}

export async function POST(request: NextRequest) {
  return processTimeouts(request, { allowPayloadNow: true, trigger: 'manual' })
}

async function processTimeouts(
  request: NextRequest,
  options: { allowPayloadNow: boolean; trigger: 'cron' | 'manual' },
) {
  const auth = validateCronRequest({
    headers: request.headers,
    secret: process.env.TIMEOUT_CRON_SECRET || process.env.CRON_SECRET || '',
  })
  if (!auth.ok) {
    return NextResponse.json({ error: '超时任务鉴权失败' }, { status: 401 })
  }

  const payload = options.allowPayloadNow ? await request.json().catch(() => ({})) : {}
  const now = payload?.now ? new Date(String(payload.now)) : new Date()
  if (Number.isNaN(now.getTime())) {
    return NextResponse.json({ error: 'now 参数不是有效时间' }, { status: 400 })
  }

  try {
    const store = getStore()
    const result = await processTimeoutAutoFlowJob({
      store,
      now,
      trigger: options.trigger,
    })

    return NextResponse.json({
      processed: result.processed,
      trigger: options.trigger,
      authMode: auth.mode,
      executedAt: result.executedAt,
      requestId: result.requestId,
      results: result.results,
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '超时任务处理失败',
    }, { status: 500 })
  }
}
