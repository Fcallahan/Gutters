import { useMemo, useRef, useState } from 'react'
import {
  buildEstimate,
  segmentFeet,
  parseDrop,
  fmtMoney,
  fmtFeet,
  DEFAULT_SETTINGS,
} from '../../lib/estimating.js'
import './blueprint.css'

const W = 960
const H = 640
const GRID = DEFAULT_SETTINGS.pxPerFoot // 15px = 1ft

// Snap a point to horizontal/vertical alignment with the previous point.
function snapToAxis(prev, p, threshold = 10) {
  if (!prev) return p
  const dx = Math.abs(p.x - prev.x)
  const dy = Math.abs(p.y - prev.y)
  if (dx < threshold && dx <= dy) return { x: prev.x, y: p.y }
  if (dy < threshold && dy < dx) return { x: p.x, y: prev.y }
  return p
}

// Snap a point to the nearest 22.5° angle increment from the previous point.
function snapToAngle(prev, p) {
  if (!prev) return p
  const dx = p.x - prev.x
  const dy = p.y - prev.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 1) return p
  const angle = Math.atan2(dy, dx)
  const step = Math.PI / 8 // 22.5°
  const snapped = Math.round(angle / step) * step
  return {
    x: prev.x + dist * Math.cos(snapped),
    y: prev.y + dist * Math.sin(snapped),
  }
}

const snapGrid = (v) => Math.round(v / GRID) * GRID

