import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { createV2Client } from '@/lib/v2-client'
import { processQualityScanWithV2 } from '@/lib/core/v3-services.mjs'
import { getErrorMessage } from '@/lib/server/error-message'

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null)
  if (!payload?.waybillNo || !payload?.skuCode || !payload?.batchNo) {
    return NextResponse.json({ error: '缺少运单号、SKU 或批次号' }, { status: 400 })
  }

  try {
    const store = getStore()
    const result = await processQualityScanWithV2({
      input: payload,
      qualityRules: await store.listQualityRules(),
      store,
      v2Client: createV2Client(),
    })

    return NextResponse.json({
      scan: result.scan,
      ticket: result.ticket,
      reusedOpenTicket: result.reusedOpenTicket,
      matchedRule: result.matchedRule,
      message: result.reusedOpenTicket
        ? '该批次已存在未关闭品控工单，本次只追加扫描记录'
        : result.ticket
          ? '扫描命中品控规则，已创建工单并暂扣批次'
          : '扫描通过，批次可出库',
    }, { status: 201 })
  } catch (error) {
    const message = getErrorMessage(error, '扫描品控失败')
    const status = message.includes('V2 SKU 归属校验失败') ? 424 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
