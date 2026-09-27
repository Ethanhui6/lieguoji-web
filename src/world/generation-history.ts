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
/** Preview.4 identities below were recomputed against actual local commit
 * 147702e and matched the archived build. See
 * docs/evidence/ph06-coastal-surface-2026-09-27/preview4-provenance.json.
 * This is storage-only compatibility, never permission to execute an old recipe. */
export const STORED_GENERATOR_HISTORY = Object.freeze({
  'macro-landmass': Object.freeze(['ae25aa84e2c9b98546bcf7d61f9a6fbc890b5a8a245277e74cc0ef1bf66f531c', 'b0aa8d84c950afd34a1c5fd098626682950b7a38865ae379bcb1d20f41427b1c', '8a93d4eec5d43838c219d5be4ed0254b8b3b5a62576d5bc867d6f2c02f1ddaa1']),
  landforms: Object.freeze(['cc2dcc65ada9259597293161b3678ec5420deb1ee0d9c07216485f15caafcde8', 'b2f9104fed3015eecb53d352fd1b1fb2e1efe6b6af561c3770f1c2d8719e2177', '8279d38e99ca772e9146ebef115c0f41dd13409a2ff850aa2e9b5e1b4a5b554b']),
  'island-chains': Object.freeze(['8b4c45c43b8c42035a3f9a2b9786380b67ce05ecc8a1e6644e33550214cfc8de', 'fa97c165ccd6b7ce9fbe1f634e11187c792afddf3bc8e49afbc2f1126aa7d16d', '8c4fb730d7f3f6320d6c812a2a7955bdf14ef804c34f8aeca3cf3a097647881b']),
  'coast-smoothing': Object.freeze(['7f5385accb82b7e17c1ea17232ab0e4741e40818c5058b5be431c89a54599a37', '75a68ae6c93e95cee6cd8e0b5bd55fd1df4dff8d3e3126bddaffd8afe4035b3f', 'bc540fd8c1e9a41efdfa2e22fdee766bbf5dc13ae8a94347a1d9f1bd29022c9c']),
  'shape-landmass': Object.freeze(['1ff3b8a2eff5f4211a2bdec0d13ca6f1c24dd2cc530e087f906b8e9a6e5b7211', '80bc0c4e4281509035a93c08816b6a52d3ce561b4356e34deca9b0a0382fc99f']),
  'ocean-floor': Object.freeze(['946c6b2dc875138db50d61bf88e8cae8e5ea058587f172ace75db2a3bf80f448']),
});

export function isStoredGeneratorFingerprint(id: string, fingerprint: string): boolean {
  return Object.hasOwn(STORED_GENERATOR_HISTORY, id)
    && STORED_GENERATOR_HISTORY[id as keyof typeof STORED_GENERATOR_HISTORY].includes(fingerprint);
}
