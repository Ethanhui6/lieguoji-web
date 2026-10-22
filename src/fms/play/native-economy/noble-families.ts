/** Original opening family territories (State.InitializeCharactersAndFamilies):
 * AllocateRulingFamilyTerritories 5BF740 / SelectRulingFamilyProvinces 5D7B50,
 * GenerateNobleFamiliesWithTerritories 5C8DD0 / SelectOptimalFamilyOrigins 5D7450,
 * CreateNobleFamilyWithTerritory 5C2940 / GenerateNobleFamilyMembers 5C91B0,
 * AssignRemainingProvincesToNearestFamilies 5C0180,
 * ValidateAndAdjustInitialDistribution 5E1850 / RedistributeProvincesToUnderCapacityFamilies 5D5F30,
 * FamilyManager.GetMaxProvinceRatio 862460. Callers own all mutation targets. */
import {f,int32,roundInt} from './numeric';
import type {CharacterRandom} from './character-generation';
import type {NativeFamilyMember,NativeFamilyMemberPorts,NativeInitialFamily} from './family-members';
import type {NativePolity} from '../native-combat/upper-efficiency';

/** Province view: id, owning family (0 = none) and land neighbours. */
export interface NativeTerritoryProvince {id:number;familyId:number;neighbors:ReadonlySet<number>}
export interface NativeTerritoryFamily {id:number;homeProvinceId:number;controlledProvinces:number[]}
export type NativeProvinceDistance=(a:number,b:number)=>number;
const POLITIES:readonly NativePolity[]=['Kingdom','Empire','Federation','Republic','Tribal','Theocracy'];
const index=(p:NativePolity)=>{const i=POLITIES.indexOf(p);if(i<0)throw Error('Unknown native polity');return i;};
/** AllocateRulingFamilyTerritories jump table: share of the state's provinces. */
export function nativeRulingTerritoryRatio(p:NativePolity){return f([.35,.4,.2,.15,.4,.35][index(p)]);}
/** FamilyManager.GetMaxProvinceRatio. */
export function nativeMaxProvinceRatio(p:NativePolity){return f([.4,.5,.25,.2,.45,.45][index(p)]);}
/** GenerateNobleFamiliesWithTerritories jump table: noble family cap by polity. */
export function nativeNobleFamilyCap(p:NativePolity){return [5,6,8,6,4,4][index(p)];}
function intDraw(random:CharacterRandom,min:number,max:number){const v=int32(random.intRange(min,max));if(v<min||v>=max)throw Error('Invalid native family integer draw');return v;}
function floatDraw(random:CharacterRandom,min:number,max:number){const v=f(random.floatRange(min,max));if(v<min||v>max)throw Error('Invalid native family float draw');return v;}
function valueDraw(random:CharacterRandom){const v=f(random.value());if(v<0||v>1)throw Error('Invalid native family probability draw');return v;}
function control(family:NativeTerritoryFamily,p:NativeTerritoryProvince){if(!family.controlledProvinces.includes(p.id))family.controlledProvinces.push(p.id);p.familyId=family.id;}

/** Ruling family size: RoundToInt(count × ratio) ≥ 1, capped by Floor(count × max ratio). */
export function nativeRulingTerritoryCount(provinceCount:number,polity:NativePolity){
  let count=Math.max(1,roundInt(f(provinceCount*nativeRulingTerritoryRatio(polity))));
  const cap=Math.floor(f(provinceCount*nativeMaxProvinceRatio(polity)));if(count>=cap)count=cap;
  return count;
}
/** SelectRulingFamilyProvinces: home, then unowned neighbours of home nearest
 * first, then the nearest remaining unowned provinces. */
