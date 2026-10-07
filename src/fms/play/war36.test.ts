import {beforeAll,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {accessFixture36,border36,stamp36} from './war36.test-support';
import {War36Session} from './war36-session';
import {War35Session} from './war35-session';
import {allianceFixture35} from './war35.test-support';
import {assertWar36Run,type War36Run} from './war36-model';
import {applyAlliance36} from './war36-alliance';
import {applyAlliance35} from './war35-alliance';
import {militaryAccess36,militaryDistances36} from './war36-access';
import {createMilitaryCore} from './war36-core';
import {previewBattle} from './war36-battle';
import {declareWar36} from './war36-declaration';
import {makeVassal36} from './war36-vassals';
import {leaveWars36} from './war36-settlement';
import {saveRun,loadRun} from './war36-stores';
import {verifyWar35Compatibility,FROZEN_WAR35_ENGINE} from '../../../scripts/fms-war36-compat';
let seed:War36Run;beforeAll(()=>{seed=accessFixture36();assertWar36Run(seed);});
const world=()=>structuredClone(seed);
const rules=(r:War36Run)=>createMilitaryCore(r.units,true,true,undefined,undefined,undefined,undefined,undefined,undefined,militaryAccess36(r));
const unite=(r:War36Run,a:string,b:string)=>applyAlliance36(r,{type:'unite',nationId:a,targetId:b});
it('freezes v35 execution and delegates both old tick and alliance commands without upgrading',()=>{
 expect(verifyWar35Compatibility()).toBe(FROZEN_WAR35_ENGINE);const r=allianceFixture35(),a=new War35Session(),b=new War36Session();a.execute({type:'load',run:r});b.execute({type:'load',run:r});
 const c={type:'alliance-edit' as const,edit:{type:'unite' as const,nationId:'n-0',targetId:'n-1'},expected:stamp36(r as unknown as War36Run),revision:0,runId:r.id};expect(b.execute(c)).toEqual(a.execute(c));expect(b.execute({type:'step',days:1})).toEqual(a.execute({type:'step',days:1}));
},30000);
it('explicit v35 copy retains actual alliances, saves both DBs and never changes old IDs or bytes',async()=>{
 const old=allianceFixture35();applyAlliance35(old,{type:'unite',nationId:'n-0',targetId:'n-1'});const before=structuredClone(old),db=new IDBFactory();await saveRun(old,null,db);
 const n=new War36Session().execute({type:'copy',run:old}).run as War36Run;expect(n.rules).toBe('fms-war-36');expect(n.alliances).toEqual(old.alliances);expect(n.id).not.toBe(old.id);expect(old).toEqual(before);await saveRun(n,null,db);expect((await loadRun(db,37))!.run).toEqual(before);expect((await loadRun(db))!.run).toEqual(n);
});
it('grants actual alliance and directional overlord access, never a transitive alliance or enemy pass',()=>{
 const r=world();unite(r,'n-0','n-1');expect(makeVassal36(r,'n-2','n-1',id=>leaveWars36(r,id)).success).toBe(true);const access=militaryAccess36(r);
 expect(access(r.world,'n-0','n-1')).toBe(true);expect(access(r.world,'n-1','n-2')).toBe(true);expect(access(r.world,'n-2','n-1')).toBe(false);expect(access(r.world,'n-0','n-2')).toBe(false);
 const relation=r.world.statecraft!.relations.find(p=>[p.a,p.b].includes('n-0')&&[p.a,p.b].includes('n-1'))!;relation.status='war';expect(access(r.world,'n-0','n-1')).toBe(false);
});
it('neutral order is refused; alliance preview returns actual connected route without mutating data',()=>{
 const r=world(),{p,q,a}=border36(r),order={armyId:a.id,targetId:q.id,kind:'march' as const};expect(rules(r).previewOrder(r.world,order).valid).toBe(false);unite(r,p.controller,q.controller);
 const before=structuredClone(r),preview=rules(r).previewOrder(r.world,order);expect(preview.valid).toBe(true);expect(preview.route).toEqual([p.id,q.id]);expect(preview.warnings.join()).toContain('友方借道');expect(r).toEqual(before);
});
it('Worker session actually marches through an ally, retains control and plan, then saves/restores position',async()=>{
 const r=world(),{p,q,after,a}=border36(r);unite(r,p.controller,q.controller);const owners=r.world.provinces.map(p=>p.controller),s=new War36Session();s.execute({type:'load',run:r});
 let n=s.execute({type:'order',order:{armyId:a.id,targetId:after.id,kind:'march'},expected:stamp36(r)}).run as War36Run;
 expect(n.battles.plans[a.id]).toBeDefined();n=s.execute({type:'tick',ticks:60,expected:stamp36(n)}).run as War36Run;expect(n.world.armies.find(v=>v.id===a.id)!.progress).toBeGreaterThan(0);expect(n.battles.plans[a.id]).toBeDefined();
 const db=new IDBFactory();await saveRun(n,null,db);const restored=(await loadRun(db))!.run;expect(restored).toEqual(n);const next=new War36Session();next.execute({type:'load',run:restored});
 n=next.execute({type:'step',days:7}).run as War36Run;expect(n.world.armies.find(v=>v.id===a.id)!.provinceId).toBe(after.id);expect(n.world.provinces.map(p=>p.controller)).toEqual(owners);assertWar36Run(n);
},30000);
it('continuous waypoints and retreat both admit friendly territory while unrelated political commands retain routes',()=>{
 const r=world(),{p,q,after,a}=border36(r);unite(r,p.controller,q.controller);const action={type:'attack-route' as const,armyId:a.id,targets:[q.id,after.id]};expect(previewBattle(r.world,r.battles,r.units,action,militaryAccess36(r)).valid).toBe(true);
 expect(rules(r).previewOrder(r.world,{armyId:a.id,targetId:q.id,kind:'retreat'}).valid).toBe(true);const s=new War36Session();s.execute({type:'load',run:r});let n=s.execute({type:'battle',action,expected:stamp36(r)}).run as War36Run;
 n=s.execute({type:'politics',action:{type:'succession',nationId:p.controller},expected:stamp36(n)}).run as War36Run;expect(n.battles.plans[a.id].targets).toEqual([q.id,after.id]);n=s.execute({type:'step',days:1}).run as War36Run;expect(n.battles.plans[a.id]).toBeDefined();assertWar36Run(n);
});
it('leaving mid-leg cancels only remaining plan, keeps physical position and evacuates without occupation',()=>{
 const r=world(),{p,q,after,a}=border36(r);unite(r,p.controller,q.controller);const owners=r.world.provinces.map(p=>p.controller),s=new War36Session();s.execute({type:'load',run:r});let n=s.execute({type:'order',order:{armyId:a.id,targetId:after.id,kind:'march'},expected:stamp36(r)}).run as War36Run;
 n=s.execute({type:'tick',ticks:30,expected:stamp36(n)}).run as War36Run;const before=structuredClone(n.world.armies.find(v=>v.id===a.id)!);
 n=s.execute({type:'alliance-edit',edit:{type:'leave',nationId:p.controller},runId:n.id,revision:n.alliances.revision,expected:stamp36(n)}).run as War36Run;const afterArmy=n.world.armies.find(v=>v.id===a.id)!;expect(afterArmy.progress).toBe(before.progress);expect(afterArmy.provinceId).toBe(before.provinceId);expect(afterArmy.route).toEqual(before.route.slice(0,1));expect(n.battles.plans[a.id]).toBeUndefined();
 n=s.execute({type:'step',days:7}).run as War36Run;const home=n.world.armies.find(v=>v.id===a.id)!;expect(n.world.provinces.find(p=>p.id===home.provinceId)!.controller).toBe(a.nationId);expect(n.world.provinces.map(p=>p.controller)).toEqual(owners);assertWar36Run(n);
},30000);
it('stale repeated order is rejected and no route exists through an unallied neutral country',()=>{
 const r=world(),{p,q,a}=border36(r);unite(r,p.controller,q.controller);const s=new War36Session();s.execute({type:'load',run:r});const c={type:'order' as const,order:{armyId:a.id,targetId:q.id,kind:'march' as const},expected:stamp36(r)};s.execute(c);expect(()=>s.execute(c)).toThrow(/时刻/);
 const neutral=r.world.provinces.find(v=>v.controller!==p.controller&&v.controller!==q.controller)!;expect(rules(r).previewOrder(r.world,{...c.order,targetId:neutral.id}).valid).toBe(false);
});
it('coordinated distances reach a shared enemy through allied territory but never import an ally-only war',()=>{
 const r=world(),{p,q}=border36(r);unite(r,p.controller,q.controller);const enemy=r.world.provinces.find(v=>v.controller!==p.controller&&v.controller!==q.controller)!;
 declareWar36(r,q.controller,enemy.controller);const access=militaryAccess36(r),dist=militaryDistances36(r.world,r.warfare,p.controller,access);expect(dist.has(p.id)).toBe(true);
 const warRelation=r.world.statecraft!.relations.find(v=>[v.a,v.b].includes(p.controller)&&[v.a,v.b].includes(enemy.controller))!;warRelation.status='peace';expect(militaryDistances36(r.world,r.warfare,p.controller,access).size).toBe(0);
});
it('daily AI actually issues a route across an allied border toward a shared objective',()=>{
 const r=world();unite(r,'n-0','n-1');unite(r,'n-0','n-2');unite(r,'n-0','n-3');declareWar36(r,'n-0','n-4');
 const access=militaryAccess36(r);let found:{id:string;from:string;next:string}|undefined;
 for(const nation of r.world.nations.filter(n=>n.id!=='n-4')){
  const dist=militaryDistances36(r.world,r.warfare,nation.id,access);
  for(const p of r.world.provinces.filter(p=>p.controller===nation.id)){
   const next=p.neighbors.map(id=>r.world.provinces.find(p=>p.id===id)!).filter(q=>access(r.world,nation.id,q.controller)&&(dist.get(q.id)??Infinity)<(dist.get(p.id)??Infinity)).sort((a,b)=>(dist.get(a.id)!-dist.get(b.id)!)||a.id.localeCompare(b.id))[0];
   if(next&&next.controller!==nation.id&&!p.neighbors.some(id=>r.world.provinces.find(p=>p.id===id)!.controller==='n-4')){const a=r.world.armies.find(a=>a.nationId===nation.id&&a.status==='idle')!;Object.assign(a,{provinceId:p.id,originId:p.id,route:[],progress:0,morale:100,supplies:100});found={id:a.id,from:p.id,next:next.id};break;}
  }if(found)break;
 }expect(found).toBeDefined();const s=new War36Session();s.execute({type:'load',run:r});const n=s.execute({type:'step',days:3}).run as War36Run,a=n.world.armies.find(a=>a.id===found!.id)!;
 expect(a.route.length>0||a.provinceId!==found!.from).toBe(true);expect(n.world.events.some(e=>e.text.includes(a.name)&&e.reason.includes('有通行权'))).toBe(true);assertWar36Run(n);
},30000);
