import SwiftUI
import WebKit
import UIKit
import PDFKit

/// Wraps the bundled `gutter-estimator.html` in a native WKWebView.
///
/// The web app runs 100% offline. Browser-only features are bridged to
/// native iOS so they work inside the app:
///   • "Save" (JSON export)  -> iOS share sheet (Save to Files, AirDrop, Mail…)
///   • "PDF View" tab        -> the estimate HTML is paginated into a real PDF here and
///                              shown in a PDFView laid over the tab. Share / Print hand
///                              off that same PDF data, so the customer is sent exactly
///                              the document they were shown.
/// Loading a saved job uses the web app's <input type="file">, which WKWebView
/// already supports with the system document picker — no bridge needed.
struct WebView: UIViewRepresentable {

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        // The burst camera's viewfinder is a muted inline <video> fed by getUserMedia;
        // without this WebKit waits for a user gesture and the preview stays black.
        config.mediaTypesRequiringUserActionForPlayback = []
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.websiteDataStore = .default()        // persists the localStorage autosave

        let ucc = config.userContentController
        ucc.add(context.coordinator, name: "gutterSave")
        ucc.add(context.coordinator, name: "gutterPdf")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        context.coordinator.mainWebView = webView

        if let url = Bundle.main.url(forResource: "gutter-estimator", withExtension: "html") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    // MARK: - Coordinator

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate,
                             WKScriptMessageHandler, UIGestureRecognizerDelegate {

        weak var mainWebView: WKWebView?

        // PDF View
        private var pdfBuildWeb: WKWebView?       // offscreen, lays out the estimate for pagination
        private var pdfBuildSeq = 0               // the web side's build counter; stale builds are dropped
        private var pdfBuildName = "Estimate.pdf"
        private var pdfData: Data?                // last finished PDF — what Share / Print send
        private var pdfName = "Estimate.pdf"
        private var pdfView: PDFView?
        private var pdfHidden = true              // what the web side last asked for (tab left, modal open)
        private var pdfBuildSigs: [[String: Any]] = []   // signatures sent with the pending build
        private var sigDrag: (ann: SignatureAnnotation, grab: CGPoint)?   // grab = finger offset from the card's origin

        private func topVC() -> UIViewController? {
            let scene = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first { $0.activationState == .foregroundActive }
            var vc = scene?.keyWindow?.rootViewController
            while let p = vc?.presentedViewController { vc = p }
            return vc
        }

        // MARK: messages from the web app

        func userContentController(_ ucc: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            switch message.name {
            case "gutterSave":
                guard let d = message.body as? [String: Any],
                      let text = d["text"] as? String else { return }
                let name = (d["name"] as? String) ?? "estimate.json"
                saveAndShare(name: name, text: text)
            case "gutterPdf":
                guard let d = message.body as? [String: Any],
                      let action = d["action"] as? String else { return }
                handlePdf(action, d)
            default: break
            }
        }

        // MARK: Save -> share sheet

        private func saveAndShare(name: String, text: String) {
            guard let data = text.data(using: .utf8) else { return }
            share(name: name.isEmpty ? "estimate.json" : name, data: data)
        }

        private func share(name: String, data: Data) {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            do {
                try data.write(to: url, options: .atomic)
            } catch { return }
            guard let vc = topVC() else { return }
            let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            if let pop = share.popoverPresentationController {
                pop.sourceView = vc.view
                pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 60,
                                        width: 0, height: 0)
                pop.permittedArrowDirections = []
            }
            vc.present(share, animated: true)
        }

        // MARK: PDF View -> build / place / share / print

