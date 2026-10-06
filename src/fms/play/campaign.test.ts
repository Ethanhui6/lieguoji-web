import {describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {CampaignSession} from './campaign-session';
import {TacticsSession} from './tactics-session';
import {assertCampaign,tacticsView,withCampaign,type CampaignRun} from './campaign-model';
import {maritimeView} from './tactics-model';
import {advanceCampaignTick} from './campaign-runtime';
import {graphFor} from './naval-rules';
import {reorganizationDuration,reorganizationStrength,progressReorganization,startReorganization} from './reorganization';
import {loadRun,saveRun,runStore} from './campaign-stores';
import {CAMPAIGN_DATABASE} from './campaign-storage';
import {TACTICS_DATABASE} from './tactics-storage';
const terrain=()=>grid((x,y)=>x>=30&&x<=210&&y>=30&&y<=200?45:0);
const stamp=(r:CampaignRun)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
function fixture(){return withCampaign(new TacticsSession().execute({type:'create',terrain:terrain(),count:4,relations:'war'}).run as ReturnType<typeof tacticsView>);}
function encounter(){
 const r=fixture(),w=r.world,p=w.provinces.find(p=>p.neighbors.some(id=>w.provinces.find(v=>v.id===id)!.controller!==p.controller))!,q=w.provinces.find(v=>p.neighbors.includes(v.id)&&v.controller!==p.controller)!,a=w.armies.find(a=>a.nationId===p.controller)!,b=w.armies.find(b=>b.nationId===q.controller)!;
 w.armies=[a,b];r.units={[a.id]:'Infantry',[b.id]:'Infantry'};r.tactics.forces=Object.fromEntries(w.armies.map(a=>[a.id,r.tactics.forces[a.id]]));
 p.controller=p.legalOwner=a.nationId;q.controller=q.legalOwner=b.nationId;p.terrain=q.terrain='plain';r.tactics.forces[a.id].homeId=p.id;r.tactics.forces[b.id].homeId=q.id;
 Object.assign(a,{provinceId:p.id,originId:p.id,route:[q.id],progress:.499,status:'marching',troops:100,morale:80,supplies:100});Object.assign(b,{provinceId:q.id,originId:q.id,route:[p.id],progress:.499,status:'marching',troops:2000,morale:80,supplies:100});
 r.tactics.rounds={[a.id]:1,[b.id]:1};r.battles.plans[a.id]={path:[p.id,q.id],targets:[q.id]};assertCampaign(r);return {r,a,b,p,q};
}
function ticks(r:CampaignRun,n:number){const g=graphFor(maritimeView(tacticsView(r)));for(let i=0;i<n;i++)r=advanceCampaignTick(r,g);return r;}
function peace(r:CampaignRun){r.world.statecraft!.relations.forEach(r=>r.status='peace');for(const a of r.world.armies){a.status='idle';a.progress=0;a.route=[];}r.battles.engagements=[];r.battles.plans={};r.tactics.rounds={};r.occupation.sieges=[];}
async function slots(db:IDBFactory,name:string){return new Promise<unknown[]>((resolve,reject)=>{const q=db.open(name);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves'),r=t.objectStore('saves').getAll();r.onsuccess=()=>resolve(r.result);t.oncomplete=()=>d.close();};});}
async function change(db:IDBFactory,key:string,edit:(value:{run:CampaignRun;checksum:string})=>void){await new Promise<void>((resolve,reject)=>{const q=db.open(CAMPAIGN_DATABASE);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves','readwrite'),s=t.objectStore('saves'),r=s.get(key);r.onsuccess=()=>{edit(r.result);s.put(r.result,key);};t.oncomplete=()=>{d.close();resolve();};t.onerror=()=>reject(t.error);};});}
describe('v10 source-backed defeated legion reorganization',()=>{
 it('creates v10 and leaves loaded v9 execution and stop-on-battle feedback identical',()=>{
  const s=new CampaignSession(),created=s.execute({type:'create',terrain:terrain(),count:4,relations:'war'}).run;expect(created.version).toBe(10);expect(runStore(created)).toBe(12);
  const old=tacticsView(encounter().r),legacy=new TacticsSession();legacy.execute({type:'load',run:old});s.execute({type:'load',run:old});const c={type:'tick' as const,ticks:30,expected:{day:old.world.day,nextEventId:old.world.nextEventId,tick:old.clock.tick},pauseOnBattle:true};
  c.expected={day:old.world.day,nextEventId:old.world.nextEventId,tick:old.clock.tick};expect(s.execute(c)).toEqual(legacy.execute(c));
 });
 it.each(['regular','manual'] as const)('returns a defeated %s army from a real open-road battle to home at 10 percent, same identity',kind=>{
  const {r,a,p}=encounter();r.tactics.forces[a.id].kind=kind;const before=structuredClone(r),n=ticks(r,1),returned=n.world.armies.find(v=>v.id===a.id)!;
  expect(n.world.events.some(e=>e.kind==='battle'&&e.text.includes('遭遇'))).toBe(true);expect(returned).toMatchObject({id:a.id,name:a.name,provinceId:p.id,originId:p.id,status:'idle',progress:0,route:[],troops:Math.floor(reorganizationStrength(n,p.id)*.1)});
  expect(n.reorganization.active[a.id]).toEqual({startedTick:1,fraction:0});expect(n.tactics.rounds[a.id]).toBeUndefined();expect(n.battles.plans[a.id]).toBeUndefined();expect(r).toEqual(before);assertCampaign(n);
 });
 it.each(['emergency','lost-home','home-quota'] as const)('keeps the real loss when excluded by %s',reason=>{
  const {r,a,b,p}=encounter();if(reason==='emergency')r.tactics.forces[a.id].kind='emergency';if(reason==='lost-home')p.controller=b.nationId;if(reason==='home-quota'){const c={...structuredClone(a),id:'other-home-army',route:[],progress:0,status:'idle' as const};r.world.armies.push(c);r.units={...r.units,[c.id]:'Infantry'};r.tactics.forces[c.id]={...r.tactics.forces[a.id]};}
  const n=ticks(r,1);expect(n.world.armies.find(v=>v.id===a.id)!.status).toBe('destroyed');expect(n.reorganization.active[a.id]).toBeUndefined();assertCampaign(n);
 });
 it('uses the native population duration and fractional strength, without an up-front population or grain debit',()=>{
  expect([0,1300,25000,50000].map(reorganizationDuration)).toEqual([20,19.48,10,10]);const {r,a,p}=encounter(),n=ticks(r,1);peace(n);const pop=n.world.statecraft!.provinces.find(l=>l.provinceId===p.id)!;pop.population=1300;const economy=structuredClone(n.world.statecraft),full=reorganizationStrength(n,p.id),initial=n.world.armies.find(v=>v.id===a.id)!.troops;
  progressReorganization(n);expect(n.world.armies.find(v=>v.id===a.id)!.troops).toBe(initial+Math.floor(full/194.8));expect(n.reorganization.active[a.id].fraction).toBeCloseTo(full/194.8%1,9);expect(n.world.statecraft).toEqual(economy);
 });
 it('takes damage while reorganizing, and permits real movement without an invulnerable state',()=>{
  const {r,a,b,p,q}=encounter(),n=ticks(r,1);const ally=n.world.armies.find(v=>v.id===a.id)!,enemy=n.world.armies.find(v=>v.id===b.id)!;ally.troops=1200;Object.assign(enemy,{provinceId:p.id,route:[],progress:0,status:'idle',troops:2000});n.tactics.rounds[b.id]=2;const hit=ticks(n,1);expect(hit.world.armies.find(v=>v.id===a.id)!.troops).toBeLessThan(1200);expect(hit.reorganization.active[a.id]).toBeDefined();
  peace(n);n.world.provinces.find(v=>v.id===q.id)!.controller=a.nationId;const s=new CampaignSession();s.execute({type:'load',run:n});const moved=s.execute({type:'order',order:{kind:'march',armyId:a.id,targetId:q.id},expected:stamp(n)}).run as CampaignRun;expect(moved.world.armies.find(v=>v.id===a.id)!.route).toContain(q.id);expect(moved.reorganization.active[a.id]).toBeDefined();
 });
 it('cancels replenishment after home falls and keeps real remaining soldiers',()=>{const {r,a,b,p}=encounter(),n=ticks(r,1),strength=n.world.armies.find(v=>v.id===a.id)!.troops;n.world.provinces.find(v=>v.id===p.id)!.controller=b.nationId;progressReorganization(n);expect(n.reorganization.active[a.id]).toBeUndefined();expect(n.world.armies.find(v=>v.id===a.id)!.troops).toBe(strength);expect(n.world.events.at(-1)!.text).toContain('停止重编');});
 it('finishes only once across save/resume and preserves fractional progress and CAS',async()=>{
  const {r,a}=encounter();let n=ticks(r,1);peace(n);n=ticks(n,37);assertCampaign(n);const db=new IDBFactory();await saveRun(n,null,db);const saved=(await loadRun(db))!.run as CampaignRun;expect(saved.reorganization).toEqual(n.reorganization);const x=ticks(n,160),y=ticks(saved,160);expect(y).toEqual(x);expect(y.reorganization.active[a.id]).toBeUndefined();expect(y.reorganization.completed[a.id]).toBe(1);expect(y.world.events.filter(e=>e.text===`${a.name}完成重编`)).toHaveLength(1);await expect(saveRun(y,null,db)).rejects.toThrow('另一窗口');await saveRun(y,1,db);expect(ticks((await loadRun(db))!.run as CampaignRun,10).reorganization.completed[a.id]).toBe(1);
 });
 it('saves an explicit independent v9 copy without changing any old database bytes',async()=>{
  const db=new IDBFactory(),s=new CampaignSession(),old=tacticsView(encounter().r);await saveRun(old,null,db);const before=await slots(db,TACTICS_DATABASE),copy=s.execute({type:'copy',run:old}).run;expect(copy.id).not.toBe(old.id);expect(copy.version).toBe(10);await saveRun(copy,null,db);expect(await slots(db,TACTICS_DATABASE)).toEqual(before);expect((await loadRun(db,11))!.run).toEqual(old);expect((await loadRun(db,12))!.run).toEqual(copy);
 });
 it('does not resurrect historical losses or duplicate home recruitment at a month boundary',()=>{
  const {r,a,p}=encounter();r.world.day=29;r.clock.tick=3599;r.tactics.rounds=Object.fromEntries(r.world.armies.map(a=>[a.id,3600]));const n=ticks(r,1);expect(n.world.day).toBe(30);expect(n.reorganization.active[a.id]).toBeDefined();expect(n.world.armies.filter(v=>v.status!=='destroyed'&&n.tactics.forces[v.id].homeId===p.id&&n.tactics.forces[v.id].kind!=='emergency')).toHaveLength(1);
  const historical=encounter();historical.a.troops=0;historical.a.status='destroyed';historical.a.route=[];historical.a.progress=0;delete historical.r.battles.plans[historical.a.id];delete historical.r.tactics.rounds[historical.a.id];const after=ticks(historical.r,1);expect(after.reorganization.active[historical.a.id]).toBeUndefined();expect(after.world.armies.find(v=>v.id===historical.a.id)!.troops).toBe(0);
 });
 it('rejects a stale command and prevents embarking a reorganizing force',()=>{const {r,a}=encounter(),n=ticks(r,1),s=new CampaignSession();s.execute({type:'load',run:n});expect(()=>s.execute({type:'tick',ticks:1,expected:stamp(r)})).toThrow('时刻');expect(()=>s.execute({type:'transport',action:{type:'embark',fleetId:'test',armyId:a.id},expected:stamp(n)})).toThrow('正在重编');});
 it('does not revive a passenger lost at sea and counts aboard home forces against the home quota',()=>{
  const {r,a}=encounter(),before=structuredClone(r);before.world.armies=before.world.armies.filter(v=>v.id!==a.id);before.transports.cargo=[{fleetId:'test',fromPortId:'port-test',army:a,unit:'Infantry',targetPortId:null}];const after=structuredClone(r);Object.assign(after.world.armies[0],{troops:0,status:'destroyed',route:[],progress:0});startReorganization(before,after);expect(after.reorganization.active[a.id]).toBeUndefined();
  const other={...structuredClone(a),id:'aboard'};r.transports.cargo=[{fleetId:'test',fromPortId:'port-test',army:other,unit:'Infantry',targetPortId:null}];r.tactics.forces[other.id]={...r.tactics.forces[a.id]};const next=structuredClone(r);Object.assign(next.world.armies[0],{troops:0,status:'destroyed',route:[],progress:0});startReorganization(r,next);expect(next.reorganization.active[a.id]).toBeUndefined();
 });
 it('integrates real embarkation and simultaneous ship damage without resurrecting the sunk passenger',()=>{
  const r=fixture(),g=graphFor(maritimeView(tacticsView(r))),port=g.ports[0],nation=r.world.provinces.find(p=>p.id===port.provinceId)!.controller,a=r.world.armies.find(a=>a.nationId===nation)!,enemy=r.world.nations.find(n=>n.id!==nation)!;
  Object.assign(a,{provinceId:port.provinceId,status:'idle',progress:0,route:[],troops:500});r.tactics.forces[a.id].homeId=port.provinceId;
  r.navy.fleets=[nation,enemy.id].map((id,i)=>({id:'fleet-'+i,name:'海战测试'+i,nationId:id,ships:1,crew:40,food:2400,node:port.node,route:[],progress:0,dockId:i===0?port.id:null,targetId:null,patrol:false,status:i===0?'docked':'anchored'}));r.maritime.hulls={'fleet-0':4,'fleet-1':100};
  const s=new CampaignSession();s.execute({type:'load',run:r});const aboard=s.execute({type:'transport',action:{type:'embark',fleetId:'fleet-0',armyId:a.id},expected:stamp(r)}).run as CampaignRun,n=ticks(aboard,30);assertCampaign(n);expect(n.navy.fleets[0].status).toBe('lost');expect(n.transports.cargo).toHaveLength(0);expect(n.world.armies.find(v=>v.id===a.id)!.status).toBe('destroyed');expect(n.reorganization.active[a.id]).toBeUndefined();expect(ticks(n,30).world.armies.find(v=>v.id===a.id)!.troops).toBe(0);
 });
 it.each(['current','backup'])('locks a future reorganization field in %s before recovery or writes',async key=>{const db=new IDBFactory(),r=ticks(encounter().r,1);await saveRun(r,null,db);await saveRun(r,1,db);await change(db,key,s=>{Object.assign(Object.values(s.run.reorganization.active)[0],{future:true});});const before=await slots(db,CAMPAIGN_DATABASE);await expect(loadRun(db)).rejects.toThrow('未知字段');await expect(saveRun(r,2,db)).rejects.toThrow('未知字段');expect(await slots(db,CAMPAIGN_DATABASE)).toEqual(before);});
 it('recovers the checked backup after current corruption and retains it on the next save',async()=>{const db=new IDBFactory(),r=ticks(encounter().r,1);peace(r);await saveRun(r,null,db);await saveRun(ticks(r,3),1,db);await change(db,'current',s=>{s.checksum='corrupt';});const saved=(await loadRun(db))!;expect(saved.recovered).toBe(true);expect(saved.run).toEqual(r);expect(saved.revision).toBe(2);await saveRun(ticks(saved.run as CampaignRun,3),2,db);await change(db,'current',s=>{s.checksum='corrupt again';});expect((await loadRun(db))!.run).toEqual(r);});
});
