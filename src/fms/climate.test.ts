import { describe, expect, it } from 'vitest';
import { FMS_CLIMATE_DEFAULTS, generateFmsClimateGrid, recoveredBiome, recoveredTemperature } from './climate';

describe('bounded recovery of original climate rules',()=>{
  // Hand-calculated source branches, not an original running-game capture.
  it.each([[0,0,27],[19,16,24],[20,-20,24],[100,0,-17],[20,90,-20],[20,-90,-20],[45,0,22]])('temperature at height %s / latitude %s is %s',(height,latitude,expected)=>{
    expect(recoveredTemperature(height,latitude)).toBe(expected);
  });
  it('truncates final fractional temperature toward zero and applies global offset',()=>{
    expect(recoveredTemperature(0,89)).toBe(-19);
    expect(recoveredTemperature(45,0,3)).toBe(25);
  });
  it('honors sea, freezing, hot desert and disabled wetland branches',()=>{
    expect(recoveredBiome(50,-50,19)).toBe(0);
    expect(recoveredBiome(50,-6,20)).toBe(11);
    expect(recoveredBiome(7,25,45)).toBe(1);
    expect(recoveredBiome(7,25,45,true)).toBe(3);
    expect(recoveredBiome(8,25,45)).toBe(3);
    expect(recoveredBiome(20,20,45)).toBe(7);
    expect(recoveredBiome(100,10,45)).toBe(8);
    expect(recoveredBiome(100,-5,45)).toBe(10);
    for(let t=-5;t<=30;t++)for(let m=0;m<60;m++)expect(recoveredBiome(m,t,25)).not.toBe(12);
  });
  it('unpacks the first horizontal wind row and stops at row edges',()=>{
    const climate=generateFmsClimateGrid(Uint8Array.of(0,0,0,0),2,2);
    // 5*sqrt(2)*.8 truncates to 5 for each of horizontal and vertical passes.
    expect([...climate.precipitation]).toEqual([10,10,10,10]);
    const coast=generateFmsClimateGrid(Uint8Array.of(0,45,0,45),2,2);
    expect(coast.precipitation[1]).toBeGreaterThan(0);
    expect(coast.precipitation[3]).toBeGreaterThan(0);
    // No off-map all-humidity dump on an isolated final land cell.
    expect(generateFmsClimateGrid(Uint8Array.of(45),1,1).precipitation[0]).toBe(0);
  });
  it('preserves typed per-write truncation and deterministic seed isolation',()=>{
    const h=Uint8Array.of(0,25,60,90,0,30,50,0,0,80,40,0),before=h.slice();
    const a=generateFmsClimateGrid(h,4,3);
    generateFmsClimateGrid(h,4,3,{...FMS_CLIMATE_DEFAULTS,seed:'unrelated'});
    expect(generateFmsClimateGrid(h,4,3)).toEqual(a);
    expect(h).toEqual(before);
    expect(a.temperature).toBeInstanceOf(Int8Array);
    expect(a.precipitation).toBeInstanceOf(Uint8Array);
  });
  it('rejects invalid or oversized grids and unbounded climate parameters',()=>{
    expect(()=>generateFmsClimateGrid(new Uint8Array(193),193,1)).toThrow();
    expect(()=>generateFmsClimateGrid(Uint8Array.of(101),1,1)).toThrow();
    for(const options of [{precipitation:0},{north:NaN},{south:1},{temperatureOffset:Infinity}]){
      expect(()=>generateFmsClimateGrid(Uint8Array.of(0),1,1,{...FMS_CLIMATE_DEFAULTS,...options})).toThrow();
    }
    expect(()=>recoveredBiome(5,1.5,45)).toThrow();
  });
});
