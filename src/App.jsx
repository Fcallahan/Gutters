import { useState } from 'react'
import { CONCEPTS, getConcept } from './concepts/registry.js'
import './App.css'

export default function App() {
  const [activeId, setActiveId] = useState(null)
  const active = activeId ? getConcept(activeId) : null

  if (active) {
    const C = active.Component
    return (
      <div className="concept-host" style={{ '--accent': active.accent }}>
        <header className="concept-host__bar">
          <button className="concept-host__back" onClick={() => setActiveId(null)}>
            ← All concepts
          </button>
          <div className="concept-host__title">
            <span className="concept-host__dot" />
            {active.name}
            <span className="concept-host__tag">{active.tagline}</span>
          </div>
          <nav className="concept-host__switch">
            {CONCEPTS.map((c) => (
              <button
                key={c.id}
                className={c.id === activeId ? 'is-active' : ''}
                style={{ '--accent': c.accent }}
                onClick={() => setActiveId(c.id)}
                title={c.name}
              >
                {c.name}
              </button>
            ))}
          </nav>
        </header>
        <main className="concept-host__stage">
          <C />
        </main>
      </div>
    )
  }

  return <Gallery onOpen={setActiveId} />
}

function Gallery({ onOpen }) {
  return (
    <div className="gallery">
      <div className="gallery__inner">
        <header className="gallery__head">
          <div className="gallery__kicker">Prime Seamless Gutters &amp; Roofing</div>
          <h1 className="gallery__title">Estimating App — Concept Gallery</h1>
          <p className="gallery__lede">
            Five different UI/UX directions for the same takeoff-to-contract workflow.
            These are <strong>concept demos</strong> — explore the feel of each approach,
            not the full feature set. Pick the directions worth building.
          </p>
        </header>

        <div className="gallery__grid">
          {CONCEPTS.map((c, i) => (
            <button
              key={c.id}
              className="card"
              style={{ '--accent': c.accent }}
              onClick={() => onOpen(c.id)}
            >
              <div className="card__top">
                <span className="card__num">{String(i + 1).padStart(2, '0')}</span>
                <span className={`card__status card__status--${c.status}`}>
                  {c.status === 'interactive' ? 'Interactive' : 'Preview'}
                </span>
              </div>
              <h2 className="card__name">{c.name}</h2>
              <div className="card__tagline">{c.tagline}</div>
              <p className="card__blurb">{c.blurb}</p>
              <div className="card__foot">
                <span className="card__audience">{c.audience}</span>
                <span className="card__open">Open →</span>
              </div>
            </button>
          ))}
        </div>

        <footer className="gallery__foot">
          Local concept build · no backend · React + Vite — based on the Prime Seamless PRD
        </footer>
      </div>
    </div>
  )
}
