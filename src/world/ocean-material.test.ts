import { describe, expect, it } from 'vitest';
import { atlasElevationColor, atlasMaterialColor, atlasTerrainColor } from './terrain-material';
import { terrainMaterialTable, TERRAIN_LUT_HEIGHT, TERRAIN_LUT_WIDTH } from './terrain-mesh';
import { atlasElevationColor as oldElevationColor, atlasTerrainColor as oldTerrainColor } from './test-fixtures/preview21-terrain-material';

const rgb = (color: number) => [color >> 16 & 255, color >> 8 & 255, color & 255];

describe('physical-depth sea response, with an independent preview21 land oracle', () => {
  it('preserves the complete land lookup bytes, integer-height palette and actual CPU slopes', () => {
    const previous = new Uint8Array(1201 * 33 * 4);
    for (let x = 0; x <= 1200; x++) for (let y = 0; y <= 32; y++) {
      const base = rgb(oldElevationColor(x / 1200 * 12000)), light = .87 + y / 32 * .26;
      const offset = (y * 1201 + x) * 4;
      for (let channel = 0; channel < 3; channel++) previous[offset + channel] = Math.min(255, Math.max(0, Math.round(base[channel] * light)));
      previous[offset + 3] = 255;
    }
    expect(terrainMaterialTable('land')).toEqual(previous);
    for (let height = 0; height <= 12000; height++) expect(atlasElevationColor(height)).toBe(oldElevationColor(height));
    for (const height of [0, 1, 150, 300, 650, 1200, 2400, 4200, 6000, 12000]) {
      for (const difference of [-24000, -500, 0, 500, 24000]) for (const step of [2, 8, 16, 32]) {
        expect(atlasTerrainColor(height, height - difference, height + difference, height - difference / 2, height + difference / 2, step))
          .toBe(oldTerrainColor(height, height - difference, height + difference, height - difference / 2, height + difference / 2, step));
      }
    }
  });

  it('has independent sea endpoints and explicit bounded slope response at shallow, shelf and deep probes', () => {
    const probes = [
      { height: -12000, base: [16, 40, 63], bright: [16, 41, 64], dark: [16, 39, 62] },
      { height: -5000, base: [18, 53, 77], bright: [18, 54, 78], dark: [18, 52, 76] },
      { height: -600, base: [41, 89, 106], bright: [43, 93, 111], dark: [39, 85, 101] },
      { height: -100, base: [81, 134, 138], bright: [83, 138, 142], dark: [79, 130, 134] },
      { height: 0, base: [97, 141, 139], bright: [100, 145, 143], dark: [94, 137, 135] },
    ];
    for (const probe of probes) {
      expect(rgb(atlasMaterialColor(probe.height, 1, 'sea'))).toEqual(probe.base);
      expect(rgb(atlasMaterialColor(probe.height, 1.13, 'sea'))).toEqual(probe.bright);
      expect(rgb(atlasMaterialColor(probe.height, .87, 'sea'))).toEqual(probe.dark);
      expect(atlasMaterialColor(probe.height, 100, 'sea')).toBe(atlasMaterialColor(probe.height, 1.13, 'sea'));
      expect(atlasMaterialColor(probe.height, -100, 'sea')).toBe(atlasMaterialColor(probe.height, .87, 'sea'));
    }
    expect(atlasMaterialColor(0, 1, 'land')).toBe(0xb2b585);
    expect(atlasMaterialColor(-1, 1, 'sea')).toBe(atlasMaterialColor(0, 1, 'sea'));
    expect(atlasTerrainColor(-600, -680, -520, -600, -600, 2)).toBe(0x2a5b6c);
    expect(atlasTerrainColor(-600, -520, -680, -600, -600, 2)).toBe(0x285768);
  });

  it('keeps the entire sea table opaque, ordered by real depth, continuous and inside its response budget', () => {
    const sea = terrainMaterialTable('sea');
    expect(TERRAIN_LUT_WIDTH).toBe(1201); expect(TERRAIN_LUT_HEIGHT).toBe(33);
    for (let y = 0; y < 33; y++) for (let x = 0; x < 1201; x++) {
      const offset = (y * 1201 + x) * 4, baseOffset = (16 * 1201 + x) * 4;
      expect(sea[offset + 3]).toBe(255);
      for (let channel = 0; channel < 3; channel++) {
        const actual = sea[offset + channel], base = sea[baseOffset + channel];
        expect(Math.abs(actual - base)).toBeLessThanOrEqual(Math.ceil(base * .0455));
        if (x) {
          expect(actual).toBeGreaterThanOrEqual(sea[offset - 4 + channel]);
          expect(actual - sea[offset - 4 + channel]).toBeLessThanOrEqual(3);
        }
      }
    }
    for (const boundary of [-5000, -2000, -600, -100, -1]) for (const light of [.87, 1, 1.13]) {
      const a = rgb(atlasMaterialColor(boundary - .0001, light, 'sea')), b = rgb(atlasMaterialColor(boundary + .0001, light, 'sea'));
      for (let channel = 0; channel < 3; channel++) expect(Math.abs(a[channel] - b[channel])).toBeLessThanOrEqual(1);
    }
  });

  it('uses the same material for the CPU slope and each LUT light row without altering raw-light coordinates', () => {
    const table = terrainMaterialTable('sea');
    for (const height of [-12000, -5000, -2000, -600, -100, -10]) {
      expect(atlasTerrainColor(height, height, height, height, height, 2)).toBe(atlasElevationColor(height));
      for (const slope of [-40, 0, 40]) {
        // At fine step two the CPU denominator is 160. These neighbours
        // produce atan(slope/40), i.e. exact raw-light rows 8, 16 and 24.
        const y = slope < 0 ? 8 : slope > 0 ? 24 : 16;
        const color = atlasTerrainColor(height, height - slope * 2, height + slope * 2, height, height, 2);
        const offset = (y * 1201 + (height + 12000) / 10) * 4;
        expect([...table.slice(offset, offset + 3)]).toEqual(rgb(color));
      }
    }
  });
});
