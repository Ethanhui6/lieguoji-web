import Foundation
import Metal
import QuartzCore
import simd
import LieguojiCore

/// 战场地面：一场陆战所在州的“地面”按参战各方兵力分色，像几股墨色从各自进入的方向洇进来、在中间相遇推挤。
/// 只在战况变化（每步推演）时更新目标，每帧只做缓动插值；暂停时插值走完即停，不再重绘。
struct BattleGround: Equatable {
    /// 一方阵营（盟国合为一营，以兵力最多的国家为代表色）。
    struct Camp: Equatable {
        let nation: Int
        /// 该营军队的兵力加权位置（地图单位），决定颜色从哪个方向进来。
        let toward: SIMD2<Float>
        let troops: Float
    }
    let province: Int
    let camps: [Camp]
}

/// 渲染端的战场地面状态：按州保存，目标变化时平滑过渡。
final class GroundBook {
    struct Slot {
        let nation: Int
        var color: RGB
        var anchor: SIMD2<Float>, anchorTarget: SIMD2<Float>
        var share: Float, shareTarget: Float
    }
    struct Ground {
        let province: Int
        let center: SIMD2<Float>
        let radius: Float
        let index: MTLBuffer
        let count: Int
        var slots: [Slot]
        var alpha: Float = 0, alphaTarget: Float = 1
        /// 战斗已结束：胜方铺满后淡出。
        var ending = false
        var detailTotal: Float = 0
    }
    var list = [Int: Ground]()
    var indexCache = [Int: (MTLBuffer, Int, SIMD2<Float>, Float)]()
    var cacheMap = 0
    var lastFrame: CFTimeInterval = 0
    var animating = false
    /// 同时最多显示的战场数（同屏多场时保持克制，最大的优先）。
    static let limit = 10
    /// 最多分几营：更多的小营并入不显示（只保留可读的几块）。
    static let maxCamps = 4
}

extension MapRenderer {
    var groundsAnimating: Bool { grounds.animating }

    /// 一个州的格子三角形（索引缓冲）、中心与半径，按州缓存。
    private func groundMesh(_ province: Int) -> (MTLBuffer, Int, SIMD2<Float>, Float)? {
        let key = map.cellCount &* 31 &+ map.meta.provinces.count
        if grounds.cacheMap != key { grounds.indexCache = [:]; grounds.cacheMap = key }
        if let c = grounds.indexCache[province] { return c }
        var list = [UInt32](), lo = SIMD2<Float>(.infinity, .infinity), hi = SIMD2<Float>(-.infinity, -.infinity)
        for c in 0..<map.cellCount where Int(map.province[c]) == province && map.isLand(c) {
            let start = map.offsets[c], end = map.offsets[c + 1]
            guard end >= start + 3 else { continue }
            for j in (start + 1)..<(end - 1) { list.append(start); list.append(j); list.append(j + 1) }
            for v in Int(start)..<Int(end) {
                let p = SIMD2(map.vertices[v * 2], map.vertices[v * 2 + 1])
                lo = simd_min(lo, p); hi = simd_max(hi, p)
            }
        }
        guard !list.isEmpty, let buffer = device.makeBuffer(bytes: list, length: list.count * MemoryLayout<UInt32>.stride) else { return nil }
        let out = (buffer, list.count, (lo + hi) / 2, max(hi.x - lo.x, hi.y - lo.y) / 2)
        grounds.indexCache[province] = out
        return out
    }

    /// 新的战况：每场战斗的各营与兵力。已有的战场平滑过渡到新目标；消失的战场进入“胜方铺满后淡出”。
    func setBattleGrounds(_ incoming: [BattleGround]) {
        var seen = Set<Int>()
        for b in incoming.prefix(GroundBook.limit) {
            guard let mesh = groundMesh(b.province) else { continue }
            seen.insert(b.province)
            var g = grounds.list[b.province] ?? GroundBook.Ground(province: b.province, center: mesh.2, radius: mesh.3, index: mesh.0, count: mesh.1, slots: [])
            g.ending = false; g.alphaTarget = 1
            var sum: Float = 0
            for camp in b.camps { sum += camp.troops }
            let total: Float = max(1, sum)
            // 每营的锚点：从战场中心朝该营军队所在方向，推到州的边缘附近（颜色从那一侧进来）。
            var weighted = SIMD2<Float>(0, 0)
            for camp in b.camps { weighted += camp.toward * camp.troops }
            let middle: SIMD2<Float> = weighted / total
            var next = [GroundBook.Slot]()
            for (i, camp) in b.camps.prefix(GroundBook.maxCamps).enumerated() {
                var dir = camp.toward - middle
                let len = simd_length(dir)
                // 两军叠在一处看不出方向时，按营的序号均匀分开方向（稳定，不随步数变）。
                if len < 0.01 { let a = Float(i) * 2 * .pi / Float(max(2, b.camps.count)) + Float(camp.nation % 7) * 0.3; dir = SIMD2(cos(a), sin(a)) } else { dir /= len }
                let anchor = g.center + dir * g.radius * 0.95
                let color = nationColors.indices.contains(camp.nation) ? nationColors[camp.nation] : RGB(0.6, 0.6, 0.6)
                if var old = g.slots.first(where: { $0.nation == camp.nation }) {
                    old.anchorTarget = anchor; old.shareTarget = camp.troops / total; old.color = color; next.append(old)
                } else {
                    // 新加入的一方从零长出。
                    next.append(GroundBook.Slot(nation: camp.nation, color: color, anchor: anchor, anchorTarget: anchor, share: 0, shareTarget: camp.troops / total))
                }
            }
            // 撤出的一方收缩消失。
            for old in g.slots where !next.contains(where: { $0.nation == old.nation }) && old.share > 0.02 && next.count < GroundBook.maxCamps {
                var s = old; s.shareTarget = 0; next.append(s)
            }
            g.slots = next
            grounds.list[b.province] = g
        }
        // 结束的战斗：份额最大的一方铺满，然后淡出（若该地易主，底下的国色已在换，地面淡出即过渡到新国色）。
        for (p, var g) in grounds.list where !seen.contains(p) && !g.ending {
            g.ending = true
            let winner = g.slots.indices.max { g.slots[$0].share < g.slots[$1].share }
            for i in g.slots.indices { g.slots[i].shareTarget = i == winner ? 1 : 0 }
            grounds.list[p] = g
        }
        grounds.animating = !grounds.list.isEmpty
    }

