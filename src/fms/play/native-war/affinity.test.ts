import {describe,it,expect,vi} from 'vitest';
import {createNativeAffinityCaches,nativeDiplomaticAffinity,nativePoliticalSystemAffinity,nativeUpdateDiplomaticCaches,type NativeAffinityState,type NativeAffinityLeader,type NativeAffinityQueries} from './affinity';
import {nativeDiplomaticPairKey,nativeGetDiplomaticRelation,nativeTruceYears,NATIVE_INITIAL_WAR_TIME,type NativeDiplomaticRelation} from './diplomatic-relations';
import {nativeGetDate,nativeGetMonthSince} from '../native-economy/character-calendar';
import {createNativeIsoCalendar,isoDate,ISO_MIN_DATE} from '../native-economy/iso-calendar';

function fixture(){
 const state=(id:number):NativeAffinityState=>({id,neighbors:new Set(),features:new Set([id]),culture:id,politicalSystem:99,provinceCount:20,alliance:null});
 const a=state(1),b=state(2),relation={state1Id:1,state2Id:2,lastWar:-200,warCount:0},c=createNativeAffinityCaches();
 // Explicit input ports isolate terms: no war, three elapsed years, two-year
 // truce. Baseline is non-neighbor +25 and no overlapping feature -10 = 15.
 const q:NativeAffinityQueries<NativeAffinityState,NativeAffinityLeader>={isSuperPower:()=>false,superSuperpowerExists:()=>false,nearSea:()=>false,intersectLands:()=>false,atWar:()=>false,enemies:()=>[],leader:()=>null,diplomaticSkill:()=>50,relation:()=>relation,yearsSinceWar:()=>3,truceYears:()=>2,minimumYearsBeforeNewWar:3};
 return {a,b,c,q,relation};
}
describe('native directional affinity and transient caches',()=>{
 it('applies superpower, enclosure, enclave and shared feature penalties without final clamping',()=>{
  const {a,b,c,q}=fixture();a.neighbors=new Set([2]);b.neighbors=new Set([1]);b.features=a.features;
  expect(nativeDiplomaticAffinity(a,b,c,{...q,isSuperPower:()=>true,intersectLands:()=>true})).toBe(-650);
 });
 it('a dominating third country adds 25 only when neither participant is a superpower',()=>{
  const t=fixture();expect(nativeDiplomaticAffinity(t.a,t.b,t.c,{...t.q,superSuperpowerExists:()=>true})).toBe(40);
  nativeUpdateDiplomaticCaches(t.c,true,false);expect(nativeDiplomaticAffinity(t.a,t.b,t.c,{...t.q,isSuperPower:s=>s===t.a,superSuperpowerExists:()=>true})).toBe(-85);
 });
 it('coast access prevents enclosure penalty and missing land-border does not manufacture it',()=>{
  const t=fixture();t.b.neighbors=new Set([1]);expect(nativeDiplomaticAffinity(t.a,t.b,t.c,{...t.q,nearSea:()=>true})).toBe(15);
 });
 it('war adds -500 and marks same-war without querying enemy intersection or treaty years',()=>{
  const t=fixture(),enemies=vi.fn(t.q.enemies),years=vi.fn(t.q.yearsSinceWar);expect(nativeDiplomaticAffinity(t.a,t.b,t.c,{...t.q,atWar:()=>true,enemies,yearsSinceWar:years})).toBe(-485);
  expect(t.c.sameWar.get(nativeDiplomaticPairKey(1,2))).toBe(true);expect(enemies).not.toHaveBeenCalled();expect(years).not.toHaveBeenCalled();
 });
 it('common enemies compare State identity and fully enumerate the second set before the first',()=>{
  const t=fixture(),shared={...t.a,id:9},calls:string[]=[];
  const enemies=(s:NativeAffinityState)=>{calls.push(`get:${s.id}`);return{*[Symbol.iterator](){calls.push(`iterate:${s.id}`);yield shared;}};};
  expect(nativeDiplomaticAffinity(t.a,t.b,t.c,{...t.q,enemies})).toBe(65);expect(calls).toEqual(['get:1','get:2','iterate:2','iterate:1']);
  nativeUpdateDiplomaticCaches(t.c,true,false);expect(nativeDiplomaticAffinity(t.a,t.b,t.c,{...t.q,enemies:()=>[{...shared}]})).toBe(15);
 });
 it('takes first positive SocialButterfly bonus even for a dead leader, reading current leader again for skill',()=>{
  const t=fixture(),leader=vi.fn(()=>({alive:false,traits:[{name:'SocialButterfly',relationshipBonus:0},{name:'Other',relationshipBonus:500},{name:'SocialButterfly',relationshipBonus:7},{name:'SocialButterfly',relationshipBonus:90}]}));
  const skill=vi.fn(()=>100);expect(nativeDiplomaticAffinity(t.a,t.b,t.c,{...t.q,leader,diplomaticSkill:skill})).toBe(22);expect(leader).toHaveBeenCalledTimes(2);expect(skill).not.toHaveBeenCalled();
 });
 it('truncates signed province count difference toward zero before the -20..0 clamp',()=>{
  const t=fixture();t.a.provinceCount=16;expect(nativeDiplomaticAffinity(t.a,t.b,t.c,t.q)).toBe(15);
  nativeUpdateDiplomaticCaches(t.c,true,false);t.a.provinceCount=9;expect(nativeDiplomaticAffinity(t.a,t.b,t.c,t.q)).toBe(13);
  nativeUpdateDiplomaticCaches(t.c,true,false);t.b.provinceCount=300;expect(nativeDiplomaticAffinity(t.a,t.b,t.c,t.q)).toBe(-5);
 });
 it('caps long-peace affinity BEFORE alliance/truce/government/living-leader additions',()=>{
  const t=fixture();t.a.culture=t.b.culture;t.a.alliance=t.b.alliance={};t.a.politicalSystem=0;t.b.politicalSystem=1;
  const years=vi.fn(()=>4),q={...t.q,yearsSinceWar:years,truceYears:()=>6,leader:()=>({alive:true,traits:null}),diplomaticSkill:()=>70};
  expect(nativeDiplomaticAffinity(t.a,t.b,t.c,q)).toBe(160);expect(years).toHaveBeenCalledTimes(2);
 });
 it('retains first-query direction in an unordered key until actual unpaused frame cache clear',()=>{
  const t=fixture();t.a.politicalSystem=0;t.b.politicalSystem=1;
  expect(nativeDiplomaticAffinity(t.a,t.b,t.c,t.q)).toBe(5);expect(nativeDiplomaticAffinity(t.b,t.a,t.c,t.q)).toBe(5);
  nativeUpdateDiplomaticCaches(t.c,true,true);nativeUpdateDiplomaticCaches(t.c,false,false);expect(nativeDiplomaticAffinity(t.b,t.a,t.c,t.q)).toBe(5);
  nativeUpdateDiplomaticCaches(t.c,true,false);expect(nativeDiplomaticAffinity(t.b,t.a,t.c,t.q)).toBe(30);expect(t.c.affinity.size).toBe(1);
 });
 it('does not overwrite duplicate native same-war cache entries or query on affinity hit',()=>{
  const t=fixture(),key=nativeDiplomaticPairKey(1,2);t.c.sameWar.set(key,false);expect(()=>nativeDiplomaticAffinity(t.a,t.b,t.c,{...t.q,atWar:()=>true})).toThrow(/duplicate cache/);
  t.c.affinity.set(key,123);const read=vi.fn(()=>true);expect(nativeDiplomaticAffinity(t.a,t.b,t.c,{...t.q,isSuperPower:read})).toBe(123);expect(read).not.toHaveBeenCalled();
 });
 it('keeps the complete directed six-government matrix',()=>{
  const matrix=Array.from({length:6},(_,a)=>Array.from({length:6},(_,b)=>nativePoliticalSystemAffinity(a,b)));
  expect(matrix).toEqual([[10,-10,10,10,0,5],[15,-30,-20,-20,0,0],[10,-20,20,20,-10,-20],[10,-20,20,20,-10,-20],[0,-10,-10,-10,25,0],[10,-10,-10,-10,0,-20]]);
  expect(nativePoliticalSystemAffinity(6,0)).toBe(0);expect(nativePoliticalSystemAffinity(0,-1)).toBe(0);
 });
});

