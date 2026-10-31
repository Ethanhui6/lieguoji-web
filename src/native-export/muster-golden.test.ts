import {it,expect} from 'vitest';
import {writeFile,mkdir} from 'node:fs/promises';
import {createNativeWorld} from './native-world';
import {actualForces47} from '../fms/play/force-runtime47';
import {readArmySpace47,landHolders47} from '../fms/play/army-space47';
import {musterMonth47} from '../fms/play/civilization47-monthly-muster';
import {reconcileCore} from '../fms/play/core-refresh51';
import {personTraits} from '../fms/play/court16-people';
import type {EmergencyTrait} from '../fms/play/native-economy/emergency-muster';
import {unitProfiles} from '../fms/play/military-profile';
import type {FoundingForces47} from '../fms/play/civilization47-forces';

type Run=FoundingForces47;
/** Everything musterMonth47 reads, by index: populations, controllers and legal owners, neighbours,
 * the nations holding each province's land, the live and dead armies with home and kind, the core
 * distances, the mobilization cooldowns, destiny and the ruler's emergency traits. */
function musterSnapshot(r:Run){
  const w=r.world,nation=new Map(w.nations.map((n,i)=>[n.id,i])),index=new Map(w.provinces.map((p,i)=>[p.id,i]));
  reconcileCore(w,r.upperCombat);
  const {spatial}=actualForces47(r),space=readArmySpace47(w,{...spatial,positions:r.armyPositions});
  const pop=new Map(w.statecraft!.provinces.map(d=>[d.provinceId,d.population]));
  return {
    day:w.day,nextArmyId:r.tactics.nextArmyId,seed:r.tactics.seed,armyCount:w.armies.length,
    nations:w.nations.map(n=>{const u=r.upperCombat.nations[n.id],h=r.tactics.mobilizations[n.id],leader=r.people.nations[n.id].leaderId,person=leader===null?null:r.people.persons[leader];
      return {name:n.name,coreThreshold:u.coreThreshold,lastMonth:h.lastMonth,recent:h.recent,destiny:r.destiny.nations[n.id].destiny,
        traits:person?(personTraits(person) as EmergencyTrait[]).map(t=>({modifier:t.emergencyMobilizationModifier??0,allowed:t.canEmergencyMobilization!==false})):null};}),
    provinces:w.provinces.map(p=>({name:p.name,city:w.cities.find(c=>c.provinceId===p.id)?.name??null,controller:nation.get(p.controller)!,legal:nation.get(p.legalOwner)!,
      population:pop.get(p.id)!,distance:r.upperCombat.provinces[p.id].distance,neighbors:p.neighbors.map(id=>index.get(id)!),
      holders:[...new Set(landHolders47(space,p.id).map(a=>nation.get(a.nationId)!))]})),
    others:w.statecraft!.provinces.filter(d=>!index.has(d.provinceId)).map(d=>d.population),
    wars:w.statecraft!.relations.filter(v=>v.status==='war').map(v=>[nation.get(v.a)!,nation.get(v.b)!]),
    armies:w.armies.map(a=>{const v=space.byArmy.get(a.id),f=r.tactics.forces[a.id];
      return {id:a.id,nation:nation.get(a.nationId)!,alive:a.troops>0&&a.status!=='destroyed',status:a.status,kind:f?.kind??'regular',home:f?index.get(f.homeId)??-1:-1,
        province:v?.province?index.get(v.province.id)!:-1,travel:v?.travel.status??''};}),
  };
}

/** Golden samples for the Swift monthly muster port (civilization47-monthly-muster): every ten days
 * for three years, a copy of the web world is moved to the next month boundary and mustered. */
it.skipIf(process.env.EXPORT_NATIVE_WORLD!=='1')('exports muster golden samples',async()=>{
  const {session,snapshot}=await createNativeWorld();
  let x=snapshot;const samples:unknown[]=[];
  for(let day=0;day<1100;day++){
    x=session.execute({kind:'advance',ticks:120} as never,x.journal.actions.length);
    if(day%10!==5)continue;
    const r=structuredClone(x.run) as Run;
    if(r.transports.cargo.length)continue;
    const month=Math.floor(r.world.day/30)+1;r.world.day=month*30;r.dailyEconomy.lastMusterMonth=month-1;
    const input=musterSnapshot(r),before=new Set(r.world.armies.map(a=>a.id)),alive=new Set(r.world.armies.filter(a=>a.troops>0&&a.status!=='destroyed').map(a=>a.id));
    const event=r.world.nextEventId;
    musterMonth47(r);
    const index=new Map(r.world.provinces.map((p,i)=>[p.id,i])),nation=new Map(r.world.nations.map((n,i)=>[n.id,i]));
    const pop=new Map(r.world.statecraft!.provinces.map(d=>[d.provinceId,d.population]));
    samples.push({input,output:{
      created:r.world.armies.filter(a=>!before.has(a.id)).map(a=>({id:a.id,name:a.name,nation:nation.get(a.nationId)!,home:index.get(a.provinceId)!,troops:a.troops,unit:r.units[a.id],kind:r.tactics.forces[a.id].kind})),
      disbanded:r.world.armies.filter(a=>alive.has(a.id)&&a.status==='destroyed').map(a=>a.id),
      populations:r.world.provinces.map(p=>pop.get(p.id)!),
      mobilizations:r.world.nations.map(n=>r.tactics.mobilizations[n.id]),seed:r.tactics.seed,nextArmyId:r.tactics.nextArmyId,
      titles:r.world.events.filter(e=>e.id>=event).map(e=>e.text)}});
  }
  expect(samples.length).toBeGreaterThan(50);
  await mkdir('ios-native/Core/Tests/LieguojiCoreTests/Golden',{recursive:true});
  await writeFile('ios-native/Core/Tests/LieguojiCoreTests/Golden/muster.json',JSON.stringify({units:unitProfiles.map(u=>({key:u.key,name:u.name})),samples}));
},3600000);
