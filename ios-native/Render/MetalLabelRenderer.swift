import UIKit
import MetalKit
import CoreText
import LieguojiCore

/// v14.0.0 纯 Metal 世界空间字体图集与舆图标注渲染引擎（彻底告别 UIKit 滑屏飘移与文字糊块）：
/// 1. 动态 CoreText 2048×2048 双通道（R = 锐利正楷墨芯、G = 柔和羊皮纸外晕）硬件 Mipmap 字形图集，按需光栅化并自动生成 Mipmap；
/// 2. 国名 / 视图分组名在 `parchmentFragment` 之前直接用与海岸/国界 100% 相同的 Metal `Uniforms` 矩阵绘制，
///    与羊皮纸肌理与西北主光天然融合，拖拽/双指缩放/惯性滑行 0.00px 漂移、永不跳位；
/// 3. 都城与城名采用「一次性世界空间优先级预排」算出每城固定 `revealScale`，缩放时按 `camera.scale` 丝滑显隐，
///    彻底消除视口边缘碰撞重排与都城上下乱翻；
/// 4. 军队兵力条与名将旗牌在同一 `MTLRenderCommandEncoder` 内紧贴 `MapRenderer` 同帧评估出的世界坐标绘制，
///    120Hz 零延迟锁死，滑屏绝不脱节冻结！
final class MetalLabelRenderer {

    // MARK: - Metal Vertex Layout & Shaders

    /// 36 字节单顶点结构（与下方 Metal `LabelVertex` 逐字段对齐）：
    /// world(2f) + pxOffset(2f) + uv(2f) + color(4f packed via RGBA8/4f) — 为最高精度与零解包误差采用紧凑 12 Float (48B)。
    struct LabelVertex {
        var worldX: Float
        var worldY: Float
        var pxX: Float
        var pxY: Float
        var uvX: Float
        var uvY: Float
        var fillR: Float
        var fillG: Float
        var fillB: Float
        var alpha: Float
        var haloA: Float
        var mode: Float // 0 = atlas glyph (R=ink, G=halo), 1 = solid rounded rect / pill bar
    }

    static let shaders = """
    struct LabelVertex {
        packed_float2 world;
        packed_float2 pxOffset;
        packed_float2 uv;
        packed_float4 fill; // rgb + alpha
        packed_float2 extra; // x = haloStrength, y = mode (0 = glyph, 1 = solid pill)
    };
    struct LabelOut {
        float4 position [[position]];
        float2 uv;
        float4 fill;
        float2 extra;
    };
    vertex LabelOut labelVertex(uint id [[vertex_id]], const device LabelVertex* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]]) {
        LabelVertex lv = v[id];
        LabelOut o;
        o.position = clip(float2(lv.world), u, float2(lv.pxOffset));
        o.uv = float2(lv.uv);
        o.fill = float4(lv.fill);
        o.extra = float2(lv.extra);
        return o;
    }
    fragment float4 labelFragment(LabelOut in [[stage_in]], texture2d<float> atlas [[texture(0)]], sampler s [[sampler(0)]]) {
        float aMaster = in.fill.a;
        if (aMaster <= 0.004) discard_fragment();
        if (in.extra.y > 0.5) {
            // 实心圆角军牌 / 血条微阴影
            float2 d = abs(in.uv - float2(0.5)) * 2.0;
            float corner = length(max(d - float2(0.72, 0.45), float2(0.0)));
            float edge = 1.0 - smoothstep(0.22, 0.34, corner);
            float a = edge * aMaster;
            if (a <= 0.004) discard_fragment();
            return float4(in.fill.rgb, a);
        }
        float4 smp = atlas.sample(s, in.uv);
        // R = 清晰墨芯 alpha（无 fake-bold 糊笔），G = 柔化外晕 alpha
        float ink = smoothstep(0.16, 0.64, smp.r);
        float halo = smoothstep(0.05, 0.58, smp.g) * in.extra.x;
        float outA = max(ink, halo) * aMaster;
        if (outA <= 0.004) discard_fragment();
        // 温润古宣外晕 (#F7EFDC) 托底 + 正楷松烟/朱砂墨芯
        float3 haloColor = float3(0.968, 0.937, 0.863);
        float3 rgb = mix(haloColor, in.fill.rgb, clamp(ink / max(outA / aMaster, 0.001), 0.0, 1.0));
        return float4(rgb, outA);
    }
    """

    // MARK: - Dynamic CoreText Dual-Channel Glyph Atlas (2048×2048)

    private struct GlyphEntry {
        let u0: Float, v0: Float, u1: Float, v1: Float
        let widthEm: Float   // quad width in font-size em units
        let heightEm: Float  // quad height in font-size em units
        let advanceEm: Float // horizontal advance in font-size em units
        let bearingXEm: Float
        let bearingYEm: Float // offset from baseline center
    }

