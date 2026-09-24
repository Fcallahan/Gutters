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
A `text` box (`{t:"text",id,x,y,w,h,text,fill,color,font,size,stroke,bold,italic,border}`) has
`w:null` for auto-width (sized to the longest line) or a number for a fixed, word-wrapped width;
`h` is always recomputed by `drawText()` on every draw, never trust a stale one. See **TEXT BOX**
below — it's shared with the Photos page.

**Text-box selection is two taps, not one.** With the Select tool, the first tap on a text box
selects it (handles + the style strip); a second tap on the box that's already the sole selection
opens the editor. `EDITABLE` (HIT TESTING) deliberately excludes `"text"` for this reason — it's
special-cased in `onDown`/`onUp` instead of the generic single-tap-opens-editor path that
`seglen`/`dsnote`/`stamp` still use.

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
embed images so backups stay portable (`serialize(true)`). Every photo enters through
`commitPhotos()` and is capped at `PHOTO_MAX_EDGE` (2000px) on the way in.

**The camera needs the native side.** "Take photo" opens an in-app `getUserMedia` viewfinder
(`openCamera()`) so a rep can shoot a burst; iOS's `<input capture>` sheet closes after one
frame, and that input is now only the fallback. Three things gate it and all live outside the
HTML: `INFOPLIST_KEY_NSCameraUsageDescription` (without it iOS kills the app the moment the
camera is touched), `requestMediaCapturePermissionFor` in `WebView.swift` (without it WKWebView
auto-denies `getUserMedia`), and `mediaTypesRequiringUserActionForPlayback = []` (without it the
preview stays black). **The simulator has no camera at all** — this path can only be tested on a
real iPad.

**Photo pane layout.** Cards are one column wide (`photoCardWidth()` splits the pane into
~520px columns), so `#photoScroll` needs `scrollbar-gutter:stable` — `renderPhotos()` measures
after clearing the pane, and without a reserved gutter it sizes columns a scrollbar too wide and
the last one wraps. Marks are stored against a 520px preview (`PHOTO_REF_W`); every renderer
scales by `cw/PHOTO_REF_W` via `photoStrokePx()`/`photoTextPx()`. The left rail belongs to the
Diagram page; `setPage()` parks it on Photos/PDF View and restores the rep's choice on the way
back.

**Photo mark schema** (`P.photos[i].strokes[]`, normalized 0..1 image coords, see the banner
comment at PHOTO MARKUP PAGE for the full table): every mark has `id` (from `uid()`) and
`opacity`. `pen`/`highlight`/`line` keep freehand/polyline `pts`; `rect`/`ellipse`/`polygon`/
`arrow` also carry `pts` (two drag corners, or `[tail,head]` for an arrow, or a closed ring for a
polygon) plus `fill`/`dash`/`heads` as applicable. A `text` mark (callout or plain) uses the
shared TEXT BOX fields above, plus an optional `tip` — the point a leader line points at, i.e. a
callout. **`ensurePhotoMarks(ph)`** is the migration hook (called from `absorbPhotoBlobs()` on
load and defensively at the top of `renderPhotos()`): it back-fills `type`/`id`/`opacity` on
legacy marks and migrates legacy prompt()-authored text to the shared fields. After it runs, no
reader needs a `||` fallback — don't add new ones.

**One painter for every mark, on screen and in the PDF.** `paintPhotoMark(ctx,st,cw,chh)` is
called from both `drawPhotoMarks()` (the live card) and `photoSnapshot()` (the full-res PDF
flatten) — `cw` is the card's on-screen width or `ph.w` in the PDF; everything else scales off
it. Pen/highlight strokes are smoothed at render time (`paintSmoothPath`, `quadraticCurveTo`
through segment midpoints) — the stored points stay a raw polyline, this is paint-only.
Arrowheads (`paintArrowShaft`) are filled triangles sized from the stroke width. Selection
chrome (bbox handles, vertex dots, the marquee) is NOT in `paintPhotoMark` — it's drawn
separately in `renderPhotos()`'s per-card `redrawPhoto()`, same split as the Diagram's
`drawScene()`/`draw()`.

**Photo tools** live in `photoTool` (`select|pen|highlight|line|rect|ellipse|arrow|polygon|
text|callout|eraser`), each with its own remembered style in `photoToolStyle[tool]` (or
`photoTextStyle` for text/callout) so switching tools doesn't clobber another tool's width/
opacity. `#photoOptbar` (`buildPhotoOptbar()`/`wirePhotoOptbar()`) is the Photos equivalent of
the Diagram's `buildOptbar()`/`#optbar` — contextual per-tool controls that, with a mark
selected, edit *that mark* live instead of the tool's defaults (`photoOptTarget()` resolves
which). A freshly drawn rect/ellipse/arrow/polygon/callout **stays selected** while its tool
remains active (`photoSelMarks` holds it); a pointerdown on one of its handles
(`photoHandleHit()`) reshapes it, any other pointerdown releases it and starts a new mark. Handle
reshaping is deliberately single-selection only — see the comment at `scaleMarkByHandle()`. The
5-chip palette (`photoPalette()`, persisted in `P.meta.photoPalette`) is shared by every tool's
stroke/fill/text color; long-press or right-click a chip to redefine it.

