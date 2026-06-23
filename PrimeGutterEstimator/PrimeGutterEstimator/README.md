# Prime Gutter Estimator — iPad App (native wrapper)

This turns your single `gutter-estimator.html` file into a real iPad app by wrapping
it in a tiny native shell (`WKWebView`). Everything still runs offline and on-device.

You need: a **Mac**, **Xcode** (free, Mac App Store), and an **Apple ID**.
For TestFlight / the App Store you also need the **Apple Developer Program** ($99/year).

---

## 1. Create the Xcode project

1. Open **Xcode** → **File ▸ New ▸ Project…**
2. Choose **iOS ▸ App**, click **Next**.
3. Fill in:
   - **Product Name:** `PrimeGutterEstimator`
   - **Interface:** **SwiftUI**
   - **Language:** **Swift**
   - **Organization Identifier:** something unique, e.g. `com.primeseamless`
     (this makes the Bundle ID `com.primeseamless.PrimeGutterEstimator`)
4. Pick a folder and **Create**.

## 2. Add the code (foolproof method — edit Xcode's own files)

Replacing the files Xcode generates is the #1 cause of an "undefined symbol: _main"
build error (it happens when the file holding `@main` loses its target membership).
Avoid that entirely by editing in place:

1. **Leave the generated `PrimeGutterEstimatorApp.swift` as-is.** It already has
   `@main` and is correctly part of the target. (If you prefer, you can paste in
   the version from this folder — but if you do, see step 5 about target membership.)
2. Open Xcode's own **`ContentView.swift`** and replace its whole contents with
   the `ContentView.swift` from this folder.
3. Create the webview file through Xcode so it's guaranteed to join the target:
   **File ▸ New ▸ File… ▸ Swift File**, name it **`WebView.swift`**, then paste in
   the contents of `WebView.swift` from this folder.
4. Drag **`gutter-estimator.html`** into the project. Tick **"Copy items if
   needed"** and make sure your app target is checked.
   - ⚠️ The filename must stay exactly `gutter-estimator.html`.

> Whenever you update the estimator, just replace this `gutter-estimator.html`
> in the project with the new version and rebuild.

## 2b. If you get "undefined symbol: _main" (or a linker error)

This means the file with `@main` isn't being compiled into the app. Fix it:

1. Click **`PrimeGutterEstimatorApp.swift`** in the left sidebar.
2. Open the **File Inspector** (top-right panel, or ⌥⌘1).
3. Under **Target Membership**, check the box next to **PrimeGutterEstimator**.
4. Do the same for **`ContentView.swift`** and **`WebView.swift`**.
5. Confirm: project icon ▸ target ▸ **Build Phases ▸ Compile Sources** should
   list all three `.swift` files. Add any that are missing with the **+**.
6. Press ⌘⇧F and search for `@main` — there must be exactly **one**.

## 3. Run it on your own iPad (free)

1. Plug your iPad into the Mac (or use a wireless target once set up).
2. In Xcode's toolbar, pick your iPad as the run destination.
3. Click **Run** (▶). The first time, Xcode will ask you to sign in with your
   Apple ID and create a free "Personal Team" signing certificate — accept.
4. On the iPad: **Settings ▸ General ▸ VPN & Device Management** → trust your
   developer certificate, then launch the app.

Free signing works for **7 days** per build (re-run from Xcode to refresh). To
remove the time limit and install over the air, use the App Store / TestFlight
route below.

## 4. App icon & name (optional but nice)

- In Xcode, open **Assets.xcassets ▸ AppIcon** and drop in a 1024×1024 PNG
  (Prime Seamless logo). Xcode generates the rest.
- To change the name under the icon, set **Display Name** in the target's
  **General** tab.

## 5. Distribute to a crew / the App Store

You need the **Apple Developer Program** ($99/yr, developer.apple.com).

- **TestFlight (easiest for your own crew):** Xcode ▸ **Product ▸ Archive** →
  **Distribute App ▸ TestFlight & App Store** → upload. Then in App Store
  Connect, add your crew's emails as testers. They install the free TestFlight
  app and tap to install yours. Builds last 90 days.
- **App Store (public):** same Archive/upload, then submit for review in App
  Store Connect. Apple reviews it (a wrapper around your own offline tool is
  fine; just fill in the listing honestly).
- **Ad Hoc:** for a fixed set of iPads by device ID, without TestFlight.

---

## Notes specific to your tool

- **Offline:** the HTML is bundled in the app, so it runs with no signal.
- **Autosave:** the app's localStorage autosave persists in the app's private
  storage between launches.
- **"Save" (JSON) and PDF export:** a browser normally "downloads" these. The
  shell catches them and hands them to native iOS:
  - **Save** opens the iOS **share sheet** → **Save to Files**, AirDrop, or Mail.
  - **Export PDF** opens the **AirPrint** sheet → pick a printer, or pinch the
    preview to **Save as PDF** into Files.
  - **Load** uses the system file picker (works out of the box).
- If a future iOS changes this behavior, the bridge lives in `WebView.swift`
  (the `gutterSave` / `gutterPrint` message handlers) and the matching
  `geNative()` calls in the HTML — ping me and I'll update them.

## Minimum iOS version

The shell uses standard WebKit/UIKit APIs available on **iOS 14+**. Modern Xcode
defaults above that, so you don't need to change anything; just don't set the
Deployment Target below 14.
