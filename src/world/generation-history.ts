/** Storage provenance only: audited implementations must never be silently
 * relabelled as, or executed by, the current implementation.
 * The first four identities are the published 90cdabc6fa1c0cd0d3f8d4037b93870b63421db5
 * Pages build; see docs/evidence/playtest-2026-09-24 and the release follow-up.
 * The second identity in each list, and shape-landmass, are the locally tested
 * 0.5.0-preview.2 uncommitted-source build, NOT a published release. Its build.json
 * reports the base HEAD, not the full source state. Evidence and source snapshot:
 * docs/evidence/ph06-handdraw-2026-09-27/{build.json,sources.json,handdraw-coverage.json}.
 * That immutable build.json has SHA-256 9c3d43ed6f1d276589f472702ae75b60b5a0923a8d71d9121fcb15eb585bb70b.
 */
export const STORED_GENERATOR_HISTORY = Object.freeze({
  'macro-landmass': Object.freeze(['ae25aa84e2c9b98546bcf7d61f9a6fbc890b5a8a245277e74cc0ef1bf66f531c', 'b0aa8d84c950afd34a1c5fd098626682950b7a38865ae379bcb1d20f41427b1c']),
  landforms: Object.freeze(['cc2dcc65ada9259597293161b3678ec5420deb1ee0d9c07216485f15caafcde8', 'b2f9104fed3015eecb53d352fd1b1fb2e1efe6b6af561c3770f1c2d8719e2177']),
  'island-chains': Object.freeze(['8b4c45c43b8c42035a3f9a2b9786380b67ce05ecc8a1e6644e33550214cfc8de', 'fa97c165ccd6b7ce9fbe1f634e11187c792afddf3bc8e49afbc2f1126aa7d16d']),
  'coast-smoothing': Object.freeze(['7f5385accb82b7e17c1ea17232ab0e4741e40818c5058b5be431c89a54599a37', '75a68ae6c93e95cee6cd8e0b5bd55fd1df4dff8d3e3126bddaffd8afe4035b3f']),
  'shape-landmass': Object.freeze(['1ff3b8a2eff5f4211a2bdec0d13ca6f1c24dd2cc530e087f906b8e9a6e5b7211']),
});

export function isStoredGeneratorFingerprint(id: string, fingerprint: string): boolean {
  return Object.hasOwn(STORED_GENERATOR_HISTORY, id)
    && STORED_GENERATOR_HISTORY[id as keyof typeof STORED_GENERATOR_HISTORY].includes(fingerprint);
}
