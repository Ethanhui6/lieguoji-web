import { describe, expect, it } from 'vitest';
import { fingerprintLandformGenerator, fingerprintMacroGenerator } from '../../../scripts/generator-fingerprint';
import { LANDFORM_GENERATOR_FINGERPRINT, MACRO_GENERATOR_FINGERPRINT } from './fingerprint';

describe('actual macro generator runtime closure fingerprint', () => {
  const root = 'src/world/generation/macro.ts', seed = 'src/world/generation/seed.ts';
  const read = (files: Record<string, string>) => (file: string) => { if (!(file in files)) throw new Error(`Missing ${file}`); return files[file]; };
  it('injects an actual SHA256 and includes transitive runtime code and parameter semantics', () => {
    expect(MACRO_GENERATOR_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
    const files = { [root]: "import {run} from './seed'; export const generate=run;", [seed]: 'export const run=128;' };
    const first = fingerprintMacroGenerator(read(files)); expect(first.files).toEqual([root, seed]);
    expect(fingerprintMacroGenerator(read({ ...files, [seed]: 'export const run=129;' })).sha256).not.toBe(first.sha256);
    expect(fingerprintMacroGenerator(read({ ...files, [root]: files[root].replace(';', ';\r\n') })).sha256).toBe(fingerprintMacroGenerator(read({ ...files, [root]: files[root].replace(';', ';\n') })).sha256);
  });
  it('fails closed for missing, dynamic or external dependencies', () => {
    expect(() => fingerprintMacroGenerator(read({ [root]: "import './missing';" }))).toThrow('Missing');
    expect(() => fingerprintMacroGenerator(read({ [root]: "import 'random-generator';" }))).toThrow('External');
    expect(() => fingerprintMacroGenerator(read({ [root]: "const generator=import('./dynamic');" }))).toThrow('Dynamic');
    expect(() => fingerprintMacroGenerator(read({ [root]: "eval('1+1');" }))).toThrow('Dynamic');
  });
  it('fingerprints each generator from its own actual runtime entry and rejects a missing landform source', () => {
    const landform = 'src/world/generation/landforms.ts';
    const files = { [root]: "import {run} from './seed'; export const generate=run;", [seed]: 'export const run=128;', [landform]: 'export const landforms=1;' };
    const macro = fingerprintMacroGenerator(read(files)), forms = fingerprintLandformGenerator(read(files));
    expect(LANDFORM_GENERATOR_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
    expect(LANDFORM_GENERATOR_FINGERPRINT).not.toBe(MACRO_GENERATOR_FINGERPRINT);
    expect(forms.files).toEqual([landform]); expect(forms.sha256).not.toBe(macro.sha256);
    const changed = { ...files, [landform]: 'export const landforms=2;' };
    expect(fingerprintMacroGenerator(read(changed))).toEqual(macro);
    expect(fingerprintLandformGenerator(read(changed)).sha256).not.toBe(forms.sha256);
    expect(() => fingerprintLandformGenerator(read({ [root]: files[root] }))).toThrow('Missing');
  });
});
