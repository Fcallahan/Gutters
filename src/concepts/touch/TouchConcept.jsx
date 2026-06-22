import { useMemo, useRef, useState, useEffect } from 'react'
import {
  buildEstimate,
  parseDrop,
  segmentFeet,
  fmtMoney,
  fmtFeet,
  DEFAULT_SETTINGS,
} from '../../lib/estimating.js'
import './touch.css'

// Touch Canvas — the tablet-first, gesture-flavored direction. A single
// light "paper" canvas you sketch on by tapping, with big floating controls,
// large touch targets, a live total chip, and a slide-up signature sheet.
// Same shared estimating engine as every other concept.

const SNAP_PX = 14 // axis snap tolerance while sketching

// One-tap downspout types, expressed in the engine's shorthand.
const DROP_TYPES = [
  { id: 'std', label: 'Standard', code: 'AB 12', emoji: '🟦' },
  { id: 'tall', label: '2-story', code: 'AABA 22', emoji: '🟪' },
  { id: 'offset', label: 'Offset', code: 'AOA 14', emoji: '🟨' },
]

// A ready-made sample roofline so the screen is never empty on first open.
const SAMPLE_RUN = {
  closed: false,
  points: [
    { x: 90, y: 120 },
    { x: 360, y: 120 },
    { x: 360, y: 250 },
    { x: 560, y: 250 },
  ],
}

