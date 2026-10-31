import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {advancePeopleMonthOwned47,diePersonOwned47} from '../fms/play/civilization47-lifecycle';
import original from '../fms/play/native-economy/character-traits.json';
import type {FoundingForces47} from '../fms/play/civilization47-forces';
import type {Population47} from '../fms/play/civilization47-population-types';

type Run=FoundingForces47&Population47;
/** The part of the run the people lifecycle reads and writes, with the world slimmed to what it
 * looks up and the chronicle trimmed to its last entries (it only appends). */
export function peopleView(r:Run){
  const w=r.world;
  return structuredClone({
    clock:r.clock,
    world:{day:w.day,nextEventId:w.nextEventId,events:w.events,custom:{seed:w.custom!.seed},nations:w.nations.map(n=>({id:n.id,name:n.name,capitalId:n.capitalId})),
      provinces:w.provinces.map(p=>({id:p.id,name:p.name,controller:p.controller,legalOwner:p.legalOwner,center:p.center})),cities:w.cities.map(c=>({id:c.id,name:c.name,provinceId:c.provinceId}))},
    kin:r.kin,life:r.life,people:r.people,civilization:r.civilization,sovereignty:r.sovereignty,nobility:(r as {nobility?:unknown}).nobility??null,
    nativeWars:{campaigns:r.nativeWars.campaigns.map(c=>({attacker:c.attacker,defender:c.defender,endedTick:c.endedTick,internal:c.internal?{casusBelliId:(c.internal as {casusBelliId?:number}).casusBelliId??null}:null}))},
    chronicle:{...r.chronicle,entries:r.chronicle.entries.slice(-3)},
  });
}
type Patch={p:string[];v?:unknown;d?:1}[];
/** Set/delete operations turning `a` into `b`: objects recurse, arrays and values are replaced. */
export function patch(a:unknown,b:unknown,path:string[]=[],out:Patch=[]):Patch{
  const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
  if(object(a)&&object(b)){
    for(const k of Object.keys(b))if(!Object.hasOwn(a,k))out.push({p:[...path,k],v:b[k]});else patch(a[k],b[k],[...path,k],out);
    for(const k of Object.keys(a))if(!Object.hasOwn(b,k))out.push({p:[...path,k],d:1});
  }else if(JSON.stringify(a)!==JSON.stringify(b))out.push({p:path,v:b});
  return out;
}

/** Golden samples for the Swift people lifecycle (civilization47-lifecycle): each ISO month boundary
 * of three years (aging, natural death, succession, vacancies), and a ruler death per nation in turn
 * (death, family head and national succession by polity). Run with EXPORT_NATIVE_WORLD=1. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports people golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;const samples:unknown[]=[];let deaths=0;
  for(let day=0;day<1100&&samples.length<18;day++){
    const before=x.run as Run;
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    const after=x.run as Run;
    if(after.kin.lifecycle.lastMonth===before.kin.lifecycle.lastMonth)continue;
    const monthly=samples.length%2===0;
    const r=structuredClone(before);
    r.life.currentDate=structuredClone(after.life.currentDate);r.life.gameTime=after.life.gameTime;r.clock.tick=after.clock.tick;r.world.day=after.world.day;
    if(!monthly){
      // A ruler death in turn: the executed path of diePersonOwned47, on the month's input.
      const nations=r.world.nations.filter(n=>r.people.nations[n.id].leaderId!==null&&r.world.provinces.some(p=>p.controller===n.id));
      const n=nations[deaths++%nations.length],person=r.kin.persons[r.people.nations[n.id].leaderId!];
      const input=peopleView(r);diePersonOwned47(r,person,deaths%2?'executed':'natural');
      samples.push({kind:'die',nationId:n.id,personId:person.id,cause:deaths%2?'executed':'natural',input,patch:patch(input,peopleView(r))});
      continue;
    }
    const input=peopleView(r);advancePeopleMonthOwned47(r);
    samples.push({kind:'month',input,patch:patch(input,peopleView(r))});
  }
  expect(samples.length).toBeGreaterThan(10);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/people.json',JSON.stringify({traits:original.traits,samples}));
},3600000);
