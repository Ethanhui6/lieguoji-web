import Foundation
import UIKit

/// 性能日志：打开「显示帧率与推演耗时」后，每半秒记一行（时刻、绘制间隔、1% 低帧、推演耗时、发热等级），
/// 最多保留最近两千行，可在菜单里导出成文本，方便在真机上量改前改后的差别。
enum PerfLog {
    private static var lines = [String]()
    private static let start = Date()
    static func record(frameMs: Double, lowFPS: Double, sim: String) {
        let thermal: String
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: thermal = "正常"
        case .fair: thermal = "微热"
        case .serious: thermal = "发热"
        case .critical: thermal = "过热"
        @unknown default: thermal = "未知"
        }
        let t = Date().timeIntervalSince(start)
        lines.append(String(format: "%.1f\t%.2f\t%.0f\t%@\t%@\t%d", t, frameMs, lowFPS, thermal, sim.trimmingCharacters(in: .whitespaces), Energy.level))
        if lines.count > 2000 { lines.removeFirst(lines.count - 2000) }
    }
    static var isEmpty: Bool { lines.isEmpty }
    /// 写成临时文本文件，供分享导出。
    static func export() -> URL? {
        let head = "秒\t绘制间隔ms\t1%低帧fps\t发热\t推演\t节能等级\n"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("列国纪性能日志-\(Int(Date().timeIntervalSince1970)).tsv")
        do { try (head + lines.joined(separator: "\n")).write(to: url, atomically: true, encoding: .utf8); return url } catch { return nil }
    }
}
