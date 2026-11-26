import SwiftUI
import UIKit

/// 世界卷宗: the card kept beside a saved world, so a list of them needs no reading of the saves.
struct ArchivedWorld: Codable, Identifiable, Equatable {
    var id: String
    var title: String
    var date: String
    var nations: Int
    var day: Int
    var saved: Date
}

/// 云端存档卡片（存于 Cloudflare Durable Object SQLite，跨设备随时上传/下载，无需电脑开机）。
struct CloudSaveCard: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    let date: String
    let nations: Int
    let provinces: Int
    let day: Int
    let sizeBytes: Int
    let updatedAt: Double
    let device: String
    let encoding: String

    var savedDate: Date { Date(timeIntervalSince1970: updatedAt / 1000.0) }
    var sizeText: String {
        if sizeBytes >= 1_048_576 { return String(format: "%.1f MB", Double(sizeBytes) / 1_048_576) }
        return "\(max(1, sizeBytes / 1024)) KB"
    }
}

/// 云端存档服务：已登录账号时直连列国纪专属腾讯云服务器（按账号安全隔离，国内 0.3s 极速同步）；
/// 未登录时平滑兼容房间码 Cloudflare 云库。
enum CloudSaveClient {
    private static let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 45
        cfg.timeoutIntervalForResource = 180
        return URLSession(configuration: cfg)
    }()

    private static func platformURL(_ path: String) -> URL? {
        URL(string: OnlinePlatform.apiBase + "/api/v1/" + path)
    }

    private static func roomURL(_ base: String, path: String) -> URL? {
        URL(string: base + "/room/\(NativeHost.activeRoomCode)/\(path)")
    }

    static func list() async throws -> [CloudSaveCard] {
        struct ListResp: Decodable { let ok: Bool; let saves: [CloudSaveCard]? }
        if let token = OnlinePlatform.currentToken, let url = platformURL("saves") {
            var req = URLRequest(url: url); req.timeoutInterval = 10
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            if let (data, resp) = try? await session.data(for: req),
               (resp as? HTTPURLResponse)?.statusCode == 200,
               let decoded = try? JSONDecoder().decode(ListResp.self, from: data), decoded.ok {
                return decoded.saves ?? []
            }
        }
        var lastError: Error = EngineError.message("连不上云端存档服务器")
        for base in RelayLink.bases {
            guard let url = roomURL(base, path: "saves") else { continue }
            var req = URLRequest(url: url); req.timeoutInterval = 12
            do {
                let (data, resp) = try await session.data(for: req)
                guard (resp as? HTTPURLResponse)?.statusCode == 200 else { continue }
                let decoded = try JSONDecoder().decode(ListResp.self, from: data)
                return decoded.saves ?? []
            } catch { lastError = error }
        }
        throw lastError
    }

    static func upload(id: String, rawSave: Data, title: String, date: String, nations: Int, provinces: Int, day: Int) async throws -> CloudSaveCard {
        struct PutResp: Decodable { let ok: Bool; let save: CloudSaveCard?; let reason: String? }
        let compressed = (try? (rawSave as NSData).compressed(using: .zlib) as Data)
        let payload = compressed ?? rawSave
        let encoding = compressed != nil ? "zlib" : "raw"
        let deviceName = await MainActor.run { UIDevice.current.name }
        let enc: (String) -> String = { $0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0 }

        func applySaveHeaders(_ req: inout URLRequest) {
            req.httpMethod = "PUT"
            req.timeoutInterval = 90
            req.setValue("application/octet-stream", forHTTPHeaderField: "content-type")
            req.setValue(encoding, forHTTPHeaderField: "x-save-encoding")
            req.setValue(enc(title), forHTTPHeaderField: "x-save-title")
            req.setValue(enc(date), forHTTPHeaderField: "x-save-date")
            req.setValue(String(nations), forHTTPHeaderField: "x-save-nations")
            req.setValue(String(provinces), forHTTPHeaderField: "x-save-provinces")
            req.setValue(String(day), forHTTPHeaderField: "x-save-day")
            req.setValue(enc(deviceName), forHTTPHeaderField: "x-save-device")
        }

        if let token = OnlinePlatform.currentToken, let url = platformURL("saves/\(id)") {
            var req = URLRequest(url: url)
            applySaveHeaders(&req)
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            do {
                let (data, resp) = try await session.upload(for: req, from: payload)
                let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
                if code == 200, let parsed = try? JSONDecoder().decode(PutResp.self, from: data), parsed.ok, let card = parsed.save {
                    Task { @MainActor in await OnlinePlatform.shared.refreshUserProfile() }
                    return card
                }
                if let parsed = try? JSONDecoder().decode(PutResp.self, from: data), let reason = parsed.reason, !reason.isEmpty {
                    throw EngineError.message(reason)
                }
            } catch let e as EngineError {
                throw e
            } catch {
                // 专属服异常时自动回落备用云库
            }
        }

        var lastError: Error = EngineError.message("上传云端存档失败，请检查网络")
        for base in RelayLink.bases {
            guard let url = roomURL(base, path: "saves/\(id)") else { continue }
            var req = URLRequest(url: url)
            applySaveHeaders(&req)
            do {
                let (data, resp) = try await session.upload(for: req, from: payload)
                let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
                if code == 200, let parsed = try? JSONDecoder().decode(PutResp.self, from: data), parsed.ok, let card = parsed.save {
                    return card
                }
                if let parsed = try? JSONDecoder().decode(PutResp.self, from: data), let reason = parsed.reason, !reason.isEmpty {
                    lastError = EngineError.message(reason)
                } else {
                    lastError = EngineError.message("云端响应异常（\(code)）")
                }
            } catch { lastError = error }
        }
        throw lastError
    }

    static func download(id: String) async throws -> Data {
        if let token = OnlinePlatform.currentToken, let url = platformURL("saves/\(id)") {
            var req = URLRequest(url: url); req.timeoutInterval = 90
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            if let (data, resp) = try? await session.data(for: req),
               let http = resp as? HTTPURLResponse, http.statusCode == 200,
               http.value(forHTTPHeaderField: "content-type")?.lowercased().contains("text/html") != true {
                let enc = (http.value(forHTTPHeaderField: "x-save-encoding") ?? "raw").lowercased()
                if enc == "zlib" { return try (data as NSData).decompressed(using: .zlib) as Data }
                return data
            }
        }
        var lastError: Error = EngineError.message("下载云端存档失败")
        for base in RelayLink.bases {
            guard let url = roomURL(base, path: "saves/\(id)") else { continue }
            var req = URLRequest(url: url); req.timeoutInterval = 90
            do {
                let (data, resp) = try await session.data(for: req)
                guard let http = resp as? HTTPURLResponse, http.statusCode == 200,
                      http.value(forHTTPHeaderField: "content-type")?.lowercased().contains("text/html") != true else { continue }
                let enc = (http.value(forHTTPHeaderField: "x-save-encoding") ?? "raw").lowercased()
                if enc == "zlib" {
                    return try (data as NSData).decompressed(using: .zlib) as Data
                }
                return data
            } catch { lastError = error }
        }
        throw lastError
    }

    static func delete(id: String) async throws {
        if let token = OnlinePlatform.currentToken, let url = platformURL("saves/\(id)") {
            var req = URLRequest(url: url); req.httpMethod = "DELETE"; req.timeoutInterval = 15
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            if let (_, resp) = try? await session.data(for: req), (resp as? HTTPURLResponse)?.statusCode == 200 {
                Task { @MainActor in await OnlinePlatform.shared.refreshUserProfile() }
                return
            }
        }
        var lastError: Error = EngineError.message("删除云端存档失败")
        for base in RelayLink.bases {
            guard let url = roomURL(base, path: "saves/\(id)") else { continue }
            var req = URLRequest(url: url); req.httpMethod = "DELETE"; req.timeoutInterval = 15
            do {
                let (_, resp) = try await session.data(for: req)
                if (resp as? HTTPURLResponse)?.statusCode == 200 { return }
            } catch { lastError = error }
        }
        throw lastError
    }
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

    /// 上传当前世界（或磁盘最新主存档）至云端卷宗。
    func uploadCurrentToCloud() async -> Result<CloudSaveCard, Error> {
        let saveData: Data?
        let title: String, date: String, nations: Int, provinces: Int, day: Int
        if let card = currentCard(), let live = await native.save() {
            saveData = live
            title = card.title; date = card.date; nations = card.nations
            provinces = map?.meta.provinces.count ?? state?.owners.count ?? 0; day = card.day
        } else if hasSave, let disk = try? Data(contentsOf: Self.saveURL) {
            saveData = disk
            let known = (try? Data(contentsOf: Self.currentCardURL)).flatMap { try? JSONDecoder().decode(ArchivedWorld.self, from: $0) }
            title = known?.title ?? "当前世界"; date = known?.date ?? ""
            nations = known?.nations ?? 0; provinces = 0; day = known?.day ?? 0
        } else {
            return .failure(EngineError.message("当前尚无可上传的世界存档"))
        }
        guard let raw = saveData, !raw.isEmpty else {
            return .failure(EngineError.message("读取世界存档失败"))
        }
        let slotId = "world-\(Int(Date().timeIntervalSince1970))"
        do {
            let card = try await CloudSaveClient.upload(id: slotId, rawSave: raw, title: title, date: date, nations: nations, provinces: provinces, day: day)
            return .success(card)
        } catch {
            return .failure(error)
        }
    }

    /// 下载云端存档并立即展卷载入。
    func openCloudSave(_ card: CloudSaveCard) async -> String? {
        pause()
        if state != nil { await saveNow() }
        await archiveCurrent()
        do {
            let data = try await CloudSaveClient.download(id: card.id)
            guard data.first == UInt8(ascii: "{") else { return "云端存档格式损坏" }
            try data.write(to: Self.saveURL, options: .atomic)
            let localCard = ArchivedWorld(id: card.id, title: card.title, date: card.date, nations: card.nations, day: card.day, saved: card.savedDate)
            if let raw = try? JSONEncoder().encode(localCard) { try? raw.write(to: Self.currentCardURL, options: .atomic) }
            await continueGame()
            return nil
        } catch {
            return error.localizedDescription
        }
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

/// 世界卷宗：本地卷宗 + 云端存档双栏管理（4.3 极简宣纸风格，支持跨设备上传、下载、删除与同步）。
struct WorldArchiveSheet: View {
    @ObservedObject var model: GameModel
    @ObservedObject private var platform = OnlinePlatform.shared
    let open: (ArchivedWorld) -> Void
    var onCloudOpened: (() -> Void)? = nil
    @State private var tab = "local"
    @State private var authOpen = false
    @State private var worlds: [ArchivedWorld] = []
    @State private var loaded = false
    @State private var burning: ArchivedWorld?

    @State private var cloudSaves: [CloudSaveCard] = []
    @State private var cloudLoading = false
    @State private var cloudBusy = false
    @State private var cloudError: String?
    @State private var cloudBanner: String?
    @State private var deletingCloud: CloudSaveCard?

    private static let stamp: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyyy.MM.dd HH:mm"; return f }()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(
                    title: "世界卷宗",
                    subtitle: platform.isLoggedIn
                        ? "账号专属云库 · \(platform.user?.nickname ?? "")（国内高速直传）"
                        : "本地卷宗与云端存档同步管理（房间 \(NativeHost.activeRoomCode)）",
                    seal: "卷"
                )
                ChipPicker(items: [("local", "本地卷宗"), ("cloud", "云端存档")], selection: $tab)
                    .padding(.horizontal, Theme.Layout.pageInset)

                if tab == "local" {
                    localContent
                } else {
                    cloudContent
                }
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .task {
            worlds = await model.archivedWorlds()
            loaded = true
        }
        .onChange(of: tab) { _, next in
            if next == "cloud", cloudSaves.isEmpty, !cloudLoading {
                Task { await refreshCloud() }
            }
        }
        .confirmationDialog("焚毁「\(burning?.title ?? "")」？存档将永久删除，无法恢复。", isPresented: Binding(get: { burning != nil }, set: { if !$0 { burning = nil } }), titleVisibility: .visible) {
            Button("焚毁这卷", role: .destructive) {
                guard let w = burning else { return }
                model.deleteArchived(w)
                withAnimation(Motion.fade) { worlds.removeAll { $0.id == w.id } }
                burning = nil
            }
            Button("留着", role: .cancel) { burning = nil }
        }
        .confirmationDialog("删除云端存档「\(deletingCloud?.title ?? "")」？", isPresented: Binding(get: { deletingCloud != nil }, set: { if !$0 { deletingCloud = nil } }), titleVisibility: .visible) {
            Button("确认删除", role: .destructive) {
                guard let c = deletingCloud else { return }
                deletingCloud = nil
                Task {
                    cloudBusy = true
                    do {
                        try await CloudSaveClient.delete(id: c.id)
                        withAnimation(Motion.fade) { cloudSaves.removeAll { $0.id == c.id } }
                        cloudBanner = "已从云端删除「\(c.title)」"
                    } catch {
                        cloudError = error.localizedDescription
                    }
                    cloudBusy = false
                }
            }
            Button("留着", role: .cancel) { deletingCloud = nil }
        }
        .sheet(isPresented: $authOpen) {
            AuthPortalSheet(platform: platform, onAuthenticated: {
                Task { await refreshCloud() }
            })
            .presentationDetents([.fraction(0.92)])
            .presentationCornerRadius(Theme.Control.cornerSheet)
            .presentationBackground { MemorialPaper() }
            .presentationDragIndicator(.hidden)
        }
    }

    @ViewBuilder private var localContent: some View {
        if worlds.isEmpty {
            if loaded {
                Text("架上尚空。推演满一个月的世界，会在开创新世界时收进这里；也可切换到「云端存档」拉取或上传备份。")
                    .font(Theme.body).foregroundStyle(Theme.ink2).padding(.horizontal, 22).padding(.top, 8)
            }
        } else {
            Group2 {
                ForEach(Array(worlds.enumerated()), id: \.element.id) { i, w in
                    if i > 0 { Divider2() }
                    localRow(w)
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    @ViewBuilder private var cloudContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !platform.isLoggedIn {
                HStack(spacing: 10) {
                    PhosphorIcon(glyph: .person, size: 16, weight: .light).foregroundStyle(Theme.seal)
                    Text("登录云端账号即可开启腾讯云专属极速存档库（支持 20 卷，国内直传 < 1 秒）")
                        .font(Theme.caption).foregroundStyle(Theme.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 4)
                    EditorialTactileButton(title: "登录", solid: true, compact: true) { authOpen = true }
                }
                .padding(12)
                .background(Theme.seal.opacity(0.055), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.seal.opacity(0.24), lineWidth: 0.7))
                .padding(.horizontal, Theme.Layout.pageInset)
            }
            HStack(spacing: 10) {
                EditorialTactileButton(title: cloudBusy ? "同步中…" : "上传当前世界", icon: .chronicle, solid: true, compact: true, fullWidth: true) {
                    guard !cloudBusy else { return }
                    Task {
                        cloudBusy = true; cloudError = nil; cloudBanner = nil
                        let res = await model.uploadCurrentToCloud()
                        switch res {
                        case .success(let card):
                            cloudSaves.removeAll { $0.id == card.id }
                            cloudSaves.insert(card, at: 0)
                            cloudBanner = "已上传「\(card.title)」（\(card.sizeText)），随时跨设备下载"
                            GameFeel.shared.notify(.success)
                        case .failure(let err):
                            cloudError = err.localizedDescription
                            GameFeel.shared.notify(.error)
                        }
                        cloudBusy = false
                    }
                }
                .disabled(cloudBusy || (model.state == nil && !model.hasSave))

                EditorialTactileButton(title: "刷新云库", icon: .refresh, compact: true) {
                    Task { await refreshCloud() }
                }
                .disabled(cloudLoading || cloudBusy)
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            if let banner = cloudBanner {
                Text(banner).font(Theme.label).foregroundStyle(Theme.jade)
                    .padding(.horizontal, Theme.Layout.pageInset)
            }
            if let err = cloudError {
                Text(err).font(Theme.label).foregroundStyle(Theme.seal)
                    .padding(.horizontal, Theme.Layout.pageInset)
            }

            if cloudLoading {
                HStack(spacing: 8) {
                    InkBusy().frame(width: 24, height: 24)
                    Text("正在读取云端存档卷宗…").font(Theme.label).foregroundStyle(Theme.ink2)
                }
                .padding(.horizontal, Theme.Layout.pageInset).padding(.vertical, 8)
            } else if cloudSaves.isEmpty {
                Text("云端尚无存档。轻点上方「上传当前世界」即可将进度 zlib 压缩存入云端（无需电脑开机，最多保留 16 卷）。")
                    .font(Theme.body).foregroundStyle(Theme.ink2)
                    .padding(.horizontal, Theme.Layout.pageInset).padding(.top, 4)
            } else {
                Group2 {
                    ForEach(Array(cloudSaves.enumerated()), id: \.element.id) { i, c in
                        if i > 0 { Divider2() }
                        cloudRow(c)
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
        }
    }

    private func refreshCloud() async {
        cloudLoading = true; cloudError = nil
        do {
            cloudSaves = try await CloudSaveClient.list()
        } catch {
            cloudError = error.localizedDescription
        }
        cloudLoading = false
    }

    private func localRow(_ w: ArchivedWorld) -> some View {
        HStack(spacing: 12) {
            Rectangle().fill(Theme.seal).frame(width: 2.5, height: 36)
            VStack(alignment: .leading, spacing: 3) {
                Text(w.title).font(Theme.serif(16)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.74)
                Text(subtitle(w)).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.74).monospacedDigit()
            }
            Spacer(minLength: 8)
            Button { burning = w } label: {
                PhosphorIcon(glyph: .trash, size: 15, weight: .light)
                    .foregroundStyle(Theme.ink2)
                    .frame(width: 34, height: 34)
                    .background(Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            .buttonStyle(PressStyle())
            EditorialTactileButton(title: "展卷", solid: true, compact: true) { open(w) }
        }
        .padding(.horizontal, 4).padding(.vertical, 12)
    }

    private func cloudRow(_ c: CloudSaveCard) -> some View {
        HStack(spacing: 10) {
            Rectangle().fill(Theme.jade).frame(width: 2.5, height: 38)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(c.title).font(Theme.serif(15.5)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.74)
                    Text(c.sizeText).font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                }
                Text(cloudSubtitle(c)).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.72).monospacedDigit()
            }
            Spacer(minLength: 6)
            Button { deletingCloud = c } label: {
                PhosphorIcon(glyph: .trash, size: 15, weight: .light)
                    .foregroundStyle(Theme.ink2)
                    .frame(width: 32, height: 32)
                    .background(Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            .buttonStyle(PressStyle())
            .disabled(cloudBusy)

            EditorialTactileButton(title: "下载展卷", solid: true, compact: true) {
                guard !cloudBusy else { return }
                Task {
                    cloudBusy = true; cloudError = nil
                    if let err = await model.openCloudSave(c) {
                        cloudError = err
                        GameFeel.shared.notify(.error)
                    } else {
                        GameFeel.shared.notify(.success)
                        onCloudOpened?()
                    }
                    cloudBusy = false
                }
            }
            .disabled(cloudBusy)
        }
        .padding(.horizontal, 4).padding(.vertical, 12)
    }

    private func subtitle(_ w: ArchivedWorld) -> String {
        var parts = [String]()
        if !w.date.isEmpty { parts.append(w.date) }
        if w.nations > 0 { parts.append("\(w.nations) 国") }
        parts.append(Self.stamp.string(from: w.saved))
        return parts.joined(separator: " · ")
    }

    private func cloudSubtitle(_ c: CloudSaveCard) -> String {
        var parts = [String]()
        if !c.date.isEmpty { parts.append(c.date) }
        if c.nations > 0 { parts.append("\(c.nations) 国") }
        if c.provinces > 0 { parts.append("\(c.provinces) 州") }
        parts.append(Self.stamp.string(from: c.savedDate))
        return parts.joined(separator: " · ")
    }
}
