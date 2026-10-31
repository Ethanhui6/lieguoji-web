import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {actualForces47} from '../fms/play/force-runtime47';
import {readArmySpace47,landHolders47} from '../fms/play/army-space47';
import {recoverArmiesOwned47} from '../fms/play/army-recovery47';
import type {FoundingForces47} from '../fms/play/civilization47-forces';

type Run=FoundingForces47;
/** Golden samples for the Swift wounded-army recovery port (army-recovery47): every five days for
 * three years, one recovery pass on a copy of the web world, with the province stocks and the
 * armies it reads. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports recovery golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;const samples:unknown[]=[];
  for(let day=0;day<1100;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%5!==0)continue;
    const r=structuredClone(x.run) as Run,w=r.world;
    const nation=new Map(w.nations.map((n,i)=>[n.id,i])),index=new Map(w.provinces.map((p,i)=>[p.id,i]));
    for(const n of w.statecraft!.nations)if(n.lastLedger)n.lastLedger.day=w.day;
    const {spatial}=actualForces47(r),space=readArmySpace47(w,{...spatial,positions:r.armyPositions});
    const stock=new Map(w.statecraft!.provinces.map(p=>[p.provinceId,p]));
    const input={
      wars:w.statecraft!.relations.filter(v=>v.status==='war').map(v=>[nation.get(v.a)!,nation.get(v.b)!]),
      provinces:w.provinces.map(p=>({controller:nation.get(p.controller)!,legal:nation.get(p.legalOwner)!,population:stock.get(p.id)!.population,grain:stock.get(p.id)!.grain,
        holders:[...new Set(landHolders47(space,p.id).map(a=>nation.get(a.nationId)!))]})),
      armies:[...space.byArmy.values()].map(v=>({id:v.army.id,name:v.army.name,nation:nation.get(v.army.nationId)!,troops:v.army.troops,status:v.army.status,travel:v.travel.status,
        province:v.province?index.get(v.province.id)!:-1,kind:r.tactics.forces[v.army.id]?.kind??'',fullStrength:r.tactics.forces[v.army.id]?.fullStrength??0})),
    };
    const event=w.nextEventId,consumed=w.nations.map(n=>w.statecraft!.nations.find(s=>s.nationId===n.id)!.lastLedger!.militaryConsumed);
    recoverArmiesOwned47(r);
    const troops=new Map(r.world.armies.map(a=>[a.id,a.troops]));
    if(input.armies.every(a=>troops.get(a.id)===a.troops))continue;
    samples.push({input,output:{troops:input.armies.map(a=>troops.get(a.id)!),
      populations:r.world.provinces.map(p=>stock.get(p.id)!.population),grain:r.world.provinces.map(p=>stock.get(p.id)!.grain),
      consumed:r.world.nations.map((n,i)=>r.world.statecraft!.nations.find(s=>s.nationId===n.id)!.lastLedger!.militaryConsumed-consumed[i]),
      events:r.world.events.filter(e=>e.id>=event).map(e=>e.text)}});
  }
  expect(samples.length).toBeGreaterThan(20);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/recovery.json',JSON.stringify({samples:samples.slice(0,150)}));
},3600000);
