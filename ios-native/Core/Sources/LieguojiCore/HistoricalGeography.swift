import Foundation
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#endif

/// v8.0.0 真实地理水系与山川地形引擎（零随机假河）：
/// - 内置中国/华夏、日本列岛、欧洲、东亚/东南亚、地中海/中东及全球 65+ 条真实 WGS-84 大江大河精确经纬度折线；
/// - 按当前历史剧本底图投影生成平滑渐变河道三角网，真实切入山谷与平原，入海口自然止于真实海岸线；
/// - 自动标识大河沿线州郡（长江、黄河、莱茵河、多瑙河、第聂伯河、维斯瓦河、伏尔加河等），赋予真实渡河防线加成与冲积平原肥力。
public enum HistoricalGeography {
    public struct RiverSpec: Sendable {
        public let name: String
        /// 3 = 特大干流（长江/黄河/伏尔加/多瑙/尼罗/密西西比/亚马孙），2 = 一级干流/战略天堑（莱茵/第聂伯/维斯瓦/珠江/松花江/汉水/淮河等），1 = 重要支流/区域大河
        public let tier: Int
        public let points: [(lon: Double, lat: Double)]

        public init(_ name: String, tier: Int, _ points: [(Double, Double)]) {
            self.name = name
            self.tier = tier
            self.points = points.map { (lon: $0.0, lat: $0.1) }
        }
    }

    // MARK: - 真实地理大江大河 WGS-84 折线库（68 条）