    private let device: MTLDevice
    private let pipeline: MTLRenderPipelineState
    private let sampler: MTLSamplerState
    private let atlasTexture: MTLTexture
    private let atlasSize = 2048
    private let glyphFontSize: CGFloat = 52
    private let glyphPad: Int = 7
    private var shelfX = 2
    private var shelfY = 2
    private var shelfH = 0
    private var glyphs: [String: GlyphEntry] = [:]
    private var atlasDirtyMipmaps = false
    private let atlasFont: UIFont

    // Reusable double-buffered GPU vertex pools (pre-parchment nations, post-parchment cities, post-parchment troops)
    private let nationPool = MapBufferPool()
    private let cityPool = MapBufferPool()
    private let troopPool = MapBufferPool()
    private var scratchVerts: [LabelVertex] = []

    // MARK: - World-Space Label Models

    private struct NationItem {
        var text: String
        var x: Float
        var y: Float
        var mapEm: Float
        var angle: Float
        var targetX: Float
        var targetY: Float
        var targetEm: Float
        var targetAngle: Float
        var startX: Float
        var startY: Float
        var startEm: Float
        var startAngle: Float
        var animStart: CFTimeInterval
        var animDuration: CFTimeInterval
        var minPoints: Float
        var alpha: Float
    }

    private struct CityItem {
        let text: String
        let x: Float
        let y: Float
        let isCapital: Bool
        let province: Int
        let revealScale: Float // 100% 视口无关预计算显隐阈值！
        let priority: Double
    }

    private var nationItems: [NationItem] = []
    private var cityItems: [CityItem] = []
    private var mapWidth: Float = 1600
    private var mapHeight: Float = 900

    var nameScale: Float = 1.0
    var fullNames: Bool = true
    var showCities: Bool = true
    var selectedProvince: Int? = nil
    var revealAlpha: Float = 1.0

    var isAnimating: Bool {
        let now = CACurrentMediaTime()
        return nationItems.contains { $0.animDuration > 0 && (now - $0.animStart) < $0.animDuration }
    }

    // MARK: - Init

    init?(device: MTLDevice, library: MTLLibrary, colorPixelFormat: MTLPixelFormat, depthPixelFormat: MTLPixelFormat, sampleCount: Int) {
        self.device = device
        self.atlasFont = MapLabelsView.font(glyphFontSize)

        let desc = MTLRenderPipelineDescriptor()
        desc.vertexFunction = library.makeFunction(name: "labelVertex")
        desc.fragmentFunction = library.makeFunction(name: "labelFragment")
        desc.colorAttachments[0].pixelFormat = colorPixelFormat
        desc.colorAttachments[0].isBlendingEnabled = true
        desc.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha
        desc.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
        desc.colorAttachments[0].sourceAlphaBlendFactor = .one
        desc.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
        desc.depthAttachmentPixelFormat = depthPixelFormat
        desc.rasterSampleCount = sampleCount
        guard let pso = try? device.makeRenderPipelineState(descriptor: desc) else { return nil }
        self.pipeline = pso

        let sDesc = MTLSamplerDescriptor()
        sDesc.minFilter = .linear
        sDesc.magFilter = .linear
        sDesc.mipFilter = .linear
        sDesc.maxAnisotropy = 4
        sDesc.sAddressMode = .clampToEdge
        sDesc.tAddressMode = .clampToEdge
        guard let samp = device.makeSamplerState(descriptor: sDesc) else { return nil }
        self.sampler = samp

        let tDesc = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: atlasSize, height: atlasSize, mipmapped: true)
        tDesc.usage = [.shaderRead]
        tDesc.storageMode = .shared
        guard let tex = device.makeTexture(descriptor: tDesc) else { return nil }
        let zeros = [UInt8](repeating: 0, count: atlasSize * atlasSize * 4)
        tex.replace(region: MTLRegionMake2D(0, 0, atlasSize, atlasSize), mipmapLevel: 0, withBytes: zeros, bytesPerRow: atlasSize * 4)
        self.atlasTexture = tex

