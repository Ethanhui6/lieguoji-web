import SwiftUI
import LieguojiCore

/// 深度邦交总览：双边好感仪（-100…+100）、渐进披露逐项关系原因、六大条约胶囊、反霸权包围网与第三方斡旋停战。
struct DiplomacyBoard: View {
    @ObservedObject var model: GameModel
    let map: WorldMap
    let state: GameState
    let nation: Int
    let fly: (Int) -> Void
    let openNation: (Int) -> Void
    let openWars: () -> Void
    let openChronicle: (Int) -> Void
    @State private var info: DiplomacyOverview?
    @State private var failed = false
    @State private var attempt = 0
    @State private var alliances: [GameModel.AllianceRow] = []
    @State private var expandedNation: Int? = nil
    @State private var busy = false
    @State private var flash: String?

    struct Relation: Identifiable {
        struct Tag: Identifiable { let id: String; let text: String; let color: Color }
        let id: Int
        var tags: [Tag] = []
        var note = ""
        var rank = 9
        var atWar = false
        var opinion: DiplomacyOverview.OpinionEntry? = nil
    }
    private func name(_ n: Int) -> String { map.meta.nations.indices.contains(n) ? MapLayers.stateLabel(map.meta.nations[n].name, full: false) : "无主" }
    private func color(_ n: Int) -> Color { map.meta.nations.indices.contains(n) ? Names.color(map.meta.nations[n].color) : Theme.ink2 }
    private func posturePill(label: String, count: Int, tint: Color) -> some View {
        HStack(spacing: 4) {
            Text(label).font(Theme.caption).foregroundStyle(Theme.ink2)
            Text("\(count)").font(Theme.body).foregroundStyle(count > 0 ? tint : Theme.ink2).monospacedDigit()
        }
        .frame(maxWidth: .infinity).frame(height: 30)
        .background(count > 0 ? tint.opacity(0.09) : Theme.wash.opacity(0.65), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func relations(_ info: DiplomacyOverview) -> [Relation] {
        var rows = [Int: Relation]()
        func add(_ n: Int, _ text: String, _ color: Color, rank: Int, note: String = "", war: Bool = false) {
            guard n != nation, n >= 0, n < state.nations.count, state.nations[n].alive else { return }
            var r = rows[n] ?? Relation(id: n)
            if !r.tags.contains(where: { $0.text == text }) {
                r.tags.append(Relation.Tag(id: "\(n)-\(text)", text: text, color: color))
            }
            r.rank = min(r.rank, rank)
            if !note.isEmpty { r.note = r.note.isEmpty ? note : r.note + " · " + note }
            if war { r.atWar = true }
            rows[n] = r
        }
        for n in info.enemies { add(n, "交战", Theme.seal, rank: 0, war: true) }
        for n in info.allies { add(n, "同盟", Theme.jade, rank: 1) }
        if let lord = info.overlord { add(lord, "宗主", Theme.ink, rank: 2) }
        for n in info.vassals { add(n, "附庸", Theme.ink, rank: 2) }
        for p in info.pacts {
            let lbl = DiplomacyOverview.treatyLabel(p.kind)
            let tone: Color = (p.kind == "defense" || p.kind == "trade" || p.kind == "marriage") ? Theme.jade : Color(red: 0.68, green: 0.48, blue: 0.14)
            add(p.nation, lbl, tone, rank: 3, note: "余 \(max(1, p.months)) 月")
        }
        for t in info.truces { add(t.nation, "停战", Theme.ink2, rank: 4, note: "余 \(max(1, t.days / 30)) 月") }
        for op in info.opinions ?? [] {
            guard op.nation != nation, op.nation >= 0, op.nation < state.nations.count, state.nations[op.nation].alive else { continue }
            var r = rows[op.nation] ?? Relation(id: op.nation)
            r.opinion = op
            if op.claim { add(op.nation, "王位宣称", Color(red: 0.72, green: 0.48, blue: 0.12), rank: 3) }
            if op.neighbor && r.note.isEmpty {
                let ratio = info.troops > 0 ? Double(op.troops) / Double(info.troops) : 0
                let relStr = info.troops > 0 ? (ratio > 1.5 ? "强于我" : ratio < 0.67 ? "弱于我" : "势均") : ""
                r.note = "接壤 · \(Names.wan(op.troops))兵" + (relStr.isEmpty ? "" : "（\(relStr)）")
            }
            if r.rank == 9 { r.rank = op.neighbor ? 5 : 6 }
            rows[op.nation] = r
        }
        return rows.values.sorted { a, b in
            if a.rank != b.rank { return a.rank < b.rank }
            let sa = a.opinion?.score ?? 0, sb = b.opinion?.score ?? 0
            if abs(sa) != abs(sb) { return abs(sa) > abs(sb) }
            return a.id < b.id
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // 邦交态势总览卡（区别于军事页的四格计数块，以单一国玺态势横卡直观呈现本国外交处境）
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 4).fill(color(nation)).frame(width: 6, height: 34)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(name(nation)) · 鸿胪邦交").font(Theme.section).foregroundStyle(Theme.ink)
                        Text(state.wars.isEmpty ? "四海承平 · 邦交从容" : "天下 \(state.wars.count) 场战事进行中 · 本国接壤 \(info?.neighbors.count ?? 0) 邦")
                            .font(Theme.caption).foregroundStyle(Theme.ink2)
                    }
                    Spacer()
                    SealFace(text: (info?.enemies.isEmpty == false) ? "战" : "盟", size: 28, color: (info?.enemies.isEmpty == false) ? Theme.seal : Theme.jade)
                }
                HStack(spacing: 6) {
                    posturePill(label: "敌国", count: info?.enemies.count ?? 0, tint: Theme.seal)
                    posturePill(label: "同盟", count: info?.allies.count ?? 0, tint: Theme.jade)
                    posturePill(label: "条约", count: info?.pacts.count ?? 0, tint: Color(red: 0.66, green: 0.48, blue: 0.14))
                    posturePill(label: "附庸", count: info?.vassals.count ?? 0, tint: Theme.ink)
                }
            }
            .padding(14)
            .background(Theme.paper2.opacity(0.95), in: RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous).stroke(Theme.ink.opacity(0.14), lineWidth: 0.85))
            .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.06), radius: 6, y: 2)
            .padding(.horizontal, Theme.Layout.pageInset)

            // 霸权威胁警示与反霸包围网
            if let hegemons = info?.hegemons, !hegemons.isEmpty {
                SectionLabel("天下霸主 · 合纵遏霸")
                VStack(spacing: 8) {
                    ForEach(hegemons) { h in
                        HStack(spacing: 10) {
                            RoundedRectangle(cornerRadius: 3).fill(color(h.nation)).frame(width: 8, height: 32)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(name(h.nation)).font(Theme.section).foregroundStyle(Theme.ink)
                                    PaperTag(text: "霸权威胁 \(h.threat)", color: Theme.seal, size: 11)
                                }
                                Text("疆域炽盛、震慑四邻，可号召诸邦结成共同防御包围网").font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                            }
                            Spacer(minLength: 4)
                            Button {
                                runQuick("已发起反\(name(h.nation))包围网") { await model.formCoalition(nation, against: h.nation) }
                            } label: {
                                Text("结包围网").font(Theme.label).foregroundStyle(Theme.paper2)
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                                    .background(Theme.seal, in: Capsule())
                            }
                            .buttonStyle(PressStyle()).disabled(busy)
                        }
                        .padding(12).paperCard(tint: Theme.seal)
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            if !alliances.isEmpty {
                SectionLabel("同盟一览")
                VStack(spacing: 8) {
                    ForEach(alliances) { a in AllianceCard(alliance: a, name: name, color: color, fly: fly) }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            // 第三方大国斡旋停战
            if let wars = info?.mediatableWars, !wars.isEmpty {
                SectionLabel("大国斡旋停战")
                Group2 {
                    ForEach(Array(wars.prefix(4).enumerated()), id: \.element.id) { idx, w in
                        HStack(spacing: 8) {
                            Text("\(name(w.a)) ⚔ \(name(w.b))").font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                            Spacer()
                            Button {
                                runQuick("已斡旋\(name(w.a))与\(name(w.b))停火") { await model.mediatePeace(nation, between: w.a, and: w.b) }
                            } label: {
                                Text("出面调停").font(Theme.label).foregroundStyle(Theme.jade)
                                    .padding(.horizontal, 10).padding(.vertical, 5)
                                    .background(Theme.jade.opacity(0.1), in: Capsule())
                                    .overlay(Capsule().stroke(Theme.jade.opacity(0.35), lineWidth: 0.8))
                            }
                            .buttonStyle(PressStyle()).disabled(busy)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        if idx < min(wars.count, 4) - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            SectionLabel(name(nation) + "的双边邦交（点开看理由与博弈）")
            Group2 {
                if let info {
                    let rows = relations(info)
                    if rows.isEmpty {
                        Text("与各国素无往来").font(Theme.body).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 14)
                    }
                    ForEach(rows) { r in
                        RelationRow(
                            relation: r,
                            name: name(r.id),
                            color: color(r.id),
                            expanded: expandedNation == r.id,
                            busy: busy,
                            toggleExpand: {
                                GameFeel.shared.tap()
                                withAnimation(Motion.panel) { expandedNation = expandedNation == r.id ? nil : r.id }
                            },
                            fly: { fly(r.id) },
                            openNation: { openNation(r.id) },
                            openWars: openWars,
                            openChronicle: { openChronicle(r.id) },
                            onAction: { actionKind in
                                switch actionKind {
                                case "trade": runQuick("已与\(name(r.id))签署通商协定") { await model.treaty(nation, r.id, years: 10, kind: "trade") }
                                case "defense": runQuick("已与\(name(r.id))缔结共同防御条约") { await model.treaty(nation, r.id, years: 10, kind: "defense") }
                                case "ultimatum": runQuick("已向\(name(r.id))发出最后通牒") { await model.sendUltimatum(nation, to: r.id, demand: "tribute") }
                                case "covert": runQuick("已派密使资助\(name(r.id))反对派") { await model.covertAction(nation, target: r.id, kind: "fundRebels") }
                                default: break
                                }
                            }
                        )
                        if r.id != rows.last?.id { Divider2() }
                    }
                } else {
                    PanelPending(failed: failed) { attempt += 1 }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
        .paperToast($flash)
        .task(id: "\(nation)-\(state.day / 30)-\(attempt)") {
            info = await model.diplomacyInfo(nation); failed = info == nil
            alliances = await model.allianceList()
        }
    }

    private func runQuick(_ fallback: String, _ op: @escaping () async -> String?) {
        guard !busy else { return }
        busy = true
        Task {
            let err = await op()
            flash = err ?? (model.state?.events.last?.text ?? fallback)
            GameFeel.shared.notify(err == nil ? .success : .error)
            attempt += 1
            busy = false
        }
    }
}

private struct AllianceCard: View {
    let alliance: GameModel.AllianceRow
    let name: (Int) -> String
    let color: (Int) -> Color
    let fly: (Int) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 2).fill(Names.color(alliance.color)).frame(width: 10, height: 10)
                Text(alliance.name).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                if alliance.unbreakable { PaperTag(text: "铁盟", color: Theme.ink) }
                Spacer(minLength: 4)
                Text("\(alliance.members.count) 国").font(Theme.label).foregroundStyle(Theme.ink2)
            }
            FlowChips(items: alliance.members.map { n -> (Int, String, Color, String?) in (n, name(n), color(n), nil) }) { n in fly(n) }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .paperCard()
    }
}

/// 渐进披露式双边关系行：首层一眼看国名、好感分值、立场与条约；点击展开第二层看逐项原因拆解条与快捷外交操作。
private struct RelationRow: View {
    let relation: DiplomacyBoard.Relation
    let name: String
    let color: Color
    let expanded: Bool
    let busy: Bool
    let toggleExpand: () -> Void
    let fly: () -> Void
    let openNation: () -> Void
    let openWars: () -> Void
    let openChronicle: () -> Void
    let onAction: (String) -> Void

    private var stanceColor: Color {
        guard let op = relation.opinion else { return Theme.ink2 }
        if relation.atWar || op.score <= -22 { return Theme.seal }
        if op.score >= 25 { return Theme.jade }
        return Theme.ink2
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Button(action: toggleExpand) {
                    HStack(spacing: 10) {
                        RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 9, height: 34)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 5) {
                                Text(name).font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
                                if let op = relation.opinion {
                                    PaperTag(text: "\(op.stance) \(op.score > 0 ? "+" : "")\(op.score)", color: stanceColor, size: 11)
                                }
                                ForEach(relation.tags.prefix(2)) { t in PaperTag(text: t.text, color: t.color, size: 11) }
                            }
                            if let op = relation.opinion {
                                OpinionGauge(score: op.score, height: 5).frame(maxWidth: 165)
                            } else if !relation.note.isEmpty {
                                Text(relation.note).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                            }
                        }
                        Spacer(minLength: 4)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if relation.atWar { LinkSeal(mark: "战", color: Theme.seal, action: openWars) }
                LinkSeal(mark: "都", color: Theme.ink2, action: fly)
                LinkSeal(mark: "国", color: Theme.jade, action: openNation)
            }

            if expanded {
                VStack(alignment: .leading, spacing: 8) {
                    if !relation.note.isEmpty {
                        Text(relation.note).font(Theme.caption).foregroundStyle(Theme.ink2)
                    }
                    if let reasons = relation.opinion?.reasons, !reasons.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(reasons.prefix(6)) { r in
                                HStack {
                                    Text(r.label).font(Theme.caption).foregroundStyle(Theme.ink2)
                                    Spacer()
                                    Text("\(r.delta > 0 ? "+" : "")\(r.delta)").font(Theme.caption)
                                        .foregroundStyle(r.delta > 0 ? Theme.jade : Theme.seal).monospacedDigit()
                                }
                            }
                        }
                        .padding(10)
                        .background(Theme.paper.opacity(0.65), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    if !relation.atWar {
                        HStack(spacing: 7) {
                            quickDipBtn("通商", color: Theme.jade) { onAction("trade") }
                            quickDipBtn("共防", color: Theme.jade) { onAction("defense") }
                            quickDipBtn("通牒", color: Theme.seal) { onAction("ultimatum") }
                            quickDipBtn("资敌", color: Theme.ink) { onAction("covert") }
                        }
                    }
                }
                .padding(.leading, 19)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
    }

    private func quickDipBtn(_ title: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(Theme.label).foregroundStyle(color)
                .frame(maxWidth: .infinity).frame(height: 30)
                .background(color.opacity(0.09), in: Capsule())
                .overlay(Capsule().stroke(color.opacity(0.32), lineWidth: 0.8))
        }
        .buttonStyle(PressStyle()).disabled(busy)
    }
}

private struct LinkSeal: View {
    let mark: String
    let color: Color
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            SealFace(text: mark, size: 28, color: color, filled: false)
        }
        .buttonStyle(PressStyle())
    }
}
