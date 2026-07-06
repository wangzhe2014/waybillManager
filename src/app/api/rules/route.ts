import { NextResponse } from 'next/server'
import { buildRuleRows, normalizeRulePayload } from '@/lib/core/rule-service.mjs'
import { getStore } from '@/lib/server/store'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const store = getStore()
    const [approvalRules, qualityRules] = await Promise.all([
      store.listAllApprovalRules(),
      store.listAllQualityRules(),
    ])

    return NextResponse.json({
      approvalRules,
      qualityRules,
      rows: buildRuleRows(approvalRules, qualityRules),
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '读取规则配置失败',
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return saveRule(request)
}

export async function PATCH(request: Request) {
  return saveRule(request)
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = String(searchParams.get('mode') || '')
  const code = String(searchParams.get('code') || '')

  if (!code || !['approval', 'quality'].includes(mode)) {
    return NextResponse.json({ error: '缺少规则类型或编码' }, { status: 400 })
  }

  try {
    const rule = await getStore().disableRule(mode, code)
    if (!rule) return NextResponse.json({ error: '规则不存在' }, { status: 404 })
    return NextResponse.json({ rule })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '停用规则失败',
    }, { status: 500 })
  }
}

async function saveRule(request: Request) {
  const payload = await request.json().catch(() => null)
  if (!payload) {
    return NextResponse.json({ error: '请求体不能为空' }, { status: 400 })
  }

  try {
    const { mode, rule } = normalizeRulePayload(payload)
    const store = getStore()
    const savedRule = mode === 'approval'
      ? await store.upsertApprovalRule(rule)
      : await store.upsertQualityRule(rule)

    return NextResponse.json({ rule: savedRule })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '保存规则失败',
    }, { status: 400 })
  }
}
