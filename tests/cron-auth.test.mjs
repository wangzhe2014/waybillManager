import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCronRequest } from '../src/lib/server/cron-auth.mjs'

function headers(values = {}) {
  return {
    get(name) {
      return values[name.toLowerCase()] || null
    },
  }
}

test('allows timeout cron requests when no secret is configured', () => {
  const result = validateCronRequest({
    headers: headers(),
    secret: '',
  })

  assert.equal(result.ok, true)
  assert.equal(result.mode, 'unprotected')
})

test('accepts bearer token that matches configured cron secret', () => {
  const result = validateCronRequest({
    headers: headers({ authorization: 'Bearer timeout-secret' }),
    secret: 'timeout-secret',
  })

  assert.equal(result.ok, true)
  assert.equal(result.mode, 'secret')
})

test('rejects missing or incorrect cron secret when configured', () => {
  const missing = validateCronRequest({
    headers: headers(),
    secret: 'timeout-secret',
  })
  const wrong = validateCronRequest({
    headers: headers({ authorization: 'Bearer wrong-secret' }),
    secret: 'timeout-secret',
  })

  assert.equal(missing.ok, false)
  assert.equal(wrong.ok, false)
}
)
