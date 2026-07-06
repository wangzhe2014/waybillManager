export function buildRuleRows(approvalRules = [], qualityRules = []) {
  return [
    ...approvalRules.map((rule) => ({
      id: String(rule.code),
      name: String(rule.name || rule.code),
      condition: amountCondition(rule),
      action: approvalLevelText(rule.level),
      mode: 'approval',
      enabled: Boolean(rule.enabled),
    })),
    ...qualityRules.map((rule) => ({
      id: String(rule.code),
      name: String(rule.name || rule.subtype || rule.code),
      condition: qualityCondition(rule),
      action: `${approvalLevelText(rule.entryLevel)} + 品控暂扣`,
      mode: 'quality',
      enabled: Boolean(rule.enabled),
    })),
  ]
}

export function normalizeRulePayload(payload = {}) {
  const mode = String(payload.mode || '').trim()
  const code = String(payload.code || '').trim()
  if (!code) throw new Error('规则编码不能为空')

  if (mode === 'approval') {
    return {
      mode,
      rule: {
        code,
        name: String(payload.name || code).trim(),
        minAmount: numberValue(payload.minAmount, 0),
        maxAmount: blank(payload.maxAmount) ? null : numberValue(payload.maxAmount, 0),
        level: String(payload.level || 'level1_reviewing'),
        enabled: booleanValue(payload.enabled, true),
      },
    }
  }

  if (mode === 'quality') {
    const conditionField = String(payload.conditionField || payload.condition?.field || '').trim()
    const conditionOperator = String(payload.conditionOperator || payload.condition?.operator || '').trim()
    if (!conditionField || !conditionOperator) throw new Error('品控规则条件不能为空')

    return {
      mode,
      rule: {
        code,
        name: String(payload.name || payload.subtype || code).trim(),
        subtype: String(payload.subtype || '').trim() || code,
        severity: String(payload.severity || 'medium'),
        condition: {
          field: conditionField,
          operator: conditionOperator,
          value: scalarValue(payload.conditionValue ?? payload.condition?.value),
        },
        entryLevel: String(payload.entryLevel || 'level1_reviewing'),
        enabled: booleanValue(payload.enabled, true),
      },
    }
  }

  throw new Error('规则类型必须是 approval 或 quality')
}

export function filterAndPaginateRuleRows(rows = [], {
  search = '',
  mode = 'all',
  name = '',
  code = '',
  status = 'all',
  page = 1,
  pageSize = 6,
} = {}) {
  const query = String(search || '').trim().toLowerCase()
  const nameQuery = String(name || '').trim().toLowerCase()
  const codeQuery = String(code || '').trim().toLowerCase()
  const modeFilter = String(mode || 'all')
  const statusFilter = String(status || 'all')
  const filtered = rows.filter((row) => {
    if (query && !ruleSearchText(row).includes(query)) return false
    if (modeFilter !== 'all' && row.mode !== modeFilter) return false
    if (nameQuery && !String(row.name || '').toLowerCase().includes(nameQuery)) return false
    if (codeQuery && !String(row.id || '').toLowerCase().includes(codeQuery)) return false
    if (statusFilter === 'enabled' && !row.enabled) return false
    if (statusFilter === 'disabled' && row.enabled) return false
    return true
  })
  const normalizedPageSize = Math.max(1, Number(pageSize || 6))
  const totalPages = Math.max(1, Math.ceil(filtered.length / normalizedPageSize))
  const normalizedPage = Math.min(totalPages, Math.max(1, Number(page || 1)))
  const from = (normalizedPage - 1) * normalizedPageSize

  return {
    rows: filtered.slice(from, from + normalizedPageSize),
    total: filtered.length,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalPages,
  }
}

function ruleSearchText(row) {
  return [
    row.id,
    row.name,
    row.condition,
    row.action,
    row.mode,
    row.enabled ? '启用 enabled' : '停用 disabled',
  ].join(' ').toLowerCase()
}

function amountCondition(rule) {
  const min = Number(rule.minAmount || 0)
  if (rule.maxAmount === null || rule.maxAmount === undefined) {
    return `金额 >= ${min}`
  }
  return `${min} <= 金额 <= ${Number(rule.maxAmount)}`
}

function approvalLevelText(level) {
  const labels = {
    level1_reviewing: '一级审批',
    level2_reviewing: '二级审批',
  }
  return labels[level] || String(level || '-')
}

function numberValue(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function booleanValue(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  return String(value).toLowerCase() === 'true'
}

function blank(value) {
  return value === undefined || value === null || String(value).trim() === ''
}

function scalarValue(value) {
  if (typeof value === 'boolean' || typeof value === 'number') return value
  const text = String(value ?? '').trim()
  if (text === 'true') return true
  if (text === 'false') return false
  const numeric = Number(text)
  return text !== '' && Number.isFinite(numeric) ? numeric : text
}

function qualityCondition(rule) {
  const condition = rule.condition || {}
  return `${rule.subtype}: ${conditionFieldText(condition.field)} ${conditionOperatorText(condition.operator)} ${condition.value ?? ''}`.trim()
}

function conditionFieldText(field) {
  const labels = {
    damageLevel: '破损等级',
    quantityDiffRate: '数量差异率',
    labelError: '标签错误',
    batchException: '批次异常',
    specMismatch: '规格不符',
  }
  return labels[field] || field || '条件'
}

function conditionOperatorText(operator) {
  const labels = {
    eq: '=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    includes: '包含',
  }
  return labels[operator] || operator || '='
}
