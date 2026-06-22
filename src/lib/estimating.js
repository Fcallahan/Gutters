// Shared gutter-estimating domain logic for all concept MVPs.
// Pure functions only — no backend, no side effects. Encodes the PRD's
// takeoff math (linear footage, miters, caps, drops, waste, turnkey total).

export const DEFAULT_SETTINGS = {
  pxPerFoot: 15, // PRD default: 15px = 1ft
  pricePerFoot: 12.5, // $/LF installed
  wastePerMiter: 1.5, // extra LF per miter for fabrication waste
  wastePerDrop: 2.0, // extra LF per downspout drop
  wastePerCap: 0.5, // extra LF per end cap
  miscLabor: 250, // flat misc/labor fee
}

// Catalog of components used across concepts.
export const COMPONENTS = {
  miter: { key: 'miter', label: 'Standard Miter', unit: 'ea', price: 18 },
  bayMiter: { key: 'bayMiter', label: 'Bay Miter', unit: 'ea', price: 28 },
  endCap: { key: 'endCap', label: 'End Cap', unit: 'ea', price: 6 },
  drop: { key: 'drop', label: 'Downspout Drop', unit: 'ea', price: 45 },
  elbowA: { key: 'elbowA', label: 'A Elbow', unit: 'ea', price: 7 },
  elbowB: { key: 'elbowB', label: 'B Elbow', unit: 'ea', price: 7 },
  offset: { key: 'offset', label: 'Offset', unit: 'ea', price: 14 },
  valleyShield: { key: 'valleyShield', label: 'Valley Shield', unit: 'ea', price: 22 },
}

const round1 = (n) => Math.round(n * 10) / 10
const round2 = (n) => Math.round(n * 100) / 100

// Distance between two points in feet, given the px/ft scale.
export function segmentFeet(a, b, pxPerFoot = DEFAULT_SETTINGS.pxPerFoot) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.hypot(dx, dy) / pxPerFoot
}

// Classify the interior angle (degrees) between two connected runs.
// PRD: standard miters 75-105 deg, bay miters e.g. 45 or 135.
export function classifyMiter(angleDeg) {
  if (angleDeg >= 75 && angleDeg <= 105) return 'miter'
  return 'bayMiter'
}

// Parse a downspout shorthand like "AABA 15" or "AB 20" into components.
// Letters: A elbow, B elbow, O offset. Trailing number = LF of downspout pipe.
export function parseDrop(code) {
  const cleaned = (code || '').toUpperCase().trim()
  const match = cleaned.match(/([ABO]*)\s*(\d+(?:\.\d+)?)?/)
  const letters = match?.[1] || ''
  const lf = match?.[2] ? parseFloat(match[2]) : 0
  let elbowA = 0
  let elbowB = 0
  let offset = 0
  for (const ch of letters) {
    if (ch === 'A') elbowA += 1
    else if (ch === 'B') elbowB += 1
    else if (ch === 'O') offset += 1
  }
  return { raw: cleaned, elbowA, elbowB, offset, pipeFeet: lf }
}

// Compute interior angle in degrees at vertex b formed by a-b-c.
export function vertexAngle(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const dot = v1.x * v2.x + v1.y * v2.y
  const m1 = Math.hypot(v1.x, v1.y)
  const m2 = Math.hypot(v2.x, v2.y)
  if (m1 === 0 || m2 === 0) return 180
  const cos = Math.min(1, Math.max(-1, dot / (m1 * m2)))
  return (Math.acos(cos) * 180) / Math.PI
}

// Given an array of "runs" (each: { points: [{x,y}...], closed: bool }),
// plus an array of drops (each a parsed-drop object or code string),
// produce a full estimate. This is the heart shared by every concept.
export function buildEstimate({ runs = [], drops = [], valleyShields = 0, settings = {} } = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings }

  let rawFeet = 0
  let miters = 0
  let bayMiters = 0
  let endCaps = 0

  for (const run of runs) {
    const pts = run.points || []
    if (pts.length < 2) continue
    // sum segment lengths
    for (let i = 0; i < pts.length - 1; i++) {
      rawFeet += segmentFeet(pts[i], pts[i + 1], s.pxPerFoot)
    }
    if (run.closed && pts.length >= 3) {
      rawFeet += segmentFeet(pts[pts.length - 1], pts[0], s.pxPerFoot)
    }

    // count interior vertices as miters
    const interior = run.closed ? pts.length : Math.max(0, pts.length - 2)
    for (let i = 0; i < pts.length; i++) {
      const isInterior = run.closed || (i > 0 && i < pts.length - 1)
      if (!isInterior) continue
      const prev = pts[(i - 1 + pts.length) % pts.length]
      const cur = pts[i]
      const next = pts[(i + 1) % pts.length]
      const ang = vertexAngle(prev, cur, next)
      if (classifyMiter(ang) === 'miter') miters += 1
      else bayMiters += 1
    }

    // end caps on open runs (both ends)
    if (!run.closed && pts.length >= 2) endCaps += 2
  }

  // normalize drops to parsed objects
  const parsedDrops = drops.map((d) => (typeof d === 'string' ? parseDrop(d) : d))
  const dropCount = parsedDrops.length
  const elbowA = parsedDrops.reduce((a, d) => a + (d.elbowA || 0), 0)
  const elbowB = parsedDrops.reduce((a, d) => a + (d.elbowB || 0), 0)
  const offsets = parsedDrops.reduce((a, d) => a + (d.offset || 0), 0)
  const downspoutFeet = parsedDrops.reduce((a, d) => a + (d.pipeFeet || 0), 0)

  const wasteFeet =
    miters * s.wastePerMiter +
    bayMiters * s.wastePerMiter +
    dropCount * s.wastePerDrop +
    endCaps * s.wastePerCap

  const materialFeet = rawFeet + wasteFeet
  const gutterCost = materialFeet * s.pricePerFoot

  const componentLines = [
    { ...COMPONENTS.miter, qty: miters },
    { ...COMPONENTS.bayMiter, qty: bayMiters },
    { ...COMPONENTS.endCap, qty: endCaps },
    { ...COMPONENTS.drop, qty: dropCount },
    { ...COMPONENTS.elbowA, qty: elbowA },
    { ...COMPONENTS.elbowB, qty: elbowB },
    { ...COMPONENTS.offset, qty: offsets },
    { ...COMPONENTS.valleyShield, qty: valleyShields },
  ].filter((l) => l.qty > 0)

  const componentCost = componentLines.reduce((a, l) => a + l.qty * l.price, 0)
  const turnkeyTotal = gutterCost + componentCost + s.miscLabor

  return {
    settings: s,
    rawFeet: round1(rawFeet),
    wasteFeet: round1(wasteFeet),
    materialFeet: round1(materialFeet),
    downspoutFeet: round1(downspoutFeet),
    counts: { miters, bayMiters, endCaps, dropCount, elbowA, elbowB, offsets, valleyShields },
    componentLines,
    gutterCost: round2(gutterCost),
    componentCost: round2(componentCost),
    miscLabor: s.miscLabor,
    turnkeyTotal: round2(turnkeyTotal),
  }
}

export const fmtMoney = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

export const fmtFeet = (n) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} LF`
