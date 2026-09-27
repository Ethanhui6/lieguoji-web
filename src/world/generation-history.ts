/** Storage provenance only: these published implementations must never be
 * silently relabelled as, or executed by, the current implementation.
 * Verified against the 90cdabc6fa1c0cd0d3f8d4037b93870b63421db5 Pages build.json;
 * see docs/evidence/playtest-2026-09-24 and the 2026-09-27 release follow-up.
 */
export const STORED_GENERATOR_HISTORY = Object.freeze({
  'macro-landmass': Object.freeze(['ae25aa84e2c9b98546bcf7d61f9a6fbc890b5a8a245277e74cc0ef1bf66f531c']),
  landforms: Object.freeze(['cc2dcc65ada9259597293161b3678ec5420deb1ee0d9c07216485f15caafcde8']),
  'island-chains': Object.freeze(['8b4c45c43b8c42035a3f9a2b9786380b67ce05ecc8a1e6644e33550214cfc8de']),
  'coast-smoothing': Object.freeze(['7f5385accb82b7e17c1ea17232ab0e4741e40818c5058b5be431c89a54599a37']),
});

export function isStoredGeneratorFingerprint(id: string, fingerprint: string): boolean {
  return Object.hasOwn(STORED_GENERATOR_HISTORY, id)
    && STORED_GENERATOR_HISTORY[id as keyof typeof STORED_GENERATOR_HISTORY].includes(fingerprint);
}
