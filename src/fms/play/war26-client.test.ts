import {settlement25View} from './war26-model';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {PlayClient} from './war26-client';
import {War26Session} from './war26-session';
import type {War26Run} from './war26-model';
import {grid} from './fixture.test-support';
class FakeWorker{
 static last:FakeWorker;onmessage?: (e:MessageEvent)=>void;onerror?:()=>void;message?:{id:number};terminated=false;
 constructor(){FakeWorker.last=this;}postMessage(message:{id:number}){this.message=message;}terminate(){this.terminated=true;}
 reply(data:object){this.onmessage?.({data:{id:this.message!.id,...data}} as MessageEvent);}
}
let seed:War26Run;
beforeAll(()=>{seed=new War26Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:24,relations:'peace'}).run as War26Run;});
afterEach(()=>vi.unstubAllGlobals());
describe.each([25,26] as const)('war client version %s deltas',version=>{
 it('retains immutable generation metadata when the tick delta omits it',async()=>{
  vi.stubGlobal('Worker',FakeWorker);const client=new PlayClient(),r=version===25?settlement25View(structuredClone(seed)):structuredClone(seed),load=client.send({type:'load',run:r});FakeWorker.last.reply({world:r.world,run:r});await load;
  const delta:Record<string,unknown>={...r};delete delta.generation;
  const tick=client.send({type:'tick',ticks:1,expected:{day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick}});FakeWorker.last.reply({world:r.world,update:delta});expect((await tick).run).toMatchObject({version,generation:r.generation});client.close();
 });
 it.each(['destiny','sovereignty','naming','culture','people','finance','upperCombat','chronicle','reorganization','life','kin','voyages',...(version===26?['warfare']:[])])('rejects %s omission without replacing the good snapshot',async key=>{
  vi.stubGlobal('Worker',FakeWorker);const client=new PlayClient(),r=version===25?settlement25View(structuredClone(seed)):structuredClone(seed),load=client.send({type:'load',run:r});FakeWorker.last.reply({world:r.world,run:r});await load;
  const broken:Record<string,unknown>={...r};delete broken[key];
  const command={type:'tick' as const,ticks:1,expected:{day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick}},pending=client.send(command);FakeWorker.last.reply({world:r.world,update:broken});await expect(pending).rejects.toThrow(/快照缺失/);
  const good=client.send(command);FakeWorker.last.reply({world:r.world,update:{...r,clock:{...r.clock,tick:1}}});expect((await good).run).toMatchObject({version,naming:r.naming,clock:{tick:1}});client.close();expect(FakeWorker.last.terminated).toBe(true);
 });
});
