/** Recovered finite-input destiny arithmetic, not yet used by production v19.
 * RVAs and scheduling/serialization differences: restoration19/NEXT_DESTINY.md.
 * Random draws are injected; this does not reproduce Unity's global RNG. */
import {f,finite,int32} from './numeric';
export interface DestinyRandom {
 intRange:(min:number,max:number)=>number;
 floatRange:(min:number,max:number)=>number;
}
export interface NativeDestiny {
 destiny:number;
 decrease:number;
 manifestCount:number;
 manifest:boolean;
}
export interface DestinyChange {
 state:NativeDestiny;
 clearEmergencyMobilizations:boolean;
}
const integerDraw=(r:DestinyRandom,min:number,max:number)=>{const value=int32(r.intRange(min,max));if(value<min||value>=max)throw Error('Invalid destiny integer draw');return value;};
const floatDraw=(r:DestinyRandom,min:number,max:number)=>{min=f(min);max=f(max);const value=r.floatRange(min,max);if(!Number.isFinite(value)||value<min||value>max)throw Error('Invalid destiny float draw');return f(value);};
function checked(s:NativeDestiny):NativeDestiny{
 if(!s||typeof s.manifest!=='boolean')throw Error('Unresolved destiny state');
 return {destiny:finite(s.destiny),decrease:finite(s.decrease),manifestCount:int32(s.manifestCount),manifest:s.manifest};
}
/** Constructor leaves destiny zero; InitStateSimulationData draws it later. */
export function nativeDestinyDefaults(random:DestinyRandom):NativeDestiny{
 return {destiny:0,decrease:floatDraw(random,.083,.24),manifestCount:3,manifest:false};
}
/** State.RandomDestiny: special branch deliberately keeps decrease and queue. */
export function nativeRandomDestiny(input:NativeDestiny,init:boolean,random:DestinyRandom):DestinyChange{
 return redraw(checked(input),init,random);
}
/** A monthly finite-input calculation can overflow its old destiny to -Inf.
 * Native redraw overwrites it; do not reject that intermediate before reset. */
function redraw(s:NativeDestiny,init:boolean,random:DestinyRandom):DestinyChange{
 if(init)s.manifestCount=integerDraw(random,2,5);
 const manifest=s.manifest&&s.manifestCount>0;
 s.manifestCount=(s.manifestCount-1)|0;
 if(manifest){s.destiny=integerDraw(random,70,90);return {state:s,clearEmergencyMobilizations:false};}
 s.destiny=integerDraw(random,10,90);s.decrease=floatDraw(random,.043,.28);
 return {state:s,clearEmergencyMobilizations:true};
}
/** Loading projects an already-resolved trait flag without drawing a counter. */
export function nativeProjectDestinyTrait(input:NativeDestiny,manifest:boolean):NativeDestiny{
 return checked({...input,manifest});
}
/** Explicit trait refresh, unlike load, redraws count whenever Manifest remains. */
export function nativeRefreshDestinyTrait(input:NativeDestiny,manifest:boolean,random:DestinyRandom):NativeDestiny{
 const s=nativeProjectDestinyTrait(input,manifest);if(manifest)s.manifestCount=integerDraw(random,2,5);return s;
}
export interface DestinyMonthInput {
 /** Resolved original PopulationPercentage. Its zero-capacity cleanup is not
  * invented here; callers must supply a real, finite ratio. Called even <30. */
 populationRatio:()=>number;
 gold:number;
 /** Absence means unresolved/missing leader, default 50. Caller uses the true
  * getter, with traits; this function does not add an isAlive predicate. */
 leaderAdministrative?:()=>number;
}
/** cvttss2si returns INT_MIN on overflow under masked invalid FP exceptions.
 * Do not replace this by JS truncation/modulo/saturation; original MXCSR is
 * outside this finite-input adapter's contract. */
export function nativeDestinyThreshold(manifestCount:number):number{
 const count=int32(manifestCount);if(count<=0)return f(10);
 const product=f(f(count)*f(1.5)),truncated=Math.trunc(product),converted=truncated< -2147483648||truncated>2147483647?-2147483648:truncated;
 return f(f(converted)+f(10));
}
export function nativeMonthlyDestiny(input:NativeDestiny,month:DestinyMonthInput,random:DestinyRandom):DestinyChange&{reset:boolean}{
 const s=checked(input),ratio=finite(month.populationRatio()),base=f(s.decrease*f(.3333));
 const raw=f(f(base+f(ratio*base))+f(base*(finite(month.gold)<0?f(.5):0)));
 if(s.destiny<f(30))s.destiny=f(s.destiny-f(floatDraw(random,.083,.24)*f(.5)));
 else {
  const skill=month.leaderAdministrative?Math.min(100,Math.max(0,finite(month.leaderAdministrative()))):f(50);
  const administrative=Math.min(1,Math.max(0,f(skill/f(100)))),factor=f(f(1.5)-administrative);
  s.destiny=f(s.destiny-f(factor*raw));
 }
 const threshold=nativeDestinyThreshold(s.manifestCount);
 if(s.destiny<threshold)return {...redraw(s,true,random),reset:true};
 return {state:s,clearEmergencyMobilizations:false,reset:false};
}
