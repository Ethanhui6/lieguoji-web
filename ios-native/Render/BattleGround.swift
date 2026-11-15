import Foundation
import Metal
import QuartzCore
import simd
import LieguojiCore

/// 占领与战场墨晕（目标由 LieguojiCore.InkFront 按军队实际位置与入境方向算出）：
/// 墨色从每一方的入境侧沿州内洇开，单方占领时随占领进度铺满整州，交战时按兵力占比分区推挤。
/// 只在每步推演后更新目标，每帧只做缓动插值；暂停时插值走完即停，不再重绘。
typealias BattleGround = InkGround

/// 渲染端的墨晕状态：按州保存，目标变化时平滑过渡。
final class GroundBook {
    struct Slot {
        let nation: Int
        var color: RGB
        var anchor: SIMD2<Float>, anchorTarget: SIMD2<Float>
        var share: Float, shareTarget: Float
        /// 覆盖面（0…1）：从入境点向州内铺开的程度。
        var reach: Float, reachTarget: Float
        /// 刚出现的一方用较短的时间常数，入境即见。
        var age: Float = 0
    }
    struct Ground {
        let province: Int
        let center: SIMD2<Float>
        let radius: Float
        let index: MTLBuffer
        let count: Int
        var slots: [Slot]
        var alpha: Float = 0, alphaTarget: Float = 1
        /// 战况结束：留下的一方铺满后淡出（易主时底色已换成新国色，淡出即过渡过去）。
        var ending = false
    }
    var list = [Int: Ground]()
    var indexCache = [Int: (MTLBuffer, Int, SIMD2<Float>, Float)]()
    var cacheMap = 0
    var lastFrame: CFTimeInterval = 0
    var animating = false
    /// 同时最多显示的墨晕州数（同屏多场时保持克制，兵力大的优先）。
    static let limit = 12
    /// 最多分几营：更多的小营并入不显示（只保留可读的几块）。
    static let maxCamps = 4
    /// 时间常数（秒）：份额与锚点、覆盖面、淡入淡出；新出现的一方覆盖面更快。
    static let shareTau: Float = 0.5, reachTau: Float = 0.45, freshTau: Float = 0.18, fadeTau: Float = 0.3
}

extension MapRenderer {
    var groundsAnimating: Bool { grounds.animating }

    /// 一个州的格子三角形（索引缓冲）、中心与半径，按州缓存（中心与半径与 InkFront.disks 一致）。
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

    /// 新的战况：已有的墨晕平滑过渡到新目标；新的一方从入境点长出；消失的一州进入“留下的一方铺满后淡出”。
    func setBattleGrounds(_ incoming: [BattleGround]) {
        var seen = Set<Int>()
        for b in incoming.prefix(GroundBook.limit) {
            guard let mesh = groundMesh(b.province) else { continue }
            seen.insert(b.province)
            var g = grounds.list[b.province] ?? GroundBook.Ground(province: b.province, center: mesh.2, radius: mesh.3, index: mesh.0, count: mesh.1, slots: [])
            g.ending = false; g.alphaTarget = 1
            let total: Float = max(1, b.camps.prefix(GroundBook.maxCamps).reduce(0) { $0 + $1.troops })
            var next = [GroundBook.Slot]()
            for camp in b.camps.prefix(GroundBook.maxCamps) {
                // 锚点在入境一侧的州界附近：墨色从那里进来。
                let anchor = g.center + camp.direction * g.radius * 0.95
                let color = nationColors.indices.contains(camp.nation) ? nationColors[camp.nation] : RGB(0.6, 0.6, 0.6)
                let share = camp.troops / total
                if var old = g.slots.first(where: { $0.nation == camp.nation }) {
                    old.anchorTarget = anchor; old.shareTarget = share; old.reachTarget = camp.reach; old.color = color; next.append(old)
                } else {
                    // 新加入的一方（入境或援军）：从自己的入境点长出，兵力份额也从零长起。
                    next.append(GroundBook.Slot(nation: camp.nation, color: color, anchor: anchor, anchorTarget: anchor, share: g.slots.isEmpty ? share : 0, shareTarget: share, reach: 0, reachTarget: camp.reach))
                }
            }
            // 撤出、溃散的一方：覆盖面与份额一起收回入境点。
            for old in g.slots where !next.contains(where: { $0.nation == old.nation }) && old.reach > 0.02 && next.count < GroundBook.maxCamps {
                var s = old; s.shareTarget = 0; s.reachTarget = 0; next.append(s)
            }
            g.slots = next
            grounds.list[b.province] = g
        }
        // 结束：份额最大的一方铺满，然后淡出。
        for (p, var g) in grounds.list where !seen.contains(p) && !g.ending {
            g.ending = true
            let winner = g.slots.indices.max { g.slots[$0].share < g.slots[$1].share }
            for i in g.slots.indices { g.slots[i].shareTarget = i == winner ? 1 : 0; if i == winner { g.slots[i].reachTarget = 1 } }
            grounds.list[p] = g
        }
        grounds.animating = !grounds.list.isEmpty
    }

