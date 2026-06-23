import { useMemo, useRef, useState, useEffect } from 'react'
import {
  buildEstimate,
  parseDrop,
  fmtMoney,
  fmtFeet,
  DEFAULT_SETTINGS,
} from '../../lib/estimating.js'
import './wizard.css'

// Preset rooflines. Each maps to the shared engine's `runs` shape so the
// wizard produces a real takeoff without the rep ever touching a canvas.
const ROOFLINES = [
  {
    id: 'ranch',
    label: 'Simple ranch',
    hint: 'One straight front run, 2 corners',
    runs: [
      {
        closed: false,
        points: [
          { x: 20, y: 30 },
          { x: 130, y: 30 },
          { x: 130, y: 78 },
        ],
      },
    ],
  },
  {
    id: 'lshape',
    label: 'L-shaped home',
    hint: 'Front + side wing, a few miters',
    runs: [
      {
        closed: false,
        points: [
          { x: 20, y: 24 },
          { x: 92, y: 24 },
          { x: 92, y: 60 },
          { x: 140, y: 60 },
          { x: 140, y: 92 },
        ],
      },
    ],
  },
  {
    id: 'full',
    label: 'Full wrap',
    hint: 'Gutters all the way around (closed loop)',
    runs: [
      {
        closed: true,
        points: [
          { x: 26, y: 24 },
          { x: 134, y: 24 },
          { x: 134, y: 92 },
          { x: 26, y: 92 },
        ],
      },
    ],
  },
]

// One-tap downspout presets, each expressed in the engine's shorthand.
const DROP_PRESETS = [
  { id: 'std', label: 'Standard drop', code: 'AB 12', sub: '2 elbows · 12 ft' },
  { id: 'long', label: 'Tall / 2-story', code: 'AABA 22', sub: '4 elbows · 22 ft' },
  { id: 'offset', label: 'Roof offset', code: 'AOA 14', sub: 'elbows + offset' },
]

const STEPS = ['Customer', 'Roofline', 'Downspouts', 'Add-ons', 'Review', 'Sign']

