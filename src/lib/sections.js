// Convert a tabular "section" (length + corner counts) used by the Pro
// Dashboard concept into the shared engine's geometric run shape, so the
// dashboard can reuse buildEstimate verbatim instead of duplicating math.
//
// We synthesize an open polyline whose interior vertices land at the
// requested angles: a 90° exterior turn yields an interior 90° (a standard
// miter), a 45° exterior turn yields an interior 135° (a bay miter).
import { DEFAULT_SETTINGS } from './estimating.js'

export function sectionToRun(sec, pxPerFoot = DEFAULT_SETTINGS.pxPerFoot) {
  const lengthFt = Math.max(0, Number(sec.lengthFt) || 0)
  const corners = Math.max(0, Math.floor(Number(sec.corners) || 0))
  const bays = Math.max(0, Math.floor(Number(sec.bays) || 0))
  if (lengthFt <= 0) return null
  const turns = corners + bays
  const segs = turns + 1
  const segLen = (lengthFt * pxPerFoot) / segs
  const exts = [...Array(corners).fill(90), ...Array(bays).fill(45)]
  let heading = 0
  let cur = { x: 0, y: 0 }
  const pts = [cur]
  for (let i = 0; i < segs; i++) {
    cur = {
      x: cur.x + Math.cos(heading) * segLen,
      y: cur.y + Math.sin(heading) * segLen,
    }
    pts.push(cur)
    if (i < exts.length) heading += (exts[i] * Math.PI) / 180
  }
  return { closed: false, points: pts }
}
