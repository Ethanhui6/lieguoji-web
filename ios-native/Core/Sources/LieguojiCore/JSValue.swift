import Foundation

/// A JavaScript value with JavaScript object semantics, for the rule modules ported line by line from
/// the web engine's run state: objects and arrays are shared references (an alias mutated through one
/// name is mutated everywhere, as in TypeScript), and object keys iterate in JavaScript order — array
/// index keys ascending first, then the other keys in insertion order. Numbers are doubles.
@dynamicMemberLookup
public final class JS: CustomStringConvertible {
    public enum Value { case null, bool(Bool), number(Double), string(String), array([JS]), object(Object) }
    public struct Object {
        public private(set) var keys: [String] = []
        var values: [String: JS] = [:]
        /// Canonical array index ("0", "17"; not "01" or "-1"), which JavaScript enumerates first, ascending.
        static func index(_ k: String) -> UInt32? {
            guard let first = k.utf8.first, k.utf8.count <= 10, first != 45, first != 43, k == "0" || first != 48, let v = UInt32(k), v != UInt32.max else { return nil }
            return v
        }
        public subscript(key: String) -> JS? {
            get { values[key] }
            set {
                guard let newValue else { if values.removeValue(forKey: key) != nil { keys.removeAll { $0 == key } }; return }
                if values.updateValue(newValue, forKey: key) == nil {
                    if let i = Object.index(key) {
                        let at = keys.firstIndex { k in guard let j = Object.index(k) else { return true }; return j > i } ?? keys.count
                        keys.insert(key, at: at)
                    } else { keys.append(key) }
                }
            }
        }
        public var entries: [(String, JS)] { keys.map { ($0, values[$0]!) } }
    }
    public var storage: Value
    public init(_ value: Value) { self.storage = value }
    public static var null: JS { JS(.null) }
    public static func object() -> JS { JS(.object(Object())) }
    public static func array(_ items: [JS] = []) -> JS { JS(.array(items)) }
    public convenience init(_ n: Double) { self.init(.number(n)) }
    public convenience init(_ n: Int) { self.init(.number(Double(n))) }
    public convenience init(_ s: String) { self.init(.string(s)) }
    public convenience init(_ b: Bool) { self.init(.bool(b)) }

    // MARK: Reading (names chosen not to collide with fields of the game data)
    public var isNull: Bool { if case .null = storage { return true }; return false }
    public var asNumber: Double { if case .number(let n) = storage { return n }; fatalError("not a number: \(self)") }
    public var asInt: Int { Int(asNumber) }
    public var asString: String { if case .string(let s) = storage { return s }; fatalError("not a string: \(self)") }
    public var asBool: Bool { if case .bool(let b) = storage { return b }; fatalError("not a bool: \(self)") }
    public var optionalNumber: Double? { if case .number(let n) = storage { return n }; return nil }
    public var optionalString: String? { if case .string(let s) = storage { return s }; return nil }
    /// JavaScript truthiness.
    public var isTruthy: Bool {
        switch storage {
        case .null: return false
        case .bool(let b): return b
        case .number(let n): return n != 0 && !n.isNaN
        case .string(let s): return !s.isEmpty
        default: return true
        }
    }
    public var asArray: [JS] {
        get { if case .array(let a) = storage { return a }; fatalError("not an array: \(self)") }
        set { storage = .array(newValue) }
    }
    public var length: Int { asArray.count }
    public var objectKeys: [String] { if case .object(let o) = storage { return o.keys }; fatalError("not an object: \(self)") }
    /// Object.entries order.
    public var objectEntries: [(String, JS)] { if case .object(let o) = storage { return o.entries }; fatalError("not an object: \(self)") }
    public var objectValues: [JS] { objectEntries.map(\.1) }
    public func has(_ key: String) -> Bool { if case .object(let o) = storage { return o[key] != nil }; return false }

    // MARK: Members
    /// Missing members read as a fresh null (JavaScript undefined) that is not attached.
    public subscript(key: String) -> JS {
        get { if case .object(let o) = storage, let v = o[key] { return v }; return .null }
        set { guard case .object(var o) = storage else { fatalError("set \(key) on \(self)") }; storage = .null; o[key] = newValue; storage = .object(o) }
    }
    public subscript(dynamicMember key: String) -> JS {
        get { self[key] }
        set { self[key] = newValue }
    }
    public subscript(index: Int) -> JS {
        get { asArray[index] }
        set { var a = asArray; a[index] = newValue; asArray = a }
    }
    public func delete(_ key: String) { guard case .object(var o) = storage else { return }; storage = .null; o[key] = nil; storage = .object(o) }
    public func push(_ v: JS) { guard case .array(var a) = storage else { fatalError("push on \(self)") }; storage = .null; a.append(v); storage = .array(a) }