    /// 每帧：缓动插值后绘制。份额与锚点以约 0.6 秒的时间常数逼近目标，兵力小幅波动只会让分界缓慢移动。
    func drawGrounds(_ encoder: MTLRenderCommandEncoder, _ u: inout Uniforms) {
        guard !grounds.list.isEmpty else { grounds.animating = false; return }
        let now = CACurrentMediaTime()
        let dt = Float(grounds.lastFrame == 0 ? 0.016 : min(0.1, now - grounds.lastFrame)); grounds.lastFrame = now
        let k = 1 - exp(-dt / 0.6), fadeK = 1 - exp(-dt / 0.35)
        var moving = false
        // 缩得很小时只保留主色分界（不加墨晕与笔触），放大时显示完整细节。
        let detail: Float = camera.scale >= 1.0 ? 1 : 0
        for (p, var g) in grounds.list {
            for i in g.slots.indices {
                g.slots[i].share += (g.slots[i].shareTarget - g.slots[i].share) * k
                g.slots[i].anchor += (g.slots[i].anchorTarget - g.slots[i].anchor) * k
                if abs(g.slots[i].share - g.slots[i].shareTarget) > 0.003 { moving = true }
            }
            g.slots.removeAll { $0.shareTarget == 0 && $0.share < 0.01 && !g.ending }
            // 胜方铺满后才开始淡出。
            if g.ending, let top = g.slots.map(\.share).max(), top > 0.95 { g.alphaTarget = 0 }
            g.alpha += (g.alphaTarget - g.alpha) * fadeK
            if abs(g.alpha - g.alphaTarget) > 0.01 { moving = true }
            if g.ending && g.alphaTarget == 0 && g.alpha < 0.01 { grounds.list[p] = nil; continue }
            grounds.list[p] = g
            draw(g, encoder, &u, detail)
        }
        grounds.animating = moving || grounds.list.values.contains { $0.ending }
        if !grounds.animating { grounds.lastFrame = 0 }
    }

    private func draw(_ g: GroundBook.Ground, _ encoder: MTLRenderCommandEncoder, _ u: inout Uniforms, _ detail: Float) {
        let slots = Array(g.slots.prefix(GroundBook.maxCamps))
        guard !slots.isEmpty, g.alpha > 0.005 else { return }
        // 加权分区：权重越大的一方占地越多。权重与份额成正比，份额相同时分界在两锚点正中。
        let n = Float(slots.count)
        var anchors = [SIMD4<Float>](repeating: .zero, count: 4), colors = anchors
        var weights = SIMD4<Float>(repeating: 0)
        for (i, s) in slots.enumerated() {
            anchors[i] = SIMD4(s.anchor.x, s.anchor.y, 0, 0)
            // 国色融入宣纸：略向纸色收一点饱和度。
            let paper = SIMD3<Float>(0.93, 0.89, 0.8), c = SIMD3(s.color.r, s.color.g, s.color.b)
            let mixed = c * 0.82 + paper * 0.18
            colors[i] = SIMD4(mixed.x, mixed.y, mixed.z, 1)
            weights[i] = g.radius * 1.7 * (s.share - 1 / n)
        }
        var block = [Float]()
        for a in anchors { block += [a.x, a.y, a.z, a.w] }
        for c in colors { block += [c.x, c.y, c.z, c.w] }
        block += [weights.x, weights.y, weights.z, weights.w]
        block += [n, g.alpha * (g.ending ? 0.9 : 1), detail, g.radius]
        encoder.setRenderPipelineState(groundPipeline)
        encoder.setVertexBuffer(positionBuffer, offset: 0, index: 0)
        encoder.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 2)
        encoder.setFragmentBytes(block, length: block.count * MemoryLayout<Float>.stride, index: 0)
        encoder.drawIndexedPrimitives(type: .triangle, indexCount: g.count, indexType: .uint32, indexBuffer: g.index, indexBufferOffset: 0)
    }
}
