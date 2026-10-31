import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {advancePeopleMonthOwned47,diePersonOwned47} from '../fms/play/civilization47-lifecycle';
import original from '../fms/play/native-economy/character-traits.json';

import {peopleView,patch,type Run} from './run-view';

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