    public static let realRivers: [RiverSpec] = [
        // ================= 中国 · 华夏 · 东亚 =================
        RiverSpec("长江", tier: 3, [
            (92.0, 33.4), (94.8, 33.1), (97.1, 32.8), (98.9, 30.8), (99.4, 28.4),
            (100.2, 26.8), (101.8, 26.6), (103.5, 27.6), (104.6, 28.8), (106.55, 29.56),
            (108.4, 30.8), (110.2, 31.0), (111.3, 30.7), (112.2, 30.3), (113.1, 29.4),
            (114.3, 30.58), (115.98, 29.72), (117.05, 30.52), (118.4, 31.35), (118.79, 32.06),
            (119.45, 32.22), (120.85, 31.95), (121.65, 31.38)
        ]),
        RiverSpec("黄河", tier: 3, [
            (96.0, 34.8), (99.0, 34.5), (101.8, 34.2), (102.5, 35.8), (103.83, 36.06),
            (105.2, 37.5), (106.3, 38.5), (106.8, 39.8), (107.4, 40.8), (109.8, 40.5),
            (111.2, 40.2), (111.0, 38.5), (110.5, 36.8), (110.25, 34.62), (111.5, 34.82),
            (113.65, 34.92), (115.0, 35.25), (116.2, 36.15), (117.0, 36.78), (118.1, 37.45),
            (119.1, 37.75)
        ]),
        RiverSpec("汉水", tier: 2, [
            (106.2, 33.2), (107.03, 33.07), (109.0, 32.7), (110.8, 32.8),
            (111.7, 32.4), (112.15, 32.04), (112.6, 31.2), (113.5, 30.5), (114.28, 30.56)
        ]),
        RiverSpec("淮河", tier: 2, [
            (113.4, 32.4), (114.6, 32.2), (115.8, 32.4), (116.8, 32.6),
            (117.35, 32.95), (118.4, 33.1), (118.9, 33.3), (119.5, 33.9), (120.2, 34.25)
        ]),
        RiverSpec("渭河", tier: 2, [
            (104.2, 35.1), (105.7, 34.58), (107.15, 34.36), (108.94, 34.38), (110.25, 34.60)
        ]),
        RiverSpec("嘉陵江", tier: 1, [
            (106.0, 33.6), (105.8, 32.4), (106.0, 31.5), (106.1, 30.7), (106.55, 29.56)
        ]),
        RiverSpec("岷江", tier: 1, [
            (103.6, 32.6), (103.6, 31.0), (103.85, 30.1), (103.77, 29.56), (104.6, 28.8)
        ]),
        RiverSpec("湘江", tier: 1, [
            (110.8, 25.4), (111.6, 26.4), (112.6, 26.9), (112.95, 28.23), (113.1, 29.37)
        ]),
        RiverSpec("赣江", tier: 1, [
            (114.9, 25.85), (114.98, 27.11), (115.5, 28.0), (115.86, 28.68), (116.1, 29.65)
        ]),
        RiverSpec("珠江", tier: 2, [
            (104.5, 25.0), (106.6, 24.7), (108.3, 23.8), (109.4, 23.6),
            (110.1, 23.4), (111.28, 23.48), (112.46, 23.05), (113.26, 23.12), (113.65, 22.75)
        ]),
        RiverSpec("京杭大运河", tier: 1, [
            (116.65, 39.9), (117.2, 39.12), (116.35, 37.45), (116.0, 36.45),
            (116.58, 35.42), (117.55, 34.55), (118.3, 33.95), (119.1, 33.55),
            (119.42, 32.39), (119.97, 31.81), (120.62, 31.30), (120.16, 30.28)
        ]),
        RiverSpec("海河", tier: 1, [
            (114.9, 40.4), (116.1, 39.8), (117.2, 39.12), (117.75, 39.0)
        ]),
        RiverSpec("汾河", tier: 1, [
            (112.1, 38.8), (112.55, 37.87), (111.8, 37.0), (111.5, 36.08), (110.6, 35.5)
        ]),
        RiverSpec("钱塘江", tier: 1, [
            (118.4, 29.6), (119.5, 29.5), (120.16, 30.26), (120.8, 30.35)
        ]),
        RiverSpec("闽江", tier: 1, [
            (117.6, 26.8), (118.2, 26.6), (119.3, 26.07), (119.65, 26.1)
        ]),
        RiverSpec("辽河", tier: 2, [
            (119.0, 43.2), (122.2, 43.6), (123.7, 42.9), (123.2, 41.8), (122.2, 40.7)
        ]),
        RiverSpec("松花江", tier: 2, [
            (128.0, 42.1), (126.55, 43.85), (125.0, 45.2), (126.6, 45.78),
            (128.8, 46.0), (130.35, 46.82), (132.5, 47.7)
        ]),
        RiverSpec("嫩江", tier: 1, [
            (124.2, 50.5), (125.2, 49.1), (123.95, 47.35), (124.6, 45.5)
        ]),
        RiverSpec("黑龙江", tier: 3, [
            (117.5, 49.8), (121.4, 53.3), (124.7, 53.1), (126.9, 51.3), (127.5, 50.25),
            (129.8, 49.0), (131.5, 47.8), (133.5, 48.2), (135.08, 48.48), (137.0, 50.5),
            (140.4, 52.8), (141.0, 53.1)
        ]),
        RiverSpec("乌苏里江", tier: 1, [
            (133.6, 45.0), (133.9, 46.5), (134.5, 47.6), (135.05, 48.46)
        ]),
        RiverSpec("鸭绿江", tier: 1, [
            (128.1, 41.8), (126.9, 41.4), (125.5, 40.7), (124.38, 40.0)
        ]),
        RiverSpec("汉江朝鲜", tier: 1, [
            (128.8, 37.3), (127.9, 37.5), (126.98, 37.56), (126.5, 37.75)
        ]),
        RiverSpec("塔里木河", tier: 2, [
            (76.2, 39.2), (79.5, 40.5), (82.8, 41.2), (86.0, 41.3), (88.4, 40.2)
        ]),
        RiverSpec("雅鲁藏布江", tier: 2, [
            (82.5, 30.2), (85.5, 29.4), (88.88, 29.3), (91.1, 29.35), (94.3, 29.5),
            (95.4, 29.8), (95.0, 28.0), (93.8, 26.8), (90.0, 25.8), (90.5, 23.0)
        ]),
        RiverSpec("湄公河", tier: 3, [
            (95.0, 32.8), (98.8, 29.5), (99.2, 26.2), (100.3, 23.2), (100.8, 21.2),
            (102.1, 19.9), (102.6, 17.95), (104.8, 16.5), (105.8, 15.1), (105.9, 13.5),
            (104.92, 11.56), (106.4, 9.95)
        ]),
        RiverSpec("伊洛瓦底江", tier: 2, [
            (97.5, 27.2), (97.4, 25.4), (96.2, 23.8), (96.08, 21.95),
            (94.9, 20.8), (95.2, 18.8), (95.6, 16.8), (95.2, 15.9)
        ]),
        RiverSpec("红河", tier: 1, [
            (100.8, 24.8), (102.8, 23.2), (104.0, 22.5), (105.84, 21.03), (106.6, 20.3)
        ]),
        RiverSpec("昭披耶河", tier: 1, [
            (100.1, 17.2), (100.1, 15.7), (100.56, 14.35), (100.5, 13.75), (100.58, 13.52)
        ]),

        // ================= 日本列岛 =================
        RiverSpec("信浓川", tier: 2, [
            (138.4, 35.95), (138.0, 36.25), (138.22, 36.62), (138.85, 37.45), (139.05, 37.95)
        ]),
        RiverSpec("利根川", tier: 2, [
            (139.0, 36.85), (139.08, 36.38), (139.55, 36.18), (140.15, 35.88), (140.85, 35.75)
        ]),
        RiverSpec("淀川", tier: 1, [
            (136.05, 35.25), (135.87, 35.0), (135.72, 34.9), (135.52, 34.7), (135.42, 34.67)
        ]),
        RiverSpec("木曾川", tier: 1, [
            (137.75, 35.9), (137.35, 35.5), (136.92, 35.38), (136.7, 35.12)
        ]),
        RiverSpec("北上川", tier: 1, [
            (141.2, 40.0), (141.15, 39.7), (141.12, 39.25), (141.2, 38.8), (141.32, 38.42)
        ]),
        RiverSpec("石狩川", tier: 2, [
            (142.9, 43.7), (142.37, 43.77), (141.85, 43.55), (141.55, 43.25), (141.35, 43.25)
        ]),
        RiverSpec("阿武隈川", tier: 1, [
            (140.15, 37.15), (140.42, 37.55), (140.48, 37.76), (140.92, 38.06)
        ]),
        RiverSpec("筑后川", tier: 1, [
            (131.05, 33.15), (130.72, 33.32), (130.51, 33.32), (130.35, 33.15)
        ]),

        // ================= 欧洲 · 俄罗斯 =================
        RiverSpec("莱茵河", tier: 3, [
            (8.8, 46.65), (9.5, 47.45), (7.59, 47.56), (7.78, 48.58), (8.45, 49.48),
            (7.6, 50.35), (6.96, 50.94), (6.77, 51.23), (5.9, 51.85), (4.48, 51.92), (4.1, 51.98)
        ]),
        RiverSpec("多瑙河", tier: 3, [
            (8.5, 48.0), (10.0, 48.4), (12.1, 49.0), (13.45, 48.57), (16.37, 48.21),
            (17.11, 48.15), (18.8, 47.8), (19.04, 47.50), (19.0, 45.8), (20.46, 44.82),
            (22.6, 44.4), (24.5, 43.7), (26.0, 43.85), (27.9, 44.3), (28.0, 45.4), (29.55, 45.2)
        ]),
        RiverSpec("伏尔加河", tier: 3, [
            (32.5, 57.2), (35.9, 56.86), (38.3, 57.6), (40.9, 57.75), (44.0, 56.32),
            (47.2, 56.15), (49.1, 55.78), (48.4, 54.3), (50.1, 53.2), (46.0, 51.53),
            (44.52, 48.70), (46.2, 47.8), (48.04, 46.35), (48.3, 45.7)
        ]),
        RiverSpec("第聂伯河", tier: 3, [
            (33.7, 55.8), (32.04, 54.78), (30.35, 53.9), (30.55, 52.0), (30.52, 50.45),
            (32.05, 49.45), (35.04, 48.46), (35.15, 47.82), (33.5, 47.0), (32.6, 46.63), (32.25, 46.55)
        ]),
        RiverSpec("顿河", tier: 2, [
            (38.3, 54.0), (39.2, 51.67), (40.5, 50.2), (42.8, 49.5),
            (43.4, 48.6), (42.1, 47.6), (39.71, 47.22), (39.25, 47.1)
        ]),
        RiverSpec("维斯瓦河", tier: 2, [
            (18.9, 49.65), (19.94, 50.06), (21.75, 50.7), (21.85, 51.5),
            (21.01, 52.23), (19.7, 52.55), (18.6, 53.02), (18.9, 54.15), (18.95, 54.36)
        ]),
        RiverSpec("奥得河", tier: 2, [
            (17.6, 49.6), (18.2, 50.1), (17.03, 51.11), (15.6, 52.05),
            (14.55, 52.35), (14.2, 53.0), (14.55, 53.43), (14.5, 53.85)
        ]),
        RiverSpec("易北河", tier: 2, [
            (15.5, 50.7), (14.4, 50.3), (13.74, 51.05), (12.6, 51.85),
            (11.63, 52.13), (11.5, 53.0), (10.0, 53.55), (8.9, 53.88)
        ]),
        RiverSpec("塞纳河", tier: 2, [
            (4.7, 47.5), (4.07, 48.3), (2.7, 48.55), (2.35, 48.86),
            (1.1, 49.44), (0.12, 49.48)
        ]),
        RiverSpec("卢瓦尔河", tier: 2, [
            (4.2, 44.85), (4.05, 46.05), (3.15, 46.98), (1.9, 47.90),
            (0.68, 47.39), (-0.55, 47.46), (-1.55, 47.22), (-2.18, 47.27)
        ]),
        RiverSpec("罗纳河", tier: 2, [
            (8.3, 46.55), (6.9, 46.2), (6.14, 46.20), (4.83, 45.76),
            (4.88, 44.93), (4.80, 43.95), (4.82, 43.35)
        ]),
        RiverSpec("加龙河", tier: 1, [
            (0.9, 42.7), (1.44, 43.60), (0.62, 44.2), (-0.58, 44.84), (-1.05, 45.55)
        ]),
        RiverSpec("泰晤士河", tier: 2, [
            (-2.0, 51.68), (-1.26, 51.75), (-0.97, 51.46), (-0.12, 51.50), (0.65, 51.50)
        ]),
        RiverSpec("波河", tier: 2, [
            (7.1, 44.7), (7.68, 45.07), (8.8, 45.12), (9.7, 45.06),
            (10.8, 45.04), (11.6, 44.9), (12.48, 44.95)
        ]),
        RiverSpec("台伯河", tier: 1, [
            (12.1, 43.75), (12.4, 43.1), (12.48, 42.3), (12.48, 41.90), (12.24, 41.73)
        ]),
        RiverSpec("埃布罗河", tier: 1, [
            (-4.2, 43.0), (-2.45, 42.47), (-0.88, 41.65), (0.52, 40.82), (0.88, 40.72)
        ]),
        RiverSpec("塔霍河", tier: 2, [
            (-1.7, 40.3), (-3.1, 40.1), (-4.02, 39.86), (-6.1, 39.75),
            (-7.8, 39.55), (-8.9, 38.85), (-9.25, 38.68)
        ]),
        RiverSpec("杜罗河", tier: 1, [
            (-2.8, 41.9), (-4.72, 41.65), (-6.2, 41.5), (-7.6, 41.15), (-8.66, 41.14)
        ]),
        RiverSpec("瓜达尔基维尔河", tier: 1, [
            (-2.9, 37.9), (-4.78, 37.88), (-5.99, 37.39), (-6.35, 36.8)
        ]),
        RiverSpec("德涅斯特河", tier: 1, [
            (23.0, 49.2), (24.7, 49.1), (26.5, 48.55), (28.3, 48.2), (29.4, 46.85), (30.2, 46.3)
        ]),
        RiverSpec("涅曼河", tier: 1, [
            (27.0, 53.4), (24.8, 53.55), (23.83, 53.68), (23.90, 54.90), (21.9, 55.1), (21.3, 55.3)
        ]),
        RiverSpec("西德维纳河", tier: 1, [
            (32.5, 56.8), (30.2, 55.2), (28.8, 55.5), (26.5, 55.88), (24.11, 56.95), (24.05, 57.06)
        ]),
        RiverSpec("北德维纳河", tier: 2, [
            (46.3, 60.75), (44.5, 61.5), (42.8, 62.9), (41.8, 63.9), (40.54, 64.54)
        ]),

        // ================= 地中海 · 中东 · 南亚 · 世界 =================
        RiverSpec("尼罗河", tier: 3, [
            (31.6, 5.0), (31.6, 9.5), (32.53, 15.60), (33.9, 17.7), (31.8, 18.6),
            (32.9, 24.09), (32.64, 25.7), (31.18, 27.18), (31.23, 30.04), (31.1, 31.45)
        ]),
        RiverSpec("幼发拉底河", tier: 2, [
            (39.5, 39.6), (38.8, 38.4), (38.0, 36.8), (40.1, 35.3),
            (42.5, 34.2), (44.4, 32.5), (46.3, 31.0), (47.8, 30.5), (48.55, 29.95)
        ]),
        RiverSpec("底格里斯河", tier: 2, [
            (40.2, 38.0), (42.4, 37.2), (43.13, 36.34), (44.36, 33.31),
            (45.8, 32.5), (47.2, 31.2), (47.8, 30.5)
        ]),
        RiverSpec("恒河", tier: 3, [
            (78.2, 30.1), (78.0, 28.5), (80.35, 26.45), (82.97, 25.32),
            (85.14, 25.61), (87.8, 25.0), (88.36, 22.57), (88.5, 21.65)
        ]),
        RiverSpec("印度河", tier: 3, [
            (81.0, 31.5), (77.5, 34.1), (74.6, 35.8), (72.2, 33.9),
            (71.2, 31.5), (70.5, 28.9), (68.9, 27.7), (68.3, 25.4), (67.5, 24.0)
        ]),
        RiverSpec("密西西比河", tier: 3, [
            (-95.2, 47.2), (-93.26, 44.98), (-90.6, 42.5), (-90.2, 38.63),
            (-89.15, 37.0), (-90.05, 35.15), (-91.18, 30.45), (-90.07, 29.95), (-89.2, 29.0)
        ]),
        RiverSpec("密苏里河", tier: 2, [
            (-111.5, 45.9), (-106.5, 48.0), (-100.8, 46.8), (-96.4, 42.5), (-94.58, 39.1), (-90.15, 38.8)
        ]),
        RiverSpec("俄亥俄河", tier: 2, [
            (-80.0, 40.44), (-82.5, 38.4), (-84.51, 39.1), (-85.75, 38.25), (-89.15, 37.0)
        ]),
        RiverSpec("圣劳伦斯河", tier: 2, [
            (-76.5, 44.2), (-73.57, 45.5), (-71.2, 46.8), (-67.5, 49.0)
        ]),
        RiverSpec("亚马孙河", tier: 3, [
            (-73.2, -3.75), (-69.9, -4.2), (-65.0, -3.4), (-60.02, -3.12),
            (-55.0, -2.3), (-51.1, 0.0), (-49.2, 0.4)
        ]),
        RiverSpec("巴拉那河", tier: 2, [
            (-51.0, -20.1), (-54.6, -25.5), (-58.8, -27.45), (-60.65, -32.95), (-58.4, -34.55)
        ]),
        RiverSpec("刚果河", tier: 3, [
            (25.2, -7.0), (25.2, 0.5), (21.5, 2.2), (18.3, 0.05), (15.3, -4.3), (12.4, -6.05)
        ]),
        RiverSpec("尼日尔河", tier: 2, [
            (-9.5, 10.5), (-8.0, 12.65), (-4.2, 14.5), (-3.0, 16.75),
            (0.0, 16.2), (2.1, 13.5), (5.5, 9.2), (6.7, 7.8), (6.2, 4.4)
        ]),
        RiverSpec("墨累河", tier: 2, [
            (148.2, -36.5), (146.9, -36.08), (144.7, -36.12), (142.15, -34.18),
            (139.65, -34.2), (138.9, -35.55)
        ]),
    ]

