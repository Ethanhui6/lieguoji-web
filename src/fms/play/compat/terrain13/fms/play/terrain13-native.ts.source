/** Native single-province contract, recovered from the owner's IL2CPP build.
 * Evidence: docs/evidence/fms-terrain13-v5-2026-10-07/RECOVERY.md.
 * Valid finite built-in inputs only; this is not the whole Army efficiency. */
import type {UnitKey} from './military-profile';
export const NATIVE_COMBAT_SCALE=Math.fround(.9);
export const BIOME_NAMES=['Marine','Hot desert','Cold desert','Savannah','Steppe','Tropical seasonal forest','Temperate deciduous broadleaf forest','Tropical rainforest','Subtropical evergreen broadleaf forest','Taiga','Tundra','Snow-covered land','Wetland'] as const;
type Table={power:number;attack:number[];defense:number[];mountainAttack:number;mountainDefense:number};
export const NATIVE_TABLES:Record<UnitKey,Table>={
 Infantry:{power:1,attack:[1,1,1,1.05,1.05,1,1,1,1,1,1,1,1],defense:[1,1,1,1,1,1.05,1.05,1,1,1,1,1,1.05],mountainAttack:1,mountainDefense:1},
 Archer:{power:.95,attack:[1,1,1,1,1,1.1,1.1,1.15,1.15,1,1,1,1],defense:[1,1,1,1,1,1.15,1.15,1.2,1.2,1,1,1,1],mountainAttack:1.1,mountainDefense:1.2},
 Shield:{power:1.05,attack:[1,1,1,.95,.95,1,1,1,1,1,1,1,1],defense:[1,1,1,1,1,1,1,1,1,1.15,1.15,1.15,1.2],mountainAttack:1.05,mountainDefense:1.3},
 Cavalry:{power:1.25,attack:[1,1.25,1.25,1.45,1.45,.8,.8,.7,.7,1,1,1,.75],defense:[1,1.2,1.2,1.2,1.2,.85,.85,.75,.75,1,1,1,.8],mountainAttack:.7,mountainDefense:.75},
 Elite:{power:1.35,attack:[1,1,1,1.05,1.05,1.05,1.05,1.05,1.05,1,1,1,1],defense:[1,1,1,1,1,1.1,1.1,1.1,1.1,1.1,1.1,1.1,1],mountainAttack:1.1,mountainDefense:1.15},
};
const f=Math.fround;
export function nativeBiomeRatios(counts:readonly number[]){const total=counts.reduce((s,n,i)=>s+(i!==0&&n>0?n:0),0);return counts.map((n,i)=>i!==0&&n>0&&total>0?f(f(n)/f(total)):0);}
export function evaluateTerrain(table:readonly number[],mountainModifier:number,ratios:readonly number[],mountainWeight:number){
 let result=f(0);for(let i=0;i<ratios.length;i++)if(ratios[i]>0)result=f(result+f(f(ratios[i])*Math.max(f(.05),f(table[i]??1))));
 if(result<=0)result=1;const mountain=mountainModifier<=0?1:mountainModifier,w=f(Math.max(0,Math.min(1,mountainWeight)));
 if(w>0)result=f(result*f(1+f(f(Math.max(f(.05),f(mountain))-1)*w)));
 return Math.max(f(.05),result);
}
export function nativeUnitModifier(key:UnitKey,attacking:boolean,ratios:readonly number[],mountain:boolean,scale=NATIVE_COMBAT_SCALE){
 const t=NATIVE_TABLES[key];return f(f(f(t.power)*evaluateTerrain(attacking?t.attack:t.defense,attacking?t.mountainAttack:t.mountainDefense,ratios,mountain?1:0))*Math.max(f(.01),f(scale)));
}
export function analyzeElevation(heights:readonly number[]){
 const n=heights.length;if(!n)return{average:0,deviation:0,high:0,veryHigh:0,mountain:false,plateau:false};
 const average=f(heights.reduce((s,h)=>s+h,0)/n),high=f(heights.filter(h=>h>60).length/n),veryHigh=f(heights.filter(h=>h>80).length/n);
 const variance=f(f(heights.reduce((s,h)=>{const d=f(f(h)-average);return s+f(d*d);},0))/f(n)),deviation=f(Math.sqrt(variance));
 const mountain=(veryHigh>=f(.15)||high>=f(.30))&&deviation>5;
 return{average,deviation,high,veryHigh,mountain,plateau:average>60&&!mountain};
}
