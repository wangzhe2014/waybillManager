import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeV2BaseUrl } from '../src/lib/v2-url.mjs'

test('normalizes localhost V2 base url to IPv4 loopback', () => {
  assert.equal(normalizeV2BaseUrl('http://localhost:3002'), 'http://127.0.0.1:3002')
})

test('keeps non-localhost V2 base urls unchanged', () => {
  assert.equal(normalizeV2BaseUrl('https://v2.example.com'), 'https://v2.example.com')
})