    // MARK: - 实时水系网格投影（替换历史底图的伪随机河流）

    /// 将真实 WGS-84 大江大河投影到历史底图并生成与原作视觉完全一致的渐变河道三角网 `[Float]`。
    public static func buildRiverMesh(
        region: HistoricalRegion,
        elevations h: [Int],
        graph g: TerrainGraph
    ) -> [Float] {
        guard region != .custom else { return [] }
        let w = g.width
        let hh = g.height
        let lonMin = region.lonMin - 3.0
        let lonMax = region.lonMax + 3.0
        let latMin = region.latMin - 3.0
        let latMax = region.latMax + 3.0

        // 可绘制安全边界（避开区域外缘禁航边）
        let padX = w * 0.024
        let padY = hh * 0.024
        let minX = padX, maxX = w - padX
        let minY = padY, maxY = hh - padY

        // 快速近似定位离某画布坐标最近的网格单元，用于检测入海口截断
        let cols = max(1, g.cellsX)
        let rows = max(1, g.cellsY)
        func isLandAt(_ x: Double, _ y: Double) -> Bool {
            let cx = max(0, min(cols - 1, Int((x / max(1.0, w)) * Double(cols))))
            let cy = max(0, min(rows - 1, Int((y / max(1.0, hh)) * Double(rows))))
            let idx = cy * cols + cx
            if idx >= 0 && idx < h.count {
                if h[idx] >= 20 { return true }
                // 检查周围 3×3 邻格防止窄河谷或河口误判
                for dy in -1...1 {
                    for dx in -1...1 {
                        let nx = cx + dx, ny = cy + dy
                        if nx >= 0 && nx < cols && ny >= 0 && ny < rows {
                            let ni = ny * cols + nx
                            if ni >= 0 && ni < h.count && h[ni] >= 20 { return true }
                        }
                    }
                }
            }
            return false
        }

        // 按区域缩放河道基准宽度：局部精图河道清晰俊朗，全球图略微收敛避免粘连
        let regionWidthScale: Double
        switch region {
        case .huaxia, .japanDetail: regionWidthScale = 1.18
        case .china, .europe, .eastAsiaJapan, .mediterranean: regionWidthScale = 1.02
        case .world: regionWidthScale = 0.72
        case .custom: regionWidthScale = 1.0
        }

        var out = [Float]()
        out.reserveCapacity(16_000)

        for river in realRivers {
            // 仅处理穿过当前战区视野的河流
            var touchesRegion = false
            for pt in river.points {
                if pt.lon >= lonMin && pt.lon <= lonMax && pt.lat >= latMin && pt.lat <= latMax {
                    touchesRegion = true
                    break
                }
            }
            guard touchesRegion else { continue }

            // 投影并切分为落在当前战区画布陆域内的连续河段
            var segments = [[(Double, Double)]]()
            var current = [(Double, Double)]()
            for pt in river.points {
                let xy = HistoricalBasemaps.project(lon: pt.lon, lat: pt.lat, region: region, width: w, height: hh)
                let inFrame = xy.x >= minX && xy.x <= maxX && xy.y >= minY && xy.y <= maxY
                if inFrame && isLandAt(xy.x, xy.y) {
                    if let prev = current.last {
                        let d = hypot(xy.x - prev.0, xy.y - prev.1)
                        if d > 2.5 { current.append((xy.x, xy.y)) }
                    } else {
                        current.append((xy.x, xy.y))
                    }
                } else {
                    if inFrame && !current.isEmpty {
                        // 入海口终点：顺滑延伸半步入海避免悬空截断
                        let prev = current[current.count - 1]
                        current.append((prev.0 + (xy.x - prev.0) * 0.55, prev.1 + (xy.y - prev.1) * 0.55))
                    }
                    if current.count >= 2 { segments.append(current) }
                    current.removeAll(keepingCapacity: true)
                }
            }
            if current.count >= 2 { segments.append(current) }

            let tierScale: Double = river.tier >= 3 ? 1.32 : (river.tier == 2 ? 0.96 : 0.68)
            for seg in segments {
                let smooth = CreationMap.riverPath(seg)
                appendScaledRiverRibbon(smooth, widthScale: tierScale * regionWidthScale, into: &out)
            }
        }
        return out
    }

