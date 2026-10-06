import {describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {readFileSync} from 'node:fs';
import {ChronicleSession} from './chronicle-session';
import {assertChronicle,campaignView,presentationOf,type ChronicleRun} from './chronicle-model';
import {graphFor} from './naval-rules';
import {CampaignSession} from './campaign-session';
import {tacticsView} from './campaign-model';
import {createDistrictRun,polygonArea} from './district-world';
import {createFmsRun} from './world';
import {grid} from './fixture.test-support';
import {advancePolitics,reconcileSovereignty,previewPolitics} from './chronicle-politics';
import {loadRun,saveRun,runStore} from './chronicle-stores';
import {CHRONICLE_DATABASE} from './chronicle-storage';
import {CAMPAIGN_DATABASE} from './campaign-storage';
import {verifyCampaignCompatibility,fingerprintChronicle} from '../../../scripts/fms-chronicle-fingerprint';
import {fingerprintCampaign} from '../../../scripts/fms-campaign-fingerprint';
import {regnalLabel} from './chronicle-records';
const terrain=()=>grid((x,y)=>x>=30&&x<=210&&y>=30&&y<=200?45:0);
const stamp=(r:ChronicleRun)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
function fixture(){const s=new ChronicleSession(),r=s.execute({type:'create',terrain:terrain(),count:4,relations:'peace'}).run as ChronicleRun;return {s,r};}
function local(r:ChronicleRun){return r.world.provinces.find(p=>r.world.provinces.filter(q=>q.controller===p.controller).length>1&&!r.world.nations.some(n=>r.world.cities.find(c=>c.id===n.capitalId)?.provinceId===p.id))!;}
async function slots(db:IDBFactory,name=CHRONICLE_DATABASE){return new Promise<unknown[]>((resolve,reject)=>{const q=db.open(name);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves'),r=t.objectStore('saves').getAll();r.onsuccess=()=>resolve(r.result);t.oncomplete=()=>d.close();};});}
async function change(db:IDBFactory,key:string,edit:(value:{run:ChronicleRun;checksum:string})=>void){await new Promise<void>((resolve,reject)=>{const q=db.open(CHRONICLE_DATABASE);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,t=d.transaction('saves','readwrite'),s=t.objectStore('saves'),r=s.get(key);r.onsuccess=()=>{edit(r.result);s.put(r.result,key);};t.oncomplete=()=>{d.close();resolve();};t.onerror=()=>reject(t.error);};});}
describe('v11 finer districts and durable actual history',()=>{
 it('flattens naval dispatch with the same frozen command outputs and stale/cargo guards',()=>{
  const {s,r}=fixture(),old=new CampaignSession();old.execute({type:'load',run:campaignView(r)});let n=r;const f=r.navy.fleets[0];expect(f).toBeDefined();
  for(const action of [{type:'patrol' as const,fleetId:f.id,enabled:false},{type:'patrol' as const,fleetId:f.id,enabled:true},{type:'build-fleet' as const,nationId:f.nationId,portId:f.dockId!,ships:1}]){
   const command={type:'naval' as const,action,expected:stamp(n)},before=structuredClone(n);n=s.execute(command).run as ChronicleRun;expect(campaignView(n)).toEqual(old.execute(command).run);expect(before).not.toBe(n);expect(()=>s.execute(command)).toThrow('时刻');
  }
  const a={type:'naval' as const,action:{type:'patrol' as const,fleetId:f.id,enabled:false},expected:stamp(n)},original=structuredClone(n);
  const fleet=n.navy.fleets.find(v=>v.id===f.id)!,port=graphFor(presentationOf(n)).ports.find(p=>p.id===f.dockId)!,army=n.world.armies.find(v=>v.nationId===f.nationId)!;
  fleet.patrol=false;Object.assign(army,{provinceId:port.provinceId,status:'idle',progress:0,route:[],troops:Math.min(army.troops,1000)});n.world.armies=n.world.armies.filter(v=>v.id!==army.id);n.transports.cargo.push({fleetId:f.id,fromPortId:f.dockId!,targetPortId:null,army,unit:n.units[army.id]});
  const units={...n.units};delete units[army.id];n.units=units;s.execute({type:'load',run:n});expect(()=>s.execute(a)).toThrow('载军');expect(original.transports.cargo).toHaveLength(0);
 });
 it('keeps regnal and national counts independent across renaming, restoration and saved history',async()=>{
  const {s,r}=fixture(),id=r.world.nations[0].id;let n=r;
  for(const [regnalName,ordinal,order] of [['景明',1,2],['景明',2,3],['承平',1,4],['景明',3,5]] as const){
   const action={type:'succession' as const,nationId:id,regnalName};expect(previewPolitics(n,action).reason).toContain(regnalLabel({regnalName,regnalOrdinal:ordinal}));
   n=s.execute({type:'politics',action,expected:stamp(n)}).run as ChronicleRun;expect(n.chronicle.leaders[id].at(-1)).toMatchObject({regnalName,regnalOrdinal:ordinal,order});expect(n.chronicle.entries.at(-1)!.people.at(-1)).toMatchObject({regnalName,regnalOrdinal:ordinal,order});
  }
  const other=n.world.nations[1].id;n=s.execute({type:'politics',action:{type:'succession',nationId:other,regnalName:'景明'},expected:stamp(n)}).run as ChronicleRun;expect(n.chronicle.leaders[other].at(-1)!.regnalOrdinal).toBe(1);
  const land=n.world.provinces.filter(p=>p.controller===id);land.forEach(p=>p.controller=other);reconcileSovereignty(n);land[0].controller=id;reconcileSovereignty(n);expect(n.chronicle.leaders[id].at(-1)).toMatchObject({regnalName:'景明',regnalOrdinal:4,order:6});
  n.world.events=[];n.world.nations[0].name='改国名';const db=new IDBFactory();await saveRun(n,null,db);expect((await loadRun(db))!.run).toEqual(n);assertChronicle(n);
 });
 it('rejects forged regnal history and invalid title commands atomically',()=>{
  const {s,r}=fixture(),id=r.world.nations[0].id;
  for(const regnalName of ['',' 景明','景明二世','太长的王号太长的王号太长的王号','景\n明'])expect(()=>s.execute({type:'politics',action:{type:'succession',nationId:id,regnalName},expected:stamp(r)})).toThrow('王号');
  const n=s.execute({type:'politics',action:{type:'succession',nationId:id,regnalName:'景明'},expected:stamp(r)}).run as ChronicleRun;expect(n.chronicle.leaders[id]).toHaveLength(2);
  for(const patch of [{order:9},{regnalOrdinal:8},{regnalName:'假王号'},{name:'假名字'}]){const bad=structuredClone(n);Object.assign(bad.chronicle.entries[0].people[1],patch);expect(()=>assertChronicle(bad)).toThrow('历史');}
  const bad=structuredClone(n);bad.chronicle.leaders[id][1].regnalOrdinal=2;expect(()=>assertChronicle(bad)).toThrow('历史');
 });
 it('formats regnal ordinals without confusing 10, 110, 101 and 1001',()=>{for(const [regnalOrdinal,text] of [[1,'一'],[10,'十'],[11,'十一'],[101,'一百零一'],[110,'一百一十'],[1001,'一千零一'],[10000,'一万']] as const)expect(regnalLabel({regnalName:'景明',regnalOrdinal})).toBe('景明'+text+'世');});
 it('creates materially smaller districts with exact land area, one real city each, and unchanged input',()=>{
  const t=terrain(),before=structuredClone(t),old=createFmsRun(t,4),r=createDistrictRun(t,4);
  expect(r.world.provinces.length).toBeGreaterThan(old.world.provinces.length*2);expect(r.world.cities).toHaveLength(r.world.provinces.length);expect(t).toEqual(before);
  expect(r.world.provinces.reduce((s,p)=>s+polygonArea(p.polygon),0)).toBeCloseTo(old.world.provinces.reduce((s,p)=>s+polygonArea(p.polygon),0),7);
  for(const p of r.world.provinces){expect(r.world.cities.filter(c=>c.provinceId===p.id)).toHaveLength(1);for(const id of p.neighbors)expect(r.world.provinces.find(q=>q.id===id)!.neighbors).toContain(p.id);}
  expect(r.world.cities.filter(c=>!r.world.nations.some(n=>n.capitalId===c.id)).every(c=>c.fort===0)).toBe(true);
 });
 it('preserves disconnected islands and inland seas rather than manufacturing land routes',()=>{
  const t=grid((x,y)=>(x<80&&y<100||x>150&&y>150)&&!(x>=30&&x<=50&&y>=30&&y<=50)?45:0),r=createDistrictRun(t,2),old=createFmsRun(t,2);
  expect(r.world.provinces.reduce((s,p)=>s+polygonArea(p.polygon),0)).toBeCloseTo(old.world.provinces.reduce((s,p)=>s+polygonArea(p.polygon),0),7);
  for(const p of r.world.provinces)for(const id of p.neighbors){const q=r.world.provinces.find(q=>q.id===id)!;expect(p.center.x<500).toBe(q.center.x<500);}
 });
 it('freezes published v10 execution and fingerprint',()=>{verifyCampaignCompatibility();expect(fingerprintCampaign()).toBe('5394c3c20077989a2eb2c243c7a686399e86c8dbfad8102bfbb3951d01019db0');expect(fingerprintChronicle()).toBe(__FMS_CHRONICLE_ENGINE__);});
 it('rejects tampering with either archived or live v10',()=>{for(const file of ['src/fms/play/campaign-runtime.ts','src/fms/play/compat/campaign1/fms/play/campaign-runtime.ts.source'])expect(()=>verifyCampaignCompatibility(f=>readFileSync(f,'utf8').replaceAll('\r\n','\n')+(f===file?'\nchanged':''))).toThrow('Published v10');});
 it('keeps loaded v10 steps identical and explicit copies preserve its geography and database bytes',async()=>{
  const source=new CampaignSession().execute({type:'create',terrain:terrain(),count:4,relations:'peace'}).run;if(source.version!==10)throw Error();
  const db=new IDBFactory(),s=new ChronicleSession(),old=new CampaignSession();await saveRun(source,null,db);const before=await slots(db,CAMPAIGN_DATABASE);
  s.execute({type:'load',run:source});old.execute({type:'load',run:source});const c={type:'tick' as const,ticks:4,expected:{day:source.world.day,nextEventId:source.world.nextEventId,tick:source.clock.tick}};expect(s.execute(c)).toEqual(old.execute(c));
  const copied=s.execute({type:'copy',run:source}).run as ChronicleRun;expect(copied.id).not.toBe(source.id);expect(copied.world.provinces).toEqual(source.world.provinces);expect(copied.world.armies).toEqual(source.world.armies);expect(copied.chronicle.entries).toEqual([]);expect(runStore(copied)).toBe(13);await saveRun(copied,null,db);expect(await slots(db,CAMPAIGN_DATABASE)).toEqual(before);expect((await loadRun(db,12))!.run).toEqual(source);expect((await loadRun(db))!.run).toEqual(copied);
 });
 it('increments actual succession independently of recent logs and keeps exact save/resume identity',async()=>{
  const {s,r}=fixture(),id=r.world.nations[0].id,before=structuredClone(r);let n=s.execute({type:'politics',action:{type:'succession',nationId:id},expected:stamp(r)}).run as ChronicleRun;
  n=s.execute({type:'politics',action:{type:'succession',nationId:id},expected:stamp(n)}).run as ChronicleRun;expect(n.chronicle.leaders[id].map(l=>l.order)).toEqual([1,2,3]);expect(n.chronicle.entries.map(e=>e.kind)).toEqual(['accession','accession']);expect(r).toEqual(before);
  const first=structuredClone(n.chronicle.entries[0]);n.world.events=[];n.world.nations[0].name='后来的国名';assertChronicle(n);expect(n.chronicle.entries[0]).toEqual(first);
  const db=new IDBFactory();await saveRun(n,null,db);const saved=(await loadRun(db))!.run as ChronicleRun;expect(saved).toEqual(n);const resumed=new ChronicleSession();resumed.execute({type:'load',run:saved});expect((resumed.execute({type:'politics',action:{type:'succession',nationId:id},expected:stamp(saved)}).run as ChronicleRun).chronicle.leaders[id].at(-1)!.order).toBe(4);
 });
 it.each(['uprising','independence'] as const)('%s changes exactly one real province, relationships, capital and economy, then survives ticking',type=>{
  const {s,r}=fixture(),p=local(r),before=structuredClone(r),parent=p.controller,pop=r.world.statecraft!.provinces.find(v=>v.provinceId===p.id)!.population;
  expect(previewPolitics(r,{type,nationId:parent,provinceId:p.id}).valid).toBe(true);
  const n=s.execute({type:'politics',action:{type,nationId:parent,provinceId:p.id},expected:stamp(r)}).run as ChronicleRun,newNation=n.world.nations.at(-1)!;
  expect(n.world.provinces.filter((q,i)=>q.controller!==r.world.provinces[i].controller).map(q=>q.id)).toEqual([p.id]);expect(n.world.cities.find(c=>c.id===newNation.capitalId)!.provinceId).toBe(p.id);expect(n.world.statecraft!.relations.find(v=>[v.a,v.b].includes(parent)&&[v.a,v.b].includes(newNation.id))!.status).toBe(type==='uprising'?'war':'peace');
  const rebels=n.world.armies.filter(a=>a.nationId===newNation.id);expect(n.world.statecraft!.provinces.find(v=>v.provinceId===p.id)!.population).toBe(pop-(type==='uprising'?rebels.reduce((s,a)=>s+a.troops,0):0));expect(n.chronicle.entries.at(-1)!.place!.id).toBe(p.id);assertChronicle(n);expect(r).toEqual(before);expect(()=>s.execute({type:'tick',ticks:120,expected:stamp(n)})).not.toThrow();
 });
 it('rejects stale or historical-capital secession without changing the installed world',()=>{const {s,r}=fixture(),n=r.world.nations[0],p=r.world.cities.find(c=>c.id===n.capitalId)!;expect(()=>s.execute({type:'politics',action:{type:'independence',nationId:n.id,provinceId:p.provinceId},expected:stamp(r)})).toThrow('首都');expect(()=>s.execute({type:'politics',action:{type:'succession',nationId:n.id},expected:{...stamp(r),tick:1}})).toThrow('时刻');const live=s.execute({type:'tick',ticks:1,expected:stamp(r)}).run as ChronicleRun;expect(live.chronicle.entries).toEqual([]);});
 it('includes sea passengers in uprising capacity and allows exactly one remaining slot',()=>{const {r}=fixture(),p=local(r),a={type:'uprising' as const,nationId:p.controller,provinceId:p.id},army=r.world.armies[0];r.world.armies=Array.from({length:499},(_,i)=>({...army,id:`test-${i}`}));r.transports.cargo=[{fleetId:'synthetic',fromPortId:'synthetic',army,unit:'Infantry',targetPortId:null}];expect(previewPolitics(r,a).valid).toBe(false);r.world.armies.pop();expect(previewPolitics(r,a).valid).toBe(true);});
 it('uses real occupied duration and pressure for autonomous rebellion, never random notices',()=>{
  const {r}=fixture(),p=local(r),parent=p.controller,other=r.world.nations.find(n=>n.id!==parent)!.id;p.legalOwner=other;const s=r.chronicle.unrest[p.id];s.pressure=100;r.world.day=330;r.clock.tick=330*120;advancePolitics(r,true);expect(r.chronicle.entries.some(e=>e.kind==='uprising')).toBe(false);r.world.day=360;r.clock.tick=360*120;advancePolitics(r,true);expect(r.chronicle.entries.filter(e=>e.kind==='uprising')).toHaveLength(1);expect(p.controller).not.toBe(parent);assertChronicle(r);
 });
 it('ends a landless nation once, keeps its city, and appends a real restoration when it recovers land',()=>{
  const {r}=fixture(),n=r.world.nations[0],other=r.world.nations[1],held=r.world.provinces.filter(p=>p.controller===n.id),cities=structuredClone(r.world.cities);held.forEach(p=>p.controller=other.id);reconcileSovereignty(r);reconcileSovereignty(r);expect(r.chronicle.entries.filter(e=>e.kind==='extinction')).toHaveLength(1);expect(r.world.cities).toEqual(cities);expect(r.chronicle.leaders[n.id].at(-1)!.endedDay).toBe(0);held[0].controller=n.id;reconcileSovereignty(r);expect(r.chronicle.entries.at(-1)!.kind).toBe('restoration');expect(r.chronicle.leaders[n.id].at(-1)!.order).toBe(2);assertChronicle(r);
 });
 it('schedules a saved succession without inventing previous monarchs',()=>{const {r}=fixture(),id=r.world.nations[0].id;r.chronicle.leaders[id][0].termEndDay=1;r.world.day=1;r.clock.tick=120;advancePolitics(r,true);expect(r.chronicle.leaders[id]).toHaveLength(2);expect(r.chronicle.entries.at(-1)!.reason).toContain('网页适配');assertChronicle(r);});
 it('resets occupation pressure on every same-day change of control',()=>{const {r}=fixture(),p=local(r),occupier=p.controller,other=r.world.nations.find(n=>n.id!==occupier)!.id;p.legalOwner=other;r.world.day=360;r.clock.tick=43200;const pressure=r.chronicle.unrest[p.id];pressure.pressure=100;p.controller=other;advancePolitics(r,false);p.controller=occupier;advancePolitics(r,false);expect(pressure.sinceDay).toBe(360);expect(pressure.pressure).toBe(0);advancePolitics(r,true);expect(r.chronicle.entries.some(e=>e.kind==='uprising')).toBe(false);});
 it('transfers real grain out of the current daily ledger without changing global stocks',()=>{const {s}=fixture(),day=s.execute({type:'step',days:1}).run as ChronicleRun,p=local(day),parent=p.controller,grain=day.world.statecraft!.provinces.find(v=>v.provinceId===p.id)!.grain,ledger=structuredClone(day.world.statecraft!.nations.find(v=>v.nationId===parent)!.lastLedger)!,stocks=day.world.statecraft!.provinces.reduce((s,p)=>s+p.grain,0);const n=s.execute({type:'politics',action:{type:'independence',nationId:parent,provinceId:p.id},expected:stamp(day)}).run as ChronicleRun,after=n.world.statecraft!.nations.find(v=>v.nationId===parent)!.lastLedger!;expect(after.territoryTransfer).toBe(ledger.territoryTransfer-grain);expect(after.closingGrain).toBe(ledger.closingGrain-grain);expect(n.world.statecraft!.provinces.reduce((s,p)=>s+p.grain,0)).toBe(stocks);expect(n.world.statecraft!.nations.at(-1)!.lastLedger).toBeNull();});
 it('requires a complete preview stamp at the Worker command boundary',()=>{const {s,r}=fixture();for(const expected of [undefined,null,{day:0,nextEventId:r.world.nextEventId},{day:0,nextEventId:r.world.nextEventId,tick:.2}])expect(()=>s.execute({type:'politics',action:{type:'succession',nationId:r.world.nations[0].id},expected} as Parameters<typeof s.execute>[0])).toThrow('预览');expect((s.execute({type:'tick',ticks:1,expected:stamp(r)}).run as ChronicleRun).chronicle.entries).toHaveLength(0);});
 it('rejects contradictory living/ended monarch histories',()=>{const {r}=fixture(),id=r.world.nations[0].id;for(const edit of [(n:ChronicleRun)=>{n.chronicle.leaders[id]=[];},(n:ChronicleRun)=>{n.chronicle.leaders[id][0].endedDay=0;},(n:ChronicleRun)=>{n.chronicle.ended[id]=0;}]){const n=structuredClone(r);edit(n);expect(()=>assertChronicle(n)).toThrow('历史');}});
 it('keeps a loaded old session intact after a candidate copy exceeds the city limit',()=>{const {r}=fixture(),old=tacticsView(campaignView(r));old.world.cities=old.world.cities.filter(c=>old.world.nations.some(n=>n.capitalId===c.id));const city=old.world.cities[0];while(old.world.cities.length<1000)old.world.cities.push({...city,id:'extra-'+old.world.cities.length});const s=new ChronicleSession();s.execute({type:'load',run:old});expect(()=>s.execute({type:'copy',run:old})).toThrow();const n=s.execute({type:'tick',ticks:1,expected:stamp(r)}).run;expect(n.id).toBe(old.id);expect(n.version).toBe(9);expect(n.world.cities).toHaveLength(1000);expect(old.clock.tick).toBe(0);});
 it('keeps CAS, exact backup recovery and the chosen backup on the next write',async()=>{
  const {s,r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);const n=s.execute({type:'tick',ticks:3,expected:stamp(r)}).run;await saveRun(n,1,db);await change(db,'current',v=>{Object.values(v.run.chronicle.unrest)[0].pressure=101;});const recovered=(await loadRun(db))!;expect(recovered.recovered).toBe(true);expect(recovered.revision).toBe(2);expect(recovered.run).toEqual(r);await expect(saveRun(r,1,db)).rejects.toThrow('另一窗口');await saveRun(n,2,db);await change(db,'current',v=>{v.run.chronicle.nextEntryId=999;});expect((await loadRun(db))!.run).toEqual(r);
 });
 it.each(['current','backup'])('locks unknown and future chronicle schemas in %s without writes',async key=>{
  const {r}=fixture(),db=new IDBFactory();await saveRun(r,null,db);await saveRun(r,1,db);await change(db,key,s=>Object.assign(Object.values(s.run.chronicle.leaders)[0][0],{future:true}));const before=await slots(db);await expect(loadRun(db)).rejects.toThrow('未知字段');await expect(saveRun(r,2,db)).rejects.toThrow('未知字段');expect(await slots(db)).toEqual(before);
 });
 it('rejects history overflow atomically while keeping the prior snapshot available',()=>{const {s,r}=fixture(),id=r.world.nations[0].id;const first=s.execute({type:'politics',action:{type:'succession',nationId:id},expected:stamp(r)}).run as ChronicleRun;first.chronicle.entries=Array.from({length:10000},(_,i)=>({...structuredClone(first.chronicle.entries[0]),id:i+1}));first.chronicle.nextEntryId=10001;s.execute({type:'load',run:first});expect(()=>s.execute({type:'politics',action:{type:'succession',nationId:id},expected:stamp(first)})).toThrow('一万条');const next=s.execute({type:'tick',ticks:1,expected:stamp(first)}).run as ChronicleRun;expect(next.chronicle.leaders[id]).toHaveLength(2);expect(next.chronicle.entries).toHaveLength(10000);});
 it('does not let a projected campaign view modify version or remove stored history',()=>{const {r}=fixture(),v=campaignView(r);expect(v.version).toBe(10);expect('chronicle'in v).toBe(false);expect(r.version).toBe(11);assertChronicle(r);});
});
