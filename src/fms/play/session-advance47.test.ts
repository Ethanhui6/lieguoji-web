import {beforeAll,describe,it,expect,vi} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal} from './culture47-session';
import {advanceSessionBatch47,readSessionAdvanceCandidate47,type SessionAdvanceLease47} from './session-advance47';
import * as military from './civilization47-military';
import * as geography from './geography-content47';
import {settleCivilizationDay47,settleSessionCivilizationDay47} from './civilization47-daily';
import {withOwnedTravel47} from './owned-travel47';
import {advanceSessionMilitaryWindow47} from './force-tick47';
const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
const action=(ticks:number)=>({kind:'advance' as const,ticks});
let journal:Culture47Journal;
beforeAll(()=>{journal=new Culture47Session().create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:24,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese']}}).journal;},30000);
const ready=()=>{const owner=new Culture47Session();owner.load(journal);return owner;};
describe('private advance batch ownership',()=>{
 it('copies the dynamic candidate once for four peaceful days without weakening public entry isolation',()=>{
  const owner=ready(),before=owner.snapshot();geography.prepareOwnedGeography47(before.run);
  const clone=vi.spyOn(geography,'cloneMilitaryCandidate47');
  let run;
  try{run=advanceSessionBatch47(before.run,[action(120),action(120),action(120),action(120)],weights);expect(clone).toHaveBeenCalledTimes(1);}finally{clone.mockRestore();}
  expect(run.world.day).toBe(4);expect(owner.snapshot()).toEqual(before);
  expect(run).toEqual(new Culture47Session().load({...journal,actions:[action(120),action(120),action(120),action(120)]}).run);
  const original=structuredClone(before.run);
  withOwnedTravel47(()=>{const pending=military.advanceCivilizationMilitary47(before.run,120,weights).run,beforeDay=structuredClone(pending);settleCivilizationDay47(pending,()=>undefined);expect(pending).toEqual(beforeDay);});
  expect(before.run).toEqual(original);
 },60000);
 it('stops exactly at partial and crossing-day endpoints and matches the untouched replay path',()=>{
  const owner=ready(),actions=[action(1),action(17),action(120),action(120)];
  owner.executeDisplay(actions,0);
  const snapshot=owner.snapshot();expect(snapshot.run.clock.tick).toBe(258);expect(snapshot.run.world.day).toBe(2);
  expect(new Culture47Session().load(snapshot.journal)).toEqual(snapshot);
 },60000);
 it('rejects forged or copied leases and revokes the authentic lease after success and failure',()=>{
  expect(()=>readSessionAdvanceCandidate47({} as SessionAdvanceLease47)).toThrow(/凭证/);
  const owner=ready(),original=military.advanceSessionCivilizationMilitary47;let lease:SessionAdvanceLease47|undefined;
  const spy=vi.spyOn(military,'advanceSessionCivilizationMilitary47').mockImplementation((...args)=>{
   lease=args[0];expect(()=>readSessionAdvanceCandidate47(structuredClone(lease!))).toThrow(/凭证/);return original(...args);
  });
  try{owner.executeDisplay([action(1)],0);}finally{spy.mockRestore();}
  expect(lease).toBeDefined();expect(()=>readSessionAdvanceCandidate47(lease!)).toThrow(/凭证/);
  expect(()=>military.advanceSessionCivilizationMilitary47(lease!,1,weights)).toThrow(/凭证/);
  expect(()=>settleSessionCivilizationDay47(lease!,()=>undefined)).toThrow(/凭证/);
  expect(()=>advanceSessionMilitaryWindow47(lease!,1,weights,{} as never)).toThrow(/凭证/);
  const prior=owner.snapshot();
  const fail=vi.spyOn(military,'advanceSessionCivilizationMilitary47').mockImplementation((...args)=>{lease=args[0];original(...args);throw Error('late private failure');});
  try{expect(()=>owner.executeDisplay([action(1)],1)).toThrow(/late private/);}finally{fail.mockRestore();}
  expect(owner.snapshot()).toEqual(prior);expect(()=>readSessionAdvanceCandidate47(lease!)).toThrow(/凭证/);
 },30000);
 it('rejects terrain damage in the first action before a later action can repair it',()=>{
  const owner=ready(),before=owner.snapshot(),original=military.advanceSessionCivilizationMilitary47;let calls=0;
  const spy=vi.spyOn(military,'advanceSessionCivilizationMilitary47').mockImplementation((...args)=>{const out=original(...args);calls++;out.run.terrain.elevations[0]+=calls===1?1:-1;return out;});
  try{expect(()=>owner.executeDisplay([action(1),action(1)],0)).toThrow(/地形发生变化/);expect(calls).toBe(1);}finally{spy.mockRestore();}
  expect(owner.snapshot()).toEqual(before);owner.executeDisplay([action(1),action(1)],0);expect(owner.snapshot().run.clock.tick).toBe(2);
 },30000);
});
