import assert from 'node:assert/strict'
import test from 'node:test'
import { scheduledTaskConfigs } from '../src/lib/core/scheduled-tasks.mjs'

test('scheduled task configs expose timeout auto flow for monitoring and manual run', () => {
  const timeoutTask = scheduledTaskConfigs.find((task) => task.id === 'timeout-auto-flow')

  assert.ok(timeoutTask)
  assert.equal(timeoutTask.name, '超时自动流转')
  assert.equal(timeoutTask.path, '/api/timeouts/process')
  assert.equal(timeoutTask.schedule, '*/5 * * * *')
  assert.equal(timeoutTask.manualMethod, 'POST')
  assert.equal(timeoutTask.enabled, true)
})

test('scheduled task ids and paths are stable for future multi-task monitoring', () => {
  const ids = scheduledTaskConfigs.map((task) => task.id)
  const paths = scheduledTaskConfigs.map((task) => task.path)

  assert.equal(new Set(ids).size, ids.length)
  assert.ok(paths.every((path) => path.startsWith('/api/')))
  assert.ok(scheduledTaskConfigs.every((task) => task.scheduleText && task.description))
})