**The eraser only touches ink.** `photoEraseAt()` (ported from the Diagram's
`eraseStrokesAt()`) splits `pen`/`highlight` strokes into surviving runs and leaves every other
mark type untouched, so scrubbing out a stray scribble can't delete a carefully placed arrow.
Shapes, lines, text and callouts are removed with Select → Delete.

**Native bridge.** `geNative(name)` returns a `webkit.messageHandlers` handler or `null`, so the
same code runs in a plain browser and in the app. `gutterSave` → iOS share sheet; `gutterPdf`
(`build`/`frame`/`hide`/`show`/`share`/`print`) → native pagination into a real PDF shown in a
`PDFView` laid over the PDF View tab's `#pdfHost`, with Share/Print sending that same PDF data. The
overlay sits above ALL web content, so anything modal on that tab must `hide` it first. Handlers
are registered in `WebView.swift`; both sides must change together.

**Signatures** (`P.meta.signatures`, shared across options; see the SIGNATURES banner) are vector
ink signed on a white pad in `openSignModal()`. `build` carries `sigs` (each with a web-rendered
`sigCardPNG()`), and native stamps them on as `SignatureAnnotation`s the rep can press-and-hold to
drag, even across pages. Native reports every landing spot back through `pdfSigMoved(id,page,x,y)`
(PDF points, top-left origin). Custom annotations aren't serialized, so Share/Print use
`exportData()`, which redraws the pages flattened. Signatures stay out of undo: `restore()` carries
them across the `P.meta` swap. The card (`SIG_W`×`SIG_H`, 170×44pt) is sized to fit the band under
page 1's footer. In the native PDF that footer ends at ~735pt of 792 on every job, because the diagram
box absorbs page 1's slack. New signatures land there (`SIG_FOOT_Y`). Changing page 1's layout means
re-measuring that band with the simulator harness.

**The PDF diagram is vector.** `diagramSVG()` replays `drawScene()` into `makeSvgCtx()`, a recorder
that turns the 2D-context calls RENDERING uses into SVG. Put job content in `drawScene()` (it prints)
and editor chrome in `draw()` (it doesn't); a new `ctx` method in RENDERING must also be added to
the recorder or it silently won't print. `makeSvgCtx().fillText` parses `ctx.font` as
`"[italic ][weight ]<size>px <family>"` — both the style and weight tokens are optional, in that
order — and emits `font-style="italic"` when present; miss either token and bold/italic text
prints plain.

**TEXT BOX (near RENDERING) is one engine for two pages.** `textStyleFont(o,px)`,
`layoutTextBox(ctx,o,px,maxWidthPx)`, `paintTextBox(ctx,o,x,y,px,maxWidthPx)` and
`applyTextSizeChange(o,newSize)` are shared by the Diagram's `{t:"text"}` (`drawText()`) and a
photo's `{type:"text"}` mark (`paintPhotoMark()`'s text branch, `paintPhotoText()`). Only the
caller's coordinate conversion differs: the Diagram passes world-px scaled by `cam.scale`, a
photo passes normalized 0..1 coords scaled by the card's `cw`/`chh`. `maxWidthPx===null` means
auto-width (sized to content, never wrapped); a number means fixed-width (word-wrapped, padding
proportional to `px`). `paintTextBox` never draws selection chrome — the Diagram replays it
through `makeSvgCtx()` for the PDF, so a baked-in handle would print. A photo callout is a text
mark with an added `tip` point; `paintPhotoText()` draws its leader line before the plate so the
plate sits on top. The floating editor is `openEditorFor()`'s text branch (Diagram) and
`openPhotoTextEditor()` (Photos) — both drive the same `#floatEdit` element (a child of `#stage`,
which `#photoStage` also sits inside), just computing its screen rect differently; open it
**synchronously inside the pointer-up** that created or tapped the box, or iOS won't raise the
keyboard.

## Conventions

- The estimator must stay **offline and single-file** — no CDN links, no external assets, no
  build step. Inline anything new.
- Comments in this file explain *why*, usually citing the bug the code prevents. Match that when
  touching non-obvious logic; keep the existing terse, dense style rather than reformatting.
- Domain vocabulary is load-bearing: *miter* (corner) is box/strip/bay by angle, *end cap* only
  on free ends, *run* is one polyline of gutter, *outlet/elbow/offset* belong to downspouts.
