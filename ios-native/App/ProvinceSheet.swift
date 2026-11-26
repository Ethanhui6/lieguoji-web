import SwiftUI
import CoreText
import UniformTypeIdentifiers
import LieguojiCore

/// 州郡详情（重置版）：顶部置顶所属国家主权大卡（一点直达国家详情）、四格核心数值与三页签清爽分区。
struct ProvinceSheet: View {
    @ObservedObject var model: GameModel
    let province: Int
    var openNation: (Int) -> Void = { _ in }
    var openArmy: (Int) -> Void = { _ in }

    private enum Tab: String, CaseIterable {
        case overview = "概览"
        case military = "地利战况"
        case admin = "政区编辑"
    }

    @State private var tab: Tab = .overview
    @State private var granting = false
    @State private var grantTarget = -1
    @State private var info: ProvinceInfo?
    @State private var pickingGood = false
    @State private var pickingCulture = false
    @State private var region: RegionInfo?
    @State private var regionActions = false
    @State private var renamingRegion = false
    @State private var regionName = ""
    @State private var flash: String?
    @State private var pressMenu: PressMenu?
    @State private var showingBreakdown = false
    @State private var refreshNonce = 0
    @State private var infraBusy = false
    @State private var editingLivelihood = false
    @State private var editPopulation = 0.0
    @State private var editGrain = 0.0
    @State private var editingDefense = false
    @State private var editDefenseLevel = 1
    @State private var pickingRename = false
    @State private var pickingCapitalRole = false

    private func report(_ e: String?, _ ok: String) {
        flash = e ?? ok
        GameFeel.shared.notify(e == nil ? .success : .error)
    }

    private func reloadNow() async {
        refreshNonce &+= 1
        info = await model.provinceInfo(province)
        region = await model.regionInfo(province)
    }

