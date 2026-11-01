import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildInboundProgress } from '../src/utils/inboundProgress.ts'

function detail(id, status, allocations = [], vehicle = null) {
  return { id, status, allocations, details: { vehicle_no: vehicle } }
}

function allocation(item_id, quantity, sku = `SKU-${item_id}`) {
  return { item_id, quantity, sku }
}

test('counts commands, quantities and unique SKUs independently', () => {
  const result = buildInboundProgress([
    detail(1, 'initialize', [allocation(1, '20')], '51C-001'),
    detail(2, 'issued', [allocation(2, 30), allocation(2, 5)], '51C-001'),
    detail(3, 'in-progress', [allocation(3, 40)], '51C-002'),
    detail(4, 'completed', [allocation(4, 50)]),
  ])
  assert.deepEqual(result.commands, { waiting: 1, running: 2, completed: 1, attention: 0 })
  assert.deepEqual(result.quantity, { waiting: 20, running: 75, completed: 50, attention: 0 })
  assert.deepEqual(result.skus, { waiting: 1, running: 2, completed: 1, attention: 0 })
  assert.deepEqual(result.vehicles, ['51C-001', '51C-002'])
})

test('a partially completed SKU appears once under running until every command completes', () => {
  const rows = [
    detail(1, 'completed', [allocation(1, 20)]),
    detail(2, 'initialize', [allocation(1, 30)]),
    detail(3, 'completed', [allocation(2, 40)]),
    detail(4, 'completed', [allocation(2, 10)]),
  ]
  const result = buildInboundProgress(rows)
  assert.deepEqual(result.skus, { waiting: 0, running: 1, completed: 1, attention: 0 })
  rows[1].status = 'completed'
  assert.deepEqual(buildInboundProgress(rows).skus, { waiting: 0, running: 0, completed: 2, attention: 0 })
})

test('failed, cancelled and unknown commands remain visible and never count as complete', () => {
  const result = buildInboundProgress([
    detail(1, 'failed', [allocation(1, 10)]),
    detail(2, 'cancelled', [allocation(2, 20)]),
    detail(3, 'unexpected', [allocation(3, 30)]),
    detail(4, 'completed', [allocation(1, 5)]),
  ])
  assert.equal(result.commands.attention, 3)
  assert.equal(result.quantity.attention, 60)
  assert.deepEqual(result.skus, { waiting: 0, running: 0, completed: 0, attention: 3 })
})

test('handles an empty session, missing allocations, invalid quantities and SKU fallback', () => {
  assert.deepEqual(buildInboundProgress([]).commands, { waiting: 0, running: 0, completed: 0, attention: 0 })
  const result = buildInboundProgress([
    { id: 1, status: 'initialize', details: {} },
    detail(2, 'completed', [allocation(null, '2.5', 'SKU-A'), allocation(null, 3, 'SKU-A')], ' 51C-001 '),
    detail(3, 'pending', [allocation(null, 'invalid', ''), allocation(2, -5), allocation(3, Infinity)]),
  ])
  assert.equal(result.commands.waiting, 2)
  assert.equal(result.quantity.completed, 5.5)
  assert.equal(result.quantity.waiting, 0)
  assert.equal(result.skus.completed, 1)
  assert.deepEqual(result.vehicles, ['51C-001'])
})
