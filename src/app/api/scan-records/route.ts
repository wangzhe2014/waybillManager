import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/server/mock-db'
import { getStore } from '@/lib/server/store'
import type { ScanRecord } from '@/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const store = getStore()
    const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') || 1))
    const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('pageSize') || 20)))
    const qualityRules = 'listAllQualityRules' in store ? await store.listAllQualityRules() : db.qualityRules
    const ruleNameById = buildRuleNameMap(qualityRules)

    if ('listScanRecords' in store) {
      const result = await store.listScanRecords({ page, pageSize })
      return NextResponse.json({
        ...result,
        scans: result.scans.map((scan: ScanRecord) => ({
          ...scan,
          matchedRuleName: ruleNameById[String(scan.matchedRuleId || '')] || '',
        })),
      })
    }

    const sortedScans = [...db.scans].sort((left, right) => new Date(right.scannedAt).getTime() - new Date(left.scannedAt).getTime())
    const from = (page - 1) * pageSize
    return NextResponse.json({
      scans: sortedScans.slice(from, from + pageSize).map((scan) => ({
        ...scan,
        matchedRuleName: ruleNameById[String(scan.matchedRuleId || '')] || '',
      })),
      total: sortedScans.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(sortedScans.length / pageSize)),
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '读取扫描记录失败',
    }, { status: 500 })
  }
}

function buildRuleNameMap(rules: Record<string, unknown>[]) {
  return rules.reduce<Record<string, string>>((map, rule) => {
    const name = String(rule.name || rule.subtype || rule.code || rule.id || '')
    for (const key of [rule.id, rule.code]) {
      if (key) map[String(key)] = name
    }
    return map
  }, {})
}
