import SwiftUI
import WebKit
import UIKit

/// Wraps the bundled `gutter-estimator.html` in a native WKWebView.
///
/// The web app runs 100% offline. Two browser-only features are bridged to
/// native iOS so they work inside the app:
///   • "Save" (JSON export)  -> iOS share sheet (Save to Files, AirDrop, Mail…)
///   • "Export PDF / Print"  -> AirPrint sheet (which includes Save to Files as PDF)
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
        ucc.add(context.coordinator, name: "gutterPrint")

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
        private var printWebView: WKWebView?      // offscreen, holds the estimate for printing

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
            case "gutterPrint":
                if let html = message.body as? String { printHTML(html) }
            default: break
            }
        }

        // MARK: Save -> share sheet

        private func saveAndShare(name: String, text: String) {
            let safe = name.isEmpty ? "estimate.json" : name
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(safe)
            do {
                try text.data(using: .utf8)?.write(to: url, options: .atomic)
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

        // MARK: PDF / Print -> render the estimate HTML, then AirPrint

        private func printHTML(_ html: String) {
            // Render off-screen so we can hand a finished page to the print system.
            let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 794, height: 1123)) // ~A4 @96dpi
            web.navigationDelegate = self
            web.loadHTMLString(html, baseURL: nil)
            printWebView = web
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard webView === printWebView else { return }   // ignore the main app's loads
            // small delay so images (diagram/photos) finish laying out
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
                guard let self, let vc = self.topVC() else { return }
                let info = UIPrintInfo(dictionary: nil)
                info.outputType = .general
                info.jobName = "Gutter Estimate"
                let pic = UIPrintInteractionController.shared
                pic.printInfo = info
                pic.printFormatter = webView.viewPrintFormatter()
                if UIDevice.current.userInterfaceIdiom == .pad {
                    pic.present(from: CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 60,
                                             width: 0, height: 0),
                                in: vc.view, animated: true) { _, _, _ in self.printWebView = nil }
                } else {
                    pic.present(animated: true) { _, _, _ in self.printWebView = nil }
                }
            }
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
