import SwiftUI
@main struct LieguojiApp: App {
    var body: some Scene { WindowGroup { GameShell() } }
}
struct GameShell: View {
    @State private var metrics = false
    @State private var information = false
    var body: some View {
        NavigationStack {
            MetalSurface(showMetrics: metrics)
                .overlay(alignment: .bottom) {
                    Text("真实 20k 地形 · 拖动与双指缩放")
                        .font(.caption).padding().background(.regularMaterial, in: Capsule()).padding()
                }
                .navigationTitle("列国纪").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { metrics.toggle() } label: { Label("性能叠层", systemImage: "gauge.with.dots.needle.67percent") }
                    }
                    ToolbarItem(placement: .bottomBar) {
                        Button { information = true } label: { Label("构建说明", systemImage: "info.circle") }
                    }
                }
                .sheet(isPresented: $information) {
                    NavigationStack {
                        List {
                            Text("SwiftUI + Metal，无网页运行时")
                            Text("请求 120Hz；实际帧率由设备、系统与负载决定。")
                            Text("地图数据已接入，模拟尚未移植。")
                        }.navigationTitle("原生版 · 地图预览")
                            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { information = false } } }
                    }.presentationDetents([.medium, .large])
                }
        }
    }
}
