import Foundation

/// 国名不闪: when borders change, the names on the map are matched to the ones already showing instead
/// of being rebuilt. A name that is still there keeps its view (so it neither disappears nor fades in
/// again), and one whose box barely moved keeps its place, so daily border changes do not make it tremble.
public enum NameStability {
    public struct Placement: Equatable {
        public var text: String, x: Double, y: Double, em: Double, angle: Double
        public init(text: String, x: Double, y: Double, em: Double, angle: Double) {
            self.text = text; self.x = x; self.y = y; self.em = em; self.angle = angle
        }
    }
    public struct Match: Equatable {
        /// The index of the old name whose view is reused; nil for a name that is new on the map.
        public var reuse: Int?
        /// The old place, size and tilt are kept (the box moved less than the tolerance).
        public var keep: Bool
    }

    /// For each fresh name: which old name it continues. Same text only; the nearest one wins, and an
    /// old name continues at most one fresh name.
    public static func match(old: [Placement], fresh: [Placement]) -> [Match] {
        var byText = [String: [Int]]()
        for (i, o) in old.enumerated() { byText[o.text, default: []].append(i) }
        var used = Set<Int>()
        return fresh.map { f in
            var best: (index: Int, d: Double)?
            for i in byText[f.text] ?? [] where !used.contains(i) {
                let d = hypot(old[i].x - f.x, old[i].y - f.y)
                if best == nil || d < best!.d { best = (i, d) }
            }
            guard let best else { return Match(reuse: nil, keep: false) }
            used.insert(best.index)
            return Match(reuse: best.index, keep: steady(old[best.index], f, distance: best.d))
        }
    }

    /// Half a glyph of drift, 15 % of size and about six degrees are not worth moving a name for.
    static func steady(_ o: Placement, _ f: Placement, distance: Double) -> Bool {
        guard o.em > 0, f.em > 0 else { return false }
        let ratio = f.em / o.em
        return distance <= 0.5 * o.em && ratio > 0.85 && ratio < 1.18 && abs(f.angle - o.angle) < 0.1
    }
}
