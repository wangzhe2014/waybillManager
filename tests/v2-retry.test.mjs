import assert from 'node:assert/strict'
import test from 'node:test'
import { requestJsonWithRetry } from '../src/lib/v2-retry.mjs'

function jsonResponse(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return payload
    },
  }
}

test('retries transient V2 network failures before returning JSON', async () => {
  let attempts = 0
  const result = await requestJsonWithRetry({
    url: 'http://v2.test/api/v3/shipments/PS1',
    headers: {},
    timeoutMs: 50,
    maxRetries: 2,
    fetchImpl: async () => {
      attempts += 1
      if (attempts === 1) throw new TypeError('socket closed')
      return jsonResponse(200, { waybillNo: 'PS1' })
    },
  })

  assert.equal(attempts, 2)
  assert.equal(result.response.status, 200)
  assert.deepEqual(result.payload, { waybillNo: 'PS1' })
  assert.equal(result.attempts, 2)
})

test('does not retry V2 client errors', async () => {
  let attempts = 0
  const result = await requestJsonWithRetry({
    url: 'http://v2.test/api/v3/shipments/NOPE',
    headers: {},
    timeoutMs: 50,
    maxRetries: 2,
    fetchImpl: async () => {
      attempts += 1
      return jsonResponse(404, { error: 'not found' })
    },
  })

  assert.equal(attempts, 1)
  assert.equal(result.response.status, 404)
  assert.deepEqual(result.payload, { error: 'not found' })
})
