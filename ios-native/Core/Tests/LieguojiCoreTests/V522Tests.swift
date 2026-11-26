import XCTest
@testable import LieguojiCore

final class V522Tests: XCTestCase {
    func testWireCodecLZ4RoundTripAndCompressionRatio() {
        // 构造接近真实大地图 GameState 的重复结构化 JSON，验证 LZ4 压缩比与零比特误差还原
        var armies = [[String: Any]]()
        for i in 0..<240 {
            armies.append([
                "id": "army_\(i)",
                "name": "第\(i % 20 + 1)禁卫军团",
                "nation": i % 18,
                "troops": 3200 + (i * 37) % 1800,
                "unit": i % 3 == 0 ? "Cavalry" : "Infantry",
                "status": i % 5 == 0 ? "fighting" : "idle",
                "travel": i % 2 == 0 ? "moving" : "idle",
                "province": i % 160,
                "supplies": 88,
                "morale": 92,
                "x": Double(120 + (i * 19) % 1400),
                "y": Double(80 + (i * 23) % 900),
                "manual": false,
                "destination": (i + 7) % 160,
                "mission": ""
            ])
        }
        let sampleObj: [String: Any] = [
            "day": 420,
            "date": ["year": 2, "month": 3, "day": 1],
            "owners": (0..<160).map { $0 % 18 },
            "armies": armies
        ]
        guard let raw = try? JSONSerialization.data(withJSONObject: sampleObj) else {
            XCTFail("测试样本 JSON 序列化失败")
            return
        }
        let compressed = WireCodec.compress(raw)
        XCTAssertTrue(WireCodec.isCompressed(compressed), "真实世界状态 JSON 应成功触发 LZ4 压缩")
        let ratio = Double(compressed.count) / Double(raw.count)
        XCTAssertLessThan(ratio, 0.35, "LZ4 压缩后体积比应低于 35%（实际 \(Int(ratio * 100))%）")
        let restored = WireCodec.decompressIfNeeded(compressed)
        XCTAssertEqual(restored, raw, "LZ4 解压还原结果必须与原文逐字节一致")
    }

    func testWireCodecPassthroughAndEdgeCases() {
        let tiny = Data("hello".utf8)
        XCTAssertEqual(WireCodec.compress(tiny), tiny)
        XCTAssertEqual(WireCodec.decompressIfNeeded(tiny), tiny)

        let repeated = Data(repeating: 0x41, count: 65_536)
        let cRep = WireCodec.compress(repeated)
        XCTAssertLessThan(cRep.count, 512, "高重复块应被极高倍率压缩")
        XCTAssertEqual(WireCodec.decompressIfNeeded(cRep), repeated)

        // 损坏魔数包安全返回空 Data，绝不崩溃越界
        let corrupted = Data([0x4C, 0x5A, 0x34, 0x21, 0x00, 0x00, 0x01, 0x00, 0xFF, 0xFF])
        XCTAssertTrue(WireCodec.decompressIfNeeded(corrupted).isEmpty)
    }

    func testEngineWireV6MuxAndCompressedReply() {
        let bigBody = Data(String(repeating: "{\"day\":1,\"status\":\"moving\"},", count: 80).utf8)
        let reply = EngineService.Reply(ok: true, reason: "ok", data: bigBody)
        let rawWire = EngineWire.reply(reply, compress: false)
        let compWire = EngineWire.reply(reply, compress: true)
        XCTAssertLessThan(compWire.count, rawWire.count / 3, "EngineWire v6 压缩回包体积应缩小 3 倍以上")

        let hLen = EngineWire.readU32(compWire, at: 0)
        let header = compWire.subdata(in: 4..<4 + hLen)
        let dLen = EngineWire.readU32(compWire, at: 4 + hLen)
        let body = compWire.subdata(in: 8 + hLen..<8 + hLen + dLen)
        let mLen = EngineWire.readU32(compWire, at: 8 + hLen + dLen)
        let map = compWire.subdata(in: 12 + hLen + dLen..<12 + hLen + dLen + mLen)
        let decoded = EngineService.Reply.decode(header: header, data: body, map: map)
        XCTAssertTrue(decoded.ok)
        XCTAssertEqual(decoded.data, bigBody)

        let mux = EngineWire.muxFrame(type: EngineWire.muxPush, id: 0x0500_002A, body: Data([1, 2, 3]))
        XCTAssertEqual(mux.count, 12)
        XCTAssertEqual(mux[0], EngineWire.muxPush)
        XCTAssertEqual(UInt32(EngineWire.readU32(mux, at: 1)), 0x0500_002A)
        XCTAssertEqual(EngineWire.readU32(mux, at: 5), 3)

        let svc = EngineService()
        let muxReply = svc.handle("enableMux", [:])
        XCTAssertTrue(muxReply.ok)
        XCTAssertTrue(muxReply.reason.hasPrefix("mux-v"))
    }
}
