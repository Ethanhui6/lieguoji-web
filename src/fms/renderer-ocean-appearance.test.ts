import { describe, expect, it } from 'vitest';
import { FMS_OCEAN_DEEP, FMS_OCEAN_SHALLOW } from './ocean-surface';
import { FMS_OCEAN_APPEARANCES, FmsRenderer } from './renderer';

describe('renderer ocean appearance', () => {
  it('keeps the recovered source palette as its default, including the Pixi clear color', () => {
    expect(FMS_OCEAN_APPEARANCES.source.shallow).toBe(FMS_OCEAN_SHALLOW);
    expect(FMS_OCEAN_APPEARANCES.source.deep).toBe(FMS_OCEAN_DEEP);
    expect(FMS_OCEAN_APPEARANCES.source.background).toBe('#1487ff');
    const renderer = new FmsRenderer();
    expect(renderer.oceanAppearance).toBe('source');
    renderer.destroy();
  });

  it('accepts paper before initialization and source again without replacing renderer state', () => {
    const renderer = new FmsRenderer();
    renderer.setOceanAppearance('paper');
    expect(renderer.oceanAppearance).toBe('paper');
    expect(FMS_OCEAN_APPEARANCES.paper.background).toBe('#e1c898');
    expect(FMS_OCEAN_APPEARANCES.paper.deep).not.toEqual(FMS_OCEAN_APPEARANCES.source.deep);
    renderer.setOceanAppearance('source');
    expect(renderer.oceanAppearance).toBe('source');
    renderer.destroy();
    renderer.setOceanAppearance('paper');
    expect(renderer.oceanAppearance).toBe('source');
  });
});
