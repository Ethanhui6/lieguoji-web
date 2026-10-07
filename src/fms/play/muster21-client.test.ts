import {destiny20View} from './muster21-model';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {PlayClient} from './muster21-client';
import {Muster21Session} from './muster21-session';
import type {Muster21Run} from './muster21-model';
import {grid} from './fixture.test-support';
class FakeWorker{
 static last:FakeWorker;onmessage?: (e:MessageEvent)=>void;onerror?:()=>void;message?:{id:number};terminated=false;
 constructor(){FakeWorker.last=this;}postMessage(message:{id:number}){this.message=message;}terminate(){this.terminated=true;}
 reply(data:object){this.onmessage?.({data:{id:this.message!.id,...data}} as MessageEvent);}
}
let seed:Muster21Run;
beforeAll(()=>{seed=new Muster21Session().execute({type:'create',terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,relations:'peace'}).run as Muster21Run;});
afterEach(()=>vi.unstubAllGlobals());
describe.each([20,21] as const)('muster client version %s deltas',version=>{
 it.each(['destiny','sovereignty','naming','culture','people','finance','upperCombat','chronicle','reorganization'])('rejects %s omission without replacing the good snapshot',async key=>{
  vi.stubGlobal('Worker',FakeWorker);const client=new PlayClient(),r=version===20?destiny20View(structuredClone(seed)):structuredClone(seed),load=client.send({type:'load',run:r});FakeWorker.last.reply({world:r.world,run:r});await load;
  const broken:Record<string,unknown>={...r};delete broken[key];
  const command={type:'tick' as const,ticks:1,expected:{day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick}},pending=client.send(command);FakeWorker.last.reply({world:r.world,update:broken});await expect(pending).rejects.toThrow('国运快照缺失');
  const good=client.send(command);FakeWorker.last.reply({world:r.world,update:{...r,clock:{...r.clock,tick:1}}});expect((await good).run).toMatchObject({version,naming:r.naming,clock:{tick:1}});client.close();expect(FakeWorker.last.terminated).toBe(true);
 });
});