export function nativeSelectRulingProvinces(provinces:readonly NativeTerritoryProvince[],homeId:number,count:number,distance:NativeProvinceDistance){
  const home=provinces.find(p=>p.id===homeId);if(!home)return [];
  const out=[home];if(count<=1)return out;
  const candidates=provinces.filter(p=>p.id!==homeId&&p.familyId===0).map((p,i)=>({p,i,d:distance(home.id,p.id)})).sort((a,b)=>a.d-b.d||a.i-b.i).map(v=>v.p);
  const near=candidates.filter(p=>home.neighbors.has(p.id)).slice(0,count-1);out.push(...near);
  const rest=count-out.length;if(rest>0)out.push(...candidates.filter(p=>!near.includes(p)).slice(0,rest));
  return out;
}
export function nativeAllocateRulingTerritories(family:NativeTerritoryFamily,provinces:readonly NativeTerritoryProvince[],polity:NativePolity,distance:NativeProvinceDistance){
  for(const p of nativeSelectRulingProvinces(provinces,family.homeProvinceId,nativeRulingTerritoryCount(provinces.length,polity),distance))control(family,p);
}
/** GenerateNobleFamiliesWithTerritories: how many noble families to found. */
export function nativeNobleFamilyCount(unowned:number,polity:NativePolity,random:CharacterRandom){
  const max=Math.max(1,Math.min(unowned,nativeNobleFamilyCap(polity)));
  if(unowned<=2)return 1;
  if(unowned<=4)return intDraw(random,1,3);
  if(unowned<=8)return intDraw(random,2,Math.min(max+1,4));
  return intDraw(random,3,max+1);
}
/** SelectOptimalFamilyOrigins: a random first origin, then farthest-point sampling. */
export function nativeSelectOrigins<P extends {id:number}>(candidates:readonly P[],count:number,distance:NativeProvinceDistance,random:CharacterRandom):P[]{
  if(candidates.length<=count)return [...candidates];
  const remaining=[...candidates],first=remaining[intDraw(random,0,remaining.length)],selected=[first];remaining.splice(remaining.indexOf(first),1);
  for(let n=1;n<count&&remaining.length;n++){
    let best:P|null=null,bestDistance=0;
    for(const p of remaining){let nearest=f(3.4028234663852886e38);for(const s of selected){const d=distance(p.id,s.id);if(!(d>nearest))nearest=d;}if(nearest>bestDistance){bestDistance=nearest;best=p;}}
    if(best){selected.push(best);remaining.splice(remaining.indexOf(best),1);}
  }
  return selected;
}
/** AssignRemainingProvincesToNearestFamilies (noble families with a home). */
export function nativeAssignRemainingToNearest(remaining:readonly NativeTerritoryProvince[],families:readonly NativeTerritoryFamily[],distance:NativeProvinceDistance){
  for(const p of remaining){let best:NativeTerritoryFamily|null=null,nearest=f(3.4028234663852886e38);
    for(const fam of families){if(fam.homeProvinceId<=0)continue;const d=distance(p.id,fam.homeProvinceId);if(nearest>d){nearest=d;best=fam;}}
    if(best)control(best,p);}
}
/** ValidateAndAdjustInitialDistribution + RedistributeProvincesToUnderCapacityFamilies. */
export function nativeValidateInitialDistribution(families:readonly NativeTerritoryFamily[],provinces:readonly NativeTerritoryProvince[],polity:NativePolity,distance:NativeProvinceDistance){
  if(!families.length)return;
  const max=Math.floor(f(provinces.length*nativeMaxProvinceRatio(polity))),byId=new Map(provinces.map(p=>[p.id,p]));
  const over=families.map((fam,i)=>({fam,i,n:fam.controlledProvinces.length})).filter(v=>v.n>max).sort((a,b)=>b.n-a.n||a.i-b.i).map(v=>v.fam),freed:NativeTerritoryProvince[]=[];
  for(const fam of over){
    const excess=fam.controlledProvinces.length-max;
    const owned=fam.controlledProvinces.map(id=>byId.get(id)!).filter(p=>p&&p.id!==fam.homeProvinceId).map((p,i)=>({p,i,d:distance(fam.homeProvinceId,p.id)})).sort((a,b)=>b.d-a.d||a.i-b.i).slice(0,excess).map(v=>v.p);
    for(const p of owned){fam.controlledProvinces.splice(fam.controlledProvinces.indexOf(p.id),1);p.familyId=0;freed.push(p);}
  }
  if(!freed.length)return;
  const under=families.map((fam,i)=>({fam,i,n:fam.controlledProvinces.length})).filter(v=>v.n<max).sort((a,b)=>a.n-b.n||a.i-b.i).map(v=>v.fam);
  for(const p of freed){let best:NativeTerritoryFamily|null=null,score=-3.4028234663852886e38;
    for(const fam of under){if(fam.controlledProvinces.length>=max)continue;const d=distance(fam.homeProvinceId,p.id),s=f(f(f(1-f(fam.controlledProvinces.length/max))*10)-f(d*f(.1)));if(s>score){score=s;best=fam;}}
    if(best)control(best,p);}
}
/** CreateNobleFamilyWithTerritory: patriarch age 25–60; 30% female inheritance. */
export function nativeNoblePatriarchAge(random:CharacterRandom){return intDraw(random,25,61);}
export function nativeNobleFemaleInheritance(random:CharacterRandom){return valueDraw(random)<f(.3);}
/** GenerateNobleFamilyMembers: spouse ±10 years (16–20 below 16), 0–2 children
 * (0–3 on the initial generation) aged head−(18..35) (0–9 if negative),
 * balancing genders; collateral members on the initial generation. */
export function nativeGenerateNobleFamilyMembers<C extends NativeFamilyMember>(head:C,family:NativeInitialFamily,stateId:number,culture:string|null,initial:boolean,p:NativeFamilyMemberPorts<C>,collateral:(head:C)=>void){
  const spouse=p.generateInit(culture,head.gender===0?1:0,null);
  if(spouse!==null){
    let age=f(f(head.age)+floatDraw(p.random,-10,10));if(age<16)age=floatDraw(p.random,16,20);
    spouse.birthTime=f(p.birthTimeFromAge(age));p.updateAge(spouse);
    spouse.stateId=stateId;head.marriageType=0;spouse.marriageType=0;spouse.familyId=family.id;spouse.lastName=p.lastName(head);
    head.spouseId=spouse.id;spouse.spouseId=head.id;family.memberIds!.push(spouse.id);
    const count=intDraw(p.random,0,(initial?1:0)+3);
    for(let i=0;i<count;i++){
      let male=0,female=0;for(const id of head.childrenIds!){const c=p.getCharacter(id);if(!c||!c.isAlive)continue;if(c.gender===0)male++;else female++;}
      const gender=male>female?1:male<female?0:valueDraw(p.random)<=f(.5)?1:0;
      const father=head.gender===0?head:spouse,mother=head.gender===1?head:spouse;
      const child=p.generateInit(family.cultureName,gender,father);if(child===null)continue;
      child.familyId=family.id;child.stateId=stateId;child.fatherId=father.id;child.motherId=mother.id;
      let childAge=f(f(head.age)-floatDraw(p.random,18,35));if(0>childAge)childAge=f(intDraw(p.random,0,10));
      child.birthTime=f(p.birthTimeFromAge(childAge));p.updateAge(child);
      family.memberIds!.push(child.id);father.childrenIds!.push(child.id);mother.childrenIds!.push(child.id);
    }
  }
  if(initial)collateral(head);
}