    var body: some View {
        if let map = model.map, map.meta.provinces.indices.contains(province) {
            let p = map.meta.provinces[province]
            let owner = model.state.flatMap { $0.owners.indices.contains(province) ? $0.owners[province] : nil } ?? p.nation
            let nation = owner >= 0 && owner < map.meta.nations.count ? map.meta.nations[owner] : nil
            let armies = model.state?.armies.enumerated().filter { $0.element.province == province } ?? []
            let siege = model.state?.sieges.first(where: { $0.province == province })
            let port = model.state?.ports?.first(where: { $0.province == province })
            let holyOf = model.state?.holy?.first(where: { $0.province == province })
            let isCapital = nation.map { map.meta.cities.indices.contains($0.capital) && map.meta.cities[$0.capital].province == province } ?? false

            let ownerState = (model.state?.nations.indices.contains(owner) == true) ? model.state?.nations[owner] : nil
            let lex = LocalizationEngine.lexicon(culture: ownerState?.culture ?? nation?.culture, polity: ownerState?.polity ?? nation?.polity, style: nil)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    SheetHeader(
                        title: p.name,
                        subtitle: [Self.terrainLine(info, p.terrain, port: port != nil), region?.name].compactMap { $0 }.joined(separator: " · "),
                        color: nation.map { Names.color($0.color) },
                        seal: lex.adminUnit
                    )

                    // 1. 置顶主权国家大卡：点击任意处立即直达「国家详情」，再也不用翻到最底找入口
                    ViewBoundary { sovereignHeroCard(map: map, provinceName: p.name, owner: owner, nation: nation, info: info) }
                        .padding(.horizontal, Theme.Layout.pageInset)

                    // 2. 2×2 严丝合缝宋版宣纸核心 KPI 宫格（人口 / 存粮 / 城防 / 税赋）
                    if let info {
                        provinceKpiGrid(info: info, armiesCount: armies.count, siege: siege)
                            .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    // 3. 紧急战况 / 围城告警（有战事才显现，承平之时保持极简）
                    if let s = model.state {
                        BattleBoard(province: province, state: s, map: map, openArmy: openArmy)
                    }
                    if let port, port.blockaded == true {
                        Group2 {
                            HStack(spacing: 8) {
                                InkIcon(glyph: .anchor, size: 16, weight: 1.85).foregroundStyle(Theme.seal)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("海港遭敌舰封锁 · 禁止登船渡海").font(Theme.body).foregroundStyle(Theme.seal)
                                    Text("敌军战舰控制港外航道，跨海贸易受阻且陆军无法从此港登船，需派水师驱逐封锁舰队。").font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                                }
                                Spacer(minLength: 4)
                            }
                            .padding(.horizontal, 14).padding(.vertical, 10)
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }
                    if let siege {
                        Group2 {
                            HStack(spacing: 8) {
                                ArtEmblem(image: BundleArt.fxSiegeFlame, size: 24, fallback: .war)
                                Text("敌军围城中").font(Theme.body).foregroundStyle(Theme.seal)
                                Spacer()
                                NationChip(map: map, nation: siege.nation)
                                Text("\(Int((siege.progress * 100).rounded()))%").font(Theme.label).foregroundStyle(Theme.seal).monospacedDigit()
                            }
                            .padding(.horizontal, 14).padding(.top, 11)
                            InkBar(fraction: siege.progress, color: Theme.seal, track: Theme.ink.opacity(0.08), height: 6)
                                .padding(.horizontal, 14).padding(.top, 7).padding(.bottom, 12)
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    // 4. 三页签清晰分层：概览与快捷 / 地利战况 / 政区编辑
                    ChipPicker(items: Tab.allCases.map { ($0, $0.rawValue) }, selection: $tab)
                        .padding(.horizontal, Theme.Layout.pageInset)

                    switch tab {
                    case .overview:
                        ViewBoundary { overviewSection(map: map, p: p, owner: owner, nation: nation, lex: lex, armies: armies, port: port, holyOf: holyOf) }
                    case .military:
                        ViewBoundary { militarySection(map: map, owner: owner) }
                    case .admin:
                        ViewBoundary { adminSection(map: map, p: p, owner: owner, nation: nation, port: port, isCapital: isCapital, holyOf: holyOf) }
                    }
                }
                .padding(.bottom, 36)
            }
            .scrollContentBackground(.hidden)
            .ignoresSafeArea(.container, edges: .bottom)
            .pressMenuHost($pressMenu)
            .paperToast($flash)
            .sheet(isPresented: $showingBreakdown) {
                ProvinceBreakdownSheet(model: model, province: province, provinceName: p.name)
                    .presentationDetents([.medium, .fraction(0.89)]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.section)
            }
            .task(id: "\(province)-\((model.state?.day ?? 0) / 30)-\(refreshNonce)") {
                if owner >= 0 { model.prefetchNationInfo(owner) }
                info = await model.provinceInfo(province)
                if region == nil { region = await model.regionInfo(province) }
            }
            .confirmationDialog("更改本\(lex.adminUnit)特产", isPresented: $pickingGood, titleVisibility: .visible) {
                ForEach(Array(Trade.goods.enumerated()), id: \.offset) { i, n in
                    Button(n) { Task { report(await model.setSpecialty(province, i), "特产改为" + n); await reloadNow() } }
                }
                Button("恢复本地特产") { Task { report(await model.setSpecialty(province, nil), "已恢复本地特产"); await reloadNow() } }
            }
            .confirmationDialog("更改本地文化", isPresented: $pickingCulture, titleVisibility: .visible) {
                ForEach(Names.culture.keys.sorted(), id: \.self) { k in
                    Button(Names.culture[k] ?? k) { Task { report(await model.setCityCulture(province, k), "本地文化已更改"); await reloadNow() } }
                }
            }
            .confirmationDialog("州郡改名", isPresented: $pickingRename, titleVisibility: .visible) {
                Button("按本地文化随机新地名") {
                    Task {
                        let e = await model.edit("randomProvinceName", ["province": province])
                        await model.refreshCustom()
                        report(e, "地名已焕新")
                        await reloadNow()
                    }
                }
                if let g = region {
                    Button("修改所属区域名（\(g.name)）") {
                        regionName = g.name
                        renamingRegion = true
                    }
                }
                Button("取消", role: .cancel) {}
            }
            .confirmationDialog("都城与州治调整", isPresented: $pickingCapitalRole, titleVisibility: .visible) {
                if owner >= 0 && !isCapital && map.meta.cities.contains(where: { $0.province == province }) {
                    Button("迁都至\(p.name)") {
                        Task { report(await model.setCapital(owner, province: province), "已迁都\(p.name)"); await reloadNow() }
                    }
                }
                if let g = region, g.center != province {
                    Button("设为「\(g.name)」区域中心") {
                        Task { report(await model.setRegionCenter(province), "已设为区域中心"); await reloadNow() }
                    }
                }
                Button("取消", role: .cancel) {}
            }
            .sheet(isPresented: $renamingRegion) {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "区域更名", subtitle: region.map { "现名 \($0.name)" }, seal: "改")
                    TextField("", text: $regionName).paperField().padding(.horizontal, 22)
                    SealButton(title: "颁行", disabled: regionName.trimmingCharacters(in: .whitespaces).isEmpty) {
                        renamingRegion = false
                        Task { report(await model.renameRegion(province, regionName), "区域已更名"); await reloadNow() }
                    }
                    .padding(.horizontal, 22)
                }
                .padding(.bottom, 16)
                .presentationDetents([.height(280)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).presentationCornerRadius(Theme.Control.cornerSheet)
            }
            .sheet(isPresented: $editingDefense) {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "城防修缮", subtitle: "\(p.name) · 调节城防等级或修筑要塞", seal: "城")
                    Group2 {
                        VStack(spacing: 12) {
                            PaperStepper(title: "城防等级", value: $editDefenseLevel, range: 1...10, unit: "级")
                            Divider2()
                            HStack(spacing: 8) {
                                EditorialTactileButton(title: "锁定该级", icon: .fortress, accent: true, solid: true, fullWidth: true) {
                                    let lv = editDefenseLevel
                                    editingDefense = false
                                    Task { report(await model.edit("setProvinceDefense", ["province": province, "level": lv]), "城防已修缮为 \(lv) 级"); await reloadNow() }
                                }
                                EditorialTactileButton(title: "恢复自动", icon: .refresh, fullWidth: true) {
                                    editingDefense = false
                                    Task { report(await model.edit("setProvinceDefense", ["province": province, "level": NSNull()]), "城防已恢复自动"); await reloadNow() }
                                }
                            }
                            HStack(spacing: 8) {
                                EditorialTactileButton(title: "修筑要塞", icon: .fortress, fullWidth: true) {
                                    editingDefense = false
                                    Task { report(await model.editProvince(province, population: nil, fortress: true), "要塞已筑成"); await reloadNow() }
                                }
                                EditorialTactileButton(title: "拆除要塞", icon: .trash, accent: true, fullWidth: true) {
                                    editingDefense = false
                                    Task { report(await model.editProvince(province, population: nil, fortress: false), "要塞已拆除"); await reloadNow() }
                                }
                            }
                        }
                        .padding(14)
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }
                .padding(.bottom, 18)
                .presentationDetents([.height(370)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).presentationCornerRadius(Theme.Control.cornerSheet)
            }
            .sheet(isPresented: $editingLivelihood) {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "补给与民生调整", subtitle: "\(p.name) · 调整州郡人口与仓廪存粮", seal: "民")
                    Group2 {
                        VStack(spacing: 12) {
                            PaperSlider(title: "人口", value: $editPopulation, range: 100...5_000_000, step: 10_000) { Names.wan(Int($0)) }
                            Divider2()
                            PaperSlider(title: "存粮", value: $editGrain, range: 0...5_000_000, step: 10_000) { Names.wan(Int($0)) }
                        }
                        .padding(14)
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                    SealButton(title: "颁行调整") {
                        let nextPop = editPopulation, nextGrain = editGrain
                        editingLivelihood = false
                        Task {
                            let e1 = await model.editProvince(province, population: nextPop, fortress: nil)
                            let e2 = e1 == nil ? await model.setProvinceGrain(province, grain: nextGrain) : e1
                            report(e2, "民生与存粮已更新")
                            await reloadNow()
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }
                .padding(.bottom, 18)
                .presentationDetents([.height(340)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).presentationCornerRadius(Theme.Control.cornerSheet)
            }
            .sheet(isPresented: $granting) {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        SheetHeader(title: "划入他国", subtitle: "\(p.name)划入所选国家，法理与实控同时转移", seal: "绘")
                        if let state = model.state {
                            Group2 {
                                NationGrid(map: map, nations: state.nations.indices.filter { state.nations[$0].alive && $0 != owner && $0 < map.meta.nations.count }, selection: $grantTarget).padding(14)
                                Divider2()
                                Button {
                                    let t = grantTarget; granting = false
                                    Task { report(await model.grant(province: province, to: t), "已划入他国"); await reloadNow() }
                                } label: {
                                    HStack(spacing: 6) {
                                        InkIcon(glyph: .brush, size: 15, weight: 1.8)
                                        Text("确认划入")
                                    }
                                        .font(Theme.section)
                                        .frame(maxWidth: .infinity).padding(.vertical, 13)
                                        .foregroundStyle(grantTarget < 0 ? Theme.ink2 : Theme.seal)
                                }
                                .buttonStyle(.plain).disabled(grantTarget < 0)
                            }
                            .padding(.horizontal, Theme.Layout.pageInset)
                        }
                    }
                    .padding(.bottom, 24)
                }
                .presentationDetents([.medium]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).presentationCornerRadius(Theme.Control.cornerSheet).font(Theme.section)
            }
        }
    }

