import {beforeAll,afterEach,describe,it,expect,vi} from 'vitest';
import {War45Session} from './war45-session';
import {rebellionFixture33} from './war33.test-support';
import {tributeFixture32} from './war32.test-support';
import {PlayClient} from './war45-client';
import {war29View,type War45Run} from './war45-model';
import {grid} from './fixture.test-support';
class FakeWorker{
 static last:FakeWorker;onmessage?:(e:MessageEvent)=>void;onerror?:()=>void;message?:{id:number};terminated=false;
 constructor(){FakeWorker.last=this;}postMessage(message:{id:number}){this.message=message;}terminate(){this.terminated=true;}
 reply(data:object){this.onmessage?.({data:{id:this.message!.id,...data}} as MessageEvent);}
}
let seed:War45Run;
beforeAll(()=>{seed=new War45Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:24,relations:'peace'}).run as War45Run;});
afterEach(()=>vi.unstubAllGlobals());
it('retains immutable harbor layout across tick deltas and rejects replacements before changing the snapshot',async()=>{
 vi.stubGlobal('Worker',FakeWorker);const r=structuredClone(seed),client=new PlayClient(),load=client.send({type:'load',run:r});FakeWorker.last.reply({world:r.world,run:r});await load;
 const expected={day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick},changed=structuredClone(r);changed.harbors.method='preserved-anchor-v1';expect(changed.harbors).not.toEqual(r.harbors);
 const bad=client.send({type:'tick',ticks:1,expected}),assertion=expect(bad).rejects.toThrow(/港湾地理快照/);FakeWorker.last.reply({world:r.world,update:changed});await assertion;
 const delta:Record<string,unknown>={...r};delete delta.harbors;const good=client.send({type:'tick',ticks:1,expected});FakeWorker.last.reply({world:r.world,update:delta});expect((await good).run).toEqual(r);client.close();
});
describe.each([29,32,33,45] as const)('candidate Worker client v%s deltas',version=>{
 it('keeps generation metadata and requires current mutable native history only for v45',async()=>{
  vi.stubGlobal('Worker',FakeWorker);const client=new PlayClient(),r=version===33?rebellionFixture33():version===32?tributeFixture32():version===29?war29View(structuredClone(seed)):structuredClone(seed),load=client.send({type:'load',run:r});FakeWorker.last.reply({world:r.world,run:r});await load;
  const delta:Record<string,unknown>={...r};delete delta.generation;
  const expected={day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick};
  if(version===45){const missing={...delta};delete missing.nativeDiplomacy;const rejected=client.send({type:'tick',ticks:1,expected}),assertion=expect(rejected).rejects.toThrow(/快照缺失/);FakeWorker.last.reply({world:r.world,update:missing});await assertion;}
  const tick=client.send({type:'tick',ticks:1,expected});FakeWorker.last.reply({world:r.world,update:delta});expect((await tick).run).toEqual(r);client.close();
 });
});
it.each(['shipbuilding','portControl','garrison','navalDeployment','alliances','rebellion','tribute','vassals','nativeDiplomacy','diplomacy','nativeWars','losses','warfare','voyages','kin','life','destiny','sovereignty','naming','culture','people','finance','upperCombat','chronicle','reorganization','tactics'])('rejects omitted v45 %s and retains its good snapshot',async field=>{
 vi.stubGlobal('Worker',FakeWorker);const r=structuredClone(seed),client=new PlayClient(),load=client.send({type:'load',run:r});FakeWorker.last.reply({world:r.world,run:r});await load;const delta:Record<string,unknown>={...r};delete delta[field];
 const expected={day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick},bad=client.send({type:'tick',ticks:1,expected}),assertion=expect(bad).rejects.toThrow(/快照/);FakeWorker.last.reply({world:r.world,update:delta});await assertion;
 const good=client.send({type:'tick',ticks:1,expected});FakeWorker.last.reply({world:r.world,update:{...r}});expect((await good).run).toEqual(r);client.close();
});