    private static func appendScaledRiverRibbon(_ path: [(Double, Double)], widthScale: Double, into out: inout [Float]) {
        let n = path.count
        guard n >= 2 else { return }
        let baseWidth = (Native.fr(0.125) / CreationMap.worldPerMap) * widthScale
        var left = [(Double, Double)]()
        var right = [(Double, Double)]()
        left.reserveCapacity(n)
        right.reserveCapacity(n)
        for i in 0..<n {
            let a = path[max(0, i - 1)]
            let b = path[min(n - 1, i + 1)]
            let d = hypot(b.0 - a.0, b.1 - a.1)
            let progress = Double(i) / Double(max(1, n - 1))
            let thickness = (0.58 + progress * 0.92) * 1.42
            let r = thickness * baseWidth * 0.5
            let nx = d > 1e-6 ? -(b.1 - a.1) / d * r : 0
            let ny = d > 1e-6 ? (b.0 - a.0) / d * r : 0
            left.append((path[i].0 + nx, path[i].1 + ny))
            right.append((path[i].0 - nx, path[i].1 - ny))
        }
        for i in 0..<(n - 1) {
            for p in [left[i], right[i], left[i + 1], right[i], right[i + 1], left[i + 1]] {
                out.append(Float(p.0))
                out.append(Float(p.1))
            }
        }
    }