export default function WizardConcept() {
  const [step, setStep] = useState(0)
  const [customer, setCustomer] = useState({ name: '', address: '' })
  const [roofId, setRoofId] = useState(null)
  const [dropCounts, setDropCounts] = useState({}) // presetId -> count
  const [valleyShields, setValleyShields] = useState(0)
  const [pricePerFoot, setPricePerFoot] = useState(DEFAULT_SETTINGS.pricePerFoot)
  const [signed, setSigned] = useState(false)

  const roof = ROOFLINES.find((r) => r.id === roofId)

  const drops = useMemo(() => {
    const list = []
    for (const preset of DROP_PRESETS) {
      const n = dropCounts[preset.id] || 0
      for (let i = 0; i < n; i++) list.push(parseDrop(preset.code))
    }
    return list
  }, [dropCounts])

  const settings = { ...DEFAULT_SETTINGS, pricePerFoot: Number(pricePerFoot) || 0 }
  const estimate = useMemo(
    () => buildEstimate({ runs: roof?.runs || [], drops, valleyShields, settings }),
    [roof, drops, valleyShields, settings.pricePerFoot]
  )

  const totalDrops = Object.values(dropCounts).reduce((a, b) => a + b, 0)

  // Per-step gate so reps can't skip required info.
  const canAdvance = [
    customer.name.trim().length > 0,
    !!roofId,
    true, // downspouts optional
    true, // add-ons optional
    true, // review
    signed,
  ][step]

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  function setDrop(id, delta) {
    setDropCounts((d) => ({ ...d, [id]: Math.max(0, (d[id] || 0) + delta) }))
  }

  function restart() {
    setStep(0)
    setCustomer({ name: '', address: '' })
    setRoofId(null)
    setDropCounts({})
    setValleyShields(0)
    setPricePerFoot(DEFAULT_SETTINGS.pricePerFoot)
    setSigned(false)
  }

  return (
    <div className="wz">
      <div className="wz__shell">
        <Progress step={step} />

        <div className="wz__stage">
          {step === 0 && (
            <Step
              title="Who's this estimate for?"
              sub="Start with the homeowner — it personalizes the proposal."
            >
              <label className="wz__field">
                <span>Customer name</span>
                <input
                  autoFocus
                  value={customer.name}
                  onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                  placeholder="e.g. Maria Gonzalez"
                />
              </label>
              <label className="wz__field">
                <span>Property address (optional)</span>
                <input
                  value={customer.address}
                  onChange={(e) => setCustomer((c) => ({ ...c, address: e.target.value }))}
                  placeholder="123 Oak St, San Antonio, TX"
                />
              </label>
            </Step>
          )}

          {step === 1 && (
            <Step
              title="What does the roofline look like?"
              sub="Pick the closest match — we'll auto-count corners, miters & end caps."
            >
              <div className="wz__choices">
                {ROOFLINES.map((r) => (
                  <button
                    key={r.id}
                    className={`wz__choice ${roofId === r.id ? 'is-picked' : ''}`}
                    onClick={() => setRoofId(r.id)}
                  >
                    <RoofThumb runs={r.runs} active={roofId === r.id} />
                    <div className="wz__choice-label">{r.label}</div>
                    <div className="wz__choice-hint">{r.hint}</div>
                  </button>
                ))}
              </div>
              {roof && (
                <div className="wz__inline-stat">
                  Detected <strong>{fmtFeet(estimate.rawFeet)}</strong> of gutter ·{' '}
                  <strong>{estimate.counts.miters + estimate.counts.bayMiters}</strong> miters ·{' '}
                  <strong>{estimate.counts.endCaps}</strong> end caps
                </div>
              )}
            </Step>
          )}

          {step === 2 && (
            <Step
              title="How many downspouts?"
              sub="Tap to add the drops you see on site. You can mix types."
            >
              <div className="wz__droplist">
                {DROP_PRESETS.map((p) => (
                  <div key={p.id} className="wz__droprow">
                    <div className="wz__droprow-info">
                      <div className="wz__droprow-label">{p.label}</div>
                      <div className="wz__droprow-sub">{p.sub}</div>
                    </div>
                    <div className="wz__stepper">
                      <button onClick={() => setDrop(p.id, -1)} aria-label="remove">−</button>
                      <span>{dropCounts[p.id] || 0}</span>
                      <button onClick={() => setDrop(p.id, 1)} aria-label="add">+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="wz__inline-stat">
                {totalDrops} drop{totalDrops === 1 ? '' : 's'} ·{' '}
                <strong>{estimate.counts.elbowA + estimate.counts.elbowB}</strong> elbows ·{' '}
                <strong>{fmtFeet(estimate.downspoutFeet)}</strong> of pipe
              </div>
            </Step>
          )}

          {step === 3 && (
            <Step
              title="Any add-ons & your price?"
              sub="Valley shields protect against debris where roof planes meet."
            >
              <div className="wz__addon">
                <div className="wz__droprow-info">
                  <div className="wz__droprow-label">Valley shields</div>
                  <div className="wz__droprow-sub">{fmtMoney(22)} each, installed</div>
                </div>
                <div className="wz__stepper">
                  <button onClick={() => setValleyShields((v) => Math.max(0, v - 1))}>−</button>
                  <span>{valleyShields}</span>
                  <button onClick={() => setValleyShields((v) => v + 1)}>+</button>
                </div>
              </div>
              <label className="wz__field">
                <span>Price per linear foot — {fmtMoney(Number(pricePerFoot) || 0)}/LF</span>
                <input
                  type="range"
                  min="8"
                  max="22"
                  step="0.5"
                  value={pricePerFoot}
                  onChange={(e) => setPricePerFoot(e.target.value)}
                />
              </label>
              <div className="wz__inline-stat">
                Material {fmtFeet(estimate.materialFeet)} (incl.{' '}
                {fmtFeet(estimate.wasteFeet)} waste) ×{' '}
                {fmtMoney(Number(pricePerFoot) || 0)} ={' '}
                <strong>{fmtMoney(estimate.gutterCost)}</strong>
              </div>
            </Step>
          )}

          {step === 4 && (
            <Step
              title="Here's the turnkey quote"
              sub={`For ${customer.name || 'the homeowner'}${customer.address ? ' · ' + customer.address : ''}`}
            >
              <div className="wz__quote">
                <QuoteRow label="Gutter material & install" value={fmtMoney(estimate.gutterCost)} />
                {estimate.componentLines.map((l) => (
                  <QuoteRow
                    key={l.key}
                    label={`${l.label} ×${l.qty}`}
                    value={fmtMoney(l.qty * l.price)}
                    muted
                  />
                ))}
                <QuoteRow label="Misc / labor" value={fmtMoney(estimate.miscLabor)} muted />
                <div className="wz__quote-total">
                  <span>Turnkey total</span>
                  <strong>{fmtMoney(estimate.turnkeyTotal)}</strong>
                </div>
              </div>
              <div className="wz__inline-stat">
                {fmtFeet(estimate.materialFeet)} of seamless gutter ·{' '}
                {estimate.counts.dropCount} downspouts · price locks on signature.
              </div>
            </Step>
          )}

          {step === 5 && (
            <Step
              title={signed ? 'Contract executed 🎉' : 'Sign to lock it in'}
              sub={
                signed
                  ? 'Pricing and terms are now locked. A clean PDF would export here.'
                  : 'By signing, the customer agrees to the Prime Seamless terms & the total above.'
              }
            >
              {!signed ? (
                <>
                  <div className="wz__terms">
                    Prime Seamless Gutters &amp; Roofing standard terms apply. The{' '}
                    <strong>{fmtMoney(estimate.turnkeyTotal)}</strong> turnkey total covers
                    materials, fabrication, installation, and cleanup. 50% deposit due at
                    signing; balance on completion. Workmanship warranted 5 years.
                  </div>
                  <SignaturePad onSign={() => setSigned(true)} />
                </>
              ) : (
                <div className="wz__done">
                  <div className="wz__done-total">{fmtMoney(estimate.turnkeyTotal)}</div>
                  <div className="wz__done-sub">
                    Signed by {customer.name || 'customer'} · locked
                  </div>
                  <button className="wz__btn wz__btn--ghost" onClick={restart}>
                    Start a new estimate
                  </button>
                </div>
              )}
            </Step>
          )}
        </div>

        {!(step === 5 && signed) && (
          <footer className="wz__nav">
            <button className="wz__btn wz__btn--ghost" onClick={back} disabled={step === 0}>
              Back
            </button>
            <div className="wz__running">
              <span>Running total</span>
              <strong>{fmtMoney(estimate.turnkeyTotal)}</strong>
            </div>
            {step < STEPS.length - 1 ? (
              <button className="wz__btn" onClick={next} disabled={!canAdvance}>
                Continue
              </button>
            ) : (
              <button className="wz__btn" disabled={!signed}>
                {signed ? 'Done' : 'Sign above'}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}

function Progress({ step }) {
  return (
    <div className="wz__progress">
      {STEPS.map((label, i) => (
        <div
          key={label}
          className={`wz__pstep ${i === step ? 'is-active' : ''} ${i < step ? 'is-done' : ''}`}
        >
          <span className="wz__pdot">{i < step ? '✓' : i + 1}</span>
          <span className="wz__plabel">{label}</span>
        </div>
      ))}
    </div>
  )
}

function Step({ title, sub, children }) {
  return (
    <div className="wz__step">
      <h2 className="wz__title">{title}</h2>
      <p className="wz__sub">{sub}</p>
      <div className="wz__body">{children}</div>
    </div>
  )
}

function QuoteRow({ label, value, muted }) {
  return (
    <div className={`wz__quote-row ${muted ? 'is-muted' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function RoofThumb({ runs, active }) {
  const color = active ? '#0e9f6e' : '#94a3b8'
  return (
    <svg className="wz__thumb" viewBox="0 0 160 110" aria-hidden="true">
      {runs.map((run, i) => {
        const pts = run.points.map((p) => `${p.x},${p.y}`).join(' ')
        return run.closed ? (
          <polygon key={i} points={pts} fill={active ? 'rgba(14,159,110,0.12)' : 'transparent'} stroke={color} strokeWidth="3" strokeLinejoin="round" />
        ) : (
          <polyline key={i} points={pts} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        )
      })}
    </svg>
  )
}

function SignaturePad({ onSign }) {
  const canvasRef = useRef(null)
  const [hasInk, setHasInk] = useState(false)
  const drawing = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
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
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  return (
    <div className="wz__sign">
      <canvas
        ref={canvasRef}
        width={520}
        height={160}
        className="wz__canvas"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="wz__sign-line">Customer signature</div>
      <div className="wz__sign-actions">
        <button className="wz__btn wz__btn--ghost" onClick={clear} disabled={!hasInk}>
          Clear
        </button>
        <button className="wz__btn" onClick={onSign} disabled={!hasInk}>
          Accept &amp; lock contract
        </button>
      </div>
    </div>
  )
}
