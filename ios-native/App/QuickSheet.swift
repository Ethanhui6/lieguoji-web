import SwiftUI
import LieguojiCore

/// 长按地图的快捷面板: everything a player can do to one province, on one page.
struct ProvinceQuickSheet: View {
    @ObservedObject var model: GameModel
    let province: Int
    var openProvince: () -> Void = {}
    var openNation: (Int) -> Void = { _ in }
    var openArmy: (Int) -> Void = { _ in }
    var close: () -> Void = {}

    private struct Choice: Identifiable { let id = UUID(); let title: String; let items: [(String, () -> Void)] }
    private enum NationAction: Identifiable { case army, grant, region, war, restore, annex, vassal, ally; var id: Int { hashValue } }

    @State private var info: ProvinceInfo?
    @State private var flash: String?
    @State private var count = 3
    @State private var size = 6
    @State private var population = 0.0
    @State private var grain = 0.0
    @State private var armyNation = -1
    @State private var choice: Choice?
    @State private var picking: NationAction?
    @State private var target = -1
    @State private var defense = 1

    private func report(_ e: String?, _ ok: String) { flash = e ?? ok; GameFeel.shared.notify(e == nil ? .success : .error) }
    private func reload() async {
        info = await model.provinceInfo(province)
        if let info { population = Double(info.population); grain = info.grain }
    }
    private func act(_ ok: String, _ body: @escaping () async -> String?) {
        Task { report(await body(), ok); await reload() }
    }
    private func option(_ title: String, _ ok: String, _ body: @escaping () async -> String?) -> (String, () -> Void) { (title, { act(ok, body) }) }
    /// A rising or a restoration is best seen on the map: the page gets out of the way.
    private func rise(_ kind: String?) {
        Task {
            let e = await model.greatRebellion(province, size: size, kind: kind)
            if let e { report(e, "") } else { GameFeel.shared.notify(.warning); close() }
        }
    }

