import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sectionToRun } from './sections.js'
import { buildEstimate, DEFAULT_SETTINGS } from './estimating.js'

const px = DEFAULT_SETTINGS.pxPerFoot

test('sectionToRun skips zero-length rows', () => {
  assert.equal(sectionToRun({ lengthFt: 0, corners: 2, bays: 1 }, px), null)
})

test('sectionToRun preserves total linear footage', () => {
  const run = sectionToRun({ lengthFt: 40, corners: 2, bays: 0 }, px)
  const est = buildEstimate({ runs: [run] })
  // raw measured footage should match the requested length (within rounding)
  assert.ok(Math.abs(est.rawFeet - 40) < 0.2, `got ${est.rawFeet}`)
})

test('corners become standard miters, bays become bay miters', () => {
  const run = sectionToRun({ lengthFt: 60, corners: 2, bays: 1 }, px)
  const est = buildEstimate({ runs: [run] })
  assert.equal(est.counts.miters, 2)
  assert.equal(est.counts.bayMiters, 1)
  // an open run always has two end caps
  assert.equal(est.counts.endCaps, 2)
})

test('dashboard-style multi-section estimate aggregates across runs', () => {
  const sections = [
    { lengthFt: 42, corners: 2, bays: 0 },
    { lengthFt: 28, corners: 1, bays: 0 },
    { lengthFt: 36, corners: 1, bays: 2 },
  ]
  const runs = sections.map((s) => sectionToRun(s, px)).filter(Boolean)
  const est = buildEstimate({ runs })
  assert.equal(est.counts.miters, 4) // 2 + 1 + 1
  assert.equal(est.counts.bayMiters, 2) // 0 + 0 + 2
  assert.equal(est.counts.endCaps, 6) // 2 per open run
  assert.ok(Math.abs(est.rawFeet - 106) < 0.5, `got ${est.rawFeet}`)
  assert.ok(est.turnkeyTotal > 0)
})
