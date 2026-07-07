import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const files = [
  'supabase/schema.sql',
  'supabase/migration_enforce_execution_status.sql',
  'supabase/migration_inventory_quantity_delta.sql',
  'supabase/migration_inventory_balance_sync.sql',
]

test('complete_ticket_execution keeps inventory balance and movement trace linked', () => {
  for (const file of files) {
    const sql = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.match(sql, /v_batch_id UUID/, `${file} should track inventory batch id`)
    assert.match(sql, /quantity = GREATEST\(quantity \+ v_quantity_delta, 0\)/, `${file} should update balance quantity`)
    assert.match(sql, /INSERT INTO inventory_movements \(\s*batch_id,/m, `${file} should link movement to batch`)
    assert.match(sql, /WHERE id = v_batch_id/, `${file} should update the selected batch row`)
  }
})