    var body: some View {
        if let map = model.map, let state = model.state {
            let p = map.meta.provinces[province]
            let owner = state.owners.indices.contains(province) ? state.owners[province] : p.nation
            let nation = map.meta.nations.indices.contains(owner) ? map.meta.nations[owner] : nil
            let here = state.armies.filter { $0.province == province }
            let isCapital = nation.map { map.meta.cities.indices.contains($0.capital) && map.meta.cities[$0.capital].province == province } ?? false
            ScrollView {
                VStack(spacing: 12) {
                    SheetHeader(title: p.name, subtitle: [nation?.name, isCapital ? "都城" : nil, "\(here.count)支军队"].compactMap { $0 }.joined(separator: " · "), color: nation.map { Names.color($0.color) }, seal: "令")
                    section("放置军队") {
                        HStack(spacing: 10) {
                            Glyph.icon("军队", size: 16)
                            Text(armyNation >= 0 && map.meta.nations.indices.contains(armyNation) ? map.meta.nations[armyNation].name : nation?.name ?? "—").font(Theme.kai(16)).foregroundStyle(Theme.ink).lineLimit(1)
                            Spacer()
                            Button("换国家") { target = -1; picking = .army }.font(Theme.kai(15)).foregroundStyle(Theme.seal)
                        }
                        slider("数量", value: Binding(get: { Double(count) }, set: { count = Int($0) }), 1...30, text: "\(count) 支")
                        tiles {
                            tile("放下军队", "shield.lefthalf.filled") {
                                let n = armyNation >= 0 ? armyNation : owner, c = count
                                Task {
                                    let e = await model.addArmy(n, province: province, count: c)
                                    if e == nil { model.playMuster(nation: n, province: province, count: c) }
                                    report(e, "\(c) 支军队已集结")
                                }
                            }
                            tile("遣散本州军队", "xmark.shield", destructive: true) { act("本州军队已遣散") { await model.clearArmies(province) } }
                            tile("连续放置", "hand.draw") {
                                model.controller.placeCount = count
                                model.controller.placingArmy = true
                                model.controller.paintNation = armyNation >= 0 ? armyNation : owner
                                close()
                            }
                        }
                    }
                    section("军令") {
                        let own = state.armies.indices.filter { state.armies[$0].nation == owner }
                        tiles {
                            tile("全军来援", "arrow.down.to.line") {
                                Task { let out = await model.rts(armies: own, to: province, defend: false); report(out.ok ? nil : out.reason, "\(own.count) 支军队开赴\(p.name)"); if out.ok { close() } }
                            }
                            tile("全军固守", "shield") {
                                Task { let out = await model.rts(armies: own, to: province, defend: true); report(out.ok ? nil : out.reason, "\(own.count) 支军队奉命固守"); if out.ok { close() } }
                            }
                            tile("本州军队", "list.bullet") {
                                let list = state.armies.enumerated().filter { $0.element.province == province }
                                choice = Choice(title: "\(p.name)的军队", items: list.map { i, a in ("\(a.name) · \(Names.wan(a.troops))", { openArmy(i) }) })
                            }
                        }
                    }
                    section("疆域") {
                        tiles {
                            tile("划入他国", "paintbrush.pointed") { target = -1; picking = .grant }
                            tile("连片划入", "square.dashed") { target = -1; picking = .region }
                            tile("定为都城", "star") { act("已迁都\(p.name)") { await model.setCapital(owner, province: province) } }
                            tile("和平立国", "leaf") { act("新国已立") { await model.foundNation(province, war: false) } }
                            tile("举兵立国", "flag.2.crossed", destructive: true) { act("新国已立") { await model.foundNation(province, war: true) } }
                            tile(info?.kinds.contains { $0.0 == "要塞" } == true ? "拆除要塞" : "筑要塞", "building.columns") {
                                let on = info?.kinds.contains { $0.0 == "要塞" } != true
                                act(on ? "要塞已筑" : "要塞已拆") { await model.editProvince(province, population: nil, fortress: on) }
                            }
                            tile("定为圣地", "sparkles") { act("已定为圣地") { await model.setHolyProvince(province) } }
                            tile("城防锁定 +", "lock.shield") { defense = min(10, defense + 1); let d = defense; act("城防锁定为 \(d)") { await model.edit("setProvinceDefense", ["province": province, "level": d]) } }
                            tile("城防自动", "lock.open") { defense = 1; act("城防恢复自动") { await model.edit("setProvinceDefense", ["province": province, "level": NSNull()]) } }
                            tile("人口锁定", "lock") { act("人口已锁定") { await model.edit("lockPopulation", ["province": province, "lock": 1]) } }
                            tile("人口解锁", "lock.open.display") { act("人口已解锁") { await model.edit("lockPopulation", ["province": province, "lock": 0]) } }
                        }
                    }
                    section("叛乱与复国") {
                        slider("波及州数", value: Binding(get: { Double(size) }, set: { size = Int($0) }), 1...40, text: "\(size) 州")
                        tiles {
                            tile("农民起义", "flame", destructive: true) { rise("peasant") }
                            tile("军阀割据", "person.badge.shield.checkmark", destructive: true) { rise("warlord") }
                            tile("神国起义", "moon.stars", destructive: true) { rise("holy") }
                            tile("藩镇独立", "flag", destructive: true) { rise("secession") }
                            tile("旧邦复国", "arrow.uturn.backward.circle") { target = -1; picking = .restore }
                            tile("随机起事", "dice") { rise(nil) }
                            tile("全国煽动", "megaphone", destructive: true) { act("叛乱已煽动") { await model.inciteRebellion(owner) } }
                        }
                    }
                    section("民生") {
                        slider("人口", value: $population, 100...5_000_000, step: 10_000, text: Names.wan(Int(population)))
                        slider("存粮", value: $grain, 0...5_000_000, step: 10_000, text: Names.wan(Int(grain)))
                        tiles {
                            tile("应用人口存粮", "checkmark.seal") {
                                let a = population, b = grain
                                act("民生已修改") {
                                    if let e = await model.editProvince(province, population: a, fortress: nil) { return e }
                                    return await model.setProvinceGrain(province, grain: b)
                                }
                            }
                            tile("更换特产", "leaf.circle") {
                                var items = Array(Trade.goods.enumerated()).map { i, n in option(n, "特产改为\(n)") { await model.setSpecialty(province, i) } }
                                items.append(option("恢复本地特产", "已恢复本地特产") { await model.setSpecialty(province, nil) })
                                choice = Choice(title: "特产", items: items)
                            }
                        }
                    }
                    section("文化与信仰") {
                        tiles {
                            tile("更改文化", "text.book.closed") {
                                choice = Choice(title: "本地文化", items: Names.culture.keys.sorted().map { k in option(Names.culture[k] ?? k, "本地文化已更改") { await model.setCityCulture(province, k) } })
                            }
                            tile("更改信仰", "hands.sparkles") {
                                choice = Choice(title: "本地信仰", items: Names.religion.keys.filter { $0 != "none" }.sorted().map { k in option(Names.religion[k] ?? k, "本地信仰已更改") { await model.setProvinceFaith(province, religion: k) } })
                            }
                        }
                    }
                    section("天灾") {
                        tiles {
                            tile("降下瘟疫", "allergens", destructive: true) { act("瘟疫已降") { await model.provinceDisaster(province, kind: "plague") } }
                            tile("降下饥荒", "drop.degreesign.slash", destructive: true) { act("饥荒已降") { await model.provinceDisaster(province, kind: "famine") } }
                            tile("平息灾情", "cross.case") { act("灾情已平") { await model.provinceDisaster(province, kind: nil) } }
                        }
                    }
                    if owner >= 0, let nation {
                        section("所属国家 · \(nation.name)") {
                            tiles {
                                tile("国家详情", "building.columns") { openNation(owner) }
                                tile("州郡详情", "map") { openProvince() }
                                tile("向他国宣战", "flag.2.crossed", destructive: true) { target = -1; picking = .war }
                                tile("停止全部战争", "hand.raised") {
                                    let wars = state.wars.filter { $0.attacker == owner || $0.defender == owner }
                                    Task {
                                        var failed: String?
                                        for w in wars { if let e = await model.makePeace(w.attacker, w.defender) { failed = e } }
                                        report(wars.isEmpty ? "该国没有战争" : failed, "已停战 \(wars.count) 场")
                                    }
                                }
                                tile("与他国结盟", "link") { target = -1; picking = .ally }
                                tile("退出同盟", "person.2.slash", destructive: true) { act("已退出同盟") { await model.leaveAlliance(owner) } }
                                tile("归附他国", "person.2") { target = -1; picking = .vassal }
                                tile("被他国吞并", "arrow.triangle.merge", destructive: true) { target = -1; picking = .annex }
                                tile("更改政体", "building.2") {
                                    choice = Choice(title: "政体", items: Regimes.styles.map { s in option(s.label, "政体改为\(s.label)") { await model.setStyle(owner, style: s.id) } })
                                }
                                tile("颁行制度", "scroll") {
                                    choice = Choice(title: "颁行制度", items: Regimes.reforms.map { f in option("\(f.name)（\(f.text)）", "已颁行\(f.name)") { await model.setReform(owner, reform: f.id, on: true) } })
                                }
                                tile("和平主义", "leaf") { act("该国转趋和平") { await model.setTemper(owner, 0.6) } }
                                tile("穷兵黩武", "bolt", destructive: true) { act("该国转趋好战") { await model.setTemper(owner, 1.6) } }
                                tile("军威大振", "bolt.shield") { act("该国进攻 +50%") { await model.setBonus(owner, key: "attack", value: 50) } }
                                tile("国库大增", "banknote") {
                                    let gold = state.nations.indices.contains(owner) ? state.nations[owner].gold : 0
                                    act("国库 +5000") { await model.editNation(owner, gold: gold + 5000, destiny: nil, polity: nil) }
                                }
                                tile("国运 +20", "sun.max") {
                                    let d = state.nations.indices.contains(owner) ? state.nations[owner].destiny : 50
                                    act("国运已提升") { await model.editNation(owner, gold: nil, destiny: min(100, d + 20), polity: nil) }
                                }
                                tile("国运 −20", "cloud.bolt", destructive: true) {
                                    let d = state.nations.indices.contains(owner) ? state.nations[owner].destiny : 50
                                    act("国运已削减") { await model.editNation(owner, gold: nil, destiny: max(0, d - 20), polity: nil) }
                                }
                            }
                        }
                    }
                }
                .padding(.bottom, 24)
            }
            .paperToast($flash)
            .task { await reload() }
            .sheet(item: $choice) { c in
                ScrollView {
                    VStack(spacing: 0) {
                        SheetHeader(title: c.title, seal: "择")
                        Group2 {
                            ForEach(Array(c.items.enumerated()), id: \.offset) { i, item in
                                if i > 0 { Divider2() }
                                Button { choice = nil; item.1() } label: {
                                    HStack { Text(item.0).font(Theme.kai(17)).foregroundStyle(Theme.ink); Spacer() }.padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    .padding(.bottom, 20)
                }
                .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
            }
            .sheet(item: $picking) { action in
                let pool: [Int] = state.nations.indices.filter { i in
                    guard i < map.meta.nations.count else { return false }
                    switch action {
                    case .restore: return !state.nations[i].alive
                    case .army: return state.nations[i].alive
                    default: return state.nations[i].alive && i != owner
                    }
                }
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        SheetHeader(title: Self.pickTitle(action, size), subtitle: pool.isEmpty ? "没有可选的国家" : nil, seal: "择")
                        if !pool.isEmpty {
                            Group2 { NationGrid(map: map, nations: pool, selection: $target) }.padding(.horizontal, 16)
                            SealButton(title: "确定", disabled: target < 0) {
                                let t = target
                                picking = nil
                                switch action {
                                case .army: armyNation = t
                                case .grant: act("已划入他国") { await model.grant(province: province, to: t) }
                                case .region: let s = size; act("\(s) 州已划入") { await model.grantRegion(province, size: s, to: t) }
                                case .annex: act("已被吞并") { await model.annex(owner, by: t) }
                                case .vassal: act("已归附") { await model.makeVassal(owner, of: t) }
                                case .ally: act("已结盟") { await model.alliance(owner, with: t) }
                                case .war: act("战端已开") { await model.declareWar(owner, on: t) }
                                case .restore:
                                    let s = size
                                    Task {
                                        let e = await model.restoreNation(province, nation: t, size: s)
                                        if let e { report(e, "") } else { GameFeel.shared.notify(.warning); close() }
                                    }
                                }
                            }
                            .padding(.horizontal, 22)
                        }
                    }
                    .padding(.bottom, 20)
                }
                .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
            }
        }
    }

    private static func pickTitle(_ action: NationAction, _ size: Int) -> String {
        switch action {
        case .restore: return "旧邦复国"
        case .war: return "向谁宣战"
        case .grant: return "划入哪国"
        case .region: return "连片 \(size) 州划入哪国"
        case .annex: return "被哪国吞并"
        case .vassal: return "归附哪国"
        case .ally: return "与哪国结盟"
        case .army: return "放置哪国军队"
        }
    }
    private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View { quickSection(title, content) }
    private func slider(_ title: String, value: Binding<Double>, _ range: ClosedRange<Double>, step: Double = 1, text: String) -> some View { quickSlider(title, value: value, range, step: step, text: text) }
    private func tiles<C: View>(@ViewBuilder _ content: () -> C) -> some View { quickGrid(content) }
    private func tile(_ title: String, _ symbol: String, destructive: Bool = false, _ action: @escaping () -> Void) -> some View { quickTile(title, symbol, destructive: destructive, action) }
}

/// 制度 and 属性: what the state's institutions and ruler are worth, with a tap to change the laws.
struct ReformCard: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let info: NationInfo
    let say: (String) -> Void
    let reload: () async -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("国势")
            VStack(spacing: 6) {
                ForEach(info.sway ?? [], id: \.name) { row in
                    HStack(spacing: 8) {
                        Glyph.icon(row.name, size: 15)
                        Text(row.name).font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(width: 48, alignment: .leading)
                        Text(row.value).font(Theme.kai(16)).foregroundStyle(Theme.ink).monospacedDigit()
                        Spacer(minLength: 4)
                        Text(row.text).font(Theme.kai(12)).foregroundStyle(Theme.ink2).lineLimit(2).minimumScaleFactor(0.8).multilineTextAlignment(.trailing)
                    }
                }
            }
            .padding(12).paperCard().padding(.horizontal, 14)
            SectionLabel("制度")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(info.reforms ?? [], id: \.id) { f in
                    Button {
                        GameFeel.shared.tap()
                        Task {
                            let e = await model.setReform(nation, reform: f.id, on: !f.on)
                            say(e ?? (f.on ? "已废止\(f.name)" : "已颁行\(f.name)"))
                            await reload()
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 5) {
                                Image(systemName: f.on ? "checkmark.seal.fill" : "seal").font(.system(size: 13)).foregroundStyle(f.on ? Theme.seal : Theme.ink2)
                                Text(f.name).font(Theme.kai(15)).foregroundStyle(f.on ? Theme.seal : Theme.ink).lineLimit(1)
                            }
                            Text(f.text).font(Theme.kai(11)).foregroundStyle(Theme.ink2).lineLimit(2).minimumScaleFactor(0.8).frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(9).frame(maxWidth: .infinity, minHeight: 62, alignment: .topLeading)
                        .background(f.on ? Theme.seal.opacity(0.08) : Theme.paper2, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(f.on ? Theme.seal.opacity(0.4) : Theme.line))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            .padding(.horizontal, 14)
        }
    }
}

/// The ink ring that grows under the finger before the long-press page opens.
struct PressRipple: View {
    @State private var grown = false
    var body: some View {
        Circle().stroke(Theme.seal, lineWidth: 3).frame(width: 96, height: 96)
            .scaleEffect(grown ? 1 : 0.2).opacity(grown ? 0 : 0.9)
            .onAppear { withAnimation(.easeOut(duration: 0.3)) { grown = true } }
            .allowsHitTesting(false)
    }
}

/// 史册大字: a band of paper across the map, four brushed characters writing themselves in and a seal coming down.
struct EpochCard: View {
    let epoch: GameModel.Epoch
    @State private var written = 0
    @State private var stamped = false
    @State private var opened = false
    var body: some View {
        VStack(spacing: 8) {
            Rectangle().fill(Theme.seal.opacity(0.75)).frame(height: 1)
            HStack(alignment: .center, spacing: 16) {
                HStack(spacing: 10) {
                    ForEach(Array(epoch.title.enumerated()), id: \.offset) { i, ch in
                        Text(String(ch)).font(Theme.kai(50)).foregroundStyle(Theme.ink)
                            .opacity(written > i ? 1 : 0).scaleEffect(written > i ? 1 : 1.25).blur(radius: written > i ? 0 : 3)
                    }
                }
                Seal(text: "史", size: 34).scaleEffect(stamped ? 1 : 2).opacity(stamped ? 1 : 0).rotationEffect(.degrees(stamped ? -6 : 8))
            }
            Text(epoch.line).font(Theme.kai(15)).foregroundStyle(Theme.ink2).lineLimit(2).multilineTextAlignment(.center).padding(.horizontal, 28)
            Rectangle().fill(Theme.seal.opacity(0.75)).frame(height: 1)
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(Theme.paper2.opacity(0.97))
        .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.1), .init(color: .black, location: 0.9), .init(color: .clear, location: 1)], startPoint: .leading, endPoint: .trailing))
        .scaleEffect(x: opened ? 1 : 0.2, y: 1)
        .shadow(color: .black.opacity(0.25), radius: 18, y: 6)
        .offset(y: -70)
        .task {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) { opened = true }
            for i in 1...max(1, epoch.title.count) {
                try? await Task.sleep(nanoseconds: 110_000_000)
                withAnimation(.easeOut(duration: 0.22)) { written = i }
            }
            try? await Task.sleep(nanoseconds: 120_000_000)
            withAnimation(.spring(response: 0.26, dampingFraction: 0.6)) { stamped = true }
            GameFeel.shared.news(.warning)
        }
    }
}

