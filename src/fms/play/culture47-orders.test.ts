import {beforeAll,describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {Culture47Session,type Culture47Journal} from './culture47-session';
import {saveCulture47,loadCulture47,CULTURE47_DATABASE} from './culture47-storage';
import {grid} from './fixture.test-support';
import {actualForces47} from './force-runtime47';
import type {MilitaryIntent47} from './culture47-orders';
let base:Culture47Journal;
beforeAll(()=>{base=new Culture47Session().create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:24,relations:'peace',setup:{mode:'historical-names',enabled:['english']}}).journal;},30000);
function fixture(force:'army'|'fleet'){
 const s=new Culture47Session(),r=s.load(force==='fleet'?{...base,opening:{...base.opening,count:5,cityCount:60}}:base).run;
 const intents:MilitaryIntent47[]=force==='army'?r.world.provinces.filter(p=>p.controller===r.world.armies[0].nationId).map(p=>({force:'army',command:{type:'army-move',armyId:r.world.armies[0].id,kind:'march',target:{kind:'province',id:p.id}}})):([...actualForces47(r).spatial.graph.cells.values()].filter(c=>c.surface==='sea').slice(0,80).map(c=>({force:'fleet',command:{type:'fleet-sail',fleetId:r.navy.fleets[0]?.id??'missing',target:{kind:'cell',id:c.id}}})));
 const options=intents.map(i=>s.previewOrder(i)),p=options.find(p=>p.preview.valid&&p.preview.distance>1);expect(p,force+' has an actual route').toBeDefined();return{s,p:p!};
}
async function change(factory:IDBFactory,update:(e:Record<string,unknown>)=>void){const db=await new Promise<IDBDatabase>((ok,no)=>{const r=factory.open(CULTURE47_DATABASE,1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});await new Promise<void>((ok,no)=>{const t=db.transaction('slots','readwrite'),s=t.objectStore('slots'),q=s.get('current');q.onsuccess=()=>{update(q.result);s.put(q.result,'current');};t.oncomplete=()=>ok();t.onerror=()=>no(t.error);});db.close();}
describe('culture world restored manual control and durable replay',()=>{
 it.each(['army','fleet'] as const)('%s previews, confirms, moves and saves twice without corrupting names or future lock',async force=>{
  const {s,p}=fixture(force),before=s.snapshot();expect(s.previewOrder(p.intent)).toEqual(p);expect(s.snapshot()).toEqual(before);
  const confirmed=s.execute({kind:'military',intent:p.intent,expected:p.preview.basedOn},p.sequence),ids=force==='army'?confirmed.run.voyages.manualArmies:confirmed.run.voyages.manualFleets;
  expect(ids).toContain(p.intent.force==='army'?p.intent.command.armyId:p.intent.command.fleetId);expect(()=>s.execute({kind:'military',intent:p.intent,expected:p.preview.basedOn},p.sequence)).toThrow();
  const next=s.execute({kind:'advance',ticks:5},1),id=ids[0],oldPoint=(force==='army'?before.frame.armies:before.frame.fleets).get(id),newPoint=(force==='army'?next.frame.armies:next.frame.fleets).get(id);expect(newPoint).not.toEqual(oldPoint);
  const f=new IDBFactory();await saveCulture47(next.journal,null,f);const restored=await loadCulture47(f);expect(new Culture47Session().load(restored!.journal)).toEqual(next);await saveCulture47(next.journal,1,f);expect((await loadCulture47(f))?.revision).toBe(2);
 },60000);
 it('a stale route confirmation never teleports or commits a new journal entry',()=>{
  const {s,p}=fixture('army'),after=s.execute({kind:'advance',ticks:1},0);expect(()=>s.execute({kind:'military',intent:p.intent,expected:p.preview.basedOn},1)).toThrow(/过期/);expect(s.snapshot()).toEqual(after);
 },30000);
 it('a broken known army discriminator recovers backup; an unknown political type locks both writes and reads',async()=>{
  const {s,p}=fixture('army'),j=s.execute({kind:'military',intent:p.intent,expected:p.preview.basedOn},0).journal,f=new IDBFactory();await saveCulture47(j,null,f);await saveCulture47(j,1,f);
  await change(f,e=>{const j=e.journal as Culture47Journal;delete (j.actions[0] as unknown as {intent:{force?:string}}).intent.force;});expect((await loadCulture47(f))?.recovered).toBe(true);await saveCulture47(j,2,f);
  await change(f,e=>{const j=e.journal as Culture47Journal;j.actions.push({kind:'politics',action:{type:'future-alliance',nationId:'n-0',targetNationId:'n-1'},expected:{}} as never);});await expect(loadCulture47(f)).rejects.toThrow('未来');await expect(saveCulture47(j,3,f)).rejects.toThrow('未来');
 },60000);
 it('a valid political confirmation survives the complete storage path',async()=>{
  const s=new Culture47Session();s.load(base);const action={type:'declare-war' as const,nationId:'n-0',targetNationId:'n-1'},p=s.preview(action);expect(p.valid,p.reason).toBe(true);const confirmed=s.execute({kind:'politics',action,expected:p.expected},0),f=new IDBFactory();await saveCulture47(confirmed.journal,null,f);expect(new Culture47Session().load((await loadCulture47(f))!.journal)).toEqual(confirmed);await saveCulture47(confirmed.journal,1,f);expect((await loadCulture47(f))?.revision).toBe(2);
 },60000);
});
