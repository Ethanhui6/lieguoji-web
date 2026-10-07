import {beforeAll,afterEach,describe,it,expect,vi} from 'vitest';
import {War33Session} from './war33-session';
import {tributeFixture32} from './war32.test-support';
import {PlayClient} from './war33-client';
import {war29View,type War33Run} from './war33-model';
import {grid} from './fixture.test-support';
class FakeWorker{
 static last:FakeWorker;onmessage?:(e:MessageEvent)=>void;onerror?:()=>void;message?:{id:number};terminated=false;
 constructor(){FakeWorker.last=this;}postMessage(message:{id:number}){this.message=message;}terminate(){this.terminated=true;}
 reply(data:object){this.onmessage?.({data:{id:this.message!.id,...data}} as MessageEvent);}
}
let seed:War33Run;
beforeAll(()=>{seed=new War33Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:24,relations:'peace'}).run as War33Run;});
afterEach(()=>vi.unstubAllGlobals());
describe.each([29,32,33] as const)('candidate Worker client v%s deltas',version=>{
 it('keeps generation metadata and requires current mutable native history only for v33',async()=>{
  vi.stubGlobal('Worker',FakeWorker);const client=new PlayClient(),r=version===32?tributeFixture32():version===29?war29View(structuredClone(seed)):structuredClone(seed),load=client.send({type:'load',run:r});FakeWorker.last.reply({world:r.world,run:r});await load;
  const delta:Record<string,unknown>={...r};delete delta.generation;
  const expected={day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick};
  if(version===33){const missing={...delta};delete missing.nativeDiplomacy;const rejected=client.send({type:'tick',ticks:1,expected}),assertion=expect(rejected).rejects.toThrow(/快照缺失/);FakeWorker.last.reply({world:r.world,update:missing});await assertion;}
  const tick=client.send({type:'tick',ticks:1,expected});FakeWorker.last.reply({world:r.world,update:delta});expect((await tick).run).toEqual(r);client.close();
 });
});
it.each(['rebellion','tribute','vassals','nativeDiplomacy','diplomacy','nativeWars','losses','warfare','voyages','kin','life','destiny','sovereignty','naming','culture','people','finance','upperCombat','chronicle','reorganization','tactics'])('rejects omitted v33 %s and retains its good snapshot',async field=>{
 vi.stubGlobal('Worker',FakeWorker);const r=structuredClone(seed),client=new PlayClient(),load=client.send({type:'load',run:r});FakeWorker.last.reply({world:r.world,run:r});await load;const delta:Record<string,unknown>={...r};delete delta[field];
 const expected={day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick},bad=client.send({type:'tick',ticks:1,expected}),assertion=expect(bad).rejects.toThrow(/快照/);FakeWorker.last.reply({world:r.world,update:delta});await assertion;
 const good=client.send({type:'tick',ticks:1,expected});FakeWorker.last.reply({world:r.world,update:{...r}});expect((await good).run).toEqual(r);client.close();
});
