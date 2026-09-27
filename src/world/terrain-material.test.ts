import { describe, expect, it } from 'vitest';
import { atlasElevationColor, atlasTerrainColor } from './terrain-material';

describe('height and real-slope terrain material', () => {
  it('has fixed independent deep-sea, shelf, lowland and mountain reference colours', () => {
    expect([-5000, -2000, -600, -100, 0, 300, 650, 2400, 6000].map(atlasElevationColor)).toEqual([
      0x12354d, 0x1b5269, 0x28798d, 0x4c97a8, 0xb2b585, 0x87a76c, 0x8ba370, 0x86806f, 0xe5e5dc,
    ]);
  });
  it('interpolates between actual elevations instead of assigning large flat bands', () => {
    expect(atlasElevationColor(-350)).toBe(0x3a889b);
    expect(atlasElevationColor(150)).toBe(0x9dae79);
    const colors = new Set(Array.from({ length: 101 }, (_, index) => atlasElevationColor(-600 + index * 5)));
    expect(colors.size).toBeGreaterThan(60);
    expect(atlasElevationColor(-12001)).toBe(atlasElevationColor(-12000));
    expect(atlasElevationColor(12001)).toBe(atlasElevationColor(12000));
  });
  it('flat surfaces retain palette anchors and opposite real slopes alter bounded light', () => {
    expect(atlasTerrainColor(650, 650, 650, 650, 650, 16)).toBe(0x8ba370);
    const base = atlasElevationColor(650), bright = atlasTerrainColor(650, 0, 2000, 0, 2000, 16), dark = atlasTerrainColor(650, 2000, 0, 2000, 0, 16);
    for (const shift of [16, 8, 0]) {
      const channel = (value: number) => (value >> shift) & 255;
      expect(channel(bright)).toBeGreaterThan(channel(base)); expect(channel(dark)).toBeLessThan(channel(base));
      expect(channel(bright)).toBeLessThanOrEqual(Math.round(channel(base) * 1.13));
      expect(channel(dark)).toBeGreaterThanOrEqual(Math.round(channel(base) * .87));
    }
  });
});
