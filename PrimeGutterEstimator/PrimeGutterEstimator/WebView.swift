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
                             WKScriptMessageHandler {

        weak var mainWebView: WKWebView?

        // PDF View
        private var pdfBuildWeb: WKWebView?       // offscreen, lays out the estimate for pagination
        private var pdfBuildSeq = 0               // the web side's build counter; stale builds are dropped
        private var pdfBuildName = "Estimate.pdf"
        private var pdfData: Data?                // last finished PDF — what Share / Print send
        private var pdfName = "Estimate.pdf"
        private var pdfView: PDFView?
        private var pdfHidden = true              // what the web side last asked for (tab left, modal open)

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
                if let data = pdfData { share(name: pdfName, data: data) }
            case "print":
                if let data = pdfData { printPDF(data) }
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
                host.addSubview(v)
                pdfView = v
            }
            v.frame = r
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard webView === pdfBuildWeb else { return }   // ignore the main app's loads
            let seq = pdfBuildSeq, name = pdfBuildName
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
                self.pdfView?.document = doc
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
