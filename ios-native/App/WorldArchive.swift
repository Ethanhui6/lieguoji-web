import SwiftUI

/// 世界卷宗: the card kept beside a saved world, so a list of them needs no reading of the saves.
struct ArchivedWorld: Codable, Identifiable, Equatable {
    var id: String
    var title: String
    var date: String
    var nations: Int
    var day: Int
    var saved: Date
}

extension GameModel {
    static var currentCardURL: URL { saveURL.deletingPathExtension().appendingPathExtension("json") }
    static var archiveFolder: URL {
        let dir = saveURL.deletingLastPathComponent().appendingPathComponent("卷宗", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// The running world as a card: named for whoever holds the most land.
    func currentCard() -> ArchivedWorld? {
        guard let s = state, let meta = map?.meta else { return nil }
        var held = [Int: Int]()
        for o in s.owners where o >= 0 { held[o, default: 0] += 1 }
        let top = held.max { $0.value != $1.value ? $0.value < $1.value : $0.key > $1.key }?.key
        let name = top.flatMap { meta.nations.indices.contains($0) ? meta.nations[$0].name : nil } ?? ""
        return ArchivedWorld(id: UUID().uuidString, title: name.isEmpty ? "无名之世" : "\(name)之世", date: s.dateText, nations: held.count, day: s.day, saved: Date())
    }

    /// Before another world takes the save, the one played so far is put away (a world barely begun is not kept).
    func archiveCurrent() async {
        let save = Self.saveURL, card = Self.currentCardURL, folder = Self.archiveFolder
        await Task.detached(priority: .utility) {
            let files = FileManager.default
            guard files.fileExists(atPath: save.path) else { return }
            let known = (try? Data(contentsOf: card)).flatMap { try? JSONDecoder().decode(ArchivedWorld.self, from: $0) }
            if let known, known.day < 30 { return }
            let id = UUID().uuidString
            // A save from before the cards existed has only its file date to go by.
            let modified = (try? files.attributesOfItem(atPath: save.path)[.modificationDate] as? Date) ?? Date()
            var info = known ?? ArchivedWorld(id: id, title: "旧日世界", date: "", nations: 0, day: 30, saved: modified)
            info.id = id
            let target = folder.appendingPathComponent(id).appendingPathExtension("lgj")
            guard (try? files.copyItem(at: save, to: target)) != nil, let raw = try? JSONEncoder().encode(info) else { return }
            try? raw.write(to: target.deletingPathExtension().appendingPathExtension("json"), options: .atomic)
        }.value
    }

    func archivedWorlds() async -> [ArchivedWorld] {
        let folder = Self.archiveFolder
        return await Task.detached(priority: .userInitiated) { () -> [ArchivedWorld] in
            let names = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
            return names.filter { $0.pathExtension == "json" }
                .compactMap { url in (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode(ArchivedWorld.self, from: $0) } }
                .sorted { $0.saved > $1.saved }
        }.value
    }

    /// Takes a world out of the archive to play; the one that was being played goes in its place.
    func openArchived(_ world: ArchivedWorld) async {
        pause()
        if state != nil { await saveNow() }
        await archiveCurrent()
        let chosen = Self.archiveFolder.appendingPathComponent(world.id).appendingPathExtension("lgj")
        let save = Self.saveURL, card = Self.currentCardURL
        do {
            let files = FileManager.default
            guard files.fileExists(atPath: chosen.path) else { throw EngineError.message("这卷世界的存档已不在了。") }
            if files.fileExists(atPath: save.path) { _ = try files.replaceItemAt(save, withItemAt: chosen) } else { try files.moveItem(at: chosen, to: save) }
            try? files.removeItem(at: chosen.deletingPathExtension().appendingPathExtension("json"))
            if let raw = try? JSONEncoder().encode(world) { try? raw.write(to: card, options: .atomic) }
        } catch { failure = "卷宗无法读取：\(error.localizedDescription)"; return }
        await continueGame()
    }

    func deleteArchived(_ world: ArchivedWorld) {
        let base = Self.archiveFolder.appendingPathComponent(world.id)
        try? FileManager.default.removeItem(at: base.appendingPathExtension("lgj"))
        try? FileManager.default.removeItem(at: base.appendingPathExtension("json"))
    }
}

/// 世界卷宗: every world put away, newest first, like scrolls on a shelf.
struct WorldArchiveSheet: View {
    @ObservedObject var model: GameModel
    let open: (ArchivedWorld) -> Void
    @State private var worlds: [ArchivedWorld] = []
    @State private var loaded = false
    @State private var burning: ArchivedWorld?
    private static let stamp: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyyy.MM.dd HH:mm"; return f }()
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "世界卷宗", subtitle: "开创新世界时，上一方天下自动收存于此", seal: "卷")
                if worlds.isEmpty {
                    if loaded {
                        Text("架上尚空。推演满一个月的世界，会在开创新世界时收进这里。")
                            .font(Theme.kai(15)).foregroundStyle(Theme.ink2).padding(.horizontal, 22).padding(.top, 8)
                    }
                } else {
                    Group2 {
                        ForEach(Array(worlds.enumerated()), id: \.element.id) { i, w in
                            if i > 0 { Divider2() }
                            row(w)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .task { worlds = await model.archivedWorlds(); loaded = true }
        .confirmationDialog("焚毁「\(burning?.title ?? "")」？存档将永久删除，无法恢复。", isPresented: Binding(get: { burning != nil }, set: { if !$0 { burning = nil } }), titleVisibility: .visible) {
            Button("焚毁这卷", role: .destructive) {
                guard let w = burning else { return }
                model.deleteArchived(w)
                withAnimation(.easeOut(duration: 0.25)) { worlds.removeAll { $0.id == w.id } }
                burning = nil
            }
            Button("留着", role: .cancel) { burning = nil }
        }
    }
    private func row(_ w: ArchivedWorld) -> some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 2).fill(Theme.seal).frame(width: 4, height: 38)
            VStack(alignment: .leading, spacing: 3) {
                Text(w.title).font(Theme.kai(18)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                Text(subtitle(w)).font(Theme.kai(12)).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.7).monospacedDigit()
            }
            Spacer(minLength: 8)
            Button { burning = w } label: {
                Image(systemName: "flame").font(.system(size: 15)).foregroundStyle(Theme.ink2).frame(width: 34, height: 34)
            }
            .buttonStyle(PressStyle())
            Button { open(w) } label: {
                Text("展卷").font(Theme.kai(15)).foregroundStyle(Theme.paper2).padding(.horizontal, 14).frame(height: 34)
                    .background(Theme.seal, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            }
            .buttonStyle(PressStyle())
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
    }
    private func subtitle(_ w: ArchivedWorld) -> String {
        var parts = [String]()
        if !w.date.isEmpty { parts.append(w.date) }
        if w.nations > 0 { parts.append("\(w.nations) 国") }
        parts.append(Self.stamp.string(from: w.saved))
        return parts.joined(separator: " · ")
    }
}
