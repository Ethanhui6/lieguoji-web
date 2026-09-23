import { describe, expect, it } from 'vitest';
import { engineFiles, fingerprintSources, verifyFrozenSources } from '../../scripts/engine-fingerprint';
import manifest from '../compat/v0_4/manifest.json';

describe('rule source closure', () => {
  it('verifies the immutable published engine and computes current content rather than git identity', () => {
    expect(verifyFrozenSources()).toBe(manifest.engineFingerprint);
    expect(fingerprintSources(engineFiles)).toMatch(/^[a-f0-9]{64}$/);
  });
  it('normalizes CRLF but includes path, content and stable order', () => {
    const files = ['src/a.ts', 'src/b.ts'];
    const source = (file: string) => file === files[0] ? "import type {B} from './b';\nexport type A = B;\n" : 'export type B = 1;\n';
    const first = fingerprintSources(files, source);
    expect(fingerprintSources(files, file => source(file).replace(/\n/g, '\r\n'))).toBe(first);
    expect(fingerprintSources([...files].reverse(), source)).not.toBe(first);
    expect(fingerprintSources(files, file => `${source(file)}// changed\n`)).not.toBe(first);
  });
  it.each(["import {rng} from './rng';", "export * from './rng';", "type X = import('./rng').X;", "import './rng';", "import('somewhere');", "require('./rng');", "eval('code');", "import x from 'external-package';"])(
    'rejects an untracked or dynamically loaded rule dependency: %s', source => {
      expect(() => fingerprintSources(['src/a.ts'], () => source)).toThrow();
    });
});
