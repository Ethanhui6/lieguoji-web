import { describe,it,expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { grid } from './fixture.test-support';
import { createFmsRun,assertFmsRun } from './world';
import { withMilitary,playRules,executeMilitary } from './runtime';
import { PlaySession } from './session';
import { previewMilitaryAction,recruitmentGrain } from './military-actions';
import { createMilitaryCore } from './military-core';
import { unitProfiles } from './military-profile';
import { loadRun,saveRun,MOBILIZATION_DATABASE } from './storage';
import * as frozen from '../../compat/v0_4/sim/core';
import { namedWorld } from './names';
import { previousMilitaryFingerprint } from './military-registry';
import { createMilitaryCore as frozenPreview } from './compat/preview1/fms/play/military-core';

const make=()=>withMilitary(createFmsRun(grid(),4,'peace'));
const version=(world:{day:number;nextEventId:number})=>({day:world.day,nextEventId:world.nextEventId});
async function tamper(factory:IDBFactory,key:string,edit:(v:Record<string,unknown>)=>void){await new Promise<void>((resolve,reject)=>{const req=factory.open(MOBILIZATION_DATABASE,1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('saves','readwrite'),store=tx.objectStore('saves'),get=store.get(key);get.onsuccess=()=>{const v=get.result;edit(v);store.put(v,key);};tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};});}

describe('FMS dedicated military rules and legacy dispatch',()=>{
  it('continues the exact known development preview while rejecting any unknown engine',async()=>{
    const current=make(),old={...current,engine:previousMilitaryFingerprint},session=new PlaySession();
    session.execute({type:'load',run:old});expect(session.execute({type:'step',days:7}).world).toEqual(frozenPreview(old.units).advanceWorld(old.world,7));
    const f=new IDBFactory();await saveRun(old,null,f);expect((await loadRun(f,2))?.run.engine).toBe(previousMilitaryFingerprint);
    expect(()=>session.execute({type:'load',run:{...old,engine:'f'.repeat(64)}})).toThrow('锁定');
  });
  it('pins old worlds to the frozen engine through steps, commands and saves',async()=>{
    const old=createFmsRun(grid(),4,'war'),before=structuredClone(old),session=new PlaySession();
    session.execute({type:'load',run:old});
    expect(session.execute({type:'step',days:7}).world).toEqual(frozen.advanceWorld(old.world,7));
    expect(old).toEqual(before);expect(old.engine).toBe('65333e9ed3fccd77c6e5bf32a9a3d0396df2990f2ad1ede7f952aec1217851c5');
    const f=new IDBFactory();await saveRun(old,null,f);expect((await loadRun(f,1))?.run).toEqual(before);
    expect(()=>session.execute({type:'military',action:{type:'relocate-capital',nationId:'n-0',cityId:'c-0'},expected:version(old.world)})).toThrow('旧世界');
  });
  it('recruits from actual population without inventing starting soldiers',()=>{
    const old=createFmsRun(grid(),4,'peace'),run=withMilitary(old);expect(()=>assertFmsRun(run)).not.toThrow();
    const people=(w:typeof old.world)=>w.statecraft!.provinces.reduce((sum,p)=>sum+p.population,0)+w.armies.reduce((sum,a)=>sum+a.troops,0);
    expect(people(run.world)).toBe(people(old.world));
    expect(run.world.statecraft!.provinces.reduce((s,p)=>s+p.grain,0)).toBeLessThan(old.world.statecraft!.provinces.reduce((s,p)=>s+p.grain,0));
    expect(run.world.armies.length).not.toBe(old.world.armies.length*3);
    expect(new Set(run.world.armies.map(a=>a.provinceId)).size).toBe(run.world.armies.length);
  });
  it('explicit copy changes identity and preserves the original state and route',()=>{
    const old=createFmsRun(grid(),4,'war'),session=new PlaySession(),before=structuredClone(old);
    const run=session.execute({type:'copy',run:old}).run!;expect(run.id).not.toBe(old.id);expect(run.world.custom!.id).toBe(run.id);expect(old).toEqual(before);
    expect(run.world.armies).toEqual(old.world.armies);if(run.version!==1)expect(Object.values(run.units).every(k=>k==='Infantry')).toBe(true);
  });
  it('requires exact army-to-unit coverage including destroyed formations',()=>{
    const run=make(),id=run.world.armies[0].id;
    for(const units of [{...run.units,unknown:'Infantry'},{...run.units,[id]:'Dragon'},Object.fromEntries(Object.entries(run.units).filter(([k])=>k!==id))])expect(()=>assertFmsRun({...run,units})).toThrow();
    expect(()=>assertFmsRun({...run,rules:'fms-military-99'})).toThrow();
  });
  it('recruitment debits the actual province and returns new mapping atomically from Worker',()=>{
    const run=make(),session=new PlaySession(),n=run.world.nations[0],c=run.world.cities.find(c=>c.id===n.capitalId)!,local=run.world.statecraft!.provinces.find(p=>p.provinceId===c.provinceId)!;
    const before=structuredClone(run),action={type:'recruit' as const,nationId:n.id,cityId:c.id,unit:'Shield' as const,troops:100};
    expect(previewMilitaryAction(run.world,action).valid).toBe(true);session.execute({type:'load',run});
    const next=session.execute({type:'military',action,expected:version(run.world)}).run!;
    expect(next.version).toBe(2);if(next.version!==2)throw Error();const a=next.world.armies.at(-1)!;
    expect(next.units[a.id]).toBe('Shield');expect(a.troops).toBe(100);expect(a.supplies).toBe(100);
    const after=next.world.statecraft!.provinces.find(p=>p.provinceId===c.provinceId)!;
    expect(after.population).toBe(local.population-100);expect(after.grain).toBe(local.grain-recruitmentGrain(100));expect(run).toEqual(before);
    expect(()=>session.execute({type:'military',action,expected:version(run.world)})).toThrow('重新预览');
    expect(session.execute({type:'step',days:1}).run?.version).toBe(2);
  });
  it('refuses nonexistent, occupied, oversized and unaffordable recruitment without any mutation',()=>{
    const run=make(),n=run.world.nations[0],action={type:'recruit' as const,nationId:n.id,cityId:n.capitalId,unit:'Elite' as const,troops:100},before=structuredClone(run);
    expect(previewMilitaryAction(run.world,{...action,cityId:run.world.nations[1].capitalId}).valid).toBe(false);
    expect(previewMilitaryAction(run.world,{...action,troops:9999}).valid).toBe(false);
    const poor=structuredClone(run);poor.world.statecraft!.provinces.forEach(p=>p.grain=0);
    expect(previewMilitaryAction(poor.world,action).valid).toBe(false);expect(()=>executeMilitary(poor,action,version(poor.world))).toThrow('粮储');expect(run).toEqual(before);
  });
  it('relocates only the capital reference and invalidates same-day pending commands',()=>{
    const run=make(),n=run.world.nations.find(n=>run.world.cities.some(c=>c.id!==n.capitalId&&run.world.provinces.find(p=>p.id===c.provinceId)!.legalOwner===n.id))!;
    const city=run.world.cities.find(c=>c.id!==n.capitalId&&run.world.provinces.find(p=>p.id===c.provinceId)!.legalOwner===n.id)!,before=structuredClone(run);
    const action={type:'relocate-capital' as const,nationId:n.id,cityId:city.id},session=new PlaySession();session.execute({type:'load',run});
    const next=session.execute({type:'military',action,expected:version(run.world)}).run!;
    expect(next.world.nations.find(x=>x.id===n.id)!.capitalId).toBe(city.id);expect(next.world.cities).toEqual(run.world.cities);expect(next.world.armies).toEqual(run.world.armies);expect(run).toEqual(before);
    expect(()=>session.execute({type:'military',action,expected:version(run.world)})).toThrow('重新预览');expect(()=>assertFmsRun(next)).not.toThrow();
  });
  it('retains former capital display aliases after relocating an explicit old copy',()=>{
    const run=createFmsRun(grid(),4),n=run.world.nations[0],c=run.world.cities.find(c=>c.id===n.capitalId)!,p=run.world.provinces.find(p=>p.id===c.provinceId)!;
    p.name=`${n.name}·${Number(p.id.slice(2))+1}区`;c.name=`${n.name}京`;const previous=namedWorld(run.world).cities.find(x=>x.id===c.id)!.name;
    const moved=structuredClone(run.world);moved.nations[0].capitalId='different-city';expect(namedWorld(moved).cities.find(x=>x.id===c.id)!.name).toBe(previous);expect(c.name).toBe(`${n.name}京`);
  });
  it('all five source speed and battle factors produce valid deterministic combat',()=>{
    const run=make(),world=structuredClone(run.world),[a,b]=world.armies;
    // Isolate a real equal-strength encounter; disable custom-world autonomy via supplies <35.
    b.nationId=world.nations[1].id;b.provinceId=a.provinceId;
    world.armies=[a,b];a.troops=b.troops=3000;a.supplies=b.supplies=30;
    const relation=world.statecraft!.relations.find(r=>[r.a,r.b].includes(a.nationId)&&[r.a,r.b].includes(b.nationId))!;relation.status='war';
    const losses:number[]=[];
    for(const profile of unitProfiles){const core=createMilitaryCore({[a.id]:profile.key,[b.id]:'Infantry'});expect(core.validateWorld(world)).toBe(true);const next=core.advanceWorld(world,1);expect(core.validateWorld(next)).toBe(true);expect(core.advanceWorld(world,1)).toEqual(next);losses.push(3000-next.armies[1].troops);}
    expect(new Set(losses).size).toBeGreaterThan(2);expect(losses[4]).toBeGreaterThan(losses[0]);
  });
  it('cavalry carries fractional travel across boundaries and all arrival previews match real steps',()=>{
    const run=make(),world=structuredClone(run.world),a=world.armies[0];world.armies=[a];
    world.provinces.forEach(p=>{p.controller=a.nationId;p.terrain='plain';});
    const infantry=createMilitaryCore({[a.id]:'Infantry'});
    const targets=world.provinces.map(p=>({id:p.id,preview:infantry.previewOrder(world,{armyId:a.id,targetId:p.id,kind:'march'})})).filter(p=>p.preview.valid).sort((a,b)=>b.preview.days-a.preview.days);
    const target=targets[0],order={armyId:a.id,targetId:target.id,kind:'march' as const};expect(target.preview.days).toBeGreaterThanOrEqual(6);
    const times:number[]=[];
    for(const profile of unitProfiles){
      const core=createMilitaryCore({[a.id]:profile.key}),preview=core.previewOrder(world,order);let next=core.issueOrder(world,order);
      for(let d=1;d<=preview.days;d++){next=core.advanceWorld(next,1);expect(core.validateWorld(next)).toBe(true);if(d<preview.days)expect(next.armies[0].provinceId).not.toBe(target.id);}
      expect(next.armies[0].provinceId).toBe(target.id);times.push(preview.days);
    }
    expect(times[3]).toBeLessThan(times[0]);expect(times[2]).toBeGreaterThan(times[0]);
  });
  it('shield border redeployment reserves grain using its actual slower mountain travel',()=>{
    const run=make(),w=structuredClone(run.world),a=w.armies[0],p=w.provinces.find(p=>p.id===a.provinceId)!;
    const q=w.provinces.find(q=>p.neighbors.includes(q.id)&&q.neighbors.some(id=>id!==p.id))!,r=w.provinces.find(r=>q.neighbors.includes(r.id)&&r.id!==p.id)!;
    w.provinces.forEach(p=>{p.controller=a.nationId;p.neighbors=[];});p.neighbors=[q.id];q.neighbors=[p.id,r.id];r.neighbors=[q.id];r.controller=w.nations[1].id;q.terrain='mountain';
    w.armies=[a];a.supplies=40;w.day=(2-[...a.id].reduce((s,c)=>s+c.charCodeAt(0),0)%3+3)%3;
    w.statecraft!.provinces.forEach(p=>p.grain=1e8);
    const core=createMilitaryCore({[a.id]:'Shield'}),next=core.advanceWorld(w,1);
    expect(next.armies[0].status).toBe('idle');expect(next.armies[0].provinceId).toBe(p.id);
  });
  it('cavalry AI does not claim a mountain attack advantage it does not possess',()=>{
    const run=make(),w=structuredClone(run.world),a=w.armies[0],b=w.armies[3],p=w.provinces.find(p=>p.id===a.provinceId)!,target=w.provinces.find(q=>p.neighbors.includes(q.id))!;
    w.provinces.forEach(p=>p.controller=a.nationId);target.controller=b.nationId;target.terrain='mountain';w.cities.forEach(c=>c.fort=0);
    a.troops=2500;b.troops=1800;a.morale=b.morale=100;a.supplies=b.supplies=80;b.provinceId=target.id;b.status='fighting';w.armies=[a,b];
    w.day=(2-[...a.id].reduce((s,c)=>s+c.charCodeAt(0),0)%3+3)%3;
    w.statecraft!.relations.find(r=>[r.a,r.b].includes(a.nationId)&&[r.a,r.b].includes(b.nationId))!.status='war';w.statecraft!.provinces.forEach(p=>p.grain=1e8);
    const next=createMilitaryCore({[a.id]:'Cavalry',[b.id]:'Infantry'}).advanceWorld(w,1);
    expect(next.armies[0].status).toBe('idle');expect(next.armies[0].route).toEqual([]);
  });
  it('v2 saves preserve units and relocation independently of v1 and enforce CAS',async()=>{
    const f=new IDBFactory(),old=createFmsRun(grid(),4),run=withMilitary(old);
    await saveRun(old,null,f);await saveRun(run,null,f);const a={...run,world:playRules(run).advanceWorld(run.world,1)},b={...run,world:playRules(run).advanceWorld(run.world,2)};
    const results=await Promise.allSettled([saveRun(a,1,f),saveRun(b,1,f)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect((await loadRun(f,1))?.run).toEqual(old);expect((await loadRun(f,3))?.run.version).toBe(2);
    await tamper(f,'current',v=>{v.checksum='damaged';});expect((await loadRun(f,3))?.run).toEqual(run);
  });
  for(const slot of ['current','backup'])it(`locks future ${slot} v2 rules without affecting v1`,async()=>{
    const f=new IDBFactory(),old=createFmsRun(grid(),4),run=withMilitary(old);await saveRun(old,null,f);await saveRun(run,null,f);await saveRun(run,1,f);
    await tamper(f,slot,v=>{(v.run as {rules:string}).rules='fms-military-99';});await expect(loadRun(f,3)).rejects.toThrow('锁定');await expect(saveRun(run,2,f)).rejects.toThrow('锁定');expect((await loadRun(f,1))?.run).toEqual(old);
  });
});