    /// 识别每个被真实大河（tier >= 2）流经或作为防线的历史州郡，用于赋能大河渡口防御（如长江/莱茵/第聂伯/维斯瓦天堑）。
    public static func riverProvinces(
        region: HistoricalRegion,
        provinces: [JS],
        scale: Double,
        width: Double,
        height: Double
    ) -> [String: String] {
        guard region != .custom, !provinces.isEmpty else { return [:] }
        // 抽取穿过本战区的重要河流（tier >= 2）的画布折线
        var projectedRivers = [(name: String, pts: [(Double, Double)])]()
        for river in realRivers where river.tier >= 2 {
            var pts = [(Double, Double)]()
            for pt in river.points {
                if pt.lon >= region.lonMin - 2 && pt.lon <= region.lonMax + 2 &&
                   pt.lat >= region.latMin - 2 && pt.lat <= region.latMax + 2 {
                    let xy = HistoricalBasemaps.project(lon: pt.lon, lat: pt.lat, region: region, width: width, height: height)
                    pts.append((xy.x * scale, xy.y * scale))
                }
            }
            if pts.count >= 2 {
                projectedRivers.append((river.name, pts))
            }
        }
        guard !projectedRivers.isEmpty else { return [:] }

        // 州郡中心到大河折线的距离阈值（游戏坐标 0...1000，局部精图约 24，全球约 14）
        let threshold = (region == .world) ? 14.0 : 25.0
        let thrSq = threshold * threshold
        var out = [String: String]()
        for p in provinces {
            let pid = p.id.asString
            let cx = p.center.x.asNumber
            let cy = p.center.y.asNumber
            var bestName: String? = nil
            var bestD2 = thrSq
            for r in projectedRivers {
                for i in 0..<(r.pts.count - 1) {
                    let a = r.pts[i], b = r.pts[i + 1]
                    let dx = b.0 - a.0, dy = b.1 - a.1
                    let len2 = dx * dx + dy * dy
                    let t = len2 > 1e-6 ? max(0.0, min(1.0, ((cx - a.0) * dx + (cy - a.1) * dy) / len2)) : 0.0
                    let px = a.0 + dx * t, py = a.1 + dy * t
                    let d2 = (cx - px) * (cx - px) + (cy - py) * (cy - py)
                    if d2 < bestD2 {
                        bestD2 = d2
                        bestName = r.name
                    }
                }
            }
            if let name = bestName {
                out[pid] = name
            }
        }
        return out
    }