        scratchVerts.reserveCapacity(4096)
        // 预热常用数字与兵力符号字形，保证首帧 Blit 生成 Mipmap 后军牌数字立即清晰
        for ch in "0123456789.万千亿+-· " { _ = ensureGlyph(String(ch)) }
    }

    // MARK: - World Setup (Viewport-Independent!)

    func setWorld(map: WorldMap, fullNames: Bool, animated: Bool) {
        self.fullNames = fullNames
        self.mapWidth = map.width
        self.mapHeight = map.height
        setNations(map: map, animated: animated)
        setCities(map: map)
    }

    func setNations(map: WorldMap, animated: Bool) {
        let unit = Float(MapLayers.fontUnit)
        var fresh: [(text: String, x: Float, y: Float, mapEm: Float, angle: Float, minPt: Float)] = []
        fresh.reserveCapacity(map.meta.labels.count)
        for box in map.meta.labels {
            guard box.nation >= 0, map.meta.nations.indices.contains(box.nation) else { continue }
            let n = map.meta.nations[box.nation]
            let shown = MapLayers.stateLabel(n.name, full: fullNames)
            guard !shown.isEmpty else { continue }
            let emW = measureTextEmWidth(shown)
            let size = MapLayers.labelFontSize(box: box, emWidth: max(0.6, emW), emHeight: 1.05)
            fresh.append((shown, box.x, box.y, size * unit, box.angle ?? 0, 3.2))
        }
        applyNationItems(fresh, animated: animated)
    }

    func setGroups(_ groups: [GroupLabel], animated: Bool) {
        let unit = Float(MapLayers.fontUnit)
        var fresh: [(text: String, x: Float, y: Float, mapEm: Float, angle: Float, minPt: Float)] = []
        fresh.reserveCapacity(groups.count)
        for g in groups {
            guard !g.name.isEmpty else { continue }
            let emW = measureTextEmWidth(g.name)
            let size = MapLayers.labelFontSize(box: g.box, emWidth: max(0.6, emW), emHeight: 1.05)
            fresh.append((g.name, g.box.x, g.box.y, size * unit, g.box.angle ?? 0, 4.0))
        }
        applyNationItems(fresh, animated: animated)
    }

    private func applyNationItems(_ freshRaw: [(text: String, x: Float, y: Float, mapEm: Float, angle: Float, minPt: Float)], animated: Bool) {
        let fresh = freshRaw.sorted { $0.mapEm != $1.mapEm ? $0.mapEm > $1.mapEm : $0.text < $1.text }
        let now = CACurrentMediaTime()
        let old = nationItems
        let oldPlaces = old.map { NameStability.Placement(text: $0.text, x: Double($0.targetX), y: Double($0.targetY), em: Double($0.targetEm), angle: Double($0.targetAngle)) }
        let newPlaces = fresh.map { NameStability.Placement(text: $0.text, x: Double($0.x), y: Double($0.y), em: Double($0.mapEm), angle: Double($0.angle)) }
        let matches = NameStability.match(old: oldPlaces, fresh: newPlaces)

        var next: [NationItem] = []
        next.reserveCapacity(fresh.count)
        for (f, m) in zip(fresh, matches) {
            if let i = m.reuse, old.indices.contains(i) {
                let o = old[i]
                let curPos = currentNationState(o, now: now)
                if m.keep {
                    next.append(NationItem(
                        text: f.text,
                        x: curPos.x, y: curPos.y, mapEm: curPos.em, angle: curPos.angle,
                        targetX: o.targetX, targetY: o.targetY, targetEm: o.targetEm, targetAngle: o.targetAngle,
                        startX: curPos.x, startY: curPos.y, startEm: curPos.em, startAngle: curPos.angle,
                        animStart: now, animDuration: 0, minPoints: f.minPt, alpha: 1
                    ))
                } else {
                    let dur: CFTimeInterval = animated ? 0.35 : 0
                    next.append(NationItem(
                        text: f.text,
                        x: curPos.x, y: curPos.y, mapEm: curPos.em, angle: curPos.angle,
                        targetX: f.x, targetY: f.y, targetEm: f.mapEm, targetAngle: f.angle,
                        startX: curPos.x, startY: curPos.y, startEm: curPos.em, startAngle: curPos.angle,
                        animStart: now, animDuration: dur, minPoints: f.minPt, alpha: 1
                    ))
                }
            } else {
                next.append(NationItem(
                    text: f.text,
                    x: f.x, y: f.y, mapEm: f.mapEm, angle: f.angle,
                    targetX: f.x, targetY: f.y, targetEm: f.mapEm, targetAngle: f.angle,
                    startX: f.x, startY: f.y, startEm: f.mapEm, startAngle: f.angle,
                    animStart: now, animDuration: 0, minPoints: f.minPt, alpha: 1
                ))
            }
        }
        nationItems = next
    }

    private func currentNationState(_ item: NationItem, now: CFTimeInterval) -> (x: Float, y: Float, em: Float, angle: Float) {
        guard item.animDuration > 1e-4 else { return (item.targetX, item.targetY, item.targetEm, item.targetAngle) }
        let raw = Float(max(0, min(1, (now - item.animStart) / item.animDuration)))
        let t = raw * raw * (3 - 2 * raw)
        return (
            item.startX + (item.targetX - item.startX) * t,
            item.startY + (item.targetY - item.startY) * t,
            item.startEm + (item.targetEm - item.startEm) * t,
            item.startAngle + (item.targetAngle - item.startAngle) * t
        )
    }

    /// 一次性视口无关的世界空间城市 LOD 预排：
    /// 都城优先（极低 revealScale，永远清晰显示且固定于都城环正上方），其余城池按人口/重要度降序贪心计算
    /// 其与全部更高优先级城池在屏幕上不重叠的精确最小缩放倍 `revealScale`！滑屏/缩放 100% 稳定，绝不跳动！
    func setCities(map: WorldMap) {
        let marks = MapLayers.cityMarks(map)
        let provs = map.meta.provinces
        struct Candidate {
            let text: String
            let x: Float
            let y: Float
            let isCapital: Bool
            let province: Int
            let halfWPx: Float
            let halfHPx: Float
            let priority: Double
        }
        var cands: [Candidate] = []
        cands.reserveCapacity(map.meta.cities.count)
        for (i, c) in map.meta.cities.enumerated() {
            guard i < marks.count else { continue }
            guard c.x.isFinite, c.y.isFinite, !c.name.isEmpty else { continue }
            let isCap = marks[i] == .capital
            let isSeat = marks[i] == .provinceSeat
            let fontSize: Float = isCap ? 11.2 : 9.4
            let emW = measureTextEmWidth(c.name)
            let halfW = max(14, emW * fontSize * 0.5 + 5)
            let halfH: Float = isCap ? 9.5 : 8.0
            let pop = provs.indices.contains(c.province) ? Double(provs[c.province].population) : 0
            let prio = (isCap ? 1_000_000_000.0 : 0.0) + pop + (isSeat ? 500_000.0 : 0.0)
            cands.append(Candidate(text: c.name, x: c.x, y: c.y, isCapital: isCap, province: c.province, halfWPx: halfW, halfHPx: halfH, priority: prio))
        }
        cands.sort { $0.priority != $1.priority ? $0.priority > $1.priority : $0.text < $1.text }

        // 对每座城计算「与已接受的更高优城池完全不重叠的最小缩放比」：
        // 屏幕距离 |dx|*s >= halfW1 + halfW2 或 |dy|*s >= halfH1 + halfH2  =>  s >= min((halfW1+halfW2)/|dx|, (halfH1+halfH2)/|dy|)
        var placed: [(x: Float, y: Float, hw: Float, hh: Float, reveal: Float, isCap: Bool)] = []
        placed.reserveCapacity(cands.count)
        var result: [CityItem] = []
        result.reserveCapacity(cands.count)
        for c in cands {
            var reqScale: Float = c.isCapital ? 0.42 : 1.05
            for p in placed {
                let adx = abs(c.x - p.x)
                let ady = abs(c.y - p.y)
                let needX = (c.halfWPx + p.hw) / max(0.01, adx)
                let needY = (c.halfHPx + p.hh) / max(0.01, ady)
                let sepScale = min(needX, needY)
                if sepScale > reqScale {
                    // 仅需与已在 reqScale 可见或更高优先级的城避让
                    reqScale = min(14.0, sepScale)
                }
            }
            if c.isCapital { reqScale = min(reqScale, 2.2) }
            placed.append((c.x, c.y, c.halfWPx, c.halfHPx, reqScale, c.isCapital))
            result.append(CityItem(text: c.text, x: c.x, y: c.y, isCapital: c.isCapital, province: c.province, revealScale: reqScale, priority: c.priority))
        }
        cityItems = result
    }

    func visibleNationSnapshot() -> [String: Float] {
        var out: [String: Float] = [:]
        for (idx, n) in nationItems.enumerated() where n.alpha > 0.01 {
            out["\(n.text)#\(idx)"] = n.alpha * revealAlpha
        }
        return out
    }

    // MARK: - Glyph Rasterization (Dual-Channel Crisp Ink + Soft Halo)

    private func measureTextEmWidth(_ text: String) -> Float {
        var w: Float = 0
        for ch in text {
            if let g = ensureGlyph(String(ch)) {
                w += g.advanceEm
            } else {
                w += 0.55
            }
        }
        return max(0.5, w)
    }

    private func ensureGlyph(_ ch: String) -> GlyphEntry? {
        if let hit = glyphs[ch] { return hit }
        if ch == " " {
            let sp = GlyphEntry(u0: 0, v0: 0, u1: 0, v1: 0, widthEm: 0.35, heightEm: 1.0, advanceEm: 0.38, bearingXEm: 0, bearingYEm: 0)
            glyphs[ch] = sp
            return sp
        }
        let attr: [NSAttributedString.Key: Any] = [.font: atlasFont]
        let ns = ch as NSString
        let rawSize = ns.size(withAttributes: attr)
        let gw = max(4, min(140, Int(ceil(rawSize.width)) + glyphPad * 2))
        let gh = max(4, min(140, Int(ceil(rawSize.height)) + glyphPad * 2))

        if shelfX + gw + 2 > atlasSize {
            shelfX = 2
            shelfY += shelfH + 2
            shelfH = 0
        }
        if shelfY + gh + 2 > atlasSize {
            // 图集满时重置书架（2048×2048 可容纳 ~1,000+ 不同汉字，单局几乎永不溢出）
            glyphs.removeAll(keepingCapacity: true)
            shelfX = 2; shelfY = 2; shelfH = 0
        }
        let px = shelfX
        let py = shelfY
        shelfX += gw + 2
        if gh > shelfH { shelfH = gh }

        // 1) 光栅化清晰正楷墨芯（绝不加 -3.5 假粗描边！笔画锐利通透）
        var inkBuf = [UInt8](repeating: 0, count: gw * gh)
        if let cgInk = CGContext(
            data: &inkBuf, width: gw, height: gh, bitsPerComponent: 8, bytesPerRow: gw,
            space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) {
            cgInk.setAllowsAntialiasing(true)
            cgInk.setShouldAntialias(true)
            cgInk.translateBy(x: 0, y: CGFloat(gh))
            cgInk.scaleBy(x: 1, y: -1)
            UIGraphicsPushContext(cgInk)
            ns.draw(at: CGPoint(x: CGFloat(glyphPad), y: CGFloat(glyphPad)), withAttributes: [
                .font: atlasFont,
                .foregroundColor: UIColor.white
            ])
            UIGraphicsPopContext()
        }

        // 2) 光栅化柔和外晕（纯白圆角外描边，提供柔和宣纸描边通道 G）
        var haloBuf = [UInt8](repeating: 0, count: gw * gh)
        if let cgHalo = CGContext(
            data: &haloBuf, width: gw, height: gh, bitsPerComponent: 8, bytesPerRow: gw,
            space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) {
            cgHalo.setAllowsAntialiasing(true)
            cgHalo.setShouldAntialias(true)
            cgHalo.setLineJoin(.round)
            cgHalo.setLineCap(.round)
            cgHalo.translateBy(x: 0, y: CGFloat(gh))
            cgHalo.scaleBy(x: 1, y: -1)
            UIGraphicsPushContext(cgHalo)
            ns.draw(at: CGPoint(x: CGFloat(glyphPad), y: CGFloat(glyphPad)), withAttributes: [
                .font: atlasFont,
                .strokeColor: UIColor.white,
                .strokeWidth: 18.0
            ])
            UIGraphicsPopContext()
        }

        // 合并至双通道 RGBA 上传（R = ink, G = max(ink, halo), B = 0, A = 255）
        var rgba = [UInt8](repeating: 0, count: gw * gh * 4)
        for i in 0..<(gw * gh) {
            let r = inkBuf[i]
            let g = max(r, haloBuf[i])
            let off = i * 4
            rgba[off] = r
            rgba[off + 1] = g
            rgba[off + 2] = 0
            rgba[off + 3] = 255
        }
        atlasTexture.replace(
            region: MTLRegionMake2D(px, py, gw, gh),
            mipmapLevel: 0,
            withBytes: rgba,
            bytesPerRow: gw * 4
        )
        atlasDirtyMipmaps = true

        let inv = 1.0 / Float(atlasSize)
        let em = Float(glyphFontSize)
        let entry = GlyphEntry(
            u0: Float(px) * inv,
            v0: Float(py) * inv,
            u1: Float(px + gw) * inv,
            v1: Float(py + gh) * inv,
            widthEm: Float(gw) / em,
            heightEm: Float(gh) / em,
            advanceEm: Float(rawSize.width) / em,
            bearingXEm: Float(glyphPad) / em,
            bearingYEm: 0
        )
        glyphs[ch] = entry
        return entry
    }

    /// 若本帧有新汉字入图集，在开始 RenderPass 之前由 BlitEncoder 生成硬件 Mipmap（每局仅首几帧触发，零后续开销）。
    func flushMipmapsIfNeeded(commandBuffer: MTLCommandBuffer) {
        guard atlasDirtyMipmaps else { return }
        atlasDirtyMipmaps = false
        if let blit = commandBuffer.makeBlitCommandEncoder() {
            blit.generateMipmaps(for: atlasTexture)
            blit.endEncoding()
        }
    }

    // MARK: - Vertex Emission Helpers

    private func emitText(
        _ text: String,
        worldX: Float, worldY: Float,
        pxOffsetX: Float, pxOffsetY: Float,
        fontSizePx: Float,
        angle: Float,
        letterSpacingEm: Float,
        fillR: Float, fillG: Float, fillB: Float,
        alpha: Float,
        haloStrength: Float
    ) {
        guard alpha > 0.005, fontSizePx >= 2.5, !text.isEmpty else { return }
        var entries: [GlyphEntry] = []
        entries.reserveCapacity(text.count)
        var totalAdv: Float = 0
        for ch in text {
            if let g = ensureGlyph(String(ch)) {
                entries.append(g)
                totalAdv += g.advanceEm
            }
        }
        guard !entries.isEmpty else { return }
        if entries.count > 1 { totalAdv += letterSpacingEm * Float(entries.count - 1) }

        let totalW = totalAdv * fontSizePx
        let ca = cos(angle), sa = sin(angle)
        var cursorX: Float = -totalW * 0.5

        for g in entries {
            let adv = g.advanceEm * fontSizePx
            if g.u1 > g.u0 {
                let qw = g.widthEm * fontSizePx
                let qh = g.heightEm * fontSizePx
                let pad = g.bearingXEm * fontSizePx
                let x0 = cursorX - pad
                let x1 = x0 + qw
                let y0 = -qh * 0.5
                let y1 = qh * 0.5

                @inline(__always)
                func rot(_ lx: Float, _ ly: Float) -> (Float, Float) {
                    (pxOffsetX + lx * ca - ly * sa, pxOffsetY + lx * sa + ly * ca)
                }
                let p00 = rot(x0, y0)
                let p10 = rot(x1, y0)
                let p01 = rot(x0, y1)
                let p11 = rot(x1, y1)

                let v00 = LabelVertex(worldX: worldX, worldY: worldY, pxX: p00.0, pxY: p00.1, uvX: g.u0, uvY: g.v0, fillR: fillR, fillG: fillG, fillB: fillB, alpha: alpha, haloA: haloStrength, mode: 0)
                let v10 = LabelVertex(worldX: worldX, worldY: worldY, pxX: p10.0, pxY: p10.1, uvX: g.u1, uvY: g.v0, fillR: fillR, fillG: fillG, fillB: fillB, alpha: alpha, haloA: haloStrength, mode: 0)
                let v01 = LabelVertex(worldX: worldX, worldY: worldY, pxX: p01.0, pxY: p01.1, uvX: g.u0, uvY: g.v1, fillR: fillR, fillG: fillG, fillB: fillB, alpha: alpha, haloA: haloStrength, mode: 0)
                let v11 = LabelVertex(worldX: worldX, worldY: worldY, pxX: p11.0, pxY: p11.1, uvX: g.u1, uvY: g.v1, fillR: fillR, fillG: fillG, fillB: fillB, alpha: alpha, haloA: haloStrength, mode: 0)

                scratchVerts.append(v00); scratchVerts.append(v10); scratchVerts.append(v01)
                scratchVerts.append(v01); scratchVerts.append(v10); scratchVerts.append(v11)
            }
            cursorX += adv + letterSpacingEm * fontSizePx
        }
    }

    private func emitPill(
        worldX: Float, worldY: Float,
        cxPx: Float, cyPx: Float,
        wPx: Float, hPx: Float,
        r: Float, g: Float, b: Float, a: Float
    ) {
        let x0 = cxPx - wPx * 0.5, x1 = cxPx + wPx * 0.5
        let y0 = cyPx - hPx * 0.5, y1 = cyPx + hPx * 0.5
        let v00 = LabelVertex(worldX: worldX, worldY: worldY, pxX: x0, pxY: y0, uvX: 0, uvY: 0, fillR: r, fillG: g, fillB: b, alpha: a, haloA: 0, mode: 1)
        let v10 = LabelVertex(worldX: worldX, worldY: worldY, pxX: x1, pxY: y0, uvX: 1, uvY: 0, fillR: r, fillG: g, fillB: b, alpha: a, haloA: 0, mode: 1)
        let v01 = LabelVertex(worldX: worldX, worldY: worldY, pxX: x0, pxY: y1, uvX: 0, uvY: 1, fillR: r, fillG: g, fillB: b, alpha: a, haloA: 0, mode: 1)
        let v11 = LabelVertex(worldX: worldX, worldY: worldY, pxX: x1, pxY: y1, uvX: 1, uvY: 1, fillR: r, fillG: g, fillB: b, alpha: a, haloA: 0, mode: 1)
        scratchVerts.append(v00); scratchVerts.append(v10); scratchVerts.append(v01)
        scratchVerts.append(v01); scratchVerts.append(v10); scratchVerts.append(v11)
    }

    // MARK: - Render Pass 1: World-Space Country Names (Pre-Parchment, Printed-On-Map Aesthetics!)

    func drawNations(
        encoder: MTLRenderCommandEncoder,
        commandBuffer: MTLCommandBuffer,
        uniforms: inout MapRenderer.Uniforms,
        camera: MapCamera,
        viewport: CGSize,
        now: CFTimeInterval
    ) {
        guard revealAlpha > 0.01, !nationItems.isEmpty else { return }
        scratchVerts.removeAll(keepingCapacity: true)
        let scale = Float(camera.scale)
        let halfW = Float(viewport.width) * 0.5 / max(0.001, scale) + 180
        let halfH = Float(viewport.height) * 0.5 / max(0.001, scale) + 180
        let cx = Float(camera.centerX), cy = Float(camera.centerY)

        // 温润深松烟墨 (#211912)，告别死黑压屏
        let inkR: Float = 0.130, inkG: Float = 0.098, inkB: Float = 0.071

        for item in nationItems {
            let st = currentNationState(item, now: now)
            // 宽松世界空间视野剔除（仅跳过完全远离屏幕的国名，绝不做视口边界偏移或碰撞重排！）
            if abs(st.x - cx) > halfW || abs(st.y - cy) > halfH { continue }
            let rawPt = st.em * scale * nameScale
            guard rawPt >= item.minPoints else { continue }
            let fontPx = min(84.0, rawPt)
            // 近景大字稍微半透明融入羊皮纸，远景清晰凝练
            let fadeIn = min(1.0, max(0.0, (rawPt - item.minPoints) / 3.5))
            let zoomSoft: Float = rawPt > 48 ? max(0.72, 1.0 - (rawPt - 48) / 140.0) : 0.94
            let a = item.alpha * revealAlpha * fadeIn * zoomSoft
            let spacing: Float = item.text.count <= 3 ? 0.14 : 0.05
            emitText(
                item.text,
                worldX: st.x, worldY: st.y,
                pxOffsetX: 0, pxOffsetY: 0,
                fontSizePx: fontPx,
                angle: st.angle,
                letterSpacingEm: spacing,
                fillR: inkR, fillG: inkG, fillB: inkB,
                alpha: a,
                haloStrength: 0.88
            )
        }
        submit(pool: nationPool, encoder: encoder, commandBuffer: commandBuffer, uniforms: &uniforms)
    }

    // MARK: - Render Pass 2: Capitals & Cities (Post-Parchment, Viewport-Independent RevealScale!)

    func drawCities(
        encoder: MTLRenderCommandEncoder,
        commandBuffer: MTLCommandBuffer,
        uniforms: inout MapRenderer.Uniforms,
        camera: MapCamera,
        viewport: CGSize
    ) {
        guard showCities, revealAlpha > 0.01, !cityItems.isEmpty else { return }
        scratchVerts.removeAll(keepingCapacity: true)
        let scale = Float(camera.scale)
        let halfW = Float(viewport.width) * 0.5 / max(0.001, scale) + 80
        let halfH = Float(viewport.height) * 0.5 / max(0.001, scale) + 80
        let cx = Float(camera.centerX), cy = Float(camera.centerY)

        for c in cityItems {
            let isSelected = (selectedProvince != nil && c.province == selectedProvince)
            let effReveal = isSelected ? 0.0 : c.revealScale
            if !isSelected && scale < effReveal * 0.88 { continue }
            if abs(c.x - cx) > halfW || abs(c.y - cy) > halfH { continue }

            let fade: Float = isSelected ? 1.0 : min(1.0, max(0.0, (scale - effReveal * 0.88) / max(0.15, effReveal * 0.26)))
            let fontPx: Float = c.isCapital ? min(13.5, max(10.5, 9.8 + scale * 0.85)) : min(11.5, max(8.8, 8.2 + scale * 0.55))
            // 固定在城环正上方偏移（永不随屏幕边缘上下翻转！）
            let yLift: Float = c.isCapital ? -12.5 : -10.0
            let r: Float = c.isCapital ? 0.620 : 0.212
            let g: Float = c.isCapital ? 0.102 : 0.169
            let b: Float = c.isCapital ? 0.071 : 0.133
            emitText(
                c.text,
                worldX: c.x, worldY: c.y,
                pxOffsetX: 0, pxOffsetY: yLift,
                fontSizePx: fontPx,
                angle: 0,
                letterSpacingEm: c.isCapital ? 0.06 : 0.02,
                fillR: r, fillG: g, fillB: b,
                alpha: fade * revealAlpha,
                haloStrength: 0.94
            )
        }
        submit(pool: cityPool, encoder: encoder, commandBuffer: commandBuffer, uniforms: &uniforms)
    }

    // MARK: - Render Pass 3: GPU Troop Count Pills & Commander Flags (120Hz Zero-Lag Lock!)

    struct TroopBadgeInput {
        let worldX: Float
        let worldY: Float
        let spreadPxX: Float
        let spreadPxY: Float
        let text: String
        let ratio: Float
        let barR: Float
        let barG: Float
        let barB: Float
        let isFleet: Bool
    }

    func drawTroopBadges(
        _ items: [TroopBadgeInput],
        encoder: MTLRenderCommandEncoder,
        commandBuffer: MTLCommandBuffer,
        uniforms: inout MapRenderer.Uniforms,
        camera: MapCamera,
        viewport: CGSize,
        iconPixels: Float
    ) {
        guard revealAlpha > 0.95, !items.isEmpty, camera.scale >= 0.48 else { return }
        scratchVerts.removeAll(keepingCapacity: true)
        let scale = Float(camera.scale)
        let halfW = Float(viewport.width) * 0.5 / max(0.001, scale) + 60
        let halfH = Float(viewport.height) * 0.5 / max(0.001, scale) + 60
        let cx = Float(camera.centerX), cy = Float(camera.centerY)
        let baseLiftY = iconPixels * 0.56 + 6.5

        for it in items {
            if abs(it.worldX - cx) > halfW || abs(it.worldY - cy) > halfH { continue }
            guard !it.text.isEmpty else { continue }
            let fontPx: Float = 9.0
            let textW = measureTextEmWidth(it.text) * fontPx
            let pillW = max(26.0, textW + 8.0)
            let pillH: Float = 12.5
            let pxX = it.spreadPxX
            let pxY = it.spreadPxY + baseLiftY

            // 深漆底牌
            emitPill(worldX: it.worldX, worldY: it.worldY, cxPx: pxX, cyPx: pxY, wPx: pillW, hPx: pillH, r: 0.11, g: 0.09, b: 0.07, a: 0.80 * revealAlpha)
            // 底部精锐/士气进度细条
            let frac = max(0.08, min(1.0, it.ratio))
            let barW = (pillW - 4.0) * frac
            let barX = pxX - (pillW - 4.0) * 0.5 + barW * 0.5
            emitPill(worldX: it.worldX, worldY: it.worldY, cxPx: barX, cyPx: pxY + pillH * 0.5 - 1.5, wPx: barW, hPx: 2.2, r: it.barR, g: it.barG, b: it.barB, a: 0.95 * revealAlpha)
            // 清晰宣白兵力数字
            emitText(
                it.text,
                worldX: it.worldX, worldY: it.worldY,
                pxOffsetX: pxX, pxOffsetY: pxY - 0.8,
                fontSizePx: fontPx,
                angle: 0,
                letterSpacingEm: 0.0,
                fillR: 0.97, fillG: 0.95, fillB: 0.90,
                alpha: 0.96 * revealAlpha,
                haloStrength: 0.0
            )
        }
        submit(pool: troopPool, encoder: encoder, commandBuffer: commandBuffer, uniforms: &uniforms)
    }

    /// 返回当前活跃国名标签的稳定键与透明度（供 CI `ShotTour` 连续帧国名稳定性校验读取）。
    func nameFrame() -> [String: Float] {
        var out: [String: Float] = [:]
        out.reserveCapacity(nationItems.count)
        for item in nationItems where item.alpha > 0.01 {
            out["\(item.text)#\(item.id)"] = item.alpha * revealAlpha
        }
        return out
    }

    private func submit(pool: MapBufferPool, encoder: MTLRenderCommandEncoder, commandBuffer: MTLCommandBuffer, uniforms: inout MapRenderer.Uniforms) {
        guard !scratchVerts.isEmpty else { return }
        let byteLen = scratchVerts.count * MemoryLayout<LabelVertex>.stride
        guard let buf = pool.write(device: device, length: byteLen, capacity: max(2048, byteLen * 3 / 2), { b in
            scratchVerts.withUnsafeBytes { raw in
                if let base = raw.baseAddress { memcpy(b.contents(), base, byteLen) }
            }
        }) else { return }
        encoder.setRenderPipelineState(pipeline)
        encoder.setVertexBuffer(buf, offset: 0, index: 0)
        encoder.setVertexBytes(&uniforms, length: MemoryLayout<MapRenderer.Uniforms>.stride, index: 2)
        encoder.setFragmentTexture(atlasTexture, index: 0)
        encoder.setFragmentSamplerState(sampler, index: 0)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: scratchVerts.count)
        pool.recordRead(in: commandBuffer)
    }
}
