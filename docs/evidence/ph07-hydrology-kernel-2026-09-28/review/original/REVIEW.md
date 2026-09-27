# PH07 first hydrology slice: independent narrow review

Reviewed scope: the bounded 2..512 by 2..512 node pure kernel, its first 14 passing
tests, and `DESIGN.md`. No production adapter, full-world water, lake volume,
persistence, Worker or UI completion is assumed or required by this review.

Original reviewed kernel SHA-256:
`4be70639685b22e53f3d4b95d8785e75d59122501a377397cfa5f8839e2d1671`.
Original test SHA-256:
`b2d13428db7b7fbf362b7d81c78ac0578222df839a00022d1df2e395f9de9f98`.
The author's `checks/fine-drainage-first/verification.json` reports 14/14 and types
exit 0, with `stageOnly:true`, `productionAcceptance:false`,
`performanceAcceptance:false`, `ph07T1Complete:false`.

## Finding: caller-overridable slice breaks private capture

Priority P2; repair before integrating this kernel. At original lines 65–71,
`instanceof Int16Array` accepts an instance with its own `slice` method or an
Int16Array subclass. The subsequent `input.coverageQ.slice()` and
`input.groundMeters.slice()` therefore do not establish independent ownership.

The independent `private-copy-probe.mjs` invokes the real original `.ts` module
with Node 24 native type stripping. It uses only 3×3 nodes and leaves that module
unchanged. Raw result is preserved in `private-copy-probe.json`:

- Ordinary initial land arrays: 9 land nodes; result arrays do not alias input.
- Same land values, with both instance `slice` methods returning themselves:
  input validation accepts them. The first `capture` progress callback changes
  caller arrays to sea. The final result now has 0 land nodes, and both returned
  arrays are exactly the caller arrays.

This directly contradicts the stated ownership boundary; it is not a claim about
a hypothetical future UI caller. The existing mutation test only exercises
ordinary native instances and misses the accepted override/subclass case.

Recommended bounded repair: capture the two source references once, allocate
independent native fixed-length destinations, and copy through an intrinsic
typed-array operation that cannot dispatch to the source's `slice`, iterator or
species. Keep exact lengths, shared-buffer rejection and hard budgets. Add the
override/subclass regression without weakening ordinary mutation/cancellation
tests. The owning agent has accepted this fix; this review does not claim their
subsequent source or tests are already checked.

## Other inspected paths: no concrete blocker found

- **Flat routing:** strict descents decrease height. Equal-height BFS assigns a
  node only once to an already reached predecessor; initial row-major seeds and
  fixed cardinal order settle ties independently of batching. The closed-flat
  pass forms a tree, and reversing only its root-to-boundary path preserves
  acyclicity. The topological pass additionally rejects a cycle or missing node.
- **Conservation and crop uncertainty:** each nonnegative coverage sample starts
  with one contribution, each node has at most one receiver, and accumulation
  processes each land node once. Maximum count is 262,144, within Uint32. The
  reverse pass identifies downstream basin IDs before using them. A basin with
  any represented boundary contributor is marked partial, and its members receive
  unresolved drainage status in the following pass. This supports the documented
  local sample-count result; it does not claim external portals or exact runoff.
- **Fine land connectivity:** cardinal edges use the fixed 2-world lattice.
  The two third vertices checked for a zero–zero edge match the adjacent triangles
  of the actual NW–SE split. A zero-area line surrounded by sea cannot become a
  land receiver edge. NW/SE checks only recognize a zero coast terminal and never
  introduce a diagonal land route. A six-interval/12-world channel is not skipped.
- **Coast geometry:** the kernel uses canonical integer edge crossings with
  endpoint zeros and 1..511 clamp; terminal coordinates stop on that edge rather
  than using the opposite bank as a receiver. The existing tests compare actual
  v4 geometry and cover a diagonal zero coast endpoint.
- **Depression output:** the recorded saddle is explicitly a candidate from
  represented adjacent basin edges. `lakeWaterSurfaceMeters` remains NO_WATER.
  No fill, water volume, merged-basin or complete lake inference is made. Consumers
  must preserve that distinction and the `partial` flag.
- **Budget and cancellation:** native per-node arrays total 24N bytes, and basin
  arrays add 24B with B≤N, hence ≤48N and at most 12MiB. Routing indegree is at most
  four and fits Uint8. The original operation cap, progress checkpoints and abort
  checks cover passes, including callback cancellation and completion. This is
  code-bound reasoning plus the existing tests, not a new performance measurement.

No production/staging source was changed by this review. No suite, build or
browser was run. Only the nine-node private-copy probe was executed. The current
docs and verification already restrict their completion claim appropriately;
the missing later PH07 systems are not classified as defects of this slice.
