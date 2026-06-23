import { useMemo, useState } from 'react'
import {
  buildEstimate,
  parseDrop,
  fmtMoney,
  fmtFeet,
  DEFAULT_SETTINGS,
} from '../../lib/estimating.js'
import './studio.css'

// Proposal Studio — the document/packet-first direction. Unlike the other
// concepts (which are takeoff-canvas first), this one treats the *deliverable*
// as the interface: you assemble a multi-page 8.5×11 proposal packet — cover,
// diagram, marked-up site photos, manufacturer color chart, and a locked
// pricing/signature page — then hit "Presentation mode" to preview the clean,
// customer-facing export described in PRD §3.6. Same shared estimating engine.

// A fixed sample takeoff so the packet always has real numbers to present.
const SAMPLE_RUN = {
  closed: false,
  points: [
    { x: 40, y: 60 },
    { x: 250, y: 60 },
    { x: 250, y: 150 },
    { x: 420, y: 150 },
  ],
}
const SAMPLE_DROPS = ['AB 12', 'AABA 22', 'AOA 14']

// Manufacturer color chart — "appended color chart" from PRD §3.4.
const COLORS = [
  { id: 'white', name: 'Classic White', hex: '#f4f4f0', brand: 'Senox' },
  { id: 'almond', name: 'Almond', hex: '#e7dcc4', brand: 'Senox' },
  { id: 'clay', name: 'Musket Clay', hex: '#b08968', brand: 'Spectra' },
  { id: 'bronze', name: 'Royal Bronze', hex: '#5c4326', brand: 'Spectra' },
  { id: 'green', name: 'Hunter Green', hex: '#33503b', brand: 'Senox' },
  { id: 'black', name: 'Matte Black', hex: '#22252a', brand: 'Spectra' },
]

// Pre-staged "site photos" rendered as CSS gradients (no assets, no network),
// each carrying markup pins that demonstrate the annotation workflow.
const PHOTOS = [
  {
    id: 'front',
    label: 'Front elevation',
    grad: 'linear-gradient(160deg,#8aa0b8,#cdd7e0 55%,#9fb0a0)',
  },
  {
    id: 'corner',
    label: 'NE corner / fascia',
    grad: 'linear-gradient(150deg,#b9a88f,#e3d6bf 60%,#8d9a86)',
  },
  {
    id: 'rear',
    label: 'Rear downspout run',
    grad: 'linear-gradient(170deg,#7d8aa0,#b6c0cf 50%,#6f7d6c)',
  },
]

const PAGES = [
  { id: 'cover', label: 'Cover', n: 1 },
  { id: 'diagram', label: 'Diagram', n: 2 },
  { id: 'photos', label: 'Site photos', n: 3 },
  { id: 'colors', label: 'Color chart', n: 4 },
  { id: 'pricing', label: 'Pricing & sign', n: 5 },
]

