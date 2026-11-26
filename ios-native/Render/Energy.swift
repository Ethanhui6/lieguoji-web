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
    static var duty: Double {
        let safeLoad = load.isFinite ? load : 0.8
        let idx = max(0, min(3, level))
        let scales = [1.0, 0.8, 0.55, 0.4]
        return max(0.2, min(1.0, safeLoad) * scales[idx])
    }
    /// Interactive map pan/pinch/fling frame-rate floor by thermal state:
    /// - `.nominal` (0): 60–120fps (honours user setting)
    /// - `.fair` (1): 60fps (never drops to 30fps on `.fair`)
    /// - `.serious` (2): 60fps during active user gesture, 45fps idle
    /// - `.critical` (3): 45fps during active user gesture, 30fps idle
    static func mapFPS(preferred: Int, interactive: Bool) -> Int {
        let base = max(30, min(120, preferred))
        switch level {
        case 0: return base
        case 1: return min(base, 60)
        case 2: return min(base, interactive ? 60 : 45)
        default: return min(base, interactive ? 45 : 30)
        }
    }
    /// Marching / background animation display-link cadence by thermal state (never drops to 30fps on `.fair`).
    static func glideFPS(preferred: Int) -> Int {
        let base = max(15, min(120, preferred))
        switch level {
        case 0: return base
        case 1: return min(base, 60)
        case 2: return min(base, 45)
        default: return min(base, 30)
        }
    }
    /// Decorative CoreAnimation effect cadence by thermal state.
    static func effectFPS(preferred: Int) -> Int {
        let base = max(15, min(60, preferred))
        switch level {
        case 0: return base
        case 1: return min(base, 45)
        case 2: return min(base, 30)
        default: return min(base, 15)
        }
    }
}