describe('native relation creation and history clocks',()=>{
 it('reuses unordered identity and creates -200 history, not a war at founding time',()=>{
  const rows:NativeDiplomaticRelation[]=[],index=new Map<bigint,NativeDiplomaticRelation|null>(),first=nativeGetDiplomaticRelation(9,2,rows,index);
  expect(first).toEqual({state1Id:2,state2Id:9,lastWar:-200,warCount:0});expect(nativeGetDiplomaticRelation(2,9,rows,index)).toBe(first);expect(rows).toEqual([first]);
 });
 it('keeps native append-before-Add failure visible rather than repairing a null dictionary value',()=>{
  const rows:NativeDiplomaticRelation[]=[],index=new Map<bigint,NativeDiplomaticRelation|null>([[nativeDiplomaticPairKey(1,2),null]]);
  expect(()=>nativeGetDiplomaticRelation(1,2,rows,index)).toThrow(/duplicate relation/);expect(rows).toHaveLength(1);expect(index.get(nativeDiplomaticPairKey(1,2))).toBeNull();
 });
 it('uses growing whole-year truces and ties-to-even setting conversion',()=>{
  expect([0,1,2,3,4,8].map(warCount=>nativeTruceYears({warCount},3))).toEqual([3,3,6,9,12,12]);
  expect(nativeTruceYears(null,2.5)).toBe(2);expect(nativeTruceYears({warCount:2},3.5)).toBe(8);
 });
 it('initial war clock has the recovered double bits and clamps through the existing actual calendar',()=>{
  const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,NATIVE_INITIAL_WAR_TIME,true);expect(bits.getBigUint64(0,true)).toBe(0xffdfffffffffffffn);
  const calendar=createNativeIsoCalendar(isoDate(1,1,1));expect(nativeGetDate(NATIVE_INITIAL_WAR_TIME,.1,calendar)).toEqual(ISO_MIN_DATE);expect(nativeGetMonthSince(NATIVE_INITIAL_WAR_TIME,0,.1,calendar)).toBe(119988);
  expect(nativeGetMonthSince(0,0,.1,calendar)).toBe(0);
 });
});
