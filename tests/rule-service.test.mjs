import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRuleRows, filterAndPaginateRuleRows, normalizeRulePayload } from '../src/lib/core/rule-service.mjs'

test('builds display rows from approval and quality rules', () => {
  const rows = buildRuleRows(
    [
      { code: 'amount-level-2', name: '大额二级审批', minAmount: 1000, maxAmount: null, level: 'level2_reviewing', enabled: true },
    ],
    [
      {
        code: 'QR-DAMAGE-03',
        name: '外观破损暂扣',
        subtype: 'damage',
        severity: 'high',
        condition: { field: 'damageLevel', operator: 'gte', value: 3 },
        entryLevel: 'level2_reviewing',
        enabled: false,
      },
    ]
  )

  assert.deepEqual(rows, [
    {
      id: 'amount-level-2',
      name: '大额二级审批',
      condition: 'amount >= 1000',
      action: 'level2_reviewing',
      mode: 'approval',
      enabled: true,
    },
    {
      id: 'QR-DAMAGE-03',
      name: '外观破损暂扣',
      condition: 'damage: damageLevel gte 3',
      action: 'level2_reviewing + qc_hold',
      mode: 'quality',
      enabled: false,
    },
  ])
})

test('normalizes approval rule payload for persistence', () => {
  assert.deepEqual(normalizeRulePayload({
    mode: 'approval',
    code: 'amount-vip',
    name: 'VIP 金额审批',
    minAmount: '200',
    maxAmount: '500',
    level: 'level1_reviewing',
    enabled: false,
  }), {
    mode: 'approval',
    rule: {
      code: 'amount-vip',
      name: 'VIP 金额审批',
      minAmount: 200,
      maxAmount: 500,
      level: 'level1_reviewing',
      enabled: false,
    },
  })
})

test('normalizes quality rule payload and parses condition value', () => {
  assert.deepEqual(normalizeRulePayload({
    mode: 'quality',
    code: 'QR-TEMP-01',
    name: '温控异常暂扣',
    subtype: 'temperature',
    severity: 'high',
    conditionField: 'temperature',
    conditionOperator: 'gte',
    conditionValue: '8',
    entryLevel: 'level2_reviewing',
    enabled: true,
  }), {
    mode: 'quality',
    rule: {
      code: 'QR-TEMP-01',
      name: '温控异常暂扣',
      subtype: 'temperature',
      severity: 'high',
      condition: { field: 'temperature', operator: 'gte', value: 8 },
      entryLevel: 'level2_reviewing',
      enabled: true,
    },
  })
})

test('rejects invalid rule payloads', () => {
  assert.throws(() => normalizeRulePayload({ mode: 'approval', code: '' }), /规则编码不能为空/)
  assert.throws(() => normalizeRulePayload({ mode: 'quality', code: 'QR-X' }), /品控规则条件不能为空/)
})

test('filters and paginates rule rows for card display', () => {
  const rows = [
    { id: 'amount-level-1', condition: '0 <= amount <= 999', action: 'level1_reviewing', mode: 'approval', enabled: true },
    { id: 'amount-level-2', condition: 'amount >= 1000', action: 'level2_reviewing', mode: 'approval', enabled: true },
    { id: 'QR-DAMAGE-03', name: '外观破损暂扣', condition: 'damageLevel gte 3', action: 'level2_reviewing + qc_hold', mode: 'quality', enabled: false },
  ]

  const result = filterAndPaginateRuleRows(rows, {
    search: '外观破损',
    page: 1,
    pageSize: 2,
  })

  assert.deepEqual(result.rows.map((row) => row.id), ['QR-DAMAGE-03'])
  assert.equal(result.total, 1)
  assert.equal(result.totalPages, 1)
})

test('filters rule rows by type, name, code and status independently', () => {
  const rows = [
    { id: 'amount-level-1', name: '小额一级审批', condition: '0 <= amount <= 999', action: 'level1_reviewing', mode: 'approval', enabled: true },
    { id: 'amount-level-2', name: '大额二级审批', condition: 'amount >= 1000', action: 'level2_reviewing', mode: 'approval', enabled: false },
    { id: 'QR-DAMAGE-03', name: '外观破损暂扣', condition: 'damageLevel gte 3', action: 'level2_reviewing + qc_hold', mode: 'quality', enabled: true },
  ]

  const result = filterAndPaginateRuleRows(rows, {
    mode: 'approval',
    name: '大额',
    code: 'level-2',
    status: 'disabled',
    page: 1,
    pageSize: 10,
  })

  assert.deepEqual(result.rows.map((row) => row.id), ['amount-level-2'])
  assert.equal(result.total, 1)
})

test('clamps rule card pagination to the available page range', () => {
  const rows = [
    { id: 'r1', condition: 'a', action: 'x', mode: 'approval', enabled: true },
    { id: 'r2', condition: 'b', action: 'y', mode: 'quality', enabled: true },
    { id: 'r3', condition: 'c', action: 'z', mode: 'quality', enabled: true },
  ]

  const result = filterAndPaginateRuleRows(rows, {
    page: 99,
    pageSize: 2,
  })

  assert.deepEqual(result.rows.map((row) => row.id), ['r3'])
  assert.equal(result.page, 2)
  assert.equal(result.totalPages, 2)
})
