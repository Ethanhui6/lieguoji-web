import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../public/boot-diagnostic.js', import.meta.url), 'utf8');

function load(protocol: string, forced = false) {
  const panel = { hidden: true, dataset: {} as { kind?: string }, textContent: '' };
  const sandbox = {
    window: { __forceIosShell: forced, addEventListener() {} } as Record<string, unknown>,
    document: {
      documentElement: { classList: { add(name: string) { sandbox.classes.push(name); } } },
      getElementById: () => panel,
      scripts: [],
      querySelector: () => null,
      addEventListener() {},
    },
    location: { protocol, host: 'localhost', pathname: '/', search: '' },
    setTimeout() { return 0; },
    classes: [] as string[],
    panel,
  };
  sandbox.window.document = sandbox.document;
  sandbox.window.location = sandbox.location;
  vm.runInNewContext(source, sandbox);
  return sandbox;
}

describe('iOS boot diagnostic', () => {
  it('arms the shell only for the Capacitor page or an explicit proof flag', () => {
    const native = load('capacitor:');
    expect(native.classes).toEqual(['ios-shell']);
    expect((native.window.__lieguojiNativeShell as (protocol: string, forced?: boolean) => boolean)('ionic:', false)).toBe(true);
    expect((native.window.__lieguojiNativeShell as (protocol: string, forced?: boolean) => boolean)('https:', false)).toBe(false);
    expect(load('https:').classes).toEqual([]);
    expect(load('https:', true).classes).toEqual(['ios-shell']);
  });

  it('hides itself once the map canvas is reported and stays visible on a boot error', () => {
    const native = load('capacitor:');
    const boot = native.window.__lieguojiBoot as (phase: string, detail?: string) => void;
    boot('module');
    expect(native.panel.hidden).toBe(false);
    boot('map', '画布 390×844');
    expect(native.panel.hidden).toBe(true);
    expect(native.panel.dataset.kind).toBe('map');
    const failed = load('capacitor:');
    (failed.window.__lieguojiBoot as (phase: string, detail?: string) => void)('error', 'WebGL 上下文丢失');
    expect(failed.panel.hidden).toBe(false);
    expect(failed.panel.dataset.kind).toBe('error');
    expect(failed.panel.textContent).toContain('WebGL 上下文丢失');
  });
});
