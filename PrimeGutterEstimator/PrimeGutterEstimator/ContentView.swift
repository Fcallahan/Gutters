import SwiftUI

struct ContentView: View {
    var body: some View {
        WebView()
            .ignoresSafeArea()          // full-bleed; the web app pads its toolbar
            .preferredColorScheme(.dark) // light status-bar text (clock/battery) over the dark toolbar
    }
}
