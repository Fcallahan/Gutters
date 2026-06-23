// Run with: npm test  (uses Node's built-in test runner, no deps)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEstimate, parseDrop, classifyMiter, vertexAngle, segmentFeet } from './estimating.js'

test('segmentFeet converts px to feet at 15px/ft', () => {
  assert.equal(segmentFeet({ x: 0, y: 0 }, { x: 150, y: 0 }), 10)
})

test('classifyMiter splits standard vs bay', () => {
  assert.equal(classifyMiter(90), 'miter')
  assert.equal(classifyMiter(45), 'bayMiter')
  assert.equal(classifyMiter(135), 'bayMiter')
})

test('vertexAngle of a right angle ~ 90', () => {
  const a = { x: 0, y: 0 }
  const b = { x: 10, y: 0 }
  const c = { x: 10, y: 10 }
  assert.ok(Math.abs(vertexAngle(a, b, c) - 90) < 0.001)
})

test('parseDrop extracts elbows, offsets and pipe LF', () => {
  const d = parseDrop('AABA 15')
  assert.equal(d.elbowA, 3)
  assert.equal(d.elbowB, 1)
  assert.equal(d.pipeFeet, 15)
})

test('buildEstimate on an open L-run computes LF, miter, caps and total', () => {
  const runs = [
    { closed: false, points: [
      { x: 0, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 150 },
    ] },
  ]
  const est = buildEstimate({ runs })
  assert.equal(est.rawFeet, 20) // 10ft + 10ft
  assert.equal(est.counts.miters, 1) // one interior right angle
  assert.equal(est.counts.endCaps, 2) // open run, both ends
  assert.ok(est.turnkeyTotal > 0)
})

test('buildEstimate closed rectangle has 4 miters, no caps', () => {
  const runs = [
    { closed: true, points: [
      { x: 0, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 150 }, { x: 0, y: 150 },
    ] },
  ]
  const est = buildEstimate({ runs })
  assert.equal(est.counts.miters, 4)
  assert.equal(est.counts.endCaps, 0)
  assert.equal(est.rawFeet, 40)
})
