import { useMemo, useState } from 'react'
import {
  buildEstimate,
  parseDrop,
  fmtMoney,
  fmtFeet,
  DEFAULT_SETTINGS,
} from '../../lib/estimating.js'
import { sectionToRun } from '../../lib/sections.js'
import './dashboard.css'

// --- Pro Dashboard concept -------------------------------------------------
// A dense, QuickBooks-flavored estimating cockpit. Instead of drawing on a
// canvas, the estimator types runs into a spreadsheet-style table; the shared
// engine recomputes the takeoff and a margin lever turns cost into price.
// The tabular section -> geometric run conversion lives in lib/sections.js.

let _uid = 100
const uid = () => ++_uid

const SAMPLE_SECTIONS = () => [
  { id: uid(), label: 'Front eave', lengthFt: 42, corners: 2, bays: 0 },
  { id: uid(), label: 'Left side', lengthFt: 28, corners: 1, bays: 0 },
  { id: uid(), label: 'Rear w/ bay window', lengthFt: 36, corners: 1, bays: 2 },
]
const SAMPLE_DROPS = () => [
  { id: uid(), code: 'AB 12', qty: 3 },
  { id: uid(), code: 'AABA 22', qty: 1 },
]

export default function DashboardConcept() {
  const [customer, setCustomer] = useState({
    name: 'Gonzalez Residence',
    address: '1247 Oak Hollow Dr, San Antonio, TX',
    estNo: 'EST-2048',
  })
  const [sections, setSections] = useState(SAMPLE_SECTIONS)
  const [drops, setDrops] = useState(SAMPLE_DROPS)
  const [valleyShields, setValleyShields] = useState(2)
  const [pricePerFoot, setPricePerFoot] = useState(DEFAULT_SETTINGS.pricePerFoot)
  const [miscLabor, setMiscLabor] = useState(DEFAULT_SETTINGS.miscLabor)
  const [margin, setMargin] = useState(35)

  const estimate = useMemo(() => {
    const px = DEFAULT_SETTINGS.pxPerFoot
    const runs = sections.map((s) => sectionToRun(s, px)).filter(Boolean)
    const dropList = []
    for (const d of drops) {
      const n = Math.max(0, Math.floor(Number(d.qty) || 0))
      for (let i = 0; i < n; i++) dropList.push(parseDrop(d.code))
    }
    return buildEstimate({
      runs,
      drops: dropList,
      valleyShields: Math.max(0, Math.floor(Number(valleyShields) || 0)),
      settings: {
        pricePerFoot: Number(pricePerFoot) || 0,
        miscLabor: Number(miscLabor) || 0,
      },
    })
  }, [sections, drops, valleyShields, pricePerFoot, miscLabor])

  // The engine's turnkeyTotal is treated as cost basis; margin marks it up.
  const cost = estimate.turnkeyTotal
  const m = Math.min(80, Math.max(0, Number(margin) || 0))
  const price = m >= 100 ? cost : cost / (1 - m / 100)
  const profit = price - cost

  // --- section + drop mutators ---
  const addSection = () =>
    setSections((xs) => [
      ...xs,
      { id: uid(), label: `Run ${xs.length + 1}`, lengthFt: 0, corners: 0, bays: 0 },
    ])
  const editSection = (id, patch) =>
    setSections((xs) => xs.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const removeSection = (id) => setSections((xs) => xs.filter((s) => s.id !== id))

  const addDrop = () =>
    setDrops((xs) => [...xs, { id: uid(), code: 'AB 10', qty: 1 }])
  const editDrop = (id, patch) =>
    setDrops((xs) => xs.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  const removeDrop = (id) => setDrops((xs) => xs.filter((d) => d.id !== id))

  const loadSample = () => {
    setSections(SAMPLE_SECTIONS())
    setDrops(SAMPLE_DROPS())
    setValleyShields(2)
    setPricePerFoot(DEFAULT_SETTINGS.pricePerFoot)
    setMiscLabor(DEFAULT_SETTINGS.miscLabor)
    setMargin(35)
  }
  const clearAll = () => {
    setSections([])
    setDrops([])
    setValleyShields(0)
  }

  const c = estimate.counts
  const totalDrops = drops.reduce((a, d) => a + Math.max(0, Math.floor(Number(d.qty) || 0)), 0)

  return (
    <div className="dash">
      {/* Toolbar */}
      <header className="dash__toolbar">
        <div className="dash__brand">
          <span className="dash__logo">PS</span>
          <div>
            <div className="dash__brand-name">Prime Estimating</div>
            <div className="dash__brand-sub">Office cockpit</div>
          </div>
        </div>
        <div className="dash__cust">
          <input
            className="dash__cust-name"
            value={customer.name}
            onChange={(e) => setCustomer((x) => ({ ...x, name: e.target.value }))}
          />
          <input
            className="dash__cust-addr"
            value={customer.address}
            onChange={(e) => setCustomer((x) => ({ ...x, address: e.target.value }))}
          />
        </div>
        <div className="dash__toolbar-actions">
          <span className="dash__estno">{customer.estNo}</span>
          <button className="dash__btn dash__btn--ghost" onClick={clearAll}>
            Clear
          </button>
          <button className="dash__btn" onClick={loadSample}>
            Load sample
          </button>
        </div>
      </header>

      <div className="dash__body">
        {/* Left: KPI rail */}
        <aside className="dash__rail">
          <Kpi label="Total LF" value={fmtFeet(estimate.materialFeet)} hint="incl. waste" />
          <Kpi label="Raw measured" value={fmtFeet(estimate.rawFeet)} hint={`${fmtFeet(estimate.wasteFeet)} waste`} />
          <Kpi label="Miters" value={`${c.miters + c.bayMiters}`} hint={`${c.bayMiters} bay`} />
          <Kpi label="End caps" value={`${c.endCaps}`} hint="open runs" />
          <Kpi label="Downspouts" value={`${totalDrops}`} hint={`${c.elbowA + c.elbowB} elbows`} />
          <Kpi label="Downspout pipe" value={fmtFeet(estimate.downspoutFeet)} hint="vertical LF" />
        </aside>

        {/* Center: editable tables */}
        <main className="dash__center">
          <section className="dash__panel">
            <div className="dash__panel-head">
              <h3>Gutter runs</h3>
              <button className="dash__add" onClick={addSection}>+ Add run</button>
            </div>
            <table className="dash__table">
              <thead>
                <tr>
                  <th className="dash__col-label">Section</th>
                  <th>Length (ft)</th>
                  <th>Corners</th>
                  <th>Bay miters</th>
                  <th className="dash__col-num">LF</th>
                  <th aria-label="remove" />
                </tr>
              </thead>
              <tbody>
                {sections.length === 0 && (
                  <tr className="dash__empty">
                    <td colSpan={6}>No runs yet — add one or load the sample.</td>
                  </tr>
                )}
                {sections.map((s) => {
                  const run = sectionToRun(s, DEFAULT_SETTINGS.pxPerFoot)
                  const lf = run
                    ? run.points.reduce((acc, p, i) =>
                        i === 0 ? 0 : acc + Math.hypot(p.x - run.points[i - 1].x, p.y - run.points[i - 1].y), 0) /
                      DEFAULT_SETTINGS.pxPerFoot
                    : 0
                  return (
                    <tr key={s.id}>
                      <td>
                        <input
                          className="dash__cell dash__cell--text"
                          value={s.label}
                          onChange={(e) => editSection(s.id, { label: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          className="dash__cell"
                          value={s.lengthFt}
                          onChange={(e) => editSection(s.id, { lengthFt: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          className="dash__cell"
                          value={s.corners}
                          onChange={(e) => editSection(s.id, { corners: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          className="dash__cell"
                          value={s.bays}
                          onChange={(e) => editSection(s.id, { bays: e.target.value })}
                        />
                      </td>
                      <td className="dash__col-num dash__mono">{lf.toFixed(1)}</td>
                      <td>
                        <button
                          className="dash__row-del"
                          onClick={() => removeSection(s.id)}
                          aria-label="Remove run"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          <section className="dash__panel">
            <div className="dash__panel-head">
              <h3>Downspout drops</h3>
              <button className="dash__add" onClick={addDrop}>+ Add drop</button>
            </div>
            <table className="dash__table">
              <thead>
                <tr>
                  <th className="dash__col-label">Code (e.g. AABA 15)</th>
                  <th>Qty</th>
                  <th className="dash__col-num">Parsed</th>
                  <th aria-label="remove" />
                </tr>
              </thead>
              <tbody>
                {drops.length === 0 && (
                  <tr className="dash__empty">
                    <td colSpan={4}>No drops yet.</td>
                  </tr>
                )}
                {drops.map((d) => {
                  const p = parseDrop(d.code)
                  const parts = [
                    p.elbowA && `${p.elbowA}A`,
                    p.elbowB && `${p.elbowB}B`,
                    p.offset && `${p.offset}off`,
                    p.pipeFeet && `${p.pipeFeet}ft`,
                  ].filter(Boolean)
                  return (
                    <tr key={d.id}>
                      <td>
                        <input
                          className="dash__cell dash__cell--text dash__mono"
                          value={d.code}
                          onChange={(e) => editDrop(d.id, { code: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          className="dash__cell"
                          value={d.qty}
                          onChange={(e) => editDrop(d.id, { qty: e.target.value })}
                        />
                      </td>
                      <td className="dash__col-num dash__parsed">
                        {parts.length ? parts.join(' · ') : '—'}
                      </td>
                      <td>
                        <button
                          className="dash__row-del"
                          onClick={() => removeDrop(d.id)}
                          aria-label="Remove drop"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="dash__addon-row">
              <label>
                <span>Valley shields</span>
                <input
                  type="number"
                  min="0"
                  className="dash__cell"
                  value={valleyShields}
                  onChange={(e) => setValleyShields(e.target.value)}
                />
              </label>
            </div>
          </section>
        </main>

        {/* Right: pricing & margin */}
        <aside className="dash__pricing">
          <div className="dash__pricing-head">Estimate summary</div>

          <div className="dash__lines">
            <LineRow
              label="Gutter material & install"
              sub={`${fmtFeet(estimate.materialFeet)} × ${fmtMoney(Number(pricePerFoot) || 0)}`}
              value={fmtMoney(estimate.gutterCost)}
            />
            {estimate.componentLines.map((l) => (
              <LineRow
                key={l.key}
                label={l.label}
                sub={`${l.qty} ${l.unit} × ${fmtMoney(l.price)}`}
                value={fmtMoney(l.qty * l.price)}
                small
              />
            ))}
            <LineRow label="Misc / labor" value={fmtMoney(estimate.miscLabor)} small />
          </div>

          <div className="dash__controls">
            <label className="dash__control">
              <span>Price / LF — {fmtMoney(Number(pricePerFoot) || 0)}</span>
              <input
                type="range"
                min="8"
                max="22"
                step="0.5"
                value={pricePerFoot}
                onChange={(e) => setPricePerFoot(e.target.value)}
              />
            </label>
            <label className="dash__control">
              <span>Misc / labor</span>
              <input
                type="number"
                min="0"
                className="dash__cell"
                value={miscLabor}
                onChange={(e) => setMiscLabor(e.target.value)}
              />
            </label>
            <label className="dash__control">
              <span>Target margin — {m}%</span>
              <input
                type="range"
                min="0"
                max="70"
                step="1"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
              />
            </label>
          </div>

          <div className="dash__totals">
            <div className="dash__total-row">
              <span>Job cost</span>
              <span className="dash__mono">{fmtMoney(cost)}</span>
            </div>
            <div className="dash__total-row dash__total-row--profit">
              <span>Margin ({m}%)</span>
              <span className="dash__mono">{fmtMoney(profit)}</span>
            </div>
            <div className="dash__total-row dash__total-row--grand">
              <span>Customer price</span>
              <span className="dash__mono">{fmtMoney(price)}</span>
            </div>
          </div>

          <button className="dash__cta">Generate proposal PDF →</button>
          <div className="dash__pricing-foot">
            Margin & misc fees are hidden on the customer-facing export.
          </div>
        </aside>
      </div>
    </div>
  )
}

function Kpi({ label, value, hint }) {
  return (
    <div className="dash__kpi">
      <div className="dash__kpi-label">{label}</div>
      <div className="dash__kpi-value">{value}</div>
      <div className="dash__kpi-hint">{hint}</div>
    </div>
  )
}

function LineRow({ label, sub, value, small }) {
  return (
    <div className={`dash__line ${small ? 'is-small' : ''}`}>
      <div className="dash__line-main">
        <span className="dash__line-label">{label}</span>
        {sub && <span className="dash__line-sub">{sub}</span>}
      </div>
      <span className="dash__line-value dash__mono">{value}</span>
    </div>
  )
}
