import {describe,it,expect} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {createFmsRun,assertFmsRun} from './world';
import {withMilitary,stepRunDay} from './runtime';
import {mobilize,militaryCapacity} from './mobilization';
import {PlaySession} from './session';
import {saveRun,loadRun} from './storage';
import {military1Fingerprint} from './military-registry';
import {createMilitaryCore as priorCore} from './compat/military1/fms/play/military-core';
import {formStartingUnits as priorFormation} from './compat/military1/fms/play/military-actions';
import {armyMarkers,armiesAt} from './navigation';
import {dayInterval} from './tempo';
import {previewMilitaryAction} from './military-actions';

const make=()=>withMilitary(createFmsRun(grid(),4,'peace'));
describe('population-based forces, compact markers and readable time',()=>{
 it('keeps the exact prior a3d9 engine and its formations, commands and steps',()=>{
  const base=createFmsRun(grid(),4,'war'),formed=priorFormation(base.world);
  const old={...withMilitary(base),...formed,engine:military1Fingerprint},session=new PlaySession();
  session.execute({type:'load',run:old});expect(session.execute({type:'step',days:7}).world).toEqual(priorCore(old.units).advanceWorld(old.world,7));
 });
 it('old v2 copy retains units/orders and two new saves cannot overwrite its original',async()=>{
  const factory=new IDBFactory(),old={...make(),engine:military1Fingerprint},before=structuredClone(old);
  await saveRun(old,null,factory);const session=new PlaySession(),copy=session.execute({type:'copy',run:old}).run!;
  expect(copy.id).not.toBe(old.id);expect(copy.world.armies).toEqual(old.world.armies);if(copy.version!==1)expect(copy.units).toEqual(old.units);
  await saveRun(copy,null,factory);await saveRun(stepRunDay(copy),1,factory);
  expect((await loadRun(factory,2))?.run).toEqual(before);expect((await loadRun(factory,8))?.run.id).toBe(copy.id);expect(old).toEqual(before);
 });
 it('monthly recruitment is funded, changes the unit map and survives a seven-day Worker batch',()=>{
  const run=make();run.world.armies.forEach(a=>{a.status='destroyed';a.troops=0;});run.world.day=29;
  const before=structuredClone(run),recruited=mobilize(run.world,run.units);
  expect(recruited.world.armies.length).toBeGreaterThan(0);
  const headcount=(w:typeof run.world)=>w.statecraft!.provinces.reduce((s,p)=>s+p.population,0)+w.armies.reduce((s,a)=>s+a.troops,0);
  expect(headcount(recruited.world)).toBe(headcount(run.world));
  const cost=recruited.world.armies.reduce((s,a)=>s+Math.ceil(a.troops*100/6),0);
  expect(run.world.statecraft!.provinces.reduce((s,p)=>s+p.grain,0)-recruited.world.statecraft!.provinces.reduce((s,p)=>s+p.grain,0)).toBe(cost);
  const session=new PlaySession();session.execute({type:'load',run});const next=session.execute({type:'step',days:7}).run!;
  expect(()=>assertFmsRun(next)).not.toThrow();expect(next.world.day).toBe(36);expect(run).toEqual(before);
  let sequential=run;for(let i=0;i<7;i++)sequential=stepRunDay(sequential) as typeof run;expect(next).toEqual(sequential);
  for(const n of next.world.statecraft!.nations){const ledger=n.lastLedger!;const grain=next.world.statecraft!.provinces.filter(p=>next.world.provinces.find(q=>q.id===p.provinceId)!.controller===n.nationId).reduce((s,p)=>s+p.grain,0);expect(ledger.closingGrain).toBe(grain);}
 });
 it('does not recruit from occupied territory, combat sites, low population or protected civilian grain',()=>{
  const run=make();run.world.armies=[];run.units={};run.world.day=29;
  const n=run.world.nations[0].id;run.world.provinces.forEach(p=>p.controller=n);
  run.world.statecraft!.provinces.forEach(p=>{p.grain=p.population*10;});expect(mobilize(run.world,run.units).world.armies).toEqual([]);
  run.world.statecraft!.provinces.forEach(p=>{p.grain=1e8;p.population=100;});expect(mobilize(run.world,run.units).world.armies).toEqual([]);
  expect(militaryCapacity(run.world,run.world.nations[1].id).cap).toBe(0);
 });
 it('can save, advance and manually recruit into a valid demilitarized world',async()=>{
  const run=make();run.world.armies=[];run.units={};expect(()=>assertFmsRun(run)).not.toThrow();
  const f=new IDBFactory();await saveRun(run,null,f);expect((await loadRun(f,3))?.run).toEqual(run);
  const session=new PlaySession();session.execute({type:'load',run});const next=session.execute({type:'step',days:1}).run!;
  const n=next.world.nations[0];const action={type:'recruit' as const,nationId:n.id,cityId:n.capitalId,unit:'Infantry' as const,troops:100};
  expect(previewMilitaryAction(next.world,action).valid).toBe(true);
  expect(session.execute({type:'military',action,expected:{day:next.world.day,nextEventId:next.world.nextEventId}}).world.armies).toHaveLength(1);
 });
 it('gradual garrison reinforcement debits people and full new supply stock without filling marching armies',()=>{
  const run=make(),a=run.world.armies[0],p=run.world.statecraft!.provinces.find(p=>p.provinceId===a.provinceId)!;
  run.world.day=4;a.troops=200;a.supplies=40;p.population=50000;p.grain=2e6;
  const next=mobilize(run.world,run.units),b=next.world.armies.find(x=>x.id===a.id)!,l=next.world.statecraft!.provinces.find(q=>q.provinceId===a.provinceId)!;
  const added=b.troops-a.troops;expect(added).toBeGreaterThan(0);expect(added).toBeLessThanOrEqual(300);expect(p.population-l.population).toBe(added);expect(p.grain-l.grain).toBe(Math.ceil(added*100/6));
  expect(b.supplies*b.troops-a.supplies*a.troops).toBeCloseTo(added*100);
  a.status='marching';expect(mobilize(run.world,run.units).world.armies.find(x=>x.id===a.id)!.troops).toBe(a.troops);
 });
 it('coalesces same-country markers while keeping opposing armies selectable and near view detailed',()=>{
  const run=make(),w=run.world,a=w.armies[0],b=w.armies[1];b.nationId=a.nationId;b.provinceId=a.provinceId;
  const far={x:23,y:31,scale:.01},markers=armyMarkers(w,run.scale,far),group=markers.find(m=>m.ids.includes(a.id))!;
  expect(group.ids).toContain(b.id);expect(armiesAt(w,run.scale,far,group)).toContain(b.id);
  expect(armyMarkers(w,run.scale,{...far,scale:20}).every(m=>m.ids.length===1)).toBe(true);
  b.nationId=w.nations.find(n=>n.id!==a.nationId)!.id;expect(armyMarkers(w,run.scale,far).find(m=>m.ids.includes(a.id))!.ids).not.toContain(b.id);
  expect(armyMarkers(w,run.scale,far,a.id).find(m=>m.ids.includes(a.id))!.ids).toEqual([a.id]);
 });
 it('has a slower default and explicit seconds per day at every speed',()=>{
  expect(dayInterval(1)).toBe(3000);expect([.5,1,2,4].map(dayInterval)).toEqual([6000,3000,1500,750]);expect(dayInterval(99)).toBe(3000);
 });
});
