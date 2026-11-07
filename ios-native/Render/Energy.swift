import Foundation

/// How hard the phone may work: the thermal state and Low Power Mode. When the phone runs warm the
/// map draws at fewer frames, the simulation leaves the processor idle for longer between steps and
/// the decorative effects (waves, battle smoke) rest, so it cools instead of heating further.
enum Energy {
    /// 0 cool, 1 warm (fair), 2 hot (serious or Low Power Mode), 3 critical.
    static var level: Int {
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
    static var duty: Double { [0.8, 0.65, 0.45, 0.3][level] }
}
