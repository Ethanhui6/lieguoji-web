import Foundation
import SwiftUI
import UIKit
import Darwin

/// 轻量零帧开销真机诊断面包屑：
/// - 仅在世界生命周期节点（启动/建世/解码/挂载/展卷/入局/存盘/读档）记录 1 行短文本，绝不每帧写入、0 发热开销；
/// - 注册 `NSSetUncaughtExceptionHandler` 留存未捕获异常原因，在「设置 → 诊断」一键查看与复制，彻底告别真机黑盒排错。
enum CrashBreadcrumb {
    private static let stageKey = "lgj.diag.lastStage.v1"
    private static let trailKey = "lgj.diag.lastTrail.v1"
    private static let excKey = "lgj.diag.lastException.v1"
    private static let lock = NSLock()
    private static var installed = false
    private static var currentTrail: [String] = []
    private(set) static var previousStage: String = ""
    private(set) static var previousTrail: String = ""
    private(set) static var previousException: String = ""

    static func install() {
        lock.lock()
        defer { lock.unlock() }
        guard !installed else { return }
        installed = true
        let d = UserDefaults.standard
        previousStage = d.string(forKey: stageKey) ?? ""
        previousTrail = d.string(forKey: trailKey) ?? ""
        previousException = d.string(forKey: excKey) ?? ""
        d.removeObject(forKey: excKey)
        NSSetUncaughtExceptionHandler { ex in
            let info = "\(ex.name.rawValue): \(ex.reason ?? "unknown")"
            UserDefaults.standard.set(info, forKey: "lgj.diag.lastException.v1")
        }
        recordLocked("boot")
    }

    static func mark(_ stage: String) {
        lock.lock()
        defer { lock.unlock() }
        recordLocked(stage)
    }

    private static func recordLocked(_ stage: String) {
        currentTrail.append(stage)
        if currentTrail.count > 14 { currentTrail.removeFirst(currentTrail.count - 14) }
        let joined = currentTrail.joined(separator: " → ")
        let d = UserDefaults.standard
        d.set(stage, forKey: stageKey)
        d.set(joined, forKey: trailKey)
    }

    static var currentMemoryMB: Int {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size) / 4
        let kr = withUnsafeMutablePointer(to: &info) { ptr in
            ptr.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }
        guard kr == KERN_SUCCESS else { return 0 }
        return Int(info.phys_footprint / (1024 * 1024))
    }

    static var totalMemoryMB: Int {
        Int(ProcessInfo.processInfo.physicalMemory / (1024 * 1024))
    }

    static func summary(version: String) -> String {
        lock.lock()
        let cur = currentTrail.joined(separator: " → ")
        lock.unlock()
        let thermal: String = {
            switch ProcessInfo.processInfo.thermalState {
            case .nominal: return "正常"
            case .fair: return "微温"
            case .serious: return "偏热"
            case .critical: return "过热"
            @unknown default: return "未知"
            }
        }()
        var lines = [
            "版本：\(version)",
            "当前内存：\(currentMemoryMB) MB / 机身 \(totalMemoryMB) MB · 温控：\(thermal)",
            "本次轨迹：\(cur.isEmpty ? "无" : cur)"
        ]
        if !previousStage.isEmpty {
            lines.append("上次末态：\(previousStage)")
        }
        if !previousTrail.isEmpty {
            lines.append("上次轨迹：\(previousTrail)")
        }
        if !previousException.isEmpty {
            lines.append("上次异常：\(previousException)")
        }
        return lines.joined(separator: "\n")
    }
}

/// 设置页轻量诊断折叠卡（默认收起，零常驻开销；展开时展示实时内存、温控与上次运行轨迹并支持一键复制）。
struct DiagnosticsSettingsRow: View {
    @State private var expanded = false
    @State private var copied = false

    var body: some View {
        DisclosureGroup("运行诊断与内存", isExpanded: $expanded) {
            VStack(alignment: .leading, spacing: 8) {
                Text(CrashBreadcrumb.summary(version: AppVersion.text))
                    .font(Theme.caption)
                    .monospacedDigit()
                    .foregroundStyle(Theme.ink2)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    UIPasteboard.general.string = CrashBreadcrumb.summary(version: AppVersion.text)
                    copied = true
                    GameFeel.shared.tap()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { copied = false }
                } label: {
                    Text(copied ? "已复制诊断摘要" : "复制诊断摘要")
                        .font(Theme.label)
                        .foregroundStyle(Theme.seal)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Theme.seal.opacity(0.09), in: Capsule())
                }
                .buttonStyle(PressStyle())
            }
            .padding(.top, 8)
        }
        .font(Theme.section).tint(Theme.seal)
        .padding(.horizontal, 16).padding(.vertical, 12)
    }
}