    /// 每帧：缓动插值后绘制。暂停后插值走完即不再请求重绘。
    func drawGrounds(_ encoder: MTLRenderCommandEncoder, _ u: inout Uniforms) {
        guard !grounds.list.isEmpty else { grounds.animating = false; return }
        let now = CACurrentMediaTime()
        let dt = Float(grounds.lastFrame == 0 ? 0.016 : min(0.1, now - grounds.lastFrame)); grounds.lastFrame = now
        var moving = false
        // 缩得很小时只保留主色与前沿（不加笔触颗粒），放大时显示完整细节。
        let detail: Float = camera.scale >= 1.0 ? 1 : 0
        for (p, var g) in grounds.list {
            for i in g.slots.indices {
                g.slots[i].age += dt
                g.slots[i].share = InkFront.ease(g.slots[i].share, toward: g.slots[i].shareTarget, seconds: dt, tau: GroundBook.shareTau)
                let a = g.slots[i].anchor, t = g.slots[i].anchorTarget
                g.slots[i].anchor = SIMD2(InkFront.ease(a.x, toward: t.x, seconds: dt, tau: GroundBook.shareTau), InkFront.ease(a.y, toward: t.y, seconds: dt, tau: GroundBook.shareTau))
                let tau = g.slots[i].age < 0.6 ? GroundBook.freshTau : GroundBook.reachTau
                g.slots[i].reach = InkFront.ease(g.slots[i].reach, toward: g.slots[i].reachTarget, seconds: dt, tau: tau)
                if abs(g.slots[i].share - g.slots[i].shareTarget) > 0.003 || abs(g.slots[i].reach - g.slots[i].reachTarget) > 0.003 { moving = true }
            }
            g.slots.removeAll { $0.reachTarget == 0 && $0.reach < 0.01 && !g.ending }
            if g.slots.isEmpty && !g.ending { g.ending = true }
            // 留下的一方铺满后才开始淡出。
            if g.ending, (g.slots.map(\.share).max() ?? 1) > 0.95, (g.slots.map(\.reach).max() ?? 1) > 0.95 || g.slots.isEmpty { g.alphaTarget = 0 }
            g.alpha = InkFront.ease(g.alpha, toward: g.alphaTarget, seconds: dt, tau: GroundBook.fadeTau)
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
        // 加权分区：份额越大的一方占地越多（份额相同时分界在两锚点正中）；每方只铺到自己的覆盖面。
        let n = Float(slots.count)
        var block = [Float]()
        block.reserveCapacity(4 * 4 * 3 + 8)
        for i in 0..<4 {
            if i < slots.count { let s = slots[i]; block += [s.anchor.x, s.anchor.y, s.reach, 0] } else { block += [0, 0, 0, 0] }
        }
        for i in 0..<4 {
            if i < slots.count {
                // 国色融入宣纸：略向纸色收一点饱和度。
                let s = slots[i], paper = SIMD3<Float>(0.93, 0.89, 0.8), c = SIMD3(s.color.r, s.color.g, s.color.b) * 0.82 + paper * 0.18
                block += [c.x, c.y, c.z, 1]
            } else { block += [0, 0, 0, 0] }
        }
        for i in 0..<4 { block.append(i < slots.count ? g.radius * 1.7 * (slots[i].share - 1 / n) : 0) }
        block += [n, g.alpha * (g.ending ? 0.9 : 1), detail, g.radius]
        encoder.setRenderPipelineState(groundPipeline)
        encoder.setVertexBuffer(positionBuffer, offset: 0, index: 0)
        encoder.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 2)
        encoder.setFragmentBytes(block, length: block.count * MemoryLayout<Float>.stride, index: 0)
        encoder.drawIndexedPrimitives(type: .triangle, indexCount: g.count, indexType: .uint32, indexBuffer: g.index, indexBufferOffset: 0)
    }
}