export default function TouchConcept() {
  const [runs, setRuns] = useState([SAMPLE_RUN])
  const [activeIdx, setActiveIdx] = useState(0)
  const [drops, setDrops] = useState([]) // array of { id, code, x, y }
  const [valleyShields, setValleyShields] = useState(0)
  const [pricePerFoot, setPricePerFoot] = useState(DEFAULT_SETTINGS.pricePerFoot)
  const [tool, setTool] = useState('draw') // 'draw' | 'drop'
  const [dropType, setDropType] = useState('std')
  const [sheet, setSheet] = useState(null) // null | 'sign' | 'menu'
  const [signed, setSigned] = useState(false)

  const svgRef = useRef(null)

  const settings = { ...DEFAULT_SETTINGS, pricePerFoot: Number(pricePerFoot) || 0 }
  const estimate = useMemo(
    () =>
      buildEstimate({
        runs,
        drops: drops.map((d) => parseDrop(d.code)),
        valleyShields,
        settings,
      }),
    [runs, drops, valleyShields, settings.pricePerFoot]
  )

  const activeRun = runs[activeIdx]
  const pointCount = runs.reduce((a, r) => a + r.points.length, 0)

  // ---- canvas helpers ----------------------------------------------------
  function toCanvas(e) {
    const svg = svgRef.current
    const rect = svg.getBoundingClientRect()
    const t = e.touches ? e.touches[0] : e
    const vb = svg.viewBox.baseVal
    return {
      x: ((t.clientX - rect.left) / rect.width) * vb.width,
      y: ((t.clientY - rect.top) / rect.height) * vb.height,
    }
  }

  function snap(p) {
    if (!activeRun || activeRun.points.length === 0 || activeRun.closed) return p
    const last = activeRun.points[activeRun.points.length - 1]
    const out = { ...p }
    if (Math.abs(p.x - last.x) < SNAP_PX) out.x = last.x
    if (Math.abs(p.y - last.y) < SNAP_PX) out.y = last.y
    return out
  }

  function handleCanvasTap(e) {
    if (signed) return
    const raw = toCanvas(e)
    if (tool === 'drop') {
      setDrops((d) => [
        ...d,
        { id: `${raw.x | 0}-${raw.y | 0}-${d.length}`, code: typeFor(dropType).code, x: raw.x, y: raw.y },
      ])
      return
    }
    // draw tool: append a snapped point to the active run
    if (!activeRun || activeRun.closed) {
      setRuns((rs) => [...rs, { closed: false, points: [raw] }])
      setActiveIdx(runs.length)
      return
    }
    const p = snap(raw)
    setRuns((rs) =>
      rs.map((r, i) => (i === activeIdx ? { ...r, points: [...r.points, p] } : r))
    )
  }

  // ---- run actions -------------------------------------------------------
  function newRun() {
    setRuns((rs) => [...rs, { closed: false, points: [] }])
    setActiveIdx(runs.length)
    setTool('draw')
  }
  function undoPoint() {
    if (!activeRun) return
    setRuns((rs) =>
      rs
        .map((r, i) =>
          i === activeIdx ? { ...r, closed: false, points: r.points.slice(0, -1) } : r
        )
        .filter((r, i) => i !== activeIdx || r.points.length > 0)
    )
  }
  function toggleClose() {
    if (!activeRun || activeRun.points.length < 3) return
    setRuns((rs) => rs.map((r, i) => (i === activeIdx ? { ...r, closed: !r.closed } : r)))
  }
  function removeDrop(id) {
    setDrops((d) => d.filter((x) => x.id !== id))
  }
  function reset() {
    setRuns([{ closed: false, points: [] }])
    setActiveIdx(0)
    setDrops([])
    setValleyShields(0)
    setPricePerFoot(DEFAULT_SETTINGS.pricePerFoot)
    setSigned(false)
    setSheet(null)
    setTool('draw')
  }

  const typeFor = (id) => DROP_TYPES.find((t) => t.id === id) || DROP_TYPES[0]

  return (
    <div className="tc">
      {/* ---- the canvas ---- */}
      <svg
        ref={svgRef}
        className={`tc__canvas ${signed ? 'is-locked' : ''}`}
        viewBox="0 0 720 480"
        onClick={handleCanvasTap}
      >
        <defs>
          <pattern id="tc-grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M30 0H0V30" fill="none" stroke="rgba(99,102,241,0.12)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="720" height="480" fill="url(#tc-grid)" />

        {runs.map((run, ri) => {
          const pts = run.points
          if (pts.length === 0) return null
          const d =
            'M ' +
            pts.map((p) => `${p.x} ${p.y}`).join(' L ') +
            (run.closed ? ' Z' : '')
          const isActive = ri === activeIdx
          return (
            <g key={ri}>
              <path
                d={d}
                fill={run.closed ? 'rgba(192,132,252,0.10)' : 'none'}
                stroke={isActive ? 'var(--accent, #c084fc)' : '#a78bda'}
                strokeWidth={isActive ? 6 : 5}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={isActive ? 1 : 0.7}
              />
              {/* segment length labels */}
              {pts.map((p, i) => {
                if (i === 0) return null
                const a = pts[i - 1]
                const mid = { x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 }
                const ft = segmentFeet(a, p, settings.pxPerFoot)
                return (
                  <text key={i} x={mid.x} y={mid.y - 8} className="tc__seg-label">
                    {ft.toFixed(1)}′
                  </text>
                )
              })}
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={isActive ? 8 : 6}
                  className="tc__node"
                  fill={isActive ? 'var(--accent, #c084fc)' : '#a78bda'}
                />
              ))}
            </g>
          )
        })}

        {/* downspout drops */}
        {drops.map((d) => (
          <g key={d.id} className="tc__drop" onClick={(e) => { e.stopPropagation(); removeDrop(d.id) }}>
            <circle cx={d.x} cy={d.y} r="15" className="tc__drop-dot" />
            <text x={d.x} y={d.y + 5} className="tc__drop-icon">↓</text>
          </g>
        ))}
      </svg>

      {/* ---- empty hint ---- */}
      {pointCount === 0 && (
        <div className="tc__hint">
          <div className="tc__hint-emoji">👆</div>
          Tap the canvas to drop gutter corners. Lines snap to square.
        </div>
      )}

      {/* ---- floating live total chip ---- */}
      <div className="tc__total">
        <div className="tc__total-label">Turnkey total</div>
        <div className="tc__total-value">{fmtMoney(estimate.turnkeyTotal)}</div>
        <div className="tc__total-sub">
          {fmtFeet(estimate.materialFeet)} · {estimate.counts.dropCount} drops ·{' '}
          {estimate.counts.miters + estimate.counts.bayMiters} miters
        </div>
        {signed && <div className="tc__locked">🔒 Locked</div>}
      </div>

      {/* ---- tool switch (left rail) ---- */}
      <div className="tc__tools">
        <ToolBtn active={tool === 'draw'} onClick={() => setTool('draw')} label="Draw" icon="✏️" />
        <ToolBtn active={tool === 'drop'} onClick={() => setTool('drop')} label="Drop" icon="↓" />
        <ToolBtn onClick={() => setSheet(sheet === 'menu' ? null : 'menu')} label="More" icon="⋯" />
      </div>

      {/* ---- contextual action dock (bottom) ---- */}
      <div className="tc__dock">
        {tool === 'draw' ? (
          <>
            <DockBtn onClick={undoPoint} disabled={!activeRun || activeRun.points.length === 0}>
              ↶ Undo
            </DockBtn>
            <DockBtn
              onClick={toggleClose}
              disabled={!activeRun || activeRun.points.length < 3}
              accent={activeRun?.closed}
            >
              {activeRun?.closed ? '⊙ Looped' : '⊙ Close loop'}
            </DockBtn>
            <DockBtn onClick={newRun}>＋ New run</DockBtn>
          </>
        ) : (
          DROP_TYPES.map((t) => (
            <DockBtn key={t.id} accent={dropType === t.id} onClick={() => setDropType(t.id)}>
              {t.emoji} {t.label}
            </DockBtn>
          ))
        )}
      </div>

      {/* ---- primary CTA ---- */}
      {!signed && (
        <button
          className="tc__cta"
          onClick={() => setSheet('sign')}
          disabled={estimate.materialFeet <= 0}
        >
          Review &amp; sign · {fmtMoney(estimate.turnkeyTotal)}
        </button>
      )}

      {/* ---- bottom sheets ---- */}
      {sheet === 'menu' && (
        <Sheet title="Estimate options" onClose={() => setSheet(null)}>
          <div className="tc__opt">
            <div>
              <div className="tc__opt-label">Valley shields</div>
              <div className="tc__opt-sub">{fmtMoney(22)} each, installed</div>
            </div>
            <Stepper
              value={valleyShields}
              onDec={() => setValleyShields((v) => Math.max(0, v - 1))}
              onInc={() => setValleyShields((v) => v + 1)}
            />
          </div>
          <label className="tc__slider">
            <span>Price per foot — {fmtMoney(Number(pricePerFoot) || 0)}/LF</span>
            <input
              type="range"
              min="8"
              max="22"
              step="0.5"
              value={pricePerFoot}
              onChange={(e) => setPricePerFoot(e.target.value)}
            />
          </label>
          <button className="tc__ghost" onClick={reset}>
            Clear &amp; start over
          </button>
        </Sheet>
      )}

      {sheet === 'sign' && (
        <Sheet
          title={signed ? 'Contract executed 🎉' : 'Confirm & sign'}
          onClose={() => setSheet(null)}
        >
          <div className="tc__review">
            <ReviewRow label="Seamless gutter & install" value={fmtMoney(estimate.gutterCost)} />
            {estimate.componentLines.map((l) => (
              <ReviewRow key={l.key} muted label={`${l.label} ×${l.qty}`} value={fmtMoney(l.qty * l.price)} />
            ))}
            <ReviewRow muted label="Misc / labor" value={fmtMoney(estimate.miscLabor)} />
            <div className="tc__review-total">
              <span>Turnkey total</span>
              <strong>{fmtMoney(estimate.turnkeyTotal)}</strong>
            </div>
          </div>
          {!signed ? (
            <>
              <div className="tc__terms">
                Prime Seamless standard terms apply. Signing locks pricing &amp; totals and
                authorizes the {fmtMoney(estimate.turnkeyTotal)} turnkey job.
              </div>
              <SignaturePad
                onSign={() => {
                  setSigned(true)
                }}
              />
            </>
          ) : (
            <div className="tc__signed">
              <div className="tc__signed-check">✓</div>
              <div>Signed &amp; locked. A clean 8.5×11 PDF would export here.</div>
              <button className="tc__ghost" onClick={reset}>
                Start a new estimate
              </button>
            </div>
          )}
        </Sheet>
      )}
    </div>
  )
}

