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
    const ruleNameBySubtype = buildRuleSubtypeMap(qualityRules)
    const filters = scanFiltersFromSearch(request.nextUrl.searchParams)
    const hasFilters = Object.values(filters).some(Boolean)

    if ('listScanRecords' in store) {
      const result = hasFilters
        ? await store.listScanRecords({ page: 1, pageSize: 500 })
        : await store.listScanRecords({ page, pageSize })
      if (hasFilters) {
        return NextResponse.json(paginateScans(
          result.scans,
          filters,
          page,
          pageSize,
          ruleNameById,
          ruleNameBySubtype,
        ))
      }
      return NextResponse.json({
        ...result,
        scans: result.scans.map((scan: ScanRecord) => ({
          ...scan,
          matchedRuleName: displayMatchedRuleName(scan, ruleNameById, ruleNameBySubtype),
        })),
      })
    }

    const sortedScans = [...db.scans].sort((left, right) => new Date(right.scannedAt).getTime() - new Date(left.scannedAt).getTime())
    return NextResponse.json(paginateScans(sortedScans, filters, page, pageSize, ruleNameById, ruleNameBySubtype))
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '读取扫描记录失败',
    }, { status: 500 })
  }
}

function scanFiltersFromSearch(searchParams: URLSearchParams) {
  return {
    waybillNo: String(searchParams.get('waybillNo') || '').trim().toLowerCase(),
    skuCode: String(searchParams.get('skuCode') || '').trim().toLowerCase(),
    batchNo: String(searchParams.get('batchNo') || '').trim().toLowerCase(),
    result: String(searchParams.get('result') || '').trim(),
    batchStatus: String(searchParams.get('batchStatus') || '').trim(),
    ticketNo: String(searchParams.get('ticketNo') || '').trim().toLowerCase(),
  }
}

function paginateScans(
  scans: ScanRecord[],
  filters: ReturnType<typeof scanFiltersFromSearch>,
  page: number,
  pageSize: number,
  ruleNameById: Record<string, string>,
  ruleNameBySubtype: Record<string, string>,
) {
  const filtered = scans.filter((scan) => {
    if (filters.waybillNo && !String(scan.waybillNo || '').toLowerCase().includes(filters.waybillNo)) return false
    if (filters.skuCode && !String(scan.skuCode || '').toLowerCase().includes(filters.skuCode)) return false
    if (filters.batchNo && !String(scan.batchNo || '').toLowerCase().includes(filters.batchNo)) return false
    if (filters.result && scan.result !== filters.result) return false
    if (filters.batchStatus && scan.batchStatus !== filters.batchStatus) return false
    if (filters.ticketNo) {
      const ticketText = `${scan.ticketNo || ''} ${scan.ticketId || ''}`.toLowerCase()
      if (!ticketText.includes(filters.ticketNo)) return false
    }
    return true
  })
  const from = (page - 1) * pageSize
  return {
    scans: filtered.slice(from, from + pageSize).map((scan) => ({
      ...scan,
      matchedRuleName: displayMatchedRuleName(scan, ruleNameById, ruleNameBySubtype),
    })),
    total: filtered.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
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

function buildRuleSubtypeMap(rules: Record<string, unknown>[]) {
  return rules.reduce<Record<string, string>>((map, rule) => {
    const subtype = String(rule.subtype || '')
    if (!subtype) return map
    map[subtype] = String(rule.name || rule.code || rule.id || subtype)
    return map
  }, {})
}

function displayMatchedRuleName(
  scan: ScanRecord,
  ruleNameById: Record<string, string>,
  ruleNameBySubtype: Record<string, string>,
) {
  const ruleName = ruleNameById[String(scan.matchedRuleId || '')]
  if (ruleName) return ruleName
  if (scan.result === 'passed') return '不适用'
  if (scan.ticketExceptionType && ruleNameBySubtype[scan.ticketExceptionType]) {
    return ruleNameBySubtype[scan.ticketExceptionType]
  }
  if (scan.ticketId || scan.ticketNo) return '复用已暂扣工单'
  return '-'
}
