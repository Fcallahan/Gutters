# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What's here

Two unrelated codebases in one repo:

| Path | What it is |
|---|---|
| `PrimeGutterEstimator/PrimeGutterEstimator/gutter-estimator.html` | **The actual product.** A ~5,000-line single-file offline app (one `<style>`, one `<script>`, no build step, no dependencies). |
| `PrimeGutterEstimator/PrimeGutterEstimator/*.swift` + `PrimeGutterEstimator.xcodeproj` | A thin SwiftUI/`WKWebView` shell that bundles that HTML as an iPad app. ~3 small files. |
| `concepts/` | A React/Vite gallery of 5 throwaway UI/UX concept demos built against `concepts/prd.md`. Exploration only — **not** the shipping app, and it shares no code with it. |

Nearly all real work happens in `gutter-estimator.html`. Treat the Swift shell as
plumbing and `concepts/` as a sketchpad unless asked otherwise.

## Environment constraints

**There is no `node`, `npm`, `deno` or `bun` on this machine.** This shapes everything:

- `concepts/`'s scripts (`npm run dev`, `npm test` — which uses `node --test`) **cannot be run
  here.** Don't propose them as a verification step; reason about that code by reading it.
- To execute the estimator's JS, use the JavaScriptCore CLI that ships with macOS.

### Testing `gutter-estimator.html` headlessly

The whole app is one `<script>` that runs DOM setup on load, so it can't be `require`d. Extract
it and run it under `jsc` with a DOM shim (`document`, `localStorage`, `indexedDB`, timers,
`getComputedStyle`, and a permissive `Proxy` for `getElementById`/canvas `ctx` — ~70 lines):

```bash
python3 -c "import re; open('app.js','w').write(re.findall(r'<script>([\s\S]*?)</script>', open('gutter-estimator.html').read())[0])"
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc shim.js app.js test.js
```

`init()` will throw partway through DOM setup — that's expected and harmless; every function is
still defined and callable. You can then drive the real engine: set `P.objects`, call
`compute()`, `materialList()`, `runCorners()`, `resizeRunSegment()`, `draw()`,
`buildEstimatePane()`. Assertions are plain scripts. **Re-extract `app.js` after every edit** —
a stale `app.js` silently tests the old code.

For visual checks: `python3 -m http.server` from the HTML's directory, then open in Chrome
(`file://` URLs are blocked from `chrome://newtab`).

### Building the iPad app

Run from the repo root (the `.xcodeproj` lives there, sources live one level down):

```bash
xcodebuild -project PrimeGutterEstimator.xcodeproj -scheme PrimeGutterEstimator \
  -destination 'id=<simulator-udid>' -configuration Debug \
  -derivedDataPath <scratch>/dd build
```

The project uses Xcode 16 `PBXFileSystemSynchronizedRootGroup` (objectVersion 77): **files in
`PrimeGutterEstimator/PrimeGutterEstimator/` are picked up automatically.** The bundled
`README.md` predates this and still describes manually dragging files in and fixing "Target
Membership" — that advice no longer applies. The filename `gutter-estimator.html` is load-bearing
(`WebView.swift` looks it up by name via `Bundle.main.url`).

## Architecture of the estimator

Navigate the file by its banner comments (`/* ==== STATE ==== */`, `CAMERA / CANVAS`,
`GEOMETRY HELPERS`, `TAKEOFF / COMPUTE`, `RENDERING`, `TOOLS + DOCK`, `HIT TESTING`,
`POINTER EVENTS`, `LEFT RAIL`, `PHOTO MARKUP PAGE`, `SAVE / LOAD / NEW`, `PRINT`, …).

**Global mutable state, no framework.** `P` is the live project (`P.meta`, `P.settings`,
`P.objects`, `P.photos`). Mutate it directly, then call `refreshAll()` (redraw + rebuild the
visible rail pane) or `draw()` for canvas-only changes. `recordHistory()` *before* a mutation
snapshots for undo.

**Everything drawn is one flat `P.objects` array** discriminated by `o.t`: `gutter`, `ds`
(downspout), `valley`, `splash`, `custom`, `demo`, `screen`, `text`, `arrow`, `stamp`, `hl`.
Line-ish objects carry `pts` (world coords) plus a parallel `lengths` array — one entry per
*segment*, so `lengths.length === pts.length - 1`. Keep them in sync on any geometry edit.

**`compute()` is the single source of truth for the takeoff.** It walks `P.objects` and returns
quantities (`q`), amounts, and totals; `materialList()` calls it and re-derives the same
quantities as human-readable BOM rows. **Any pricing rule change must be made in both** or the
worksheet and the printed estimate disagree.

**Options are estimate variants.** `OPTIONS[]` each own their own `settings`, `objects` and
undo `history`; `meta` (customer), `photos` and stamp presets are *shared*. `captureActive()` /
`activate(i)` swap the live `P` between them.

**Coordinates:** world units with `GRID = 20`; `cam {x, y, scale}`; `worldToScreen` /
`screenToWorld`. Feet are derived, not stored — `P.settings.feetPerSquare` (or calibration)
converts via `feetToWorld` / `autoLen`.

**Run connectivity is geometric, not stored.** Endpoints within `CAP_EPS` (11 world units) count
as joined. `isClosedRun()`, `freeEnds()`, `runCorners()` and `junctionCorners()` all re-derive
this from the points every time. Don't cache a "closed"/"joined" flag on an object — extending,
splitting and dragging all invalidate it, and a stale flag silently drops end caps or invents
miters. Known limitation: only *endpoint-to-endpoint* joins are recognized; a run ending on
another run's interior vertex counts as neither a miter nor a junction.

**Photo blobs never live in `P`.** `P.photos` and `P.meta.titleImage` hold only ids; base64 sits
in the `photoBlobs` Map, mirrored to IndexedDB. This is deliberate — blobs in `P` made undo
snapshots ~27 MB and blew WKWebView's localStorage quota silently. Exported "Save" JSON *does*
embed images so backups stay portable (`serialize(true)`).

**Native bridge.** `geNative(name)` returns a `webkit.messageHandlers` handler or `null`, so the
same code runs in a plain browser and in the app. `gutterSave` → iOS share sheet, `gutterPrint`
→ AirPrint. Handlers are registered in `WebView.swift`; both sides must change together.

## Conventions

- The estimator must stay **offline and single-file** — no CDN links, no external assets, no
  build step. Inline anything new.
- Comments in this file explain *why*, usually citing the bug the code prevents. Match that when
  touching non-obvious logic; keep the existing terse, dense style rather than reformatting.
- Domain vocabulary is load-bearing: *miter* (corner) is box/strip/bay by angle, *end cap* only
  on free ends, *run* is one polyline of gutter, *outlet/elbow/offset* belong to downspouts.
