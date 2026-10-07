import {beforeAll,describe,expect,it} from 'vitest';
import {War27Session} from './war27-session';
import {type War27Run} from './war27-model';
import {grid} from './fixture.test-support';
import {initialWar28,registerWar28,importUnknownWars28,nativeWar28,war28DamageSink,stateNumber,provinceNumber,reconcileParticipants28,reconcileWar28Identities,war28Months,type War28Campaign} from './war28-state';
import {assertWar28,assertWar28Schema} from './war28-validation';
import {war28Queries,type War28Policy} from './war28-query';
import {nativeArmyHit} from './native-war/battle-damage';
import {nativeDecidePeaceReason,nativeHasAutonomousDiplomacyParticipant} from './native-war/peace';
import {nativeWarScoreParts} from './native-war/score';
import {nativeBuildSettlementPlan} from './native-war/settlement-plan';
import {nativeBuildEffect} from './native-war/settlement-effects';
import {advanceCombat,initialBattles} from './war28-battle';
import {combatEfficiency} from './fiscal15-rules';
import {lossRecorder} from './war27-losses';
import {verifyWar27Compatibility} from '../../../scripts/fms-war28-compat';
const f=Math.fround,stamp=(r:War27Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
const policy:War28Policy={territoryLossThreshold:()=>.5,autonomousDiplomacy:()=>true}; // Explicit fixture policy, not a production default.
let seed:War27Run;
beforeAll(()=>{seed=new War27Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace'}).run as War27Run;});
function fixture(){
 const session=new War27Session();session.execute({type:'load',run:seed});
 const [b,a]=seed.world.nations.map(n=>n.id).sort(),r=session.execute({type:'action',action:{type:'declare-war',nationId:a,targetNationId:b},expected:stamp(seed)}).run as War27Run;
 const state=initialWar28(r),c=registerWar28(state,r,a,b,[]),q=war28Queries(r,state,policy);return {r,state,c,q,a,b};
}
function bindGoal(c:War28Campaign,r:War27Run,state:ReturnType<typeof initialWar28>,a:string,b:string,type=0){
 const target=r.world.provinces.find(p=>p.controller===b)!;
 c.goals=[{id:1,type,addedBy:stateNumber(r,a),beneficiary:stateNumber(r,a),target:stateNumber(r,b),scope:{provinceIds:[provinceNumber(state,target.id)],requiredCount:1}}];return target;
}
describe('v28 bridge over real created worlds, preserving v27',()=>{
 it('freezes all 11 v27 files and their dependency fingerprint',()=>{verifyWar27Compatibility();},30000);
 it('records actual declarer, initial participant land only, and native acquisition order',()=>{
  const {r,state,c,a,b}=fixture();expect(a>b).toBe(true);expect(c.attacker).toBe(a);expect(c.defender).toBe(b);
  expect(c.participants).toEqual([{stateId:stateNumber(r,a),side:0},{stateId:stateNumber(r,b),side:1}]);
  const order=[...r.upperCombat.nations[a].provinceOrder].reverse();r.upperCombat.nations[a].provinceOrder=order;
  const fresh=initialWar28(r),record=registerWar28(fresh,r,a,b,[]);
  expect(record.initialOwners.filter(p=>p[1]===stateNumber(r,a)).map(p=>fresh.provinceIds[p[0]-1])).toEqual(order);
  expect(c.initialOwners).toHaveLength(r.world.provinces.filter(p=>p.controller===a||p.controller===b).length);assertWar28(state,r);
 });
 it('holds original capital/ownership through conquest, migration and province array reorder',()=>{
  const {r,state,c,q,a,b}=fixture(),before=structuredClone(c),target=r.world.provinces.find(p=>p.controller===b)!;
  const pid=provinceNumber(state,target.id);target.controller=a;r.world.nations.find(n=>n.id===b)!.capitalId=r.world.cities.find(city=>city.provinceId===target.id)!.id;r.world.provinces.reverse();
  expect(q.province(pid)!.stateId).toBe(stateNumber(r,a));expect(c).toEqual(before);expect(q.state(stateNumber(r,a))!.provinces!.some(p=>p!.id===pid)).toBe(true);assertWar28(state,r);
 });
 it('imported active wars have no invented attacker, start time, snapshot or goals',()=>{
  const {r,a,b}=fixture(),s=initialWar28(r);importUnknownWars28(s,r);const c=s.campaigns[0];
  expect(c).toMatchObject({history:'unknown',attacker:null,defender:null,startTime:null,initialOwners:[],initialCapitals:[],initialProvinceCounts:[],goals:[]});
  war28DamageSink(s,r)(a,b,f(.03));expect(c.kills[0][1]).toBe(f(.03));expect(()=>nativeWar28(c)).toThrow(/缺少开战历史/);assertWar28(s,r);
 });
 it('deduplicates registration without replacing the first snapshot or adding a revision',()=>{
  const {r,state,c,a,b}=fixture(),rev=state.revision;expect(registerWar28(state,r,b,a,[])).toBe(c);expect(c.attacker).toBe(a);expect(state.revision).toBe(rev);
 });
 it('raw fractions and overkill are counted unchanged, with explicit identity never falling back',()=>{
  const {r,state,c,a,b}=fixture(),sink=war28DamageSink(state,r);sink(a,b,f(.03125));sink(a,b,400);const before=structuredClone(state);sink(a,b,100,999);expect(state).toEqual(before);expect(c.kills).toEqual([[stateNumber(r,a),f(400.03125)]]);expect(c.deaths).toEqual([[stateNumber(r,b),f(400.03125)]]);
 });
 it('selects first opposing active war only and ignores destroyed participants for new hits',()=>{
  const {r,state,c,a,b}=fixture();const later=structuredClone(c);later.id=2;state.campaigns.push(later);state.nextId=3;
  const sink=war28DamageSink(state,r);sink(a,b,1);expect(c.kills[0][1]).toBe(1);expect(later.kills).toEqual([]);
  c.destroyedParticipants.push(c.participants.pop()!);sink(a,b,2,c.id);expect(c.kills[0][1]).toBe(1);
  sink(a,b,3);expect(later.kills[0][1]).toBe(3);
 });
 it('does not partially mutate counters on revision/float overflow or invalid amount',()=>{
  const {r,state,c,a,b}=fixture(),sink=war28DamageSink(state,r);state.revision=Number.MAX_SAFE_INTEGER;let before=structuredClone(state);expect(()=>sink(a,b,1)).toThrow(/安全范围/);expect(state).toEqual(before);
  state.revision=0;c.kills=[[stateNumber(r,a),f(3.4e38)]];before=structuredClone(state);expect(()=>sink(a,b,f(3.4e38))).toThrow(/溢出/);expect(state).toEqual(before);
  for(const value of [NaN,Infinity,.1])expect(()=>sink(a,b,value)).toThrow();sink(a,b,0);expect(state).toEqual(before);
 });
 it('unknown goal data and missing identity fail before registration mutates the candidate',()=>{
  const {r,a,b}=fixture(),state=initialWar28(r),before=structuredClone(state);
  expect(()=>registerWar28(state,r,a,b,[{id:1,type:0,addedBy:stateNumber(r,a),target:stateNumber(r,b),beneficiary:stateNumber(r,a),scope:null}])).toThrow();expect(state).toEqual(before);
  r.people.nations[a].id=0;expect(()=>registerWar28(state,r,a,b,[])).toThrow(/身份/);expect(state).toEqual(before);
 });
 it('moves an extinct participant after land loss, keeping its damage and initial capital',()=>{
  const {r,state,c,a,b}=fixture();war28DamageSink(state,r)(a,b,40);const initial=structuredClone(c.initialCapitals);for(const p of r.world.provinces)if(p.controller===b)p.controller=a;reconcileParticipants28(state,r);
  expect(c.destroyedParticipants).toEqual([{stateId:stateNumber(r,b),side:1}]);expect(c.deaths).toEqual([[stateNumber(r,b),40]]);expect(c.initialCapitals).toEqual(initial);assertWar28(state,r);
  const oldId=stateNumber(r,b);delete r.people.nations[b];expect(nativeWar28(c).primaryDefenderId).toBe(oldId);
 });
 it('live query accepts a newly founded country after identity reconciliation',()=>{
  const {r,state,q,a}=fixture(),key='new-war28-state',id=400;expect(q.state(id)).toBe(null);
  r.world.nations.push({...r.world.nations[0],id:key});r.people.nations[key]={...r.people.nations[a],id};r.finance.nations[key]={...r.finance.nations[a]};r.upperCombat.nations[key]={...r.upperCombat.nations[a],provinceOrder:[]};r.world.provinces[0].controller=key;
  reconcileWar28Identities(state,r);expect(q.state(id)).not.toBe(null);expect(q.isDeadOrZero(id)).toBe(false);expect(q.state(id)!.provinces).toHaveLength(1);
 });
 it('rejects an installed history missing an active relation, before its first tick',()=>{const {r,state}=fixture();state.campaigns=[];expect(()=>assertWar28(state,r)).toThrow(/历史损坏/);});
 it('queries see current finance/ownership and require explicit diplomacy policy',()=>{
  const {r,state,q,a}=fixture(),id=stateNumber(r,a),war=nativeWar28(state.campaigns[0]);const stateRef=q.state(id)!;
  r.finance.nations[a]={...r.finance.nations[a],gold:300};expect(stateRef.gold).toBe(300);stateRef.gold=123;expect(r.finance.nations[a].gold).toBe(123);
  const off=war28Queries(r,state,{...policy,autonomousDiplomacy:()=>false});expect(nativeHasAutonomousDiplomacyParticipant(war,off)).toBe(false);expect(nativeHasAutonomousDiplomacyParticipant(war,q)).toBe(true);
  const bad=war28Queries(r,state,{...policy,territoryLossThreshold:()=>NaN});expect(()=>bad.hasStateCollapsed(war,id)).toThrow(/阈值/);
 });
 it('uses completed ISO months including leap day, never day/30',()=>{
  const {r}=fixture();r.life.startDate={year:2024,month:1,day:31};r.life.secondsPerDay=1;r.life.gameTime=28;expect(war28Months(r,0)).toBe(0);r.life.gameTime=29;expect(war28Months(r,0)).toBe(1);r.life.gameTime=59;expect(war28Months(r,0)).toBe(1);r.life.gameTime=60;expect(war28Months(r,0)).toBe(2);
 });
 it('actual land control drives goal progress and native peace after a full year',()=>{
  const {r,state,c,q,a,b}=fixture(),p=bindGoal(c,r,state,a,b);p.controller=a;r.life.secondsPerDay=1;r.life.gameTime=364;
  expect(nativeDecidePeaceReason(nativeWar28(c),q)).toBe(null);r.life.gameTime=365;const war=nativeWar28(c);expect(nativeDecidePeaceReason(war,q)).toBe(0);expect(nativeWarScoreParts(war,q).score).toBeGreaterThan(0);
  const plan=nativeBuildSettlementPlan(war,0,{...q,buildEffect:nativeBuildEffect,buildInternalPlan:()=>{throw Error('Unsupported internal war');}})!;
  expect(plan.enforcedGoals).toEqual([1]);expect(plan.transfers).toEqual([]);expect(plan.outcomes.get(stateNumber(r,a))).toBe(0);assertWar28(state,r);
 });
 it('preserves JSON entries and identical scores after serialization and replay',()=>{
  const {r,state,c,q,a,b}=fixture();war28DamageSink(state,r)(a,b,f(40/3));bindGoal(c,r,state,a,b);const restored=JSON.parse(JSON.stringify(state)) as typeof state;assertWar28(restored,r);
  expect(restored).toEqual(state);expect(nativeWarScoreParts(nativeWar28(restored.campaigns[0]),war28Queries(r,restored,policy))).toEqual(nativeWarScoreParts(nativeWar28(c),q));
  for(const s of [state,restored])war28DamageSink(s,r)(b,a,f(10/3));expect(restored).toEqual(state);
 });
 it.each(['root','campaign','participant','goal','scope'])('locks future %s fields before recovery validation',where=>{
  const {r,state,c,a,b}=fixture();bindGoal(c,r,state,a,b);const target=where==='root'?state:where==='campaign'?c:where==='participant'?c.participants[0]:where==='goal'?c.goals[0]:c.goals[0].scope!;Object.assign(target,{futureField:true});expect(()=>assertWar28Schema(state)).toThrow(/未来|未知/);
 });
 it('rejects duplicate identity, invalid snapshots and loss of land identity',()=>{
  const {r,state}=fixture();const duplicate=structuredClone(state);duplicate.nationIds.push(duplicate.nationIds[0]);expect(()=>assertWar28(duplicate,r)).toThrow();const count=structuredClone(state);count.campaigns[0].initialProvinceCounts[0][1]++;expect(()=>assertWar28(count,r)).toThrow();const before=structuredClone(state);r.world.provinces.pop();expect(()=>reconcileWar28Identities(state,r)).toThrow(/地图身份/);expect(state).toEqual(before);
 });
});
describe('v28 actual combat damage source',()=>{
 it('rounds per attack including elite and multiplier, preserving positive fractions',()=>{
  expect(nativeArmyHit(.3,3,false)).toBe(f(f(f(f(.3)*40)*1)/3));expect(nativeArmyHit(.3,3,true)).toBe(f(nativeArmyHit(.3,3,false)*f(.1)));expect(nativeArmyHit(1,2,false,40,0)).toBe(20);expect(nativeArmyHit(1,2,false,40,2)).toBe(40);expect(nativeArmyHit(.00001,3,false)).toBeGreaterThan(0);
 });
 it('records each real attack before integer carry/clamp, including lethal overkill',()=>{
  const {r,state,c,a,b}=fixture(),selected=[a,b].map(id=>r.world.armies.find(x=>x.nationId===id)!),place=r.world.provinces.find(p=>p.id===selected[0].provinceId)!;
  for(const army of r.world.armies)Object.assign(army,selected.includes(army)?{provinceId:place.id,troops:1_000_000,morale:100,supplies:100,status:'idle',route:[],progress:0}:{troops:0,status:'destroyed',route:[],progress:0});
  selected[0].troops=1;
  const terrain={...r.terrainContext,upper:r.upperCombat,finance:r.finance,people:r.people,culture:r.culture};
  const expected=selected.map(attacker=>nativeArmyHit(combatEfficiency(r.world,attacker,r.units,place,true,terrain),1,r.units[selected.find(x=>x.id!==attacker.id)!.id]==='Elite'));
  const before=structuredClone(r.world),result=advanceCombat(r.world,initialBattles(),r.units,1,()=>new Set(selected.map(x=>x.id)),terrain,lossRecorder(r.losses,r.warfare),war28DamageSink(state,r));
  expect(r.world).toEqual(before);expect(result.world.armies.find(x=>x.id===selected[0].id)!.troops).toBe(0);
  expect(new Map(c.kills).get(stateNumber(r,b))).toBe(expected[1]);expect(new Map(c.deaths).get(stateNumber(r,a))).toBe(expected[1]);expect(r.losses.nations[a].total.combat).toBe(1);expect(expected[1]*10).toBeGreaterThan(1);
 });
});
