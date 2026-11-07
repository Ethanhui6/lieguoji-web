import Foundation

/// How hard the phone may work: the thermal state and Low Power Mode. When the phone runs warm the
/// map draws at fewer frames, the simulation leaves the processor idle for longer between steps and
/// the decorative effects (waves, battle smoke) rest, so it cools instead of heating further.
enum Energy {
    /// 发热时自动降档 (推演与画面); off, the phone's warmth is ignored.
    static var autoCool = true
    /// 推演占用: the share of real time the simulation may keep a core busy when the phone is cool.
    static var load = 0.8
    /// 0 cool, 1 warm (fair), 2 hot (serious or Low Power Mode), 3 critical.
    static var level: Int {
        guard autoCool else { return 0 }
        let p = ProcessInfo.processInfo
        let t: Int
        switch p.thermalState {
        case .nominal: t = 0
        case .fair: t = 1
        case .serious: t = 2
        case .critical: t = 3
        @unknown default: t = 1
        }
        return p.isLowPowerModeEnabled ? max(t, 2) : t
    }
    static var hot: Bool { level >= 2 }
    /// The share of real time the simulation may keep a core busy (the rest it sleeps).
    static var duty: Double { max(0.2, min(1, load) * [1, 0.8, 0.55, 0.4][level]) }
}
