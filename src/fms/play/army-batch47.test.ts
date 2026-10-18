import {describe,it,expect,beforeAll} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {rotateArmyBatch47,assertArmyBatch47,consumeArmyBatch47,ARMY_BATCH_RULE47} from './army-batch47';
import {Culture47Session,type Culture47Journal} from './culture47-session';
import {FRAME_LOOP_RULE47} from './frame-loop47';
import {populationStamp47} from './civilization47-population-types';
import {grid} from './fixture.test-support';
import {loadCulture47,saveCulture47} from './culture47-storage';
import {issueArmyOrderOwned47} from './army-commands47';
import {advanceCivilizationMilitary47} from './civilization47-military';
import {settleArmyAutonomyDay47} from './civilization47-army-ai';

let journal:Culture47Journal;
beforeAll(()=>{
 const owner=new Culture47Session();let s=owner.create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:24,relations:'war',setup:{mode:'culture-generated',enabled:['chinese','japanese']}});
 s=owner.execute({kind:'enable-frame-loop',rule:FRAME_LOOP_RULE47,expected:populationStamp47(s.run)},0);
 journal=owner.execute({kind:'enable-army-batch',rule:ARMY_BATCH_RULE47,expected:populationStamp47(s.run)},1).journal;
},30000);
describe('native five-call rotation driving real WEB army orders',()=>{
 it('wraps short lists and resets an out-of-range cursor instead of modulo',()=>{
  expect(rotateArmyBatch47(['a','b'],0)).toEqual({selected:['a','b','a','b','a'],cursor:1});
  expect(rotateArmyBatch47(['a','b','c'],8)).toEqual({selected:['a','b','c','a','b'],cursor:2});
  expect(rotateArmyBatch47([],8)).toEqual({selected:[],cursor:8});
 });
 it('issues real orders before the first daily closeout and does not repeat a consumed frame',()=>{
  const o=new Culture47Session();o.load(journal);const s=o.execute({kind:'advance',ticks:20},2);
  expect(s.run.world.day).toBe(0);expect(s.run.dailyEconomy.lastDay).toBe(0);
  expect(s.run.armyBatch).toMatchObject({calls:5,lastTick:20});
  expect(Object.values(s.run.armyAutonomy.armies).some(a=>a.issuedTick===20)).toBe(true);
  expect(Object.values(s.run.armyPositions.records).some(p=>p.status==='moving')).toBe(true);
  const before=structuredClone(s.run.armyBatch);expect(consumeArmyBatch47(s.run)).toEqual([]);expect(s.run.armyBatch).toEqual(before);
 });
 it('preserves day settlement, state under split requests, exact journal replay and IndexedDB cold restore',async()=>{
  const a=new Culture47Session(),b=new Culture47Session();a.load(journal);b.load(journal);
  for(let day=0;day<4;day++){a.executeDisplay([{kind:'advance',ticks:120}],a.snapshot().journal.actions.length);for(let f=0;f<6;f++)b.executeDisplay([{kind:'advance',ticks:20}],b.snapshot().journal.actions.length);}
  const result=a.snapshot();expect(b.snapshot().run).toEqual(result.run);expect(result.run.armyBatch?.calls).toBe(120);expect(result.run.dailyEconomy.lastDay).toBe(4);
  expect(new Culture47Session().load(result.journal)).toEqual(result);
  const db=new IDBFactory();await saveCulture47(result.journal,null,db);const saved=await loadCulture47(db);expect(saved).not.toBeNull();expect(new Culture47Session().load(saved!.journal)).toEqual(result);
 },60000);
 it('rejects malformed rotation and repeated enabling without changing the live candidate',()=>{
  const o=new Culture47Session(),s=o.load(journal);
  expect(()=>assertArmyBatch47({...s.run,armyBatch:{...s.run.armyBatch!,cursor:-1}})).toThrow();
  expect(()=>assertArmyBatch47({...s.run,armyBatch:{...s.run.armyBatch!,lastTick:20}})).toThrow();
  expect(()=>o.execute({kind:'enable-army-batch',rule:ARMY_BATCH_RULE47,expected:populationStamp47(s.run)},2)).toThrow();expect(o.snapshot()).toEqual(s);
 });
 it('keeps player halt orders through rotating AI updates',()=>{
  const o=new Culture47Session();o.load(journal);const s=o.execute({kind:'advance',ticks:20},2),id=s.run.world.armies.find(a=>s.run.armyPositions.records[a.id].status==='moving')!.id;
  const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
  issueArmyOrderOwned47(s.run,{type:'army-halt',armyId:id},weights,'player');
  const before=structuredClone(s.run.armyPositions.records[id]);
  let out=s.run;
  const targetCalls=out.world.armies.length+10;
  while(out.armyBatch!.calls<targetCalls){const step=advanceCivilizationMilitary47(out,20,weights);out=step.dailyPending?settleArmyAutonomyDay47(step.run,weights):step.run;}
  expect(out.voyages.manualArmies).toContain(id);expect(out.armyAutonomy.armies[id].decision).toBe('manual');
  expect(out.armyPositions.records[id]).toEqual(before);expect(out.armyBatch!.calls).toBeGreaterThanOrEqual(targetCalls);
 });
});