    /// 校验某网格点是否毗邻真实大河（供 `CreationMap.biomes` 为冲积平原增加真实水源湿度，如尼罗河谷、两河、长江中下游）。
    public static func riverNearMask(
        region: HistoricalRegion,
        points: [(Double, Double)],
        width: Double,
        height: Double
    ) -> [Bool] {
        var mask = [Bool](repeating: false, count: points.count)
        guard region != .custom, !points.isEmpty else { return mask }
        var segs = [(Double, Double, Double, Double)]()
        for river in realRivers where river.tier >= 2 {
            var prev: (Double, Double)? = nil
            for pt in river.points {
                if pt.lon >= region.lonMin - 2 && pt.lon <= region.lonMax + 2 &&
                   pt.lat >= region.latMin - 2 && pt.lat <= region.latMax + 2 {
                    let xy = HistoricalBasemaps.project(lon: pt.lon, lat: pt.lat, region: region, width: width, height: height)
                    if let p = prev { segs.append((p.0, p.1, xy.x, xy.y)) }
                    prev = xy
                } else {
                    prev = nil
                }
            }
        }
        guard !segs.isEmpty else { return mask }
        let radius = max(width, height) * (region == .world ? 0.008 : 0.015)
        let r2 = radius * radius
        for i in points.indices {
            let px = points[i].0, py = points[i].1
            for s in segs {
                let minX = min(s.0, s.2) - radius, maxX = max(s.0, s.2) + radius
                let minY = min(s.1, s.3) - radius, maxY = max(s.1, s.3) + radius
                if px < minX || px > maxX || py < minY || py > maxY { continue }
                let dx = s.2 - s.0, dy = s.3 - s.1
                let len2 = dx * dx + dy * dy
                let t = len2 > 1e-6 ? max(0.0, min(1.0, ((px - s.0) * dx + (py - s.1) * dy) / len2)) : 0.0
                let ex = px - (s.0 + dx * t), ey = py - (s.1 + dy * t)
                if ex * ex + ey * ey <= r2 {
                    mask[i] = true
                    break
                }
            }
        }
        return mask
    }
}
