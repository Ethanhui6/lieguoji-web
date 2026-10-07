import {nativeBlankConquerable,nativeHasCedeableProvince,nativeLandAdjacent,nativeCoastal,type NativeDeclarationGeography} from './declaration-geography';
import {nativeConquestAiWeight,type NativeDeclarationState,type NativeWeightQueries} from './declaration-choice';
import type {NativeWarLookup,NativeWarProvince} from '../war26-native';
import type {NativeConversionReligions} from './settlement-effects';

export interface NativeCasusBelliDefinition {
 id:number;allowedGoals:readonly number[];internal:boolean;dedicatedAnnex:boolean;annexThreshold:number;
 requiresBlank:boolean;requiresUnifier:boolean;requiresTheocraticConflict:boolean;
 minimumSameCulture:number;forceDecisiveCede:boolean;unificationWeightBonus:boolean;
}
const definition=(id:number,allowedGoals:readonly number[],extra:Partial<NativeCasusBelliDefinition>={}):NativeCasusBelliDefinition=>({id,allowedGoals,internal:false,dedicatedAnnex:false,annexThreshold:1,requiresBlank:false,requiresUnifier:false,requiresTheocraticConflict:false,minimumSameCulture:0,forceDecisiveCede:false,unificationWeightBonus:false,...extra});
/** BuildCatalog 668DA0 actual registration order. Internal entries register
 * empty goals; absence of enum values 4/5 is intentional in this version. */
export const NATIVE_CASUS_BELLI_CATALOG:readonly NativeCasusBelliDefinition[]=[
 definition(1,[2,1,3,6]),definition(2,[3],{dedicatedAnnex:true,annexThreshold:2147483647}),definition(3,[4]),
 definition(6,[1],{requiresUnifier:true,minimumSameCulture:2,forceDecisiveCede:true,unificationWeightBonus:true}),
 definition(7,[11],{requiresTheocraticConflict:true}),definition(8,[3],{dedicatedAnnex:true,annexThreshold:2147483647,requiresBlank:true}),
 ...[10,11,12,13,14,15,16].map(id=>definition(id,[],{internal:true})),
];
export interface NativeCasusProvince extends NativeWarProvince {culture:number}
export interface NativeCasusState extends NativeDeclarationState,NativeDeclarationGeography {
 culture:number;politicalSystem:number;religionId:string|null;provinces:readonly (NativeCasusProvince|null)[]|null;
}
export interface NativeCasusQueries<S extends NativeCasusState> {
 province:NativeWarLookup;
 landCount:(state:S)=>number;
 unifier:(state:S)=>boolean;
 validReligion:(id:string|null)=>boolean;
 isVassal:(state:S)=>boolean;
}
const required=<T>(v:T|null|undefined):T=>{if(v==null)throw Error('Native null reference');return v;};
/** Province culture, not defender national culture; retain duplicates/order. */
function* sameCultureProvinces(a:NativeCasusState,d:NativeCasusState,lookup:NativeWarLookup):Generator<NativeCasusProvince>{
 const sea=required(a.seaNeighbors).has(d.id);
 for(const p of required(d.provinces))if(p?.isLand&&p.culture===a.culture&&(nativeLandAdjacent(p,a.id,lookup)||sea&&nativeCoastal(p,lookup)))yield p;
}
export function nativeHasSameCultureCedeable(a:NativeCasusState|null,d:NativeCasusState|null,minimum:number,lookup:NativeWarLookup):boolean{
 if(!a||!d||!d.provinces||minimum<=0)return false;
 let n=0;for(const p of sameCultureProvinces(a,d,lookup)){void p;n=(n+1)|0;if(n>=minimum)return true;}return false;
}
export function nativeCedeableSameCulture(a:NativeCasusState|null,d:NativeCasusState|null,lookup:NativeWarLookup):number[]{
 if(!a||!d||!d.provinces)return [];
 const result:number[]=[];for(const p of sameCultureProvinces(a,d,lookup))result.push(p.id);return result;
}
/** Manager absence throws only after the native ID early exits; a present
 * manager with a missing religion dictionary is an ordinary false result. */
export function nativeCasusValidReligion(id:string|null,manager:()=>{religions:NativeConversionReligions}|null):boolean{
 if(id===null||id===''||id==='Atheism')return false;
 const religions=required(manager()).religions;if(!religions)return false;
 const religion=religions.get(id)?.religion;return !!religion&&religion.name!=='AtheismName';
}
export function nativeCasusAnnexFeasible<S extends NativeCasusState>(cb:NativeCasusBelliDefinition,d:S,q:Pick<NativeCasusQueries<S>,'landCount'>):boolean{
 const count=q.landCount(d);return count>=1&&(cb.dedicatedAnnex||count<=cb.annexThreshold);
}
export function nativeCasusVassalFeasible<S extends NativeCasusState>(d:S,q:Pick<NativeCasusQueries<S>,'landCount'|'isVassal'>):boolean{return q.landCount(d)>=1&&!q.isVassal(d);}
/** Shared CanUse 6684F0. CB priority strength thresholds belong to Choose,
 * not here. MinSameCulture returns BEFORE allowed-goal enumeration. */
export function nativeCasusCanUse<S extends NativeCasusState>(cb:NativeCasusBelliDefinition,a:S|null,d:S|null,q:NativeCasusQueries<S>):boolean{
 if(!a||!d||a===d||d.dead||nativeBlankConquerable(d)!==cb.requiresBlank)return false;
 if(!required(a.neighbors).has(d.id)&&!required(a.seaNeighbors).has(d.id))return false;
 if(cb.requiresUnifier&&!q.unifier(a))return false;
 if(cb.requiresTheocraticConflict&&(a.politicalSystem!==5||a.religionId===d.religionId||!q.validReligion(a.religionId)||!q.validReligion(d.religionId)))return false;
 if(cb.minimumSameCulture>0)return nativeHasSameCultureCedeable(a,d,cb.minimumSameCulture,q.province);
 const cedeable=nativeHasCedeableProvince(a,d,q.province);
 for(const goal of required(cb.allowedGoals)){
  if([0,1,2,6].includes(goal)&&cedeable)return true;
  if(goal===3&&nativeCasusAnnexFeasible(cb,d,q))return true;
  if(goal===4&&nativeCasusVassalFeasible(d,q))return true;
  if(goal===11&&q.landCount(d)>=1)return true;
 }
 return false;
}
/** EvaluateAiWeight 668980. Blank conquest has its own bounded low-cost
 * formula. The unification bonus re-reads leader traits after base scoring. */
export function nativeCasusAiWeight<S extends NativeCasusState>(cb:NativeCasusBelliDefinition,a:S|null,d:S|null,q:NativeWeightQueries<S>&{unifier:(s:S)=>boolean}):number{
 if(!a||!d)return 0;
 const f=Math.fround;
 if(cb.requiresBlank){
  const expansion=Math.max(0,Math.min(1,f(f(a.expansionism)-1))),ambition=q.ambitious(a)?1:0;
  const value=f(f(f(expansion*f(.08))+f(.58))+f(ambition*f(.04)));
  // SSE minss returns its second operand if either value is NaN.
  return Number.isNaN(value)?f(.7):Math.min(value,f(.7));
 }
 return nativeConquestAiWeight(a,d,q,cb.unificationWeightBonus?share=>share>=f(.45)&&q.unifier(a)?f(.15):0:undefined);
}