func quickSection<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
    VStack(alignment: .leading, spacing: 8) {
        SectionLabel(title)
        VStack(spacing: 10) { content() }.padding(12).paperCard().padding(.horizontal, 14)
    }
}
func quickSlider(_ title: String, value: Binding<Double>, _ range: ClosedRange<Double>, step: Double = 1, text: String) -> some View {
    HStack(spacing: 10) {
        Text(title).font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(width: 64, alignment: .leading)
        PaperTrack(value: value, range: range, step: step, onEditingChanged: nil)
        Text(text).font(Theme.kai(15)).foregroundStyle(Theme.ink).monospacedDigit().frame(width: 72, alignment: .trailing).lineLimit(1).minimumScaleFactor(0.7)
    }
}
func quickGrid<C: View>(@ViewBuilder _ content: () -> C) -> some View {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) { content() }
}
func quickTile(_ title: String, _ symbol: String, destructive: Bool = false, _ action: @escaping () -> Void) -> some View {
    Button(action: action) {
        VStack(spacing: 5) {
            Image(systemName: symbol).font(.system(size: 19, weight: .regular)).frame(height: 24)
            Text(title).font(Theme.kai(13)).lineLimit(1).minimumScaleFactor(0.7)
        }
        .foregroundStyle(destructive ? Theme.seal : Theme.ink).frame(maxWidth: .infinity).frame(height: 66)
        .background(Theme.paper2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(destructive ? Theme.seal.opacity(0.35) : Theme.line))
        .contentShape(Rectangle())
    }
    .buttonStyle(PressStyle())
}

/// An action that starts async work (a tuple of a title and a bare Task closure cannot be typed by the compiler).
@MainActor func later(_ body: @escaping @MainActor () async -> Void) -> () -> Void { { Task { @MainActor in await body() } } }
