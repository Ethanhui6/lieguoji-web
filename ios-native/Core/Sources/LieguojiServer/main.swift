import Foundation
import LieguojiCore
#if os(Windows)
import WinSDK
#elseif canImport(Glibc)
import Glibc
#else
import Darwin
#endif

// 列国纪远程计算服务器: the computer runs the simulation, the phone only draws. It listens on TCP
// (port 8765 by default, or the first argument), serves one phone at a time and keeps the world while
// the phone reconnects. Requests and replies are EngineWire frames handled by EngineService.

setvbuf(stdout, nil, _IONBF, 0)
let port = UInt16(CommandLine.arguments.dropFirst().first ?? "") ?? 8765
let service = EngineService()

#if os(Windows)
typealias Socket = SOCKET
let invalidSocket = INVALID_SOCKET
func closeSocket(_ s: Socket) { closesocket(s) }
var wsa = WSADATA()
guard WSAStartup(0x0202, &wsa) == 0 else { print("网络初始化失败"); exit(1) }
#else
typealias Socket = Int32
let invalidSocket: Int32 = -1
func closeSocket(_ s: Socket) { close(s) }
signal(SIGPIPE, SIG_IGN)
#endif

func sendAll(_ s: Socket, _ data: Data) -> Bool {
    var sent = 0
    return data.withUnsafeBytes { (buf: UnsafeRawBufferPointer) -> Bool in
        guard let base = buf.baseAddress else { return true }
        while sent < data.count {
            let chunk = min(data.count - sent, 1 << 20)
            #if os(Windows)
            let n = Int(send(s, base.advanced(by: sent).assumingMemoryBound(to: CChar.self), Int32(chunk), 0))
            #elseif canImport(Glibc)
            let n = Glibc.send(s, base.advanced(by: sent), chunk, Int32(MSG_NOSIGNAL))
            #else
            let n = Darwin.send(s, base.advanced(by: sent), chunk, 0)
            #endif
            if n <= 0 { return false }
            sent += n
        }
        return true
    }
}

func receiveExactly(_ s: Socket, _ count: Int) -> Data? {
    if count == 0 { return Data() }
    var out = Data(count: count), got = 0
    let ok = out.withUnsafeMutableBytes { (buf: UnsafeMutableRawBufferPointer) -> Bool in
        guard let base = buf.baseAddress else { return false }
        while got < count {
            let chunk = min(count - got, 1 << 20)
            #if os(Windows)
            let n = Int(recv(s, base.advanced(by: got).assumingMemoryBound(to: CChar.self), Int32(chunk), 0))
            #elseif canImport(Glibc)
            let n = Glibc.recv(s, base.advanced(by: got), chunk, 0)
            #else
            let n = Darwin.recv(s, base.advanced(by: got), chunk, 0)
            #endif
            if n <= 0 { return false }
            got += n
        }
        return true
    }
    return ok ? out : nil
}

func readU32(_ s: Socket) -> Int? { receiveExactly(s, 4).map { EngineWire.readU32($0, at: 0) } }

/// The computer's IPv4 addresses, so the player knows what to type on the phone.
func localAddresses() -> [String] {
    var name = [CChar](repeating: 0, count: 256)
    #if os(Windows)
    guard gethostname(&name, Int32(name.count)) == 0 else { return [] }
    #else
    guard gethostname(&name, name.count) == 0 else { return [] }
    #endif
    var hints = addrinfo(); hints.ai_family = AF_INET
    #if os(Windows)
    hints.ai_socktype = Int32(SOCK_STREAM)
    #elseif canImport(Glibc)
    hints.ai_socktype = Int32(SOCK_STREAM.rawValue)
    #else
    hints.ai_socktype = SOCK_STREAM
    #endif
    var result: UnsafeMutablePointer<addrinfo>?
    guard getaddrinfo(name, nil, &hints, &result) == 0 else { return [] }
    defer { freeaddrinfo(result) }
    var list = [String](), p = result
    while let info = p {
        if let addr = info.pointee.ai_addr {
            var host = [CChar](repeating: 0, count: 64)
            #if os(Windows)
            let len = Int32(info.pointee.ai_addrlen)
            #else
            let len = socklen_t(info.pointee.ai_addrlen)
            #endif
            if getnameinfo(addr, len, &host, 64, nil, 0, Int32(NI_NUMERICHOST)) == 0 {
                let s = String(cString: host); if !list.contains(s) && !s.hasPrefix("127.") { list.append(s) }
            }
        }
        p = info.pointee.ai_next
    }
    return list
}

#if os(Windows)
let listener = socket(AF_INET, Int32(SOCK_STREAM), Int32(IPPROTO_TCP.rawValue))
#elseif canImport(Glibc)
let listener = socket(AF_INET, Int32(SOCK_STREAM.rawValue), 0)
#else
let listener = socket(AF_INET, SOCK_STREAM, 0)
#endif
guard listener != invalidSocket else { print("无法创建监听端口"); exit(1) }
var yes: Int32 = 1
#if os(Windows)
_ = withUnsafePointer(to: &yes) { $0.withMemoryRebound(to: CChar.self, capacity: 4) { setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, $0, 4) } }
#else
setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))
#endif
var address = sockaddr_in()
#if os(Windows)
address.sin_family = ADDRESS_FAMILY(AF_INET)
let addressLength = Int32(MemoryLayout<sockaddr_in>.size)
#else
address.sin_family = sa_family_t(AF_INET)
let addressLength = socklen_t(MemoryLayout<sockaddr_in>.size)
#endif
address.sin_port = port.bigEndian
#if os(Windows)
address.sin_addr.S_un.S_addr = 0
#else
address.sin_addr.s_addr = 0
#endif
let bound = withUnsafePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(listener, $0, addressLength) } }
guard bound == 0 else { print("端口 \(port) 已被占用，可在命令后加其他端口号，例如 LieguojiServer 8766"); exit(1) }
guard listen(listener, 4) == 0 else { print("无法监听端口 \(port)"); exit(1) }

print("列国纪远程计算服务器已启动，端口 \(port)")
let addresses = localAddresses()
if addresses.isEmpty { print("在手机「设置 › 远程计算」里填写这台电脑的局域网 IP（可用 ipconfig 查看）和端口 \(port)") }
else { print("在手机「设置 › 远程计算」里填写：" + addresses.map { "\($0):\(port)" }.joined(separator: "  或  ")) }
print("手机与电脑须在同一局域网；首次运行若弹出防火墙提示，请允许访问。按 Ctrl+C 退出。")

while true {
    let client = accept(listener, nil, nil)
    if client == invalidSocket { continue }
    print("手机已连接")
    var calls = 0, started = Date()
    while let headerLength = readU32(client), headerLength < 16 << 20, let header = receiveExactly(client, headerLength),
          let payloadLength = readU32(client), payloadLength < 1 << 30, let payload = receiveExactly(client, payloadLength) {
        let o = (try? JSONSerialization.jsonObject(with: header)) as? [String: Any] ?? [:]
        let call = o["call"] as? String ?? "", args = o["args"] as? [String: Any] ?? [:]
        let reply = service.handle(call, args, payload: payload.isEmpty ? nil : payload)
        if call == "open" { print(reply.ok ? "世界已载入，开始推演" : "世界载入失败：\(reply.reason)") }
        calls += 1
        if Date().timeIntervalSince(started) > 30 { print("已处理 \(calls) 个请求"); calls = 0; started = Date() }
        if !sendAll(client, EngineWire.reply(reply)) { break }
    }
    closeSocket(client)
    print("手机已断开（世界保留在电脑上，重新连接即可继续）")
}