    // MARK: Copies and comparison
    /// structuredClone.
    public func clone() -> JS {
        switch storage {
        case .array(let a): return JS(.array(a.map { $0.clone() }))
        case .object(let o): var c = Object(); for (k, v) in o.entries { c[k] = v.clone() }; return JS(.object(c))
        default: return JS(storage)
        }
    }
    /// Deep equality with exact numbers and key order ignored; returns the first differing path.
    public func difference(_ other: JS, path: String = "$") -> String? {
        switch (storage, other.storage) {
        case (.null, .null): return nil
        case (.bool(let a), .bool(let b)): return a == b ? nil : "\(path): \(a) ≠ \(b)"
        case (.number(let a), .number(let b)): return a == b || (a.isNaN && b.isNaN) ? nil : "\(path): \(a) ≠ \(b)"
        case (.string(let a), .string(let b)): return a == b ? nil : "\(path): \(a) ≠ \(b)"
        case (.array(let a), .array(let b)):
            if a.count != b.count { return "\(path): length \(a.count) ≠ \(b.count)" }
            for i in a.indices { if let d = a[i].difference(b[i], path: "\(path)[\(i)]") { return d } }
            return nil
        case (.object(let a), .object(let b)):
            for k in a.keys where b[k] == nil { if !a[k]!.isNull { return "\(path).\(k): only on the left" } }
            for k in b.keys where a[k] == nil { if !b[k]!.isNull { return "\(path).\(k): only on the right" } }
            for k in a.keys { if let w = b[k], let d = a[k]!.difference(w, path: "\(path).\(k)") { return d } }
            return nil
        default: return "\(path): \(self) ≠ \(other)"
        }
    }
    public var description: String {
        switch storage {
        case .null: return "null"
        case .bool(let b): return "\(b)"
        case .number(let n): return n == n.rounded() && abs(n) < 1e15 ? String(Int(n)) : "\(n)"
        case .string(let s): return "\"\(s)\""
        case .array(let a): return "[" + a.map(\.description).joined(separator: ",") + "]"
        case .object(let o): return "{" + o.entries.map { "\"\($0.0)\":\($0.1)" }.joined(separator: ",") + "}"
        }
    }

    // MARK: Parsing
    public static func parse(_ data: Data) throws -> JS {
        var p = Parser(bytes: [UInt8](data))
        let v = try p.value()
        return v
    }
    struct ParseError: Error { let at: Int }
    struct Parser {
        let bytes: [UInt8]; var i = 0
        init(bytes: [UInt8]) { self.bytes = bytes }
        mutating func skip() { while i < bytes.count, bytes[i] == 32 || bytes[i] == 10 || bytes[i] == 13 || bytes[i] == 9 { i += 1 } }
        mutating func value() throws -> JS {
            skip()
            guard i < bytes.count else { throw ParseError(at: i) }
            switch bytes[i] {
            case 123:
                i += 1; var o = Object(); skip()
                if bytes[i] == 125 { i += 1; return JS(.object(o)) }
                while true {
                    skip(); let k = try string(); skip(); guard bytes[i] == 58 else { throw ParseError(at: i) }; i += 1
                    o[k] = try value(); skip()
                    if bytes[i] == 44 { i += 1; continue }
                    guard bytes[i] == 125 else { throw ParseError(at: i) }; i += 1; return JS(.object(o))
                }
            case 91:
                i += 1; var a = [JS](); skip()
                if bytes[i] == 93 { i += 1; return JS(.array(a)) }
                while true {
                    a.append(try value()); skip()
                    if bytes[i] == 44 { i += 1; continue }
                    guard bytes[i] == 93 else { throw ParseError(at: i) }; i += 1; return JS(.array(a))
                }
            case 34: return JS(.string(try string()))
            case 116: i += 4; return JS(.bool(true))
            case 102: i += 5; return JS(.bool(false))
            case 110: i += 4; return JS(.null)
            default:
                let start = i
                while i < bytes.count, (bytes[i] >= 48 && bytes[i] <= 57) || bytes[i] == 45 || bytes[i] == 43 || bytes[i] == 46 || bytes[i] == 101 || bytes[i] == 69 { i += 1 }
                guard let n = Double(String(decoding: bytes[start..<i], as: UTF8.self)) else { throw ParseError(at: start) }
                return JS(.number(n))
            }
        }
        mutating func string() throws -> String {
            guard bytes[i] == 34 else { throw ParseError(at: i) }
            i += 1; var out = [UInt8](), start = i
            while bytes[i] != 34 {
                if bytes[i] == 92 {
                    out.append(contentsOf: bytes[start..<i]); i += 1
                    switch bytes[i] {
                    case 110: out.append(10); case 116: out.append(9); case 114: out.append(13); case 98: out.append(8); case 102: out.append(12)
                    case 117:
                        var code = UInt32(String(decoding: bytes[(i + 1)...(i + 4)], as: UTF8.self), radix: 16)!; i += 4
                        if code >= 0xD800 && code < 0xDC00, bytes[i + 1] == 92, bytes[i + 2] == 117, let low = UInt32(String(decoding: bytes[(i + 3)...(i + 6)], as: UTF8.self), radix: 16) {
                            code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00); i += 6
                        }
                        out.append(contentsOf: Array(String(Character(Unicode.Scalar(code) ?? "\u{FFFD}")).utf8))
                    default: out.append(bytes[i])
                    }
                    i += 1; start = i
                } else { i += 1 }
            }
            out.append(contentsOf: bytes[start..<i]); i += 1
            return String(decoding: out, as: UTF8.self)
        }
    }
}

/// JavaScript helpers the ported rules use.
public enum JSMath {
    /// Math.imul then `>>> 0` LCG step used by every persisted web random stream.
    public static func lcg(_ state: Double) -> Double { Double(UInt32(truncatingIfNeeded: Int64(state)) &* 1664525 &+ 1013904223) }
    static func f(_ x: Double) -> Double { Native.fr(x) }
}