    // MARK: - 2×2 宋版宣纸核心 KPI 宫格

    @ViewBuilder
    private func provinceKpiGrid(info: ProvinceInfo, armiesCount: Int, siege: GameState.Siege?) -> some View {
        let popFrac = info.capacity > 0 ? min(1, Double(info.population) / Double(info.capacity)) : nil
        let defLv = Int((info.defense ?? 1).rounded())
        let taxMul = (info.income ?? 1.0) * (info.terrainTax ?? 1.0)
        let taxPct = Int((taxMul * 100).rounded())
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 9), GridItem(.flexible(), spacing: 9)], spacing: 9) {
            kpiCard(
                icon: .person,
                label: "人口",
                value: Names.wan(info.population),
                sub: "上限 \(Names.wan(info.capacity))",
                fraction: popFrac,
                warn: false
            ) {
                GameFeel.shared.scrollOpen(); showingBreakdown = true
            }
            kpiCard(
                icon: .goods,
                label: "存粮",
                value: Names.wan(Int(info.grain)),
                sub: "补给 \(Int(info.supply.rounded()))",
                fraction: nil,
                warn: info.grain < Double(max(1, info.population)) * 0.12
            ) {
                GameFeel.shared.scrollOpen(); showingBreakdown = true
            }
            kpiCard(
                icon: .fortress,
                label: "城防",
                value: "\(defLv) 级",
                sub: siege != nil ? "围城 \(Int((siege!.progress * 100).rounded()))%" : (armiesCount > 0 ? "驻军 \(armiesCount) 支" : "四境安宁"),
                fraction: min(1, Double(defLv) / 10.0),
                warn: siege != nil
            ) {
                GameFeel.shared.scrollOpen(); showingBreakdown = true
            }
            kpiCard(
                icon: .economy,
                label: "税赋",
                value: "\(taxPct)%",
                sub: info.specialty.map { "特产 · \($0)" } ?? "常产赋税",
                fraction: nil,
                warn: taxPct < 85
            ) {
                if info.specialty != nil {
                    GameFeel.shared.tap(); pickingGood = true
                } else {
                    GameFeel.shared.scrollOpen(); showingBreakdown = true
                }
            }
        }
    }

    private func kpiCard(icon: InkGlyph, label: String, value: String, sub: String, fraction: Double?, warn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    InkIcon(glyph: icon, size: 13.5, weight: 1.7)
                        .foregroundStyle(warn ? Theme.seal : Theme.ink2)
                        .frame(width: 16, height: 16)
                    Text(label)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                    Spacer(minLength: 4)
                    Text(sub)
                        .font(Theme.sans(11))
                        .foregroundStyle(warn ? Theme.seal : Theme.ink2.opacity(0.85))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                Text(value)
                    .font(Theme.serif(19))
                    .foregroundStyle(warn ? Theme.seal : Theme.ink)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
                    .contentTransition(.numericText())
                if let fraction {
                    InkBar(fraction: fraction, color: warn ? Theme.seal : Theme.ink.opacity(0.58), track: Theme.hairline, height: 3)
                } else {
                    Rectangle().fill(Color.clear).frame(height: 3)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: 76)
            .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous)
                    .stroke(warn ? Theme.seal.opacity(0.38) : Theme.hairline, lineWidth: 0.75)
            )
            .contentShape(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
        }
        .buttonStyle(PressStyle())
    }

    // MARK: - 置顶所属国家主权大卡

    @ViewBuilder
    private func sovereignHeroCard(map: WorldMap, provinceName: String, owner: Int, nation: WorldMeta.Nation?, info: ProvinceInfo?) -> some View {
        if let n = nation {
            let tint = Names.color(n.color)
            HStack(spacing: 12) {
                Rectangle()
                    .fill(tint)
                    .frame(width: 4, height: 42)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 7) {
                        Text(n.name).font(Theme.serif(19)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
                        if let info, info.core == true {
                            PaperTag(text: "核心", color: Theme.ink2, size: 10.5)
                        }
                    }
                    let legalNote: String = {
                        if let info, info.owner != info.controller, info.owner >= 0, info.owner < map.meta.nations.count {
                            return " · 法理属\(map.meta.nations[info.owner].name)"
                        }
                        return ""
                    }()
                    Text("\(Names.polity[n.polity] ?? n.polity) · \(Names.culture[n.culture] ?? n.culture)\(legalNote)")
                        .font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                }
                Spacer(minLength: 6)
                EditorialTactileButton(title: "国家详情", icon: .chevronRight, solid: true, compact: true) {
                    openNation(owner)
                }
            }
            .padding(.vertical, 12)
            .paperCard()
        } else {
            HStack(spacing: 12) {
                Seal(text: "邑", size: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text("无主之地").font(Theme.serif(16)).foregroundStyle(Theme.ink)
                    Text("尚未归属政权，可在此立国").font(Theme.caption).foregroundStyle(Theme.ink2)
                }
                Spacer()
                EditorialTactileButton(title: "在此立国", solid: true, compact: true) {
                    Task { report(await model.foundNation(province, war: false), "新国已立"); await reloadNow() }
                }
            }
            .padding(.vertical, 12)
            .paperCard()
        }
    }

    // MARK: - 概览与驻军

    @ViewBuilder
    private func overviewSection(map: WorldMap, p: WorldMeta.Province, owner: Int, nation: WorldMeta.Nation?, lex: LocalizationEngine.Lexicon, armies: [(offset: Int, element: GameState.Army)], port: GameState.Port?, holyOf: GameState.Holy?) -> some View {
        // 一屏直达的 4 项触感快捷按钮
        if let n = nation {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                quickTile(title: "国家详情", glyph: .nation, tint: Theme.ink) { openNation(owner) }
                quickTile(title: "划入他国", glyph: .brush, tint: Theme.ink) { grantTarget = -1; granting = true }
                quickTile(title: "在此立国", glyph: .fire, tint: Theme.seal) {
                    pressMenu = PressMenu(title: "在\(p.name)建立新国家", subtitle: "按本地文化生成国号、执政者与氏族", items: [
                        PressMenuItem(title: "和平独立", symbol: "leaf") { Task { report(await model.foundNation(province, war: false), "新国已立"); await reloadNow() } },
                        PressMenuItem(title: "举兵独立（与原主开战）", symbol: "flag.2.crossed", destructive: true) { Task { report(await model.foundNation(province, war: true), "已举兵"); await reloadNow() } },
                    ])
                }
                quickTile(title: holyOf == nil ? "定为圣地" : "本教圣地", glyph: .religion, tint: Theme.ink, disabled: holyOf != nil) {
                    Task { report(await model.setHolyProvince(province), "已定为\(Names.religion[n.religion] ?? "本教")圣地"); await reloadNow() }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }

        // 本境驻军（前置展示，点击直接进入军团详情）
        if !armies.isEmpty {
            SectionLabel("本\(lex.adminUnit)驻军（\(armies.count) 军）")
            Group2 {
                ForEach(armies, id: \.element.id) { pair in
                    Button {
                        GameFeel.shared.tap()
                        openArmy(pair.offset)
                    } label: {
                        ArmyRow(map: map, army: pair.element)
                    }
                    .buttonStyle(.plain)
                    if pair.element.id != armies.last?.element.id { Divider2() }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }

        // 五槽州郡基建（水利 / 商埠 / 关隘 / 船坞 / 学院）与特产战略实效
        if let info {
            alignedInfraSection(info: info)
        }

        // 繁盛度与战略定位
        if let info, let prosp = info.prosperity {
            SectionLabel("\(lex.adminUnit)治况与战略价值")
            Group2 {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        if let role = info.strategicRole {
                            PaperTag(text: role, color: role == "咽喉雄关" || role == "边荒险地" ? Theme.seal : Theme.ink2, size: 11)
                        }
                        Text("繁盛度").font(Theme.label).foregroundStyle(Theme.ink2)
                        Text(info.prosperityLabel ?? "").font(Theme.body).foregroundStyle(prosp < 40 ? Theme.seal : Theme.ink)
                        Spacer()
                        EditorialValueText("\(prosp)/100", size: 15, color: Theme.ink)
                    }
                    InkBar(fraction: Double(prosp) / 100.0, color: prosp < 40 ? Theme.seal : Theme.ink.opacity(0.68), height: 4)
                    if !info.kinds.isEmpty {
                        Divider2()
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10, alignment: .leading), GridItem(.flexible(), spacing: 10, alignment: .leading)], alignment: .leading, spacing: 8) {
                            ForEach(Array(info.kinds.enumerated()), id: \.offset) { _, k in
                                HStack(alignment: .top, spacing: 6) {
                                    PaperTag(
                                        text: k.0,
                                        color: (k.0 == "封锁" || k.0 == "民变" || k.0 == "瘟疫" || k.0 == "饥荒") ? Theme.seal : Theme.ink2,
                                        size: 11
                                    )
                                    Text(k.1).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(2).minimumScaleFactor(0.8).fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 4).padding(.vertical, 14)
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        } else if let info, !info.kinds.isEmpty {
            SectionLabel("\(lex.adminUnit)风物与治况")
            Group2 {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10, alignment: .leading), GridItem(.flexible(), spacing: 10, alignment: .leading)], alignment: .leading, spacing: 9) {
                    ForEach(Array(info.kinds.enumerated()), id: \.offset) { _, k in
                        HStack(alignment: .top, spacing: 6) {
                            PaperTag(
                                text: k.0,
                                color: k.0 == "边地" ? Theme.ink2 : (k.0 == "封锁" || k.0 == "民变" || k.0 == "瘟疫" || k.0 == "饥荒") ? Theme.seal : (k.0 == "核心" || k.0 == "善治" || k.0 == "粮仓") ? Theme.jade : Theme.seal,
                                size: 11
                            )
                            Text(k.1).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(2).minimumScaleFactor(0.8).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(14)
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }

        if let port {
            SectionLabel("海港控制")
            Group2 {
                Row(label: "海港", value: port.occupier == port.owner ? "本国控制" : "被占领"); Divider2()
                if port.occupier >= 0, port.occupier < map.meta.nations.count { Row(label: "港口控制", value: map.meta.nations[port.occupier].name); Divider2() }
                Row(label: "控制度", value: "\(Int(port.value))")
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    // MARK: - 地利与战况

    @ViewBuilder
    private func militarySection(map: WorldMap, owner: Int) -> some View {
        if let info {
            // 地形实际玩法影响卡片：一目了然展示行军速度、税赋丰瘠、天然守险与敌军补给损耗
            SectionLabel("山川地利影响")
            Group2 {
                VStack(alignment: .leading, spacing: 10) {
                    if let summary = info.terrainSummary, !summary.isEmpty {
                        Text(summary).font(Theme.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    HStack(spacing: 0) {
                        let pacePct = Int(((info.pace ?? 1.0) * 100).rounded())
                        let taxDelta = Int((((info.terrainTax ?? 1.0) - 1.0) * 100).rounded())
                        let defDelta = Int((((info.terrainDefense ?? 1.0) - 1.0) * 100).rounded())
                        let attrText = info.terrainAttrition ?? "无"
                        terrainCell(label: "行军速", value: "\(pacePct)%", tone: pacePct >= 100 ? Theme.jade : pacePct <= 70 ? Theme.seal : Theme.ink)
                        Rectangle().fill(Theme.ink.opacity(0.10)).frame(width: 0.8, height: 32)
                        terrainCell(label: "赋税产出", value: taxDelta == 0 ? "标准" : (taxDelta > 0 ? "+\(taxDelta)%" : "\(taxDelta)%"), tone: taxDelta > 0 ? Theme.jade : taxDelta < 0 ? Theme.seal : Theme.ink)
                        Rectangle().fill(Theme.ink.opacity(0.10)).frame(width: 0.8, height: 32)
                        terrainCell(label: "天然守险", value: defDelta == 0 ? "平地" : (defDelta > 0 ? "+\(defDelta)%" : "\(defDelta)%"), tone: defDelta > 0 ? Theme.jade : Theme.ink2)
                        Rectangle().fill(Theme.ink.opacity(0.10)).frame(width: 0.8, height: 32)
                        terrainCell(label: "客军损耗", value: attrText.replacingOccurrences(of: "无额外损耗", with: "无"), tone: attrText.contains("极") || attrText.contains("严") || attrText.contains("瘴") ? Theme.seal : attrText.contains("无") ? Theme.ink2 : Theme.gold)
                    }
                    if let sName = info.seasonName, let sNote = info.seasonNote, !sNote.isEmpty {
                        Divider2()
                        HStack(alignment: .top, spacing: 6) {
                            PaperTag(text: sName, color: sName.contains("冬") ? Color(red: 0.24, green: 0.44, blue: 0.62) : sName.contains("秋") ? Color(red: 0.74, green: 0.42, blue: 0.12) : Theme.jade, size: 11)
                            Text(sNote).font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            if let arms = info.combat, !arms.isEmpty {
                SectionLabel("地利 · 各兵种攻防修正")
                Group2 {
                    HStack {
                        Text("兵种").font(Theme.label).foregroundStyle(Theme.ink2)
                        Spacer()
                        Text("进攻").font(Theme.label).foregroundStyle(Theme.ink2).frame(width: 62, alignment: .trailing)
                        Text("防守").font(Theme.label).foregroundStyle(Theme.ink2).frame(width: 62, alignment: .trailing)
                    }
                    .padding(.horizontal, 16).padding(.top, 11).padding(.bottom, 5)
                    Divider2()
                    ForEach(arms.indices, id: \.self) { i in
                        HStack {
                            Text(arms[i].unit).font(Theme.body).foregroundStyle(Theme.ink)
                            Spacer()
                            Self.percent(arms[i].attack).frame(width: 62, alignment: .trailing)
                            Self.percent(arms[i].defense).frame(width: 62, alignment: .trailing)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 8)
                        if i < arms.count - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
            ProvinceWarView(info: info, owner: owner, state: model.state, map: map)
        } else {
            Text("正在勘察地利战况……").font(Theme.body).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset)
        }
    }

    // MARK: - 对齐五槽州郡基建（水利 / 商埠 / 关隘 / 船坞 / 学院）

    private func infraGlyph(for id: String) -> InkGlyph {
        switch id {
        case "irrigation": return .lake
        case "market": return .economy
        case "fortress": return .fortress
        case "shipyard": return .anchor
        case "academy": return .culture
        default: return .region
        }
    }

    @ViewBuilder
    private func alignedInfraSection(info: ProvinceInfo) -> some View {
        if let effect = info.specialtyEffect, !effect.isEmpty {
            Group2 {
                HStack(spacing: 8) {
                    PaperTag(text: info.specialtyTier ?? "战略特产", color: Theme.gold, size: 11)
                    Text("\(info.specialty ?? "物产")：\(effect)")
                        .font(Theme.caption).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }

        if let slots = info.infra, !slots.isEmpty {
            SectionLabel("州郡基建（水利 / 商埠 / 关隘 / 船坞 / 学院）")
            Group2 {
                VStack(spacing: 0) {
                    ForEach(Array(slots.enumerated()), id: \.element.id) { idx, row in
                        let maxLv = max(3, min(5, row.level > 3 ? 5 : 3))
                        let isMax = row.level >= maxLv
                        HStack(alignment: .center, spacing: 11) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 7, style: .continuous)
                                    .fill(row.level > 0 ? Theme.seal.opacity(0.08) : Theme.wash.opacity(0.6))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                                            .stroke(row.level > 0 ? Theme.seal.opacity(0.28) : Theme.hairline, lineWidth: 0.7)
                                    )
                                InkIcon(glyph: infraGlyph(for: row.id), size: 15, weight: 1.7)
                                    .foregroundStyle(row.level > 0 ? Theme.seal : Theme.ink2)
                            }
                            .frame(width: 30, height: 30)

                            VStack(alignment: .leading, spacing: 3) {
                                HStack(spacing: 6) {
                                    Text(row.label)
                                        .font(Theme.body)
                                        .foregroundStyle(Theme.ink)
                                        .lineLimit(1)
                                    HStack(spacing: 3) {
                                        ForEach(1...maxLv, id: \.self) { lv in
                                            Circle()
                                                .fill(lv <= row.level ? Theme.seal : Theme.ink.opacity(0.14))
                                                .frame(width: 5.5, height: 5.5)
                                        }
                                    }
                                    Text("Lv.\(row.level)")
                                        .font(Theme.caption)
                                        .foregroundStyle(row.level > 0 ? Theme.seal : Theme.ink2)
                                        .monospacedDigit()
                                }
                                Text(row.effect)
                                    .font(Theme.caption)
                                    .foregroundStyle(Theme.ink2)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.78)
                            }

                            Spacer(minLength: 6)

                            Group {
                                if isMax {
                                    Text("已满级")
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.jade)
                                        .frame(width: 88, height: 30)
                                        .background(Theme.jade.opacity(0.09), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                                        .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(Theme.jade.opacity(0.32), lineWidth: 0.7))
                                } else if row.available {
                                    Button {
                                        guard !infraBusy else { return }
                                        GameFeel.shared.tap()
                                        infraBusy = true
                                        Task {
                                            let err = await model.buildProvinceInfra(province: province, slot: row.id)
                                            report(err, err == nil ? "已\(row.level == 0 ? "兴建" : "升级") \(row.level + 1) 级\(row.label)" : "")
                                            await reloadNow()
                                            infraBusy = false
                                        }
                                    } label: {
                                        Text("\(row.level == 0 ? "兴建" : "升级") · \(row.cost)金")
                                            .font(Theme.caption)
                                            .foregroundStyle(Theme.seal)
                                            .monospacedDigit()
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.78)
                                            .frame(width: 88, height: 30)
                                            .background(Theme.seal.opacity(0.08), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                                            .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(Theme.seal.opacity(0.32), lineWidth: 0.75))
                                    }
                                    .buttonStyle(PressStyle())
                                    .disabled(infraBusy)
                                    .opacity(infraBusy ? 0.5 : 1)
                                } else {
                                    Text("需沿海港")
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.ink2)
                                        .frame(width: 88, height: 30)
                                }
                            }
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        if idx < slots.count - 1 { Divider2() }
                    }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    // MARK: - 政区与编辑（全对齐 AlignedMetaRow）

    @ViewBuilder
    private func adminSection(map: WorldMap, p: WorldMeta.Province, owner: Int, nation: WorldMeta.Nation?, port: GameState.Port?, isCapital: Bool, holyOf: GameState.Holy?) -> some View {
        let legalNation: WorldMeta.Nation? = {
            if let info, info.owner >= 0, info.owner < map.meta.nations.count {
                return map.meta.nations[info.owner]
            }
            return nation
        }()
        let capitalStatus = isCapital ? "国都" : (region?.center == province ? "区域中心" : "普通州郡")
        let canAdjustCapitalRole = (owner >= 0 && !isCapital && map.meta.cities.contains(where: { $0.province == province })) || (region != nil && region?.center != province)

        SectionLabel("民生与政区总览")
        Group2 {
            AlignedMetaRow(
                label: "所属国（法理）",
                value: legalNation?.name ?? "无主之地",
                icon: .nation,
                trailingGlyph: .chevronRight,
                action: legalNation != nil ? { openNation(info?.owner ?? owner) } : nil
            )
            Divider2()
            AlignedMetaRow(
                label: "实控国",
                value: nation?.name ?? "无主之地",
                icon: .command,
                valueColor: (info != nil && info!.owner != info!.controller) ? Theme.seal : Theme.ink,
                trailingGlyph: .chevronRight,
                action: nation != nil ? { openNation(owner) } : nil
            )
            Divider2()
            AlignedMetaRow(
                label: "政区地形",
                value: Self.terrainLine(info, p.terrain, port: port != nil),
                icon: .mountain
            )
            Divider2()
            AlignedMetaRow(
                label: "都城 / 州治",
                value: capitalStatus,
                icon: .crown,
                valueColor: isCapital ? Theme.seal : Theme.ink,
                trailingGlyph: .brush,
                action: canAdjustCapitalRole ? { pickingCapitalRole = true } : nil
            )
            if let g = region {
                Divider2()
                AlignedMetaRow(
                    label: "所属区域",
                    value: "\(g.name) · \(g.provinces.count)州 · \(Names.wan(Int(g.population)))人",
                    icon: .region,
                    trailingGlyph: .brush,
                    action: { regionActions = true }
                )
                .confirmationDialog(g.name, isPresented: $regionActions, titleVisibility: .visible) {
                    Button("区域更名") { regionName = g.name; renamingRegion = true }
                    if g.center != province {
                        Button("设为区域中心") {
                            Task { report(await model.setRegionCenter(province), "已设为区域中心"); await reloadNow() }
                        }
                    }
                }
            }
            if let h = holyOf {
                Divider2()
                AlignedMetaRow(label: "圣地归属", value: (Names.religion[h.religion] ?? h.religion) + "圣地", icon: .religion, valueColor: Theme.seal)
            }
            if let n = nation {
                Divider2()
                AlignedMetaRow(label: "所属政体", value: Names.polity[n.polity] ?? n.polity, icon: .polity)
                Divider2()
                AlignedMetaRow(label: "主体文化", value: Names.culture[n.culture] ?? n.culture, icon: .culture)
            }
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        SectionLabel("政区编辑（点按即时修改）")
        Group2 {
            AlignedMetaRow(
                label: "州郡改名",
                value: p.name,
                icon: .brush,
                trailingGlyph: .brush,
                action: { pickingRename = true }
            )
            Divider2()
            AlignedMetaRow(
                label: "疆土划归",
                value: nation?.name ?? "无主之地",
                icon: .nation,
                trailingGlyph: .brush,
                action: { grantTarget = -1; granting = true }
            )
            if let info {
                Divider2()
                AlignedMetaRow(
                    label: "城防修缮",
                    value: "\(Int((info.defense ?? 1).rounded())) 级",
                    icon: .fortress,
                    trailingGlyph: .brush,
                    action: {
                        editDefenseLevel = max(1, min(10, Int((info.defense ?? 1).rounded())))
                        editingDefense = true
                    }
                )
                Divider2()
                AlignedMetaRow(
                    label: "补给 / 民生",
                    value: "\(Names.wan(info.population))人 · \(Names.wan(Int(info.grain)))粮",
                    icon: .goods,
                    trailingGlyph: .brush,
                    action: {
                        editPopulation = Double(info.population)
                        editGrain = info.grain
                        editingLivelihood = true
                    }
                )
                if let good = info.specialty {
                    Divider2()
                    AlignedMetaRow(
                        label: "州郡特产",
                        value: good,
                        icon: .goods,
                        trailingGlyph: .brush,
                        action: { pickingGood = true }
                    )
                }
                Divider2()
                AlignedMetaRow(
                    label: "本地文化",
                    value: Names.culture[info.cityCulture ?? ""] ?? info.cityCulture ?? "—",
                    icon: .culture,
                    trailingGlyph: .brush,
                    action: { pickingCulture = true }
                )
            }
        }
        .padding(.horizontal, Theme.Layout.pageInset)
    }

    private func terrainCell(label: String, value: String, tone: Color) -> some View {
        VStack(spacing: 3) {
            Text(label).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
            Text(value).font(Theme.body).foregroundStyle(tone).monospacedDigit().lineLimit(1).minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity)
    }

    private func quickTile(title: String, glyph: InkGlyph, tint: Color, disabled: Bool = false, action: @escaping () -> Void) -> some View {
        let isAccent = (tint == Theme.seal)
        return Button {
            GameFeel.shared.tap()
            action()
        } label: {
            VStack(spacing: 5) {
                InkIcon(glyph: glyph, size: 17, weight: 1.7)
                    .foregroundStyle(isAccent ? Theme.seal : Theme.ink)
                    .frame(height: 20)
                Text(title).font(Theme.caption).foregroundStyle(isAccent ? Theme.seal : Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity).frame(height: 56)
            .background(isAccent ? Theme.seal.opacity(0.06) : Theme.wash.opacity(0.48), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(isAccent ? Theme.seal.opacity(0.28) : Theme.hairline, lineWidth: 0.65))
            .contentShape(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
        }
        .buttonStyle(PressStyle())
        .disabled(disabled).opacity(disabled ? 0.42 : 1)
    }
}

extension ProvinceSheet {
    /// Subtitle uses the same land name as the tags. The coarse plain/forest/mountain field can
    /// disagree with the biome (平原 beside 热带雨林); the tag wins once the province is loaded.
    static func terrainLine(_ info: ProvinceInfo?, _ stored: String, port: Bool = false) -> String {
        let base: String
        if info?.mountain == true { base = "山地" }
        else if let name = info?.terrain, !name.isEmpty { base = name }
        else { base = Names.terrain[stored] ?? stored }
        if port { return "\(base) · 良港要冲" }
        if info?.mountain == true { return "\(base) · 山隘险地" }
        if base.contains("林") { return "\(base) · 林莽之地" }
        if base.contains("草原") || base.contains("平") { return "\(base) · 沃野平畴" }
        return base
    }
    /// A terrain multiplier as a signed percent: jade when it helps, seal when it hurts.
    static func percent(_ v: Double) -> some View {
        let p = Int(((v - 1) * 100).rounded())
        return Text(p == 0 ? "—" : (p > 0 ? "+\(p)%" : "\(p)%")).font(Theme.body).monospacedDigit()
            .foregroundStyle(p > 0 ? Theme.jade : p < 0 ? Theme.seal : Theme.ink2)
    }
}
