# Prime Gutters — Concept Gallery

Local, no-backend React app that showcases **5 different UI/UX concept MVPs**
for the gutter-estimating workflow described in `prd.md`. These are concept
demos to tease out the direction we like best — not the full feature set.

## Run it

```bash
npm install
npm run dev      # opens http://localhost:5173
```

Other scripts:

```bash
npm run build    # production build to dist/
npm run preview  # serve the built bundle
npm test         # unit tests for the shared estimating engine
```

## The concepts

Open from the gallery home screen, or switch between them from the top bar.

| # | Concept | Direction | Status |
|---|---------|-----------|--------|
| 01 | **Blueprint CAD** | Engineering dark-grid takeoff canvas with a live estimate rail | ✅ Interactive |
| 02 | **Guided Wizard** | Step-by-step, one-question-at-a-time closing flow | ✅ Interactive |
| 03 | **Pro Dashboard** | Dense desktop estimating cockpit with line-item tables | ✅ Interactive |
| 04 | **Touch Canvas** | Tablet-first, gesture-driven, on-site signature | ✅ Interactive |
| 05 | **Proposal Studio** | Document/packet-first builder with photo markup, color chart & presentation export | ✅ Interactive |

### Blueprint CAD (interactive)
Click to drop points and sketch gutter runs on a 15px = 1ft grid (axis + grid
snapping). Finish a run or close a loop, add downspout drops via shorthand
(`AABA 15`), and watch linear footage, auto-detected miters/caps, components,
and the **turnkey total** compute live. Hit **Load sample** to see a populated
estimate instantly.

### Guided Wizard (interactive)
A light, friendly, one-question-at-a-time closing flow: enter the customer,
pick a preset roofline (auto-counts miters/caps), tap to add downspouts, set
add-ons and price with a slider, review the itemized turnkey quote, then capture
a real on-canvas **signature** that locks the contract. A running total follows
the rep the whole way. Same shared engine as Blueprint — no canvas drawing
required.

### Pro Dashboard (interactive)
A dense, QuickBooks-flavored office cockpit. The estimator types gutter runs
into a spreadsheet-style table (length, corners, bay miters) and downspouts as
shorthand codes (`AABA 22`) instead of drawing — a KPI rail, live line items,
and a **margin lever** that turns job cost into customer price update on every
keystroke. The same shared engine powers it: `lib/sections.js` synthesizes
real run geometry from the table rows so `buildEstimate` runs unchanged.

### Touch Canvas (interactive)
The tablet-first direction, closest to the shipping vision. A single light
"paper" canvas you sketch on by **tapping** to drop gutter corners (lines snap
to square and show live foot lengths), with a floating glass total chip, a
left tool rail (Draw / Drop / More), and a contextual bottom dock to undo,
close a loop, or start a new run. Switch to the **Drop** tool to tap downspouts
straight onto the diagram (tap a drop again to remove it). A slide-up sheet
handles valley shields + price, and a second sheet reviews the itemized quote
and captures a finger/Pencil **signature** that locks the contract. Same shared
engine — no new math.

### Proposal Studio (interactive)
The document/packet-first direction — it flips the model so the **deliverable is
the interface**. A page-layout app (left page-thumbnail rail, center 8.5×11
"paper", right contextual inspector) where you assemble the full proposal: a
branded **cover** (edit customer + accent), a **takeoff diagram**, **annotated
site photos** (click a photo to drop numbered markup pins and type notes — PRD
§3.3), a **manufacturer color chart** (selecting a Senox/Spectra swatch re-themes
the packet — PRD §3.4), and a **pricing & signature** page that locks on sign.
Hit **Presentation mode** to preview the clean, customer-facing export (PRD §3.6)
with editor chrome hidden. Same shared engine drives the numbers.

## Architecture

- **Vite + React**, plain JSX, no backend, no global state lib.
- `src/lib/estimating.js` — the shared, pure takeoff/pricing engine every
  concept draws from (LF, miter classification, drop parsing, waste, totals).
- `src/concepts/registry.js` — single source of truth for the gallery; add a
  concept here and it appears everywhere.
- Each concept lives in `src/concepts/<id>/` with its own scoped CSS.