export default function StudioConcept() {
  const [pageId, setPageId] = useState('cover')
  const [customer, setCustomer] = useState({
    name: 'Maria Gonzalez',
    address: '123 Oak St, San Antonio, TX',
  })
  const [colorId, setColorId] = useState('bronze')
  // markup pins per photo: { photoId: [{ id, x, y, note }] }
  const [pins, setPins] = useState({
    front: [{ id: 'p1', x: 32, y: 40, note: 'Fascia wrap included along front' }],
    corner: [{ id: 'p2', x: 58, y: 55, note: 'Rot here — replace before install' }],
    rear: [],
  })
  const [signed, setSigned] = useState(false)
  const [present, setPresent] = useState(false)

  const color = COLORS.find((c) => c.id === colorId) || COLORS[0]
  const estimate = useMemo(
    () =>
      buildEstimate({
        runs: [SAMPLE_RUN],
        drops: SAMPLE_DROPS.map((d) => parseDrop(d)),
        valleyShields: 2,
        settings: DEFAULT_SETTINGS,
      }),
    []
  )

  function addPin(photoId, e) {
    if (present || signed) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPins((p) => ({
      ...p,
      [photoId]: [
        ...(p[photoId] || []),
        { id: `${photoId}-${(p[photoId] || []).length}-${Math.round(x)}`, x, y, note: 'New note' },
      ],
    }))
  }
  function editPin(photoId, pinId, note) {
    setPins((p) => ({
      ...p,
      [photoId]: p[photoId].map((pin) => (pin.id === pinId ? { ...pin, note } : pin)),
    }))
  }
  function removePin(photoId, pinId) {
    setPins((p) => ({ ...p, [photoId]: p[photoId].filter((pin) => pin.id !== pinId) }))
  }

  const pinTotal = Object.values(pins).reduce((a, list) => a + list.length, 0)

  return (
    <div className={`st ${present ? 'is-present' : ''}`}>
      {/* ---- page thumbnail rail ---- */}
      {!present && (
        <aside className="st__rail">
          <div className="st__rail-head">Proposal packet</div>
          {PAGES.map((pg) => (
            <button
              key={pg.id}
              className={`st__thumb ${pg.id === pageId ? 'is-active' : ''}`}
              onClick={() => setPageId(pg.id)}
            >
              <span className="st__thumb-n">{pg.n}</span>
              <span className="st__thumb-label">{pg.label}</span>
            </button>
          ))}
          <div className="st__rail-foot">
            <div className="st__chip">
              <span>Turnkey</span>
              <strong>{fmtMoney(estimate.turnkeyTotal)}</strong>
            </div>
            {signed && <div className="st__locked">🔒 Locked</div>}
          </div>
        </aside>
      )}

      {/* ---- the page stage ---- */}
      <div className="st__stage">
        {present && (
          <div className="st__present-bar">
            <span>Presentation preview · customer-facing export</span>
            <button onClick={() => setPresent(false)}>Exit preview</button>
          </div>
        )}

        <div className="st__scroll">
          {(present ? PAGES : PAGES.filter((p) => p.id === pageId)).map((pg) => (
            <Paper key={pg.id} accent={color.hex} brandInk={brandInk(color.hex)}>
              {pg.id === 'cover' && (
                <CoverPage
                  customer={customer}
                  setCustomer={setCustomer}
                  color={color}
                  estimate={estimate}
                  present={present}
                />
              )}
              {pg.id === 'diagram' && <DiagramPage estimate={estimate} color={color} />}
              {pg.id === 'photos' && (
                <PhotosPage
                  pins={pins}
                  addPin={addPin}
                  editPin={editPin}
                  removePin={removePin}
                  present={present}
                />
              )}
              {pg.id === 'colors' && (
                <ColorsPage colorId={colorId} setColorId={setColorId} present={present} />
              )}
              {pg.id === 'pricing' && (
                <PricingPage
                  estimate={estimate}
                  customer={customer}
                  signed={signed}
                  setSigned={setSigned}
                  present={present}
                />
              )}
            </Paper>
          ))}
        </div>
      </div>

      {/* ---- inspector (contextual, right) ---- */}
      {!present && (
        <aside className="st__inspector">
          <div className="st__insp-head">{PAGES.find((p) => p.id === pageId)?.label}</div>
          {pageId === 'cover' && (
            <>
              <Field label="Customer name" value={customer.name}
                onChange={(v) => setCustomer((c) => ({ ...c, name: v }))} />
              <Field label="Property address" value={customer.address}
                onChange={(v) => setCustomer((c) => ({ ...c, address: v }))} />
              <p className="st__insp-note">Edits flow straight onto the cover page.</p>
            </>
          )}
          {pageId === 'diagram' && (
            <ul className="st__insp-stats">
              <li><span>Total gutter</span><strong>{fmtFeet(estimate.materialFeet)}</strong></li>
              <li><span>Miters</span><strong>{estimate.counts.miters + estimate.counts.bayMiters}</strong></li>
              <li><span>End caps</span><strong>{estimate.counts.endCaps}</strong></li>
              <li><span>Downspouts</span><strong>{estimate.counts.dropCount}</strong></li>
            </ul>
          )}
          {pageId === 'photos' && (
            <p className="st__insp-note">
              Click anywhere on a photo to drop a numbered markup pin, then edit
              its note. <strong>{pinTotal}</strong> annotation{pinTotal === 1 ? '' : 's'} so far.
            </p>
          )}
          {pageId === 'colors' && (
            <p className="st__insp-note">
              Selecting a color updates the proposal accent and the spec line on
              the pricing page — the chosen swatch is highlighted for the crew.
            </p>
          )}
          {pageId === 'pricing' && (
            <p className="st__insp-note">
              {signed
                ? 'Signed — totals and terms are locked against post-signature edits.'
                : 'Capture the signature on the page to lock pricing & terms.'}
            </p>
          )}

          <button className="st__present-btn" onClick={() => setPresent(true)}>
            ▶ Presentation mode
          </button>
        </aside>
      )}
    </div>
  )
}

function brandInk(hex) {
  // pick readable ink for a swatch background
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1f2937' : '#f8fafc'
}

function Paper({ children, accent }) {
  return (
    <div className="st__paper" style={{ '--paper-accent': accent }}>
      {children}
    </div>
  )
}

function CoverPage({ customer, color, estimate, present }) {
  return (
    <div className="st__cover">
      <div className="st__cover-band" style={{ background: color.hex, color: brandInk(color.hex) }}>
        <div className="st__cover-co">Prime Seamless Gutters &amp; Roofing</div>
        <div className="st__cover-sub">San Antonio, TX · est. 2011</div>
      </div>
      <div className="st__cover-body">
        <div className="st__cover-kicker">Turnkey Gutter Proposal</div>
        <h1 className="st__cover-name">{customer.name || 'Customer name'}</h1>
        <div className="st__cover-addr">{customer.address || 'Property address'}</div>
        <div className="st__cover-total">
          <span>Turnkey total</span>
          <strong>{fmtMoney(estimate.turnkeyTotal)}</strong>
        </div>
        <div className="st__cover-spec">
          {fmtFeet(estimate.materialFeet)} seamless gutter · {color.name} ({color.brand})
        </div>
      </div>
      {present && <div className="st__pagefoot">Page 1 · Cover</div>}
    </div>
  )
}

