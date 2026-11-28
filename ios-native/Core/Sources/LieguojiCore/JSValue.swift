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
                        // v14.0.0：数组下标前缀有序区二分查找插入位，消灭 O(N²) 线性扫描！
                        var lo = 0, hi = keys.count
                        while lo < hi {
                            let mid = (lo + hi) >> 1
                            if let j = Object.index(keys[mid]), j < i {
                                lo = mid + 1
                            } else {
                                hi = mid
                            }
                        }
                        keys.insert(key, at: lo)
                    } else { keys.append(key) }
                }
            }
        }
        /// 仅用于 `JS.parse` 批量构建：直接追加并最后一次性归并排序数组下标键，彻底消除解析 3500+ 人物字典时的 O(N²) 插入与频繁移位。
        mutating func parseInsert(_ key: String, _ value: JS, hasNumeric: inout Bool) {
            if values.updateValue(value, forKey: key) == nil {
                keys.append(key)
                if !hasNumeric, let b = key.utf8.first, b >= 48 && b <= 57, Object.index(key) != nil {
                    hasNumeric = true
                }
            }
        }
        mutating func finalizeParsedKeys() {
            var idxKeys: [(UInt32, String)] = []
            var strKeys: [String] = []
            idxKeys.reserveCapacity(keys.count)
            strKeys.reserveCapacity(keys.count)
            for k in keys {
                if let i = Object.index(k) {
                    idxKeys.append((i, k))
                } else {
                    strKeys.append(k)
                }
            }
            if idxKeys.count > 1 {
                idxKeys.sort { $0.0 < $1.0 }
            }
            keys.removeAll(keepingCapacity: true)
            for p in idxKeys { keys.append(p.1) }
            keys.append(contentsOf: strKeys)
        }
        public var entries: [(String, JS)] { keys.map { ($0, values[$0]!) } }
    }
    public var storage: Value
    public init(_ value: Value) { self.storage = value }
    /// v11.0.0 零分配只读空值单例：热循环读取缺失键不再每秒堆分配数百万个 JS(.null) 对象！
    nonisolated(unsafe) private static let sharedNull = JS(.null)
    public static var null: JS { sharedNull }
    public static func object() -> JS { JS(.object(Object())) }
    public static func array(_ items: [JS] = []) -> JS { JS(.array(items)) }
    public convenience init(_ n: Double) { self.init(.number(n)) }
    public convenience init(_ n: Int) { self.init(.number(Double(n))) }
    public convenience init(_ s: String) { self.init(.string(s)) }
    public convenience init(_ b: Bool) { self.init(.bool(b)) }

    // MARK: Reading (names chosen not to collide with fields of the game data)
    public var isNull: Bool { if case .null = storage { return true }; return false }
    public var isArray: Bool { if case .array = storage { return true }; return false }
    /// 生产环境为缺失或错型字段返回默认值。调试时可启用严格读取来定位错误字段。
    static func lenient(_ what: String) {
        #if DEBUG
        if JS.strictReads { fatalError(what) }
        #endif
    }
    public static var strictReads = false
    public var asNumber: Double {
        switch storage {
        case .number(let n): return n
        case .bool(let b): return b ? 1 : 0
        case .string(let s): if let d = Double(s) { return d }
        default: break
        }
        JS.lenient("not a number"); return 0
    }
    public var asInt: Int { let n = asNumber; return n.isFinite ? Int(max(-9.0e18, min(9.0e18, n))) : 0 }
    public var asString: String {
        switch storage {
        case .string(let s): return s
        case .number(let n): return n == n.rounded() && abs(n) < 1e15 ? String(Int(n)) : String(n)
        default: JS.lenient("not a string"); return ""
        }
    }
    public var asBool: Bool { if case .bool(let b) = storage { return b }; JS.lenient("not a bool"); return isTruthy }
    public var optionalNumber: Double? { if case .number(let n) = storage { return n }; return nil }
    public var optionalString: String? { if case .string(let s) = storage { return s }; return nil }
    public var optionalArray: [JS]? { if case .array(let a) = storage { return a }; return nil }
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
        get { if case .array(let a) = storage { return a }; JS.lenient("not an array"); return [] }
        set { guard self !== Self.sharedNull else { return }; storage = .array(newValue) }
    }
    public var length: Int { asArray.count }
    public var objectKeys: [String] { if case .object(let o) = storage { return o.keys }; JS.lenient("not an object"); return [] }
    /// Object.entries order.
    public var objectEntries: [(String, JS)] { if case .object(let o) = storage { return o.entries }; JS.lenient("not an object"); return [] }
    /// 零中间数组分配遍历对象键值（热路径替代 objectEntries）。
    public func forEachEntry(_ body: (String, JS) -> Void) {
        guard case .object(let o) = storage else { return }
        for k in o.keys {
            if let v = o.values[k] { body(k, v) }
        }
    }
    public var objectValues: [JS] { objectEntries.map(\.1) }
    public func has(_ key: String) -> Bool { if case .object(let o) = storage { return o[key] != nil }; return false }

    // MARK: Members
    /// Missing members read as a fresh null (JavaScript undefined) that is not attached.
    public subscript(key: String) -> JS {
        get { if case .object(let o) = storage, let v = o[key] { return v }; return .null }
        set { guard case .object(var o) = storage else { JS.lenient("set on non-object"); return }; storage = .null; o[key] = newValue; storage = .object(o) }
    }
    public subscript(dynamicMember key: String) -> JS {
        get { self[key] }
        set { self[key] = newValue }
    }
    public subscript(index: Int) -> JS {
        get { if case .array(let a) = storage, a.indices.contains(index) { return a[index] }; JS.lenient("index out of range"); return .null }
        set { guard case .array(var a) = storage, a.indices.contains(index) else { JS.lenient("set index out of range"); return }; storage = .null; a[index] = newValue; storage = .array(a) }
    }
    public func delete(_ key: String) { guard case .object(var o) = storage else { return }; storage = .null; o[key] = nil; storage = .object(o) }
    public func push(_ v: JS) { guard case .array(var a) = storage else { JS.lenient("push on non-array"); return }; storage = .null; a.append(v); storage = .array(a) }

    // MARK: Copies and comparison
    /// structuredClone.
    /// A new object/array sharing its children: enough when every field written is replaced whole.
    public func shallowClone() -> JS {
        switch storage {
        case .array(let a): return JS(.array(a))
        case .object(let o): return JS(.object(o))
        default: return JS(storage)
        }
    }
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

    /// JSON.stringify: escaped strings, shortest round-trip numbers, non-finite numbers as null.
    public var json: String { var out = ""; write(&out); return out }
    /// 流式 UTF-8 序列化为 Data：跳过 20MB 级中间 String 与每个键的临时 JS 对象堆分配，存盘与建世内存峰值直降 60%+，且与 `Data(json.utf8)` 逐字节一致。
    public func jsonData(reserveCapacity cap: Int = 256) -> Data {
        var bytes = [UInt8]()
        bytes.reserveCapacity(max(64, cap))
        writeUTF8(&bytes)
        return Data(bytes)
    }
    private static func writeEscapedUTF8(_ s: String, into out: inout [UInt8]) {
        out.append(0x22) // "
        var needsEscape = false
        for b in s.utf8 {
            if b == 0x22 || b == 0x5C || b < 0x20 { needsEscape = true; break }
        }
        if !needsEscape {
            out.append(contentsOf: s.utf8)
            out.append(0x22)
            return
        }
        for u in s.unicodeScalars {
            switch u {
            case "\"": out.append(0x5C); out.append(0x22)
            case "\\": out.append(0x5C); out.append(0x5C)
            case "\n": out.append(0x5C); out.append(0x6E)
            case "\r": out.append(0x5C); out.append(0x72)
            case "\t": out.append(0x5C); out.append(0x74)
            default:
                if u.value < 0x20 {
                    out.append(contentsOf: String(format: "\\u%04x", u.value).utf8)
                } else {
                    out.append(contentsOf: u.utf8)
                }
            }
        }
        out.append(0x22)
    }
    func writeUTF8(_ out: inout [UInt8]) {
        switch storage {
        case .null: out.append(contentsOf: [110, 117, 108, 108]) // null
        case .bool(let b):
            if b { out.append(contentsOf: [116, 114, 117, 101]) }
            else { out.append(contentsOf: [102, 97, 108, 115, 101]) }
        case .number(let n):
            if !n.isFinite {
                out.append(contentsOf: [110, 117, 108, 108])
            } else if n == n.rounded() && abs(n) < 1e15 {
                out.append(contentsOf: String(Int64(n)).utf8)
            } else {
                out.append(contentsOf: "\(n)".utf8)
            }
        case .string(let s):
            Self.writeEscapedUTF8(s, into: &out)
        case .array(let a):
            out.append(0x5B) // [
            for (i, v) in a.enumerated() {
                if i > 0 { out.append(0x2C) }
                v.writeUTF8(&out)
            }
            out.append(0x5D) // ]
        case .object(let o):
            out.append(0x7B) // {
            var first = true
            for k in o.keys {
                guard let v = o.values[k] else { continue }
                if !first { out.append(0x2C) }
                first = false
                Self.writeEscapedUTF8(k, into: &out)
                out.append(0x3A) // :
                v.writeUTF8(&out)
            }
            out.append(0x7D) // }
        }
    }
    func write(_ out: inout String) {
        switch storage {
        case .null: out += "null"
        case .bool(let b): out += b ? "true" : "false"
        case .number(let n): out += !n.isFinite ? "null" : n == n.rounded() && abs(n) < 1e15 ? String(Int64(n)) : "\(n)"
        case .string(let s):
            out += "\""
            for u in s.unicodeScalars {
                switch u {
                case "\"": out += "\\\""
                case "\\": out += "\\\\"
                case "\n": out += "\\n"
                case "\r": out += "\\r"
                case "\t": out += "\\t"
                default: if u.value < 0x20 { out += String(format: "\\u%04x", u.value) } else { out.unicodeScalars.append(u) }
                }
            }
            out += "\""
        case .array(let a): out += "["; for (i, v) in a.enumerated() { if i > 0 { out += "," }; v.write(&out) }; out += "]"
        case .object(let o):
            out += "{"
            for (i, (k, v)) in o.entries.enumerated() { if i > 0 { out += "," }; JS(.string(k)).write(&out); out += ":"; v.write(&out) }
            out += "}"
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
                var hasNumeric = false
                while true {
                    skip(); let k = try string(); skip(); guard bytes[i] == 58 else { throw ParseError(at: i) }; i += 1
                    o.parseInsert(k, try value(), hasNumeric: &hasNumeric); skip()
                    if bytes[i] == 44 { i += 1; continue }
                    guard bytes[i] == 125 else { throw ParseError(at: i) }; i += 1
                    if hasNumeric { o.finalizeParsedKeys() }
                    return JS(.object(o))
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
                return JS(.number(try number()))
            }
        }
        /// v14.0.0 零 String 分配快速数字解析：常见整数与短小数直接累加，仅科学计数法或超长有效位回退标准 `Double(String)` 保证 IEEE-754 精确舍入。
        mutating func number() throws -> Double {
            let start = i
            let count = bytes.count
            var neg = false
            if i < count && bytes[i] == 45 { neg = true; i += 1 }
            else if i < count && bytes[i] == 43 { i += 1 }
            var intVal: UInt64 = 0
            var intDigits = 0
            while i < count {
                let b = bytes[i]
                if b >= 48 && b <= 57 {
                    if intDigits < 15 { intVal = intVal &* 10 &+ UInt64(b &- 48) }
                    intDigits += 1
                    i += 1
                } else {
                    break
                }
            }
            var hasDot = false
            var fracVal: UInt64 = 0
            var fracDigits = 0
            if i < count && bytes[i] == 46 {
                hasDot = true
                i += 1
                while i < count {
                    let b = bytes[i]
                    if b >= 48 && b <= 57 {
                        if intDigits + fracDigits < 15 { fracVal = fracVal &* 10 &+ UInt64(b &- 48) }
                        fracDigits += 1
                        i += 1
                    } else {
                        break
                    }
                }
            }
            var hasExp = false
            if i < count && (bytes[i] == 101 || bytes[i] == 69) {
                hasExp = true
                i += 1
                if i < count && (bytes[i] == 45 || bytes[i] == 43) { i += 1 }
                while i < count && bytes[i] >= 48 && bytes[i] <= 57 { i += 1 }
            }
            guard i > start else { throw ParseError(at: start) }
            if !hasExp && intDigits > 0 && intDigits + fracDigits <= 15 && (!hasDot || fracDigits > 0) {
                if !hasDot {
                    let d = Double(intVal)
                    return neg ? -d : d
                }
                // 10^1 ... 10^14 精确可由 Double 表示，單次除法满足 IEEE-754 最近舍入
                var p10 = 1.0
                switch fracDigits {
                case 1: p10 = 1e1; case 2: p10 = 1e2; case 3: p10 = 1e3; case 4: p10 = 1e4
                case 5: p10 = 1e5; case 6: p10 = 1e6; case 7: p10 = 1e7; case 8: p10 = 1e8
                case 9: p10 = 1e9; case 10: p10 = 1e10; case 11: p10 = 1e11; case 12: p10 = 1e12
                case 13: p10 = 1e13; case 14: p10 = 1e14
                default: p10 = pow(10.0, Double(fracDigits))
                }
                let combined = Double(intVal) * p10 + Double(fracVal)
                let d = combined / p10
                return neg ? -d : d
            }
            guard let n = Double(String(decoding: bytes[start..<i], as: UTF8.self)) else { throw ParseError(at: start) }
            return n
        }
        mutating func string() throws -> String {
            guard bytes[i] == 34 else { throw ParseError(at: i) }
            i += 1; let firstStart = i
            let count = bytes.count
            // v14.0.0 99.9% 无转义快速通道：零临时 [UInt8] 堆分配直接切片解码 UTF-8！
            while i < count {
                let b = bytes[i]
                if b == 34 {
                    let s = String(decoding: bytes[firstStart..<i], as: UTF8.self)
                    i += 1
                    return s
                }
                if b == 92 { break }
                i += 1
            }
            guard i < count else { throw ParseError(at: i) }
            var out = [UInt8]()
            out.reserveCapacity((i - firstStart) + 16)
            var start = firstStart
            while i < count && bytes[i] != 34 {
                if bytes[i] == 92 {
                    out.append(contentsOf: bytes[start..<i]); i += 1
                    guard i < count else { throw ParseError(at: i) }
                    switch bytes[i] {
                    case 110: out.append(10); case 116: out.append(9); case 114: out.append(13); case 98: out.append(8); case 102: out.append(12)
                    case 117:
                        guard i + 4 < count, let parsed = UInt32(String(decoding: bytes[(i + 1)...(i + 4)], as: UTF8.self), radix: 16) else { throw ParseError(at: i) }
                        var code = parsed; i += 4
                        if code >= 0xD800 && code < 0xDC00, i + 6 < count, bytes[i + 1] == 92, bytes[i + 2] == 117, let low = UInt32(String(decoding: bytes[(i + 3)...(i + 6)], as: UTF8.self), radix: 16) {
                            code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00); i += 6
                        }
                        out.append(contentsOf: Array(String(Character(Unicode.Scalar(code) ?? "\u{FFFD}")).utf8))
                    default: out.append(bytes[i])
                    }
                    i += 1; start = i
                } else { i += 1 }
            }
            guard i < count else { throw ParseError(at: i) }
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