function ToolBtn({ active, onClick, label, icon }) {
  return (
    <button className={`tc__tool ${active ? 'is-active' : ''}`} onClick={onClick}>
      <span className="tc__tool-icon">{icon}</span>
      <span className="tc__tool-label">{label}</span>
    </button>
  )
}

function DockBtn({ children, onClick, disabled, accent }) {
  return (
    <button
      className={`tc__dockbtn ${accent ? 'is-accent' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function Stepper({ value, onDec, onInc }) {
  return (
    <div className="tc__stepper">
      <button onClick={onDec} aria-label="decrease">−</button>
      <span>{value}</span>
      <button onClick={onInc} aria-label="increase">+</button>
    </div>
  )
}

function Sheet({ title, children, onClose }) {
  return (
    <div className="tc__scrim" onClick={onClose}>
      <div className="tc__sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tc__grip" />
        <div className="tc__sheet-head">
          <h3>{title}</h3>
          <button className="tc__sheet-x" onClick={onClose} aria-label="close">×</button>
        </div>
        <div className="tc__sheet-body">{children}</div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value, muted }) {
  return (
    <div className={`tc__review-row ${muted ? 'is-muted' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function SignaturePad({ onSign }) {
  const canvasRef = useRef(null)
  const [hasInk, setHasInk] = useState(false)
  const drawing = useRef(false)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [])

  function pos(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const t = e.touches ? e.touches[0] : e
    return {
      x: ((t.clientX - rect.left) / rect.width) * canvasRef.current.width,
      y: ((t.clientY - rect.top) / rect.height) * canvasRef.current.height,
    }
  }
  function start(e) {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }
  function move(e) {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setHasInk(true)
  }
  function end() {
    drawing.current = false
  }
  function clear() {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    setHasInk(false)
  }

  return (
    <div className="tc__sign">
      <canvas
        ref={canvasRef}
        width={560}
        height={150}
        className="tc__sign-canvas"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="tc__sign-line">Customer signature</div>
      <div className="tc__sign-actions">
        <button className="tc__ghost" onClick={clear} disabled={!hasInk}>
          Clear
        </button>
        <button className="tc__primary" onClick={onSign} disabled={!hasInk}>
          Accept &amp; lock
        </button>
      </div>
    </div>
  )
}