        private func handlePdf(_ action: String, _ d: [String: Any]) {
            switch action {
            case "build":
                guard let html = d["html"] as? String else { return }
                pdfBuildSeq = (d["seq"] as? NSNumber)?.intValue ?? (pdfBuildSeq + 1)
                pdfBuildName = (d["name"] as? String) ?? "Estimate.pdf"
                pdfBuildSigs = (d["sigs"] as? [[String: Any]]) ?? []
                pdfHidden = (d["hidden"] as? Bool) ?? false
                if pdfHidden { pdfView?.isHidden = true }
                if let r = rect(d) { placePdfView(r) }
                // The old document stays on screen until the new one is ready, so ticking an
                // option doesn't blank the view. Letter width in CSS px; the print formatter
                // re-flows the content per page, so the frame height doesn't matter.
                let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 816, height: 1056))
                web.navigationDelegate = self
                web.loadHTMLString(html, baseURL: nil)
                pdfBuildWeb = web
            case "frame":
                if let r = rect(d) { placePdfView(r) }
            case "hide":
                pdfHidden = true
                pdfView?.isHidden = true
            case "show":
                pdfHidden = false
                pdfView?.isHidden = (pdfView?.document == nil)
            case "share":
                if let data = exportData() { share(name: pdfName, data: data) }
            case "print":
                if let data = exportData() { printPDF(data) }
            default: break
            }
        }

        private func rect(_ d: [String: Any]) -> CGRect? {
            guard let r = d["rect"] as? [String: Any],
                  let x = (r["x"] as? NSNumber)?.doubleValue,
                  let y = (r["y"] as? NSNumber)?.doubleValue,
                  let w = (r["w"] as? NSNumber)?.doubleValue,
                  let h = (r["h"] as? NSNumber)?.doubleValue else { return nil }
            return CGRect(x: x, y: y, width: w, height: h)
        }

        /// The PDFView is a subview of the web view, positioned over the web page's #pdfHost.
        /// CSS px map 1:1 to points here (the page never zooms), so the web's rect is used as-is.
        private func placePdfView(_ r: CGRect) {
            guard let host = mainWebView else { return }
            let v: PDFView
            if let existing = pdfView {
                v = existing
            } else {
                v = PDFView()
                v.autoScales = true
                v.displayMode = .singlePageContinuous
                v.displayDirection = .vertical
                v.backgroundColor = UIColor(red: 0.42, green: 0.47, blue: 0.52, alpha: 1)  // #6b7885, the web page's backdrop
                v.isHidden = true
                // press-and-hold a signature, then drag — a plain pan would fight the PDF's own scrolling
                let hold = UILongPressGestureRecognizer(target: self, action: #selector(dragSignature(_:)))
                hold.minimumPressDuration = 0.2
                hold.delegate = self
                v.addGestureRecognizer(hold)
                host.addSubview(v)
                pdfView = v
            }
            v.frame = r
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard webView === pdfBuildWeb else { return }   // ignore the main app's loads
            let seq = pdfBuildSeq, name = pdfBuildName, sigs = pdfBuildSigs
            // small delay so images (photos, title image) finish laying out
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
                guard let self, webView === self.pdfBuildWeb, seq == self.pdfBuildSeq else { return }
                self.pdfBuildWeb = nil
                guard let data = self.renderPDF(from: webView),
                      let doc = PDFDocument(data: data), doc.pageCount > 0 else {
                    self.callJS("pdfNativeError(\(seq), 'Could not build the PDF')")
                    return
                }
                self.pdfData = data
                self.pdfName = name
                // stay on the page being viewed: a rebuild (placing a signature, Refresh) used to jump to page 1
                var viewing = 0
                if let v = self.pdfView, let old = v.document, let pg = v.currentPage { viewing = old.index(for: pg) }
                viewing = min(max(0, viewing), doc.pageCount - 1)
                self.addSignatures(sigs, to: doc, viewing: viewing)
                self.pdfView?.document = doc
                if viewing > 0, let pg = doc.page(at: viewing) { self.pdfView?.go(to: pg) }
                self.pdfView?.isHidden = self.pdfHidden
                self.callJS("pdfNativeDone(\(seq), \(doc.pageCount))")
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            guard webView === pdfBuildWeb else { return }
            pdfBuildWeb = nil
            callJS("pdfNativeError(\(pdfBuildSeq), 'Could not lay out the estimate')")
        }

        /// Paginates with the same print formatter AirPrint uses, so page breaks match a printed
        /// copy, and draws into a PDF context — text and the SVG diagram stay vector.
        private func renderPDF(from web: WKWebView) -> Data? {
            let paper = CGRect(x: 0, y: 0, width: 612, height: 792)     // US Letter, in points
            let printable = paper.insetBy(dx: 36, dy: 36)                // 0.5in, matching the HTML's @page margin
            let renderer = UIPrintPageRenderer()
            renderer.addPrintFormatter(web.viewPrintFormatter(), startingAtPageAt: 0)
            // paperRect / printableRect are read-only; KVC is the standard way to set them without a printer
            renderer.setValue(NSValue(cgRect: paper), forKey: "paperRect")
            renderer.setValue(NSValue(cgRect: printable), forKey: "printableRect")
            let pages = renderer.numberOfPages
            guard pages > 0 else { return nil }
            renderer.prepare(forDrawingPages: NSRange(location: 0, length: pages))
            return UIGraphicsPDFRenderer(bounds: paper).pdfData { ctx in
                for i in 0..<pages {
                    ctx.beginPage()
                    renderer.drawPage(at: i, in: ctx.pdfContextBounds)
                }
            }
        }

        // MARK: Signatures

        /// Stamps each signature card onto its page. The web side stores rects with a top-left origin
        /// (so they read like the HTML); PDF page space is bottom-left, hence the flip. A page past the
        /// end (the packet got shorter) clamps to the last page; page:null is a fresh signature, centred
        /// on the page in view and reported back so the web side can persist where it landed.
        private func addSignatures(_ sigs: [[String: Any]], to doc: PDFDocument, viewing: Int) {
            for s in sigs {
                guard let id = s["id"] as? String,
                      let png = s["png"] as? String,
                      let b64 = png.components(separatedBy: ",").last,
                      let bytes = Data(base64Encoded: b64),
                      let img = UIImage(data: bytes)?.cgImage else { continue }
                let w = (s["w"] as? NSNumber)?.doubleValue ?? 170
                let h = (s["h"] as? NSNumber)?.doubleValue ?? 44
                let placed = (s["page"] as? NSNumber) != nil
                let idx = min(max(0, (s["page"] as? NSNumber)?.intValue ?? viewing), doc.pageCount - 1)
                guard let page = doc.page(at: idx) else { continue }
                let box = page.bounds(for: .mediaBox)
                var r: CGRect
                if placed {
                    let x = (s["x"] as? NSNumber)?.doubleValue ?? 0
                    let y = (s["y"] as? NSNumber)?.doubleValue ?? 0
                    r = CGRect(x: box.minX + x, y: box.maxY - y - h, width: w, height: h)
                } else {
                    r = CGRect(x: box.midX - w / 2, y: box.midY - h / 2, width: w, height: h)
                }
                r = clamp(r, to: box)
                let ann = SignatureAnnotation(id: id, image: img, bounds: r)
                page.addAnnotation(ann)
                if !placed || idx != (s["page"] as? NSNumber)?.intValue { reportSignature(ann, on: page, in: doc) }
            }
        }

        private func clamp(_ r: CGRect, to box: CGRect) -> CGRect {
            var r = r
            r.origin.x = min(max(box.minX, r.minX), box.maxX - r.width)
            r.origin.y = min(max(box.minY, r.minY), box.maxY - r.height)
            return r
        }

        private func reportSignature(_ ann: SignatureAnnotation, on page: PDFPage, in doc: PDFDocument) {
            let box = page.bounds(for: .mediaBox)
            let x = ann.bounds.minX - box.minX, y = box.maxY - ann.bounds.maxY
            let id = ann.sigId.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
            callJS("pdfSigMoved('\(id)', \(doc.index(for: page)), \(x), \(y))")
        }

        private func signature(at viewPoint: CGPoint) -> (SignatureAnnotation, PDFPage)? {
            guard let v = pdfView, let page = v.page(for: viewPoint, nearest: false) else { return nil }
            let p = v.convert(viewPoint, to: page)
            // topmost first, in case two cards overlap
            for a in page.annotations.reversed() {
                if let s = a as? SignatureAnnotation, s.bounds.contains(p) { return (s, page) }
            }
            return nil
        }

        func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
            guard let v = pdfView, g.view === v else { return true }
            return signature(at: g.location(in: v)) != nil
        }

        // PDFView's own long-press (text selection) waits for ours, or it wins on a signature
        func gestureRecognizer(_ g: UIGestureRecognizer,
                               shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            guard let v = pdfView, g.view === v, g.delegate === self else { return false }
            return other is UILongPressGestureRecognizer
        }

        private func pdfScrollView(_ v: UIView) -> UIScrollView? {
            for sub in v.subviews {
                if let s = sub as? UIScrollView { return s }
                if let s = pdfScrollView(sub) { return s }
            }
            return nil
        }

        @objc private func dragSignature(_ g: UILongPressGestureRecognizer) {
            guard let v = pdfView, let doc = v.document else { return }
            let pt = g.location(in: v)
            switch g.state {
            case .began:
                guard let hit = signature(at: pt) else { return }
                let ann = hit.0, p = v.convert(pt, to: hit.1)
                sigDrag = (ann, CGPoint(x: p.x - ann.bounds.minX, y: p.y - ann.bounds.minY))
                pdfScrollView(v)?.isScrollEnabled = false
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            case .changed:
                guard let drag = sigDrag, let page = drag.ann.page else { return }
                let ann = drag.ann, grab = drag.grab
                // the finger may be over another page by now; the card moves there on release
                let target = v.page(for: pt, nearest: true) ?? page
                let p = v.convert(pt, to: target)
                var r = ann.bounds
                r.origin = CGPoint(x: p.x - grab.x, y: p.y - grab.y)
                r = clamp(r, to: target.bounds(for: .mediaBox))
                if target !== page {
                    page.removeAnnotation(ann)
                    ann.bounds = r
                    target.addAnnotation(ann)
                } else {
                    ann.bounds = r
                }
            case .ended, .cancelled, .failed:
                pdfScrollView(v)?.isScrollEnabled = true
                if let ann = sigDrag?.ann, let page = ann.page { reportSignature(ann, on: page, in: doc) }
                sigDrag = nil
            default: break
            }
        }

        /// A custom-drawn annotation isn't written out by dataRepresentation(), so when the document
        /// carries signatures, redraw every page into a fresh PDF — PDFPage.draw includes its
        /// annotations — and the text and diagram stay vector.
        private func exportData() -> Data? {
            guard let doc = pdfView?.document, doc.pageCount > 0 else { return pdfData }
            let signed = (0..<doc.pageCount).contains { i in
                doc.page(at: i)?.annotations.contains { $0 is SignatureAnnotation } ?? false
            }
            guard signed, let first = doc.page(at: 0) else { return pdfData }
            let renderer = UIGraphicsPDFRenderer(bounds: first.bounds(for: .mediaBox))
            return renderer.pdfData { ctx in
                for i in 0..<doc.pageCount {
                    guard let page = doc.page(at: i) else { continue }
                    let box = page.bounds(for: .mediaBox)
                    ctx.beginPage(withBounds: box, pageInfo: [:])
                    let cg = ctx.cgContext
                    cg.saveGState()
                    cg.translateBy(x: 0, y: box.height)     // UIKit's context is top-left; PDF pages are bottom-left
                    cg.scaleBy(x: 1, y: -1)
                    page.draw(with: .mediaBox, to: cg)
                    cg.restoreGState()
                }
            }
        }

        private func printPDF(_ data: Data) {
            guard let vc = topVC() else { return }
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = pdfName
            let pic = UIPrintInteractionController.shared
            pic.printInfo = info
            pic.printingItem = data
            if UIDevice.current.userInterfaceIdiom == .pad {
                pic.present(from: CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 60,
                                         width: 0, height: 0),
                            in: vc.view, animated: true, completionHandler: nil)
            } else {
                pic.present(animated: true, completionHandler: nil)
            }
        }

        private func callJS(_ js: String) {
            mainWebView?.evaluateJavaScript(js, completionHandler: nil)
        }

        // Fallback: if the web app ever opens a window (non-native path), keep it in-app.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction,
                     windowFeatures: WKWindowFeatures) -> WKWebView? {
            if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
            return nil
        }

        // Camera permission — REQUIRED, or getUserMedia is auto-denied and the burst
        // camera falls back to the one-shot iOS capture sheet. The only page loaded here
        // is the bundled file:// app and the camera is only reachable from "Take photo",
        // so grant it and let iOS's own NSCameraUsageDescription prompt be the real gate.
        func webView(_ webView: WKWebView,
                     requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo,
                     type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            decisionHandler(type == .camera ? .grant : .deny)   // never the microphone
        }

        // JavaScript dialogs — REQUIRED, or alert()/confirm()/prompt() silently no-op in
        // WKWebView (this is why the "New" button did nothing: confirm() returned false).
        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo,
                     completionHandler: @escaping () -> Void) {
            guard let vc = topVC() else { completionHandler(); return }
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            vc.present(a, animated: true)
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo,
                     completionHandler: @escaping (Bool) -> Void) {
            guard let vc = topVC() else { completionHandler(false); return }
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
            a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
            vc.present(a, animated: true)
        }

        func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                     defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                     completionHandler: @escaping (String?) -> Void) {
            guard let vc = topVC() else { completionHandler(nil); return }
            let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
            a.addTextField { $0.text = defaultText }
            a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
            a.addAction(UIAlertAction(title: "OK", style: .default) { _ in
                completionHandler(a.textFields?.first?.text)
            })
            vc.present(a, animated: true)
        }
    }
}

/// A signature card stamped on a PDF page: the web side renders the card (white box, ink, name,
/// date) to a PNG and this just draws it into its bounds, so screen, Share and Print all match.
final class SignatureAnnotation: PDFAnnotation {
    let sigId: String
    private let image: CGImage

    init(id: String, image: CGImage, bounds: CGRect) {
        self.sigId = id
        self.image = image
        super.init(bounds: bounds, forType: .stamp, withProperties: nil)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func draw(with box: PDFDisplayBox, in context: CGContext) {
        context.saveGState()
        context.interpolationQuality = .high
        context.draw(image, in: bounds)     // page space is y-up, which is what CGContext.draw expects
        context.restoreGState()
    }
}
