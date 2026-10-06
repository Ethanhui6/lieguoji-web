import {it,expect} from 'vitest';
import {analyzeElevation,evaluateTerrain,nativeBiomeRatios,nativeUnitModifier,NATIVE_COMBAT_SCALE} from './terrain13-native';
it('restores the native attack/defense table and static scale without generic mountain stacking',()=>{
 const steppe=[0,0,0,0,1],forest=[0,0,0,0,0,0,0,1];
 expect(NATIVE_COMBAT_SCALE).toBe(0.8999999761581421);
 expect(nativeUnitModifier('Cavalry',true,steppe,false)).toBeCloseTo(1.63125,6);
 expect(nativeUnitModifier('Cavalry',true,forest,true)).toBeCloseTo(.55125,6);
 expect(nativeUnitModifier('Shield',false,forest,true)).toBeCloseTo(1.2285,6);
 expect(nativeUnitModifier('Archer',false,forest,true)).toBeCloseTo(1.2312,6);
 expect(nativeUnitModifier('Infantry',true,[],false)).toBeCloseTo(.9,6);
});
it('normalizes upstream positive non-marine counts, including unknown indices with neutral fallback',()=>{
 const ratios=nativeBiomeRatios([100,2,-5,0,6,0,0,0,0,0,0,0,0,2]);expect(ratios[0]).toBe(0);expect(ratios[1]).toBe(Math.fround(.2));expect(ratios[4]).toBe(Math.fround(.6));expect(ratios[13]).toBe(Math.fround(.2));
 expect(evaluateTerrain([1,2],1,ratios,0)).toBeCloseTo(1.2,6);
 // Evaluate accepts ratios as provided; it does not normalize a second time.
 expect(evaluateTerrain([2],1,[.25],0)).toBe(.5);expect(evaluateTerrain([0],-1,[1],1)).toBe(Math.fround(.05));expect(evaluateTerrain([],1,[],0)).toBe(1);
});
it('uses native strict heights and a boolean mountain classification, not average elevation',()=>{
 expect(analyzeElevation([80,80,80])).toMatchObject({mountain:false,plateau:true,deviation:0});
 expect(analyzeElevation([60,60,60,60,60,60,60,60,60,60])).toMatchObject({high:0,veryHigh:0,mountain:false});
 const mixed=analyzeElevation([85,85,45,45,45,45,45,45,45,45]);expect(mixed).toMatchObject({average:53,deviation:16,mountain:true,plateau:false});expect(mixed.veryHigh).toBe(Math.fround(.2));
 expect(analyzeElevation([])).toMatchObject({mountain:false,plateau:false,average:0});
});
