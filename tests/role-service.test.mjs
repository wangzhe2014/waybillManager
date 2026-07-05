import assert from 'node:assert/strict'
import test from 'node:test'
import { getActorProfile, roleOptions } from '../src/lib/core/role-service.mjs'

test('returns role profile for approval and execution requests', () => {
  assert.deepEqual(getActorProfile('level2_approver'), {
    key: 'level2_approver',
    label: '二级审批人',
    actorId: 'approver-level2-demo',
    roles: ['level2_approver'],
  })
})

test('falls back to operator profile for unknown roles', () => {
  assert.equal(getActorProfile('missing').key, 'operator')
  assert.ok(roleOptions.some((option) => option.key === 'quality_manager'))
})
