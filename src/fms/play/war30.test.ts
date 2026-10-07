import {beforeAll,describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {War30Session} from './war30-session';
import {War29Session} from './war29-session';
import {assertWar30Run,war29View,copyWar30Candidate,type War30Run} from './war30-model';
import {previewDeclaration30,evaluateDeclaration30,refreshMilitaryTargets30} from './war30-declaration';
import {relation30,reconcileNativeDiplomacy30,advanceDiplomaticSchedule30,truce30,assertNativeDiplomacy30} from './war30-state';
import {NATIVE_INITIAL_WAR_TIME} from './native-war/diplomatic-relations';
import {lifeTime} from './life22-state';
import {isoPlusDays} from './native-economy/iso-calendar';
import {reconcileKin} from './dynasty23-state';
import {reconcileUpper} from './upper14-state';
import {reconcileWar26} from './war26-state';
import {war26Strength} from './war26-strength';
import {graphFor} from './naval-rules';
import {presentationOf} from './war30-model';
import {loadRun,saveRun} from './war30-stores';
let seed:War30Run;
const stamp=(r:War30Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
beforeAll(()=>{seed=new War30Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace'}).run as War30Run;});
const world=()=>structuredClone(seed);
function date(r:War30Run,day:number){r.world.day=day;r.clock.tick=day*120;r.life.lastTick=r.clock.tick;r.life.gameTime=lifeTime(r.life,r.clock.tick);r.life.currentDate=isoPlusDays(r.life.startDate,day);r.life.lastAgeMonth=r.life.currentDate.year*12+r.life.currentDate.month-1;for(const p of Object.values(r.life.persons))if(p.source==='native-founding')p.updatedMonth=r.life.lastAgeMonth;reconcileKin(r.kin,r);}
function declaration(){const r=world(),s=new War30Session();s.execute({type:'load',run:r});const [a,b]=r.world.nations.map(n=>n.id);return {r:s.execute({type:'action',action:{type:'declare-war',nationId:a,targetNationId:b},expected:stamp(r)}).run as War30Run,a,b,s};}
describe('v30 actual declaration and persisted diplomacy session',()=>{
 it('initializes real new-world points/times once, and leaves copied old history unknown',()=>{
  const r=world();assertWar30Run(r);for(const n of Object.values(r.nativeDiplomacy.nations)){expect(n).toMatchObject({origin:'new-world',activeTime:NATIVE_INITIAL_WAR_TIME,passiveTime:NATIVE_INITIAL_WAR_TIME,pools:{power:120,efficiency:20}});expect(n.pools.startWar).toBeGreaterThanOrEqual(0);expect(n.pools.startWar).toBeLessThanOrEqual(100);}
  const old=war29View(r),before=structuredClone(old),copy=copyWar30Candidate(old);for(const n of Object.values(copy.nativeDiplomacy.nations))expect(n).toMatchObject({origin:'explicit-copy',activeTime:null,passiveTime:null});const [a,b]=r.world.nations.map(n=>n.id);expect(relation30(copy.nativeDiplomacy,a,b)).toMatchObject({history:'unknown',lastWar:null,warCount:null});expect(old).toEqual(before);
 });
 it('preview/cancel leaves RNG, relations, all geometry and the world untouched; confirm stores the actual full goals',()=>{
  const r=world(),before=structuredClone(r),[a,b]=r.world.nations.map(n=>n.id);expect(previewDeclaration30(r,a,b).valid).toBe(true);expect(r).toEqual(before);const {r:n}=declaration();assertWar30Run(n);
  expect(n.nativeDiplomacy.declarations[0]).toMatchObject({casusBelliId:1,goals:[{primary:true,scopeType:0}]});expect(n.world.provinces).toEqual(r.world.provinces);expect(n.nativeWars.campaigns[0].history).toBe('complete');expect(relation30(n.nativeDiplomacy,a,b).warCount).toBe(0);expect(n.nativeDiplomacy.nations[a].activeTime).toBe(0);expect(n.nativeDiplomacy.nations[b].passiveTime).toBe(0);
 });
 it('rejects repeated/stale declaration and the session remains on the last valid state',()=>{
  const {r,a,b,s}=declaration();expect(()=>s.execute({type:'action',action:{type:'declare-war',nationId:a,targetNationId:b},expected:stamp(r)})).toThrow(/已交战/);expect(()=>s.execute({type:'tick',ticks:1,expected:{...stamp(r),nextEventId:0}})).toThrow(/时刻/);const n=s.execute({type:'tick',ticks:1,expected:stamp(r)}).run as War30Run;expect(n.nativeDiplomacy.declarations).toEqual(r.nativeDiplomacy.declarations);
 });
 it('records a war END once and enforces 3/6/9/12-year growth, never incrementing on start',()=>{
  const {r,a,b,s}=declaration(),n=s.execute({type:'action',action:{type:'make-peace',nationId:a,targetNationId:b},expected:stamp(r)}).run as War30Run;const p=relation30(n.nativeDiplomacy,a,b);expect(p).toMatchObject({warCount:1,lastWar:0,endedWarIds:[1]});const before=structuredClone(n);reconcileNativeDiplomacy30(n.nativeDiplomacy,n);expect(n).toEqual(before);expect(previewDeclaration30(n,a,b)).toMatchObject({valid:false});expect(truce30(n,p).required).toBe(3);for(const [count,years]of [[2,6],[3,9],[4,12],[20,12]])expect(truce30(n,{...p,warCount:count}).required).toBe(years);assertWar30Run(n);
 });
 it('preserves unknown old counts after an actually observed end and across two saves',async()=>{
  const {r,a,b}=declaration(),old=war29View(r),copy=copyWar30Candidate(old),s=new War30Session();s.execute({type:'load',run:copy});const n=s.execute({type:'action',action:{type:'make-peace',nationId:a,targetNationId:b},expected:stamp(copy)}).run as War30Run;
  expect(relation30(n.nativeDiplomacy,a,b)).toMatchObject({history:'unknown',warCount:null,lastWar:0,endedWarIds:[1]});expect(truce30(n,relation30(n.nativeDiplomacy,a,b)).required).toBe(12);const db=new IDBFactory();await saveRun(n,null,db);await saveRun(n,1,db);expect((await loadRun(db))!.run).toEqual(n);expect(old.nativeWars.campaigns[0].endedTick).toBeNull();
 });
 it('runs exactly once on assigned monthly days, keeps accumulating while autonomous diplomacy is off, and resumes identical RNG from storage',async()=>{
  const r=world();r.diplomacy.worldAuto=false;const before=structuredClone(r.nativeDiplomacy),called:string[]=[];
  for(let day=1;day<=62;day++){date(r,day);advanceDiplomaticSchedule30(r.nativeDiplomacy,r,id=>{called.push(id);evaluateDeclaration30(r,id);});advanceDiplomaticSchedule30(r.nativeDiplomacy,r,id=>called.push('duplicate:'+id));}
  expect(called).toHaveLength(r.world.nations.length);for(const [id,n]of Object.entries(r.nativeDiplomacy.nations)){expect(n.pools.power).toBe(140);expect(n.pools.startWar).toBe(Math.fround(before.nations[id].pools.startWar+20));}expect(r.nativeWars.campaigns).toHaveLength(0);assertNativeDiplomacy30(r.nativeDiplomacy,r);
  const db=new IDBFactory();await saveRun(r,null,db);const restored=(await loadRun(db))!.run as War30Run;for(let day=63;day<=93;day++)for(const n of [r,restored]){date(n,day);advanceDiplomaticSchedule30(n.nativeDiplomacy,n,()=>{});}expect(restored).toEqual(r);
 });
 it('actually chooses and starts a supported war from native points/neighbor/strength queries',()=>{
  const r=world(),a=r.world.nations[0].id;for(const army of r.world.armies)army.troops=army.nationId===a?1000000:10;r.nativeDiplomacy.nations[a].pools.startWar=120;r.nativeDiplomacy.nations[a].expansionism=6;
  const result=evaluateDeclaration30(r,a);expect(result).not.toBeNull();expect(r.nativeDiplomacy.nations[a].pools.startWar).toBe(0);expect(r.nativeDiplomacy.declarations).toHaveLength(1);expect([1,2,6]).toContain(r.nativeDiplomacy.declarations[0].casusBelliId);expect(r.world.statecraft!.relations.some(p=>p.status==='war')).toBe(true);assertWar30Run(r);
 });
 it('keeps point pools when automatic diplomacy is off and halves a failed eligible attempt',()=>{
  const r=world(),id=r.world.nations[0].id;r.nativeDiplomacy.nations[id].pools.startWar=120;r.diplomacy.worldAuto=false;expect(evaluateDeclaration30(r,id)).toBeNull();expect(r.nativeDiplomacy.nations[id].pools.startWar).toBe(120);r.diplomacy.worldAuto=true;r.nativeDiplomacy.nations[id].activeTime=0;expect(evaluateDeclaration30(r,id)).toBeNull();expect(r.nativeDiplomacy.nations[id].pools.startWar).toBe(60);
 });
 it('disables both legacy autonomous declaration paths and preserves split tick determinism',()=>{
  const r=world();r.diplomacy.worldAuto=false;const one=new War30Session(),many=new War30Session();one.execute({type:'load',run:r});many.execute({type:'load',run:r});const n=one.execute({type:'tick',ticks:120,expected:stamp(r)}).run as War30Run;let split=r;for(let i=0;i<3;i++)split=many.execute({type:'tick',ticks:40,expected:stamp(split)}).run as War30Run;expect(n).toEqual(split);expect(n.nativeWars.campaigns).toHaveLength(0);expect(n.nativeDiplomacy.lastDay).toBe(1);
 });
 it('keeps frozen v29 behavior and settings in its own session',()=>{
  const old=war29View(world()),a=new War30Session(),b=new War29Session();a.execute({type:'load',run:old});b.execute({type:'load',run:old});const command={type:'diplomacy-settings' as const,edit:{scope:'world' as const,enabled:false},runId:old.id,revision:old.diplomacy.revision,expected:stamp(world())};expect(a.execute(command)).toEqual(b.execute(command));
 });
 it('owns its installed geometry privately; returned snapshots cannot bypass load/save validation',()=>{
  const r=world(),s=new War30Session(),loaded=s.execute({type:'load',run:r}).run as War30Run;
  loaded.diplomaticGeography.water[0].faces.pop();loaded.terrain.elevations[0]=100;loaded.world.provinces[0].polygon[0].x+=100;
  const next=s.execute({type:'tick',ticks:1,expected:stamp(r)}).run as War30Run;expect(next.diplomaticGeography).toEqual(r.diplomaticGeography);expect(next.terrain).toEqual(r.terrain);assertWar30Run(next);expect(()=>s.execute({type:'load',run:loaded})).toThrow();
 });
 it('rejects corrupted full declaration fields, unknown future state and invalid timestamps',()=>{
  const {r}=declaration();for(const mutate of [(n:War30Run)=>n.nativeDiplomacy.declarations[0].goals[0].primary=false,(n:War30Run)=>Object.assign(n.nativeDiplomacy,{future:1}),(n:War30Run)=>n.nativeDiplomacy.nations[n.world.nations[0].id].activeTime=10000]){const n=structuredClone(r);mutate(n);expect(()=>assertWar30Run(n)).toThrow();}
 });
 it('clears consumed fronts without changing the complete diplomatic scope or inventing a land connection',()=>{
  const {r,a,b}=declaration(),d=structuredClone(r.nativeDiplomacy.declarations[0]);for(const p of r.world.provinces)if(d.goals[0].scope!.provinceIds!.includes(r.nativeWars.provinceIds.indexOf(p.id)+1))p.controller=a;reconcileUpper(r,r.upperCombat);reconcileWar26(r.world,r.warfare,graphFor(presentationOf(r)),r.clock.tick,(w,id)=>war26Strength(w,r,id));refreshMilitaryTargets30(r);expect(r.nativeDiplomacy.declarations[0]).toEqual(d);expect(r.warfare.campaigns[0].goals.find(p=>p.nationId===a&&p.enemyId===b)?.provinceIds).toEqual([]);
 });
});
