# Wide-coast corner candidate — static proof, not acceptance

Only `runtime/detail-natural-outline.ts` differs from the captured production
outline. The source contour, facing-shore separation, quarter-distance-minus-two
cap computation, two-pass cap propagation, regional plan and total envelope
remain unchanged. No tests, preview or browser have run when this note is written.

## Candidate and its scope

The old cut is preserved exactly for a corner unless both incident edges are at
least 128 world, the minimum cap of the vertex and its two source neighbors is
at least 32 world and structure is at least 32 world. Call this minimum `cap`.
It conservatively covers both endpoints of either incident source edge. On a qualifying corner:

`cut = max(oldCut, floor(min(1.5 * structure, 2 * cap, .45 * before, .45 * after)))`

The two incident cuts on an edge consume at most 90% of its length, leaving at
least 10% before Q8 quantization. This avoids overlap/reversal of tangent stations.
At most 240 world can be cut, and the existing 4-world parameter interval still
limits each corner to 61 nodes. Global 16,384-node, 8,000,000-work and intersection
checks still reject rather than degrade an over-budget candidate.

## Bound for a quadratic corner

Place the source vertex at zero, and use unit vectors `u` and `v` pointing toward
the previous and next vertices. Exact equal-length stations are `c*u` and `c*v`.
The quadratic curve is `p(t) = c * ((1-t)^2*u + t^2*v)`.

For `t <= .5`, projection onto the incoming original segment is
`c*((1-t)^2 + t^2*(u dot v))`, between zero and `c`. Its perpendicular distance is
at most `c*t^2`. The symmetric outgoing argument applies for `t >= .5`.
Therefore distance to the two-segment union is at most
`c * min(t^2,(1-t)^2) <= c/4 <= cap/2`.

The implementation does not debit this worst-case bound at every point. It
measures distance to both original finite segments at every generated Q8 sample,
takes the smaller distance, and retains the existing two-Q8-unit rounding guard.
This guard accounts for nearest-point coordinate rounding (less than sqrt(.5))
and integer-square-root flooring (less than one Q8 unit). Rounding the projection
parameter along the line cannot reduce exact perpendicular distance.

## Bound between samples

Distance to a closed union is 1-Lipschitz but is not necessarily convex. For a
polyline chord of length `L` with endpoint distances `d0,d1`, distance at fraction
`s` is bounded by both `d0+s*L` and `d1+(1-s)*L`. Subtract the linearly interpolated
distance `(1-s)*d0+s*d1`; the resulting upper bound is at most `L/2` because
`abs(d1-d0) <= L`.

The wide branch additionally debits half of the larger adjacent chord length
from each sample's cap. Chord length uses integer sqrt plus one, then ceiling
division by two; it never underestimates the physical chord. Both endpoints of
every corner chord therefore carry at least `L/2` reserve. With the measured
two-Q8-unit distance guard this proves, throughout a chord:

`distance to original two-segment union + interpolated remaining cap <= source cap`.

Parameter spacing implies a chord is at most roughly 8 world (not 4 world), so
the additional reserve is at most roughly 4 world. At the minimum qualifying
32-world cap, `cut <= 2*cap` leaves more than enough cap for this reserve. The
existing clamp never needs to hide an envelope overspend in a qualifying branch.

The straight chord between corners lies on the shared source edge, apart from
Q8 station rounding, and its endpoint remaining caps are reduced, not increased.
For two qualifying corners, both endpoints use at most the minimum of the shared
source edge's endpoint caps, hence the entire remaining-cap interpolation does
too. This avoids treating a high vertex cap as authority for its lower-cap neighbor.
At an unchanged legacy neighbor the existing cap behavior is retained; that cap
was already no greater than its incident whole-edge facing cap. New cuts do not
permit exceeding any original facing-shore cap along the cut edges.

## Expected evidence and limitations

Prepared tests compare old/new exact edges and caps for short shores, zero
structure and protected 12-world features; sample all wide-corner chord interiors
for full envelope bounds; retain source immutability, cancellation and area sign;
and compare the actual captured 41-point recipe. The diagnostic writes source,
old outline and candidate outline geometry plus original/candidate PNGs with the
same framing. It is the rounded reference contour only, before regional SDF
perturbation and fine-grid reconstruction. It cannot establish rendered gameplay,
saved-world compatibility or final continent visual quality.

The overall bounded envelope still limits how far a long hand-drawn straight
edge can move. This change expands smooth tangent transitions; it does not claim
to eliminate all straight shore or reproduce a particular game's artwork.
