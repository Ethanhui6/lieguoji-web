import {beforeAll,describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {War27Session} from './war27-session';
import {War26Session} from './war26-session';
import {assertWar27Run,war26View,presentationOf,type War27Run} from './war27-model';
import {lossRecorder,reconcileLosses,assertLosses,zeroLosses} from './war27-losses';
import {runStore,loadRun,saveRun} from './war27-stores';
import {WAR27_DATABASE} from './war27-storage';
import {WAR26_DATABASE} from './war26-storage';
import {fingerprintWar27,verifyWar26Compatibility} from '../../../scripts/fms-war27-fingerprint';
import {grid} from './fixture.test-support';
import {graphFor} from './naval-rules';
import {advanceTacticsSeaTick} from './war27-sea';
import {createMilitaryCore} from './war27-core';
import {previewBattle,applyBattle} from './war27-battle';
import type {BattleState} from './war27-battle';
const stamp=(r:War27Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
let seed:War27Run;
beforeAll(()=>{seed=new War27Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace'}).run as War27Run;});
function declared(){const s=new War27Session();s.execute({type:'load',run:seed});const a=seed.world.nations[0].id,b=seed.world.nations[1].id,r=s.execute({type:'action',action:{type:'declare-war',nationId:a,targetNationId:b},expected:stamp(seed)}).run as War27Run;return {s,r,a,b};}
async function slots(db:IDBFactory,name:string,mutate?:(store:IDBObjectStore)=>void){return new Promise<unknown[]>((resolve,reject)=>{const q=db.open(name);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves',mutate?'readwrite':'readonly'),store=t.objectStore('saves');mutate?.(store);const result=store.getAll();t.oncomplete=()=>{resolve(result.result);d.close();};t.onabort=()=>reject(t.error);};});}
describe('v27 loss ledger over actual execution',()=>{
 it('freezes the v26 execution and uses an independent version and store',()=>{verifyWar26Compatibility();expect(fingerprintWar27()).toBe(__FMS_WAR27_ENGINE__);assertWar27Run(seed);expect(runStore(seed)).toBe(29);expect(seed.losses.originTick).toBe(0);expect(seed.losses.source).toBe('new-world');},30000);
 it('counts actual simultaneous land deductions even before the engagement ends',()=>{
  const {s,r,a,b}=declared(),selected=[a,b].map(id=>r.world.armies.find(x=>x.nationId===id)!);const place=selected[0].provinceId;
  for(const army of r.world.armies)Object.assign(army,selected.includes(army)?{provinceId:place,troops:10000,morale:100,supplies:100,status:'idle',route:[],progress:0}:{troops:0,status:'destroyed',route:[],progress:0});
  s.execute({type:'load',run:r});const n=s.execute({type:'tick',ticks:100,expected:stamp(r)}).run as War27Run;
  for(const army of selected){const loss=n.losses.nations[army.nationId].total;expect(loss.combat).toBeGreaterThan(0);expect(loss.combat+loss.pursuit+loss.rout).toBe(10000-n.world.armies.find(x=>x.id===army.id)!.troops);}
  expect(r.losses.nations[a].total).toEqual(zeroLosses());assertWar27Run(n);
 });
 it('does not multiply a multi-country loss into several wars, or invent an enemy for fractional carry',()=>{
  const {r,a,b}=declared(),third=r.world.nations[2].id,record=lossRecorder(r.losses,r.warfare);record(a,'combat',101,[b,third]);record(a,'combat',7,[]);record(a,'combat',23,[b,b]);
  expect(r.losses.nations[a].total.combat).toBe(131);expect(r.losses.nations[a].unassigned.combat).toBe(108);expect(r.losses.campaigns[r.warfare.campaigns[0].id].losses[a].combat).toBe(23);assertWar27Run(r);
 });
 it('separates a no-exit rout from actual combat deductions',()=>{const {r,a}=declared(),army=r.world.armies.find(x=>x.nationId===a)!;for(const p of r.world.provinces)p.controller=r.world.nations[1].id;const amount=army.troops;createMilitaryCore(r.units,true,true,undefined,undefined,undefined,lossRecorder(r.losses,r.warfare)).forceRetreat(r.world,army);expect(army.troops).toBe(0);expect(r.losses.nations[a].total.rout).toBe(amount);expect(r.losses.nations[a].total.combat).toBe(0);expect(r.losses.nations[a].unassigned.rout).toBe(amount);});
 it('does not record preview loss, and records a real manual edge retreat only once',()=>{
  const {r,a,b}=declared(),army=r.world.armies.find(x=>x.nationId===a)!,enemy=r.world.armies.find(x=>x.nationId===b)!,from=r.world.provinces.find(p=>p.neighbors.length)!,to=r.world.provinces.find(p=>p.id===from.neighbors[0])!;
  Object.assign(army,{provinceId:from.id,route:[to.id],progress:.4,status:'fighting',troops:1000});Object.assign(enemy,{provinceId:to.id,route:[from.id],progress:.6,status:'fighting'});
  const state:BattleState={version:1,nextId:2,plans:{},engagements:[{id:'engagement-1',a:from.id,b:to.id,t:.4,armies:[army.id,enemy.id],started:0,pulse:0,carry:{[army.id]:0,[enemy.id]:0},losses:{[army.id]:0,[enemy.id]:0}}]},action={type:'withdraw' as const,armyId:army.id};
  expect(previewBattle(r.world,state,r.units,action).valid).toBe(true);expect(r.losses.nations[a].total.pursuit).toBe(0);const moved=applyBattle(r.world,state,r.units,action,lossRecorder(r.losses,r.warfare));expect(moved.world.armies.find(x=>x.id===army.id)!.troops).toBe(975);expect(r.losses.nations[a].total.pursuit).toBe(25);expect(()=>applyBattle(moved.world,moved.battles,r.units,action,lossRecorder(r.losses,r.warfare))).toThrow();expect(r.losses.nations[a].total.pursuit).toBe(25);
 });
 it('records both sides of a lethal naval round, and the remaining cargo exactly once',()=>{
  const {r,a,b}=declared(),view=presentationOf(r);if(view.version!==8)throw Error('view');const g=graphFor(view),node=g.ports[0].node;
  view.navy.fleets=[a,b].map((nationId,i)=>({id:`fleet-${i}`,name:'Test fleet',nationId,ships:1,crew:40,food:2400,node,route:[],progress:0,dockId:null,targetId:null,patrol:false,status:'anchored'}));
  view.maritime={version:1,hulls:{'fleet-0':4,'fleet-1':4},contacts:[{a:'fleet-0',b:'fleet-1',started:0,pulse:0}],retreating:{}};
  const army=view.world.armies.find(x=>x.nationId===a)!;view.world.armies=view.world.armies.filter(x=>x.id!==army.id);view.transports.cargo=[{fleetId:'fleet-0',fromPortId:g.ports[0].id,targetPortId:null,army:{...army,troops:500},unit:view.units[army.id]}];
  const advance=(run:typeof view)=>advanceTacticsSeaTick(run,g,base=>({...base,clock:{version:1,tick:base.clock.tick+30}}),lossRecorder(r.losses,r.warfare));const n=advance(view);
  for(const id of [a,b]){expect(r.losses.nations[id].total.hull).toBe(4);expect(r.losses.nations[id].total.crew).toBe(40);expect(r.losses.nations[id].total.ships).toBe(1);}expect(r.losses.nations[a].total.cargo).toBe(500);expect(n.transports.cargo).toEqual([]);advance(n);expect(r.losses.nations[a].total.cargo).toBe(500);
 });
 it('failed damage accounting discards the whole candidate, including simulated movement',()=>{const {s,r,a,b}=declared(),soldiers=[a,b].map(id=>r.world.armies.find(x=>x.nationId===id)!);for(const army of soldiers)Object.assign(army,{provinceId:soldiers[0].provinceId,status:'idle',route:[],progress:0,troops:10000,morale:100,supplies:100});r.losses.revision=Number.MAX_SAFE_INTEGER;s.execute({type:'load',run:r});expect(()=>s.execute({type:'tick',ticks:100,expected:stamp(r)})).toThrow(/安全范围/);const n=s.execute({type:'voyage-auto',nationId:a,enabled:false,expected:stamp(r)}).run as War27Run;expect(n.losses).toEqual(r.losses);expect(n.world).toEqual(r.world);expect(n.clock).toEqual(r.clock);});
 it('new records after copying are partial, historical closed wars stay unknown, old run and DB continue unchanged',async()=>{
  const {r}=declared(),old=war26View(r),s=new War27Session(),baseline=new War26Session(),db=new IDBFactory();await saveRun(old,null,db);const before=await slots(db,WAR26_DATABASE);s.execute({type:'load',run:old});baseline.execute({type:'load',run:old});const cmd={type:'tick' as const,ticks:12,expected:stamp(r)};expect(s.execute(cmd)).toEqual(baseline.execute(cmd));
  const copy=s.execute({type:'copy',run:old}).run as War27Run;expect(copy.losses.source).toBe('copy');expect(Object.values(copy.losses.campaigns)[0].history).toBe('since-copy');expect(copy.id).not.toBe(old.id);await saveRun(copy,null,db);expect(await slots(db,WAR26_DATABASE)).toEqual(before);
  const ended=structuredClone(old);ended.warfare.campaigns[0].endedTick=0;ended.world.statecraft!.relations.find(x=>x.status==='war')!.status='peace';const archived=s.execute({type:'copy',run:ended}).run as War27Run;expect(Object.values(archived.losses.campaigns)[0].history).toBe('unknown');
 });
 it('saves counters, restores identical continuation and rejects CAS conflicts',async()=>{const {r,a}=declared(),db=new IDBFactory();lossRecorder(r.losses,r.warfare)(a,'combat',55,[]);await saveRun(r,null,db);const loaded=(await loadRun(db))!.run;expect(loaded).toEqual(r);const s=new War27Session(),t=new War27Session();s.execute({type:'load',run:r});t.execute({type:'load',run:loaded});expect(s.execute({type:'tick',ticks:10,expected:stamp(r)})).toEqual(t.execute({type:'tick',ticks:10,expected:stamp(r)}));await expect(saveRun(r,null,db)).rejects.toThrow(/另一窗口/);});
 it.each(['current','backup'])('locks future nested loss fields in %s before any recovery or write',async slot=>{const {r}=declared(),db=new IDBFactory();await saveRun(r,null,db);await saveRun(r,1,db);await slots(db,WAR27_DATABASE,s=>{const q=s.get(slot);q.onsuccess=()=>{q.result.run.losses.nations[r.world.nations[0].id].total.futureKills=3;s.put(q.result,slot);};});const before=await slots(db,WAR27_DATABASE);await expect(loadRun(db)).rejects.toThrow(/未来|未知/);await expect(saveRun(r,2,db)).rejects.toThrow(/未来|未知/);expect(await slots(db,WAR27_DATABASE)).toEqual(before);});
 it('recovers a damaged main ledger, then preserves it through two subsequent saves',async()=>{const {r,a}=declared(),db=new IDBFactory();lossRecorder(r.losses,r.warfare)(a,'combat',41);await saveRun(r,null,db);await saveRun(r,1,db);await slots(db,WAR27_DATABASE,s=>{const q=s.get('current');q.onsuccess=()=>s.put({...q.result,checksum:'bad'},'current');});const recovered=(await loadRun(db))!;expect(recovered.recovered).toBe(true);expect(recovered.run).toEqual(r);await saveRun(recovered.run,2,db);await saveRun(recovered.run,3,db);expect((await loadRun(db))!.run).toEqual(r);});
 it('prunes only campaign rows pruned by warfare while keeping lifetime totals',()=>{const {r,a}=declared();lossRecorder(r.losses,r.warfare)(a,'combat',10);r.warfare.campaigns=[];reconcileLosses(r.losses,r.world,r.warfare,0);expect(r.losses.campaigns).toEqual({});expect(r.losses.nations[a].total.combat).toBe(10);assertLosses(r.losses,r.world,r.warfare,0);});
 it('rejects impossible, missing and overflowing values without partial counter mutation',()=>{const {r,a}=declared(),record=lossRecorder(r.losses,r.warfare);r.losses.nations[a].total.combat=Number.MAX_SAFE_INTEGER;const before=structuredClone(r.losses);expect(()=>record(a,'combat',1)).toThrow(/安全范围/);expect(r.losses).toEqual(before);for(const value of [-1,1.5,NaN])expect(()=>record(a,'combat',value)).toThrow();delete (r.losses.nations[a].total as Partial<typeof r.losses.nations[string]['total']>).hull;expect(()=>assertWar27Run(r)).toThrow();});
});