function DiagramPage({ estimate, color }) {
  const pts = SAMPLE_RUN.points
  const d = 'M ' + pts.map((p) => `${p.x} ${p.y}`).join(' L ')
  return (
    <div className="st__page">
      <PageTitle>Takeoff Diagram</PageTitle>
      <svg className="st__diagram" viewBox="0 0 480 220">
        <defs>
          <pattern id="st-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="#e5e7eb" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="480" height="220" fill="url(#st-grid)" />
        <path d={d} fill="none" stroke={color.hex} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="5" fill={color.hex} />
        ))}
        {pts.slice(1).map((p, i) => {
          const a = pts[i]
          return (
            <text key={i} x={(a.x + p.x) / 2} y={(a.y + p.y) / 2 - 8} className="st__dim">
              {((Math.hypot(p.x - a.x, p.y - a.y)) / DEFAULT_SETTINGS.pxPerFoot).toFixed(0)}′
            </text>
          )
        })}
      </svg>
      <div className="st__legend">
        {estimate.componentLines.map((l) => (
          <span key={l.key} className="st__legend-item">{l.label}: <strong>{l.qty}</strong></span>
        ))}
      </div>
    </div>
  )
}

function PhotosPage({ pins, addPin, editPin, removePin, present }) {
  return (
    <div className="st__page">
      <PageTitle>Annotated Site Photos</PageTitle>
      <div className="st__photos">
        {PHOTOS.map((ph) => (
          <figure key={ph.id} className="st__photo">
            <div className="st__photo-img" style={{ background: ph.grad }} onClick={(e) => addPin(ph.id, e)}>
              {(pins[ph.id] || []).map((pin, i) => (
                <span key={pin.id} className="st__pin" style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  onClick={(e) => { e.stopPropagation(); if (!present) removePin(ph.id, pin.id) }}
                  title={present ? pin.note : 'Click to remove'}>
                  {i + 1}
                </span>
              ))}
            </div>
            <figcaption>{ph.label}</figcaption>
            <ul className="st__notes">
              {(pins[ph.id] || []).map((pin, i) => (
                <li key={pin.id}>
                  <span className="st__note-n">{i + 1}</span>
                  {present ? (
                    <span>{pin.note}</span>
                  ) : (
                    <input value={pin.note} onChange={(e) => editPin(ph.id, pin.id, e.target.value)} />
                  )}
                </li>
              ))}
              {(pins[ph.id] || []).length === 0 && <li className="st__note-empty">No markup yet</li>}
            </ul>
          </figure>
        ))}
      </div>
    </div>
  )
}

function ColorsPage({ colorId, setColorId, present }) {
  return (
    <div className="st__page">
      <PageTitle>Manufacturer Color Chart</PageTitle>
      <div className="st__swatches">
        {COLORS.map((c) => (
          <button key={c.id} className={`st__swatch ${c.id === colorId ? 'is-picked' : ''}`}
            onClick={() => !present && setColorId(c.id)} disabled={present}>
            <span className="st__swatch-chip" style={{ background: c.hex }} />
            <span className="st__swatch-name">{c.name}</span>
            <span className="st__swatch-brand">{c.brand}</span>
            {c.id === colorId && <span className="st__swatch-tag">Selected</span>}
          </button>
        ))}
      </div>
      <p className="st__page-note">Senox &amp; Spectra seamless aluminum · 20-year finish warranty.</p>
    </div>
  )
}

function PricingPage({ estimate, customer, signed, setSigned, present }) {
  return (
    <div className="st__page">
      <PageTitle>Pricing &amp; Authorization</PageTitle>
      <div className="st__quote">
        <Row label="Seamless gutter & install" value={fmtMoney(estimate.gutterCost)} />
        {estimate.componentLines.map((l) => (
          <Row key={l.key} muted label={`${l.label} ×${l.qty}`} value={fmtMoney(l.qty * l.price)} />
        ))}
        <Row muted label="Misc / labor" value={fmtMoney(estimate.miscLabor)} />
        <div className="st__quote-total">
          <span>Turnkey total</span>
          <strong>{fmtMoney(estimate.turnkeyTotal)}</strong>
        </div>
      </div>
      <div className="st__sigbox">
        <div className="st__sig-terms">
          Prime Seamless standard terms apply. Signature locks the total above and
          authorizes the work. 50% deposit at signing; balance on completion.
        </div>
        {signed ? (
          <div className="st__sig-done">
            <span className="st__sig-script">{customer.name || 'Customer'}</span>
            <span className="st__sig-meta">✓ Signed &amp; locked</span>
          </div>
        ) : present ? (
          <div className="st__sig-line">x ______________________________</div>
        ) : (
          <button className="st__sig-btn" onClick={() => setSigned(true)}>
            Capture signature &amp; lock
          </button>
        )}
      </div>
    </div>
  )
}

function PageTitle({ children }) {
  return <h2 className="st__page-title">{children}</h2>
}
function Row({ label, value, muted }) {
  return (
    <div className={`st__row ${muted ? 'is-muted' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
function Field({ label, value, onChange }) {
  return (
    <label className="st__field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
