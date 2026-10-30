import Foundation

/// Isolated versioned persistence. Never reads or overwrites web/Capacitor saves.
public actor NativeSaveStore {
    public enum Failure: Error { case unsupportedVersion, invalidName }
    private struct Envelope<Value: Codable>: Codable {
        let schemaVersion: Int
        let rulesVersion: String
        let state: Value
    }
    private let directory: URL
    private let rulesVersion: String
    public init(directory: URL, rulesVersion: String) {
        self.directory = directory; self.rulesVersion = rulesVersion
    }
    private func url(_ id: UUID) -> URL { directory.appendingPathComponent(id.uuidString + ".json") }
    public func save<Value: Codable & Sendable>(_ state: Value, id: UUID) throws {
        let data = try JSONEncoder().encode(Envelope(schemaVersion: 1,rulesVersion: rulesVersion,state: state))
        try FileManager.default.createDirectory(at: directory,withIntermediateDirectories: true)
        let destination = url(id)
        if FileManager.default.fileExists(atPath: destination.path) {
            let old = try Data(contentsOf: destination)
            try old.write(to: destination.appendingPathExtension("backup"),options: .atomic)
        }
        try data.write(to: destination,options: .atomic)
    }
    public func load<Value: Codable & Sendable>(_ type: Value.Type, id: UUID) throws -> Value {
        let data = try Data(contentsOf: url(id))
        let envelope = try JSONDecoder().decode(Envelope<Value>.self,from: data)
        guard envelope.schemaVersion == 1, envelope.rulesVersion == rulesVersion else { throw Failure.unsupportedVersion }
        return envelope.state
    }
}
