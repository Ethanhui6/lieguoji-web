import SwiftUI
import CoreText
import UniformTypeIdentifiers
import LieguojiCore

struct ProvinceSheet: View {
    @ObservedObject var model: GameModel
    let province: Int
    var openNation: (Int) -> Void = { _ in }
    var openArmy: (Int) -> Void = { _ in }
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
    private func report(_ e: String?, _ ok: String) { flash = e ?? ok; GameFeel.shared.notify(e == nil ? .success : .error) }
    var body: some View {
        if let map = model.map {
            let p = map.meta.provinces[province]
            let owner = model.state.flatMap { $0.owners.indices.contains(province) ? $0.owners[province] : nil } ?? p.nation
            let nation = owner >= 0 && owner < map.meta.nations.count ? map.meta.nations[owner] : nil
            let armies = model.state?.armies.enumerated().filter { $0.element.province == province } ?? []
            ScrollView {
                VStack(spacing: 14) {
                    SheetHeader(title: p.name, subtitle: nation.map { "\($0.name) · \(Self.terrainLine(info, p.terrain))" } ?? Self.terrainLine(info, p.terrain), color: nation.map { Names.color($0.color) })
                    if let s = model.state { BattleBoard(province: province, state: s, map: map, openArmy: openArmy) }
                    if let info {
                        // 州郡属性: core or frontier, mountain, fortress, rich, granary, well governed.
                        // Two columns, each a tag and what it means (one long row ran off the page).
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10, alignment: .leading), GridItem(.flexible(), spacing: 10, alignment: .leading)], alignment: .leading, spacing: 8) {
                            ForEach(Array(info.kinds.enumerated()), id: \.offset) { _, k in
                                HStack(spacing: 6) {
                                    PaperTag(text: k.0, color: k.0 == "边地" ? Theme.ink2 : k.0 == "封锁" || k.0 == "民变" ? Color(red: 0.45, green: 0.08, blue: 0.08) : Theme.seal, size: 13)
                                    Text(k.1).font(Theme.kai(12)).foregroundStyle(Theme.ink2).lineLimit(2).minimumScaleFactor(0.8).fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                        .padding(.horizontal, 22)
                        if let arms = info.combat, !arms.isEmpty {
                            // 地利: how this land favours each arm (attacking into it / holding it).
                            Group2 {
                                HStack {
                                    Text("地利").font(Theme.kai(15)).foregroundStyle(Theme.ink2)
                                    Spacer()
                                    Text("进攻").font(Theme.kai(13)).foregroundStyle(Theme.ink2).frame(width: 58, alignment: .trailing)
                                    Text("防守").font(Theme.kai(13)).foregroundStyle(Theme.ink2).frame(width: 58, alignment: .trailing)
                                }
                                .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 4)
                                ForEach(arms.indices, id: \.self) { i in
                                    HStack {
                                        Text(arms[i].unit).font(Theme.kai(16)).foregroundStyle(Theme.ink)
                                        Spacer()
                                        Self.percent(arms[i].attack).frame(width: 58, alignment: .trailing)
                                        Self.percent(arms[i].defense).frame(width: 58, alignment: .trailing)
                                    }
                                    .padding(.horizontal, 16).padding(.vertical, 5)
                                }
                                Spacer(minLength: 6)
                            }
                            .padding(.horizontal, 16)
                        }
                        ProvinceWarView(info: info, owner: owner, state: model.state, map: map)
                    }
                    Group2 {
                        if let info {
                            Row(label: "人口", value: info.population.formatted()); Divider2()
                            Row(label: "人口上限", value: info.capacity.formatted()); Divider2()
                            Row(label: "存粮", value: Int(info.grain).formatted()); Divider2()
                            if let good = info.specialty {
                                Button { pickingGood = true } label: {
                                    HStack { Text("特产").foregroundStyle(Theme.ink2); Spacer(); Text(good).foregroundStyle(Theme.ink); Image(systemName: "pencil").font(.system(size: 10, weight: .regular)).foregroundStyle(Theme.seal.opacity(0.7)) }
                                        .font(Theme.kai(17)).padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .confirmationDialog("特产", isPresented: $pickingGood, titleVisibility: .visible) {
                                    ForEach(Array(Trade.goods.enumerated()), id: \.offset) { i, n in
                                        Button(n) { Task { report(await model.setSpecialty(province, i), "特产改为" + n); self.info = await model.provinceInfo(province) } }
                                    }
                                    Button("恢复本地特产") { Task { report(await model.setSpecialty(province, nil), "已恢复本地特产"); self.info = await model.provinceInfo(province) } }
                                }
                                Divider2()
                            }
                            if let g = region {
                                Button { regionActions = true } label: {
                                    HStack { Text("区域").foregroundStyle(Theme.ink2); Spacer(); Text("\(g.name) · \(g.provinces.count)州 · \(Names.wan(Int(g.population)))人").foregroundStyle(Theme.ink).lineLimit(1); Image(systemName: "pencil").font(.system(size: 10, weight: .regular)).foregroundStyle(Theme.seal.opacity(0.7)) }
                                        .font(Theme.kai(17)).padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .confirmationDialog(g.name, isPresented: $regionActions, titleVisibility: .visible) {
                                    Button("区域更名") { regionName = g.name; renamingRegion = true }
                                    if g.center != province { Button("设为区域中心") { Task { report(await model.setRegionCenter(province), "已设为区域中心"); region = await model.regionInfo(province) } } }
                                }
                                .sheet(isPresented: $renamingRegion) {
                                    VStack(alignment: .leading, spacing: 14) {
                                        SheetHeader(title: "区域更名", subtitle: "现名 \(g.name)", seal: "改")
                                        TextField("", text: $regionName).paperField().padding(.horizontal, 22)
                                        SealButton(title: "颁行", disabled: regionName.trimmingCharacters(in: .whitespaces).isEmpty) {
                                            renamingRegion = false
                                            Task { report(await model.renameRegion(province, regionName), "区域已更名"); region = await model.regionInfo(province) }
                                        }
                                        .padding(.horizontal, 22)
                                    }
                                    .padding(.bottom, 16)
                                    .presentationDetents([.height(280)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
                                }
                                Divider2()
                            }
                            Button { pickingCulture = true } label: {
                                HStack { Text("本地文化").foregroundStyle(Theme.ink2); Spacer(); Text(Names.culture[info.cityCulture ?? ""] ?? info.cityCulture ?? "—").foregroundStyle(Theme.ink); Image(systemName: "pencil").font(.system(size: 10, weight: .regular)).foregroundStyle(Theme.seal.opacity(0.7)) }
                                    .font(Theme.kai(17)).padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .confirmationDialog("本地文化", isPresented: $pickingCulture, titleVisibility: .visible) {
                                ForEach(Names.culture.keys.sorted(), id: \.self) { k in
                                    Button(Names.culture[k] ?? k) { Task { report(await model.setCityCulture(province, k), "本地文化已更改"); self.info = await model.provinceInfo(province) } }
                                }
                            }
                            Divider2()
                            if info.owner != info.controller, info.owner >= 0, info.owner < map.meta.nations.count { Row(label: "法理归属", value: map.meta.nations[info.owner].name); Divider2() }
                        }
                        if let n = nation {
                            Row(label: "政体", value: Names.polity[n.polity] ?? n.polity); Divider2(); Row(label: "文化", value: Names.culture[n.culture] ?? n.culture); Divider2()
                            Button { openNation(owner) } label: {
                                HStack { Text("国家详情").foregroundStyle(Theme.ink); Spacer(); Text(n.name).foregroundStyle(Theme.ink2); Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.ink2) }
                                    .font(Theme.kai(17)).padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            Divider2()
                            Button { grantTarget = -1; granting = true } label: {
                                HStack { Text("划入他国（绘制国家）").foregroundStyle(Theme.ink); Spacer(); Image(systemName: "paintbrush.pointed").font(.caption).foregroundStyle(Theme.seal) }
                                    .font(Theme.kai(17)).padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            Divider2()
                            // 在此立国: a new state in this province, at peace or in arms against its owner.
                            Button {
                                pressMenu = PressMenu(title: "在\(p.name)建立新国家", subtitle: "按本州文化生成国号、君主与家族", items: [
                                    PressMenuItem(title: "和平独立", symbol: "leaf") { Task { report(await model.foundNation(province, war: false), "新国已立"); self.info = await model.provinceInfo(province) } },
                                    PressMenuItem(title: "举兵独立（与原主开战）", symbol: "flag.2.crossed", destructive: true) { Task { report(await model.foundNation(province, war: true), "已举兵"); self.info = await model.provinceInfo(province) } },
                                ])
                            } label: {
                                HStack { Text("在此立国").foregroundStyle(Theme.ink); Spacer(); Image(systemName: "flag.fill").font(.caption).foregroundStyle(Theme.seal) }
                                    .font(Theme.kai(17)).padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            Divider2()
                            // 圣地: this province as its owner's faith's holy province.
                            let holyOf = model.state?.holy?.first { $0.province == province }
                            if let h = holyOf {
                                Row(label: "圣地", value: (Names.religion[h.religion] ?? h.religion) + "圣地")
                            } else {
                                Button { Task { report(await model.setHolyProvince(province), "已定为圣地") } } label: {
                                    HStack { Text("设为" + (Names.religion[n.religion] ?? "本教") + "圣地").foregroundStyle(Theme.ink); Spacer(); Image(systemName: "sparkle").font(.caption).foregroundStyle(Theme.seal) }
                                        .font(Theme.kai(17)).padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    if let siege = model.state?.sieges.first(where: { $0.province == province }) {
                        Group2 {
                            HStack { Text("围城").foregroundStyle(Theme.seal); Spacer(); NationChip(map: map, nation: siege.nation) }.padding(.horizontal, 16).padding(.top, 12)
                            GeometryReader { g in
                                let filled = min(1, max(0, siege.progress))
                                ZStack(alignment: .leading) {
                                    Capsule().fill(Theme.ink.opacity(0.08))
                                    Capsule().fill(Theme.seal).frame(width: g.size.width * filled)
                                }
                            }
                            .frame(height: 6).padding(.horizontal, 16).padding(.bottom, 14)
                        }
                        .padding(.horizontal, 16)
                    }
                    if let port = model.state?.ports?.first(where: { $0.province == province }) {
                        Group2 {
                            Row(label: "海港", value: port.occupier == port.owner ? "本国控制" : "被占领"); Divider2()
                            if port.occupier >= 0, port.occupier < map.meta.nations.count { Row(label: "港口控制", value: map.meta.nations[port.occupier].name); Divider2() }
                            Row(label: "控制度", value: "\(Int(port.value))")
                        }
                        .padding(.horizontal, 16)
                    }
                    if !armies.isEmpty {
                        Group2 {
                            ForEach(armies, id: \.element.id) { pair in
                                Button { openArmy(pair.offset) } label: { ArmyRow(map: map, army: pair.element) }.buttonStyle(.plain)
                                if pair.element.id != armies.last?.element.id { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
                .padding(.bottom, 24)
            }
            .pressMenuHost($pressMenu)
            .paperToast($flash)
            .task(id: model.state?.day) { info = await model.provinceInfo(province); if region == nil { region = await model.regionInfo(province) } }
            .sheet(isPresented: $granting) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        SheetHeader(title: "绘制国家", subtitle: "\(p.name)划入所选国家，法理与实控同时转移", seal: "绘")
                        if let state = model.state {
                            Group2 {
                                NationGrid(map: map, nations: state.nations.indices.filter { state.nations[$0].alive && $0 != owner && $0 < map.meta.nations.count }, selection: $grantTarget).padding(14)
                                Divider2()
                                Button {
                                    let t = grantTarget; granting = false
                                    Task { report(await model.grant(province: province, to: t), "已划入他国"); self.info = await model.provinceInfo(province) }
                                } label: { Label("确认划入", systemImage: "paintbrush.pointed.fill").font(Theme.kai(18)).frame(maxWidth: .infinity).padding(.vertical, 13).foregroundStyle(grantTarget < 0 ? Theme.ink2 : Theme.seal) }
                                .buttonStyle(.plain).disabled(grantTarget < 0)
                            }
                            .padding(.horizontal, 16)
                        }
                    }
                    .padding(.bottom, 24)
                }
                .presentationDetents([.medium]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.kai(17))
            }
        }
    }
}

extension ProvinceSheet {
    /// Subtitle uses the same land name as the tags. The coarse plain/forest/mountain field can
    /// disagree with the biome (平原 beside 热带雨林); the tag wins once the province is loaded.
    static func terrainLine(_ info: ProvinceInfo?, _ stored: String) -> String {
        if info?.mountain == true { return "山地" }
        if let name = info?.terrain, !name.isEmpty { return name }
        return Names.terrain[stored] ?? stored
    }
    /// A terrain multiplier as a signed percent: seal red when it helps, faded when it hurts.
    static func percent(_ v: Double) -> some View {
        let p = Int(((v - 1) * 100).rounded())
        return Text(p == 0 ? "—" : (p > 0 ? "+\(p)%" : "\(p)%")).font(Theme.kai(15)).monospacedDigit()
            .foregroundStyle(p > 0 ? Theme.seal : p < 0 ? Theme.ink2 : Theme.ink)
    }
}