export default function BlueprintConcept() {
  const svgRef = useRef(null)
  const [runs, setRuns] = useState([]) // committed runs
  const [draft, setDraft] = useState([]) // points of run-in-progress
  const [cursor, setCursor] = useState(null)
  const [snapOn, setSnapOn] = useState(true)
  const [angleSnap, setAngleSnap] = useState(false)
  const [gridSnap, setGridSnap] = useState(true)
  const [pricePerFoot, setPricePerFoot] = useState(DEFAULT_SETTINGS.pricePerFoot)
  const [dropCode, setDropCode] = useState('')
  const [drops, setDrops] = useState([])
  const [valleyShields, setValleyShields] = useState(0)

  const settings = { ...DEFAULT_SETTINGS, pricePerFoot: Number(pricePerFoot) || 0 }
  const estimate = useMemo(
    () => buildEstimate({ runs, drops, valleyShields, settings }),
    [runs, drops, valleyShields, settings.pricePerFoot]
  )

  function toSvgPoint(e) {
    const svg = svgRef.current
    const rect = svg.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    return { x, y }
  }

  function processPoint(p) {
    let pt = p
    const prev = draft[draft.length - 1]
    if (angleSnap) pt = snapToAngle(prev, pt)
    else if (snapOn) pt = snapToAxis(prev, pt)
    if (gridSnap) pt = { x: snapGrid(pt.x), y: snapGrid(pt.y) }
    return {
      x: Math.max(0, Math.min(W, pt.x)),
      y: Math.max(0, Math.min(H, pt.y)),
    }
  }

  function handleClick(e) {
    const pt = processPoint(toSvgPoint(e))
    setDraft((d) => [...d, pt])
  }

  function handleMove(e) {
    setCursor(processPoint(toSvgPoint(e)))
  }

  function finishRun(closed) {
    if (draft.length >= 2) {
      setRuns((r) => [...r, { points: draft, closed }])
    }
    setDraft([])
  }

  function undoPoint() {
    setDraft((d) => d.slice(0, -1))
  }

  function clearAll() {
    setRuns([])
    setDraft([])
    setDrops([])
    setValleyShields(0)
  }

  function addDrop() {
    const parsed = parseDrop(dropCode)
    if (!dropCode.trim()) return
    setDrops((d) => [...d, parsed])
    setDropCode('')
  }

  function loadSample() {
    setRuns([
      {
        closed: false,
        points: [
          { x: 150, y: 150 },
          { x: 600, y: 150 },
          { x: 600, y: 420 },
          { x: 810, y: 420 },
        ],
      },
      {
        closed: false,
        points: [
          { x: 150, y: 480 },
          { x: 450, y: 480 },
        ],
      },
    ])
    setDrops([parseDrop('AABA 15'), parseDrop('AB 10')])
    setValleyShields(1)
    setDraft([])
  }

  const livePreview = cursor && draft.length > 0 ? [...draft, cursor] : draft

  return (
    <div className="bp">
      <div className="bp__canvas-wrap">
        <div className="bp__toolbar">
          <ToolToggle on={snapOn} onClick={() => setSnapOn((v) => !v)} label="Axis snap" />
          <ToolToggle on={angleSnap} onClick={() => setAngleSnap((v) => !v)} label="22.5° snap" />
          <ToolToggle on={gridSnap} onClick={() => setGridSnap((v) => !v)} label="Grid snap" />
          <span className="bp__sep" />
          <button className="bp__btn" onClick={undoPoint} disabled={!draft.length}>
            Undo point
          </button>
          <button className="bp__btn" onClick={() => finishRun(false)} disabled={draft.length < 2}>
            Finish run
          </button>
          <button className="bp__btn" onClick={() => finishRun(true)} disabled={draft.length < 3}>
            Close loop
          </button>
          <span className="bp__sep" />
          <button className="bp__btn bp__btn--ghost" onClick={loadSample}>
            Load sample
          </button>
          <button className="bp__btn bp__btn--ghost" onClick={clearAll}>
            Clear
          </button>
        </div>

        <div className="bp__hint">
          Click to drop points · double-click to finish a run · {GRID}px = 1&nbsp;ft scale
        </div>

        <svg
          ref={svgRef}
          className="bp__svg"
          viewBox={`0 0 ${W} ${H}`}
          onClick={handleClick}
          onMouseMove={handleMove}
          onDoubleClick={() => finishRun(false)}
          onMouseLeave={() => setCursor(null)}
        >
          <defs>
            <pattern id="bp-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
              <path
                d={`M ${GRID} 0 L 0 0 0 ${GRID}`}
                fill="none"
                stroke="rgba(120,170,255,0.16)"
                strokeWidth="1"
              />
            </pattern>
            <pattern id="bp-grid-major" width={GRID * 5} height={GRID * 5} patternUnits="userSpaceOnUse">
              <rect width={GRID * 5} height={GRID * 5} fill="url(#bp-grid)" />
              <path
                d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`}
                fill="none"
                stroke="rgba(120,170,255,0.32)"
                strokeWidth="1.2"
              />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#bp-grid-major)" />

          {/* committed runs */}
          {runs.map((run, i) => (
            <RunShape key={i} run={run} />
          ))}

          {/* draft run with live preview segment */}
          {livePreview.length >= 2 && (
            <polyline
              points={livePreview.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#ffd166"
              strokeWidth="3"
              strokeDasharray="2 6"
              strokeLinejoin="round"
            />
          )}
          {draft.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="5" fill="#ffd166" stroke="#0b0f17" strokeWidth="1.5" />
          ))}
          {/* live segment length label */}
          {cursor && draft.length > 0 && (
            <SegLabel a={draft[draft.length - 1]} b={cursor} />
          )}
          {cursor && (
            <circle cx={cursor.x} cy={cursor.y} r="4" fill="none" stroke="#ffd166" strokeWidth="1.5" />
          )}
        </svg>
      </div>

      <aside className="bp__rail">
        <div className="bp__rail-head">
          <div className="bp__rail-kicker">Live Takeoff</div>
          <div className="bp__total">{fmtMoney(estimate.turnkeyTotal)}</div>
          <div className="bp__total-sub">Turnkey total</div>
        </div>

        <Section title="Linear footage">
          <Row label="Measured runs" value={fmtFeet(estimate.rawFeet)} />
          <Row label="Waste allowance" value={fmtFeet(estimate.wasteFeet)} muted />
          <Row label="Material LF" value={fmtFeet(estimate.materialFeet)} strong />
          <Row label="Downspout pipe" value={fmtFeet(estimate.downspoutFeet)} muted />
        </Section>

        <Section title="Auto-detected components">
          {estimate.componentLines.length === 0 ? (
            <div className="bp__empty">Draw runs to detect miters &amp; caps.</div>
          ) : (
            estimate.componentLines.map((l) => (
              <Row key={l.key} label={l.label} value={`${l.qty} ${l.unit}`} />
            ))
          )}
        </Section>

        <Section title="Downspout drops">
          <div className="bp__drop-input">
            <input
              value={dropCode}
              onChange={(e) => setDropCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDrop()}
              placeholder="e.g. AABA 15"
            />
            <button className="bp__btn" onClick={addDrop}>
              Add
            </button>
          </div>
          {drops.length === 0 ? (
            <div className="bp__empty">Parses elbows (A/B), offsets (O) &amp; pipe LF.</div>
          ) : (
            <div className="bp__chips">
              {drops.map((d, i) => (
                <span key={i} className="bp__chip" onClick={() => setDrops((x) => x.filter((_, j) => j !== i))}>
                  {d.raw || 'drop'} ✕
                </span>
              ))}
            </div>
          )}
          <Row label="Valley shields" value={
            <span className="bp__stepper">
              <button onClick={() => setValleyShields((v) => Math.max(0, v - 1))}>−</button>
              {valleyShields}
              <button onClick={() => setValleyShields((v) => v + 1)}>+</button>
            </span>
          } />
        </Section>

        <Section title="Pricing">
          <label className="bp__field">
            <span>Price / LF</span>
            <input
              type="number"
              value={pricePerFoot}
              min="0"
              step="0.5"
              onChange={(e) => setPricePerFoot(e.target.value)}
            />
          </label>
          <Row label="Gutter (material × rate)" value={fmtMoney(estimate.gutterCost)} />
          <Row label="Components" value={fmtMoney(estimate.componentCost)} />
          <Row label="Misc / labor" value={fmtMoney(estimate.miscLabor)} />
          <Row label="Turnkey total" value={fmtMoney(estimate.turnkeyTotal)} strong />
        </Section>
      </aside>
    </div>
  )
}

function RunShape({ run }) {
  const pts = run.points
  const path = pts.map((p) => `${p.x},${p.y}`).join(' ')
  return (
    <g>
      {run.closed ? (
        <polygon points={path} fill="rgba(79,140,255,0.10)" stroke="#4f8cff" strokeWidth="3" strokeLinejoin="round" />
      ) : (
        <polyline points={path} fill="none" stroke="#4f8cff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="#0b0f17" stroke="#4f8cff" strokeWidth="2" />
      ))}
      {pts.slice(0, -1).map((p, i) => (
        <SegLabel key={i} a={p} b={pts[i + 1]} subtle />
      ))}
      {run.closed && pts.length >= 3 && (
        <SegLabel a={pts[pts.length - 1]} b={pts[0]} subtle />
      )}
    </g>
  )
}

function SegLabel({ a, b, subtle }) {
  const feet = segmentFeet(a, b)
  if (feet < 0.3) return null
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  return (
    <g>
      <rect x={mx - 22} y={my - 11} width="44" height="18" rx="4" fill="#0b0f17" opacity="0.82" />
      <text
        x={mx}
        y={my + 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="11"
        fontFamily="ui-monospace, monospace"
        fill={subtle ? '#9fc0ff' : '#ffd166'}
      >
        {feet.toFixed(1)}′
      </text>
    </g>
  )
}

function ToolToggle({ on, onClick, label }) {
  return (
    <button className={`bp__toggle ${on ? 'is-on' : ''}`} onClick={onClick}>
      <span className="bp__toggle-dot" />
      {label}
    </button>
  )
}

function Section({ title, children }) {
  return (
    <section className="bp__section">
      <h3 className="bp__section-title">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, value, strong, muted }) {
  return (
    <div className={`bp__row ${strong ? 'is-strong' : ''} ${muted ? 'is-muted' : ''}`}>
      <span className="bp__row-label">{label}</span>
      <span className="bp__row-value">{value}</span>
    </div>
  )
}
