import XCTest
@testable import LieguojiCore

final class V521Tests: XCTestCase {
    func testEngineWireV5GreetingAndV4Compat() {
        XCTAssertEqual(EngineWire.greeting, "列国纪远程计算·6")
        XCTAssertTrue(EngineWire.compatibleGreetings.contains("列国纪远程计算·6"))
        XCTAssertTrue(EngineWire.compatibleGreetings.contains("列国纪远程计算·5"))
        XCTAssertTrue(EngineWire.compatibleGreetings.contains("列国纪远程计算·4"))

        let service = EngineService()
        let ping = service.handle("ping", [:])
        XCTAssertTrue(ping.ok)
        XCTAssertEqual(ping.reason, EngineWire.greeting)
        XCTAssertEqual(ping.text, "idle")

        let park = service.handle("park", [:])
        XCTAssertTrue(park.ok)
    }

    func testNationColorsBorderGraphHighContrast() {
        // 4×4 平面网格（16 国彼此接壤，内部节点度数高达 4）：验证所有直接接壤国色差 ΔE ≥ 22
        let rows = 4, cols = 4, n = rows * cols
        var adj = [Set<Int>](repeating: [], count: n)
        var caps = [(x: Double, y: Double)]()
        for r in 0..<rows {
            for c in 0..<cols {
                let idx = r * cols + c
                caps.append((Double(c) * 100, Double(r) * 100))
                if c + 1 < cols { adj[idx].insert(idx + 1); adj[idx + 1].insert(idx) }
                if r + 1 < rows { adj[idx].insert(idx + cols); adj[idx + cols].insert(idx) }
            }
        }
        let colors = NationColors.assignGraph(adjacency: adj, capitals: caps)
        XCTAssertEqual(colors.count, n)
        var minBorderDE = 999.0
        for i in 0..<n {
            for j in adj[i] where i < j {
                let de = NationColors.difference(colors[i], colors[j])
                if de < minBorderDE { minBorderDE = de }
            }
        }
        XCTAssertGreaterThanOrEqual(minBorderDE, 22.0, "接壤邻国最小色差 ΔE=\(minBorderDE) 过低")
        XCTAssertGreaterThanOrEqual(NationColors.palette.count, 36)
    }

    func testNamingCatalogCleansAwkwardStateAndCitySuffixes() {
        XCTAssertEqual(NamingCatalog.cleanStateBase("波兰王国"), "波兰")
        XCTAssertEqual(NamingCatalog.cleanStateBase("葡萄牙王国"), "葡萄牙")
        XCTAssertEqual(NamingCatalog.cleanStateBase("科英布拉伯"), "科英布拉")
        XCTAssertEqual(NamingCatalog.cleanStateBase("葡属印度"), "果阿")

        XCTAssertEqual(NamingCatalog.cleanCityName("剑桥郡"), "剑桥")
        XCTAssertEqual(NamingCatalog.cleanCityName("牛津郡"), "牛津")
        XCTAssertEqual(NamingCatalog.cleanCityName("兰开夏"), "兰开斯特")
        XCTAssertEqual(NamingCatalog.cleanCityName("辽阳行省"), "辽阳")
        XCTAssertEqual(NamingCatalog.cleanCityName("和宁路"), "和宁")
        XCTAssertEqual(NamingCatalog.cleanCityName("钦察草原"), "萨莱")
        XCTAssertEqual(NamingCatalog.cleanCityName("特斯科科城"), "特斯科科")
        XCTAssertEqual(NamingCatalog.cleanCityName("库斯科城"), "库斯科")
    }

    func testEncirclementDetection() {
        let r = JS.object()
        r.world = JS.object()
        r.alliances = JS.object(); r.alliances.records = .array()
        r.vassals = JS.object(); r.vassals.records = .array()
        r.world.statecraft = JS.object(); r.world.statecraft.relations = .array()

        let p0 = JS.object(); p0.id = JS("p0"); p0.controller = JS("nB"); p0.neighbors = .array([JS("p1"), JS("p2")])
        let p1 = JS.object(); p1.id = JS("p1"); p1.controller = JS("nB"); p1.neighbors = .array([JS("p0")])
        let p2 = JS.object(); p2.id = JS("p2"); p2.controller = JS("nB"); p2.neighbors = .array([JS("p0")])
        r.world.provinces = .array([p0, p1, p2])

        let army = JS.object(); army.id = JS("a1"); army.nationId = JS("nA")
        XCTAssertTrue(ArmyTactics.isEncircled(r, army: army, provinceIndex: 0), "四周全是敌控州且无海港时应判定陷入合围")

        // 当邻州 p1 变为己方控制时，解除合围
        p1.controller = JS("nA")
        XCTAssertFalse(ArmyTactics.isEncircled(r, army: army, provinceIndex: 0), "存在友邻陆路时不应判定合围")
    }
}
