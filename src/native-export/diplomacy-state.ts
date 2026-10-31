import {orderedWar28Provinces} from '../fms/play/war47-wars';
import {war26Strength} from '../fms/play/war26-strength';
import {allianceOf46} from '../fms/play/war46-alliance';
import {overlord46} from '../fms/play/war46-vassals';
import {CULTURE_IDS47} from '../fms/play/civilization47-catalog';
import {POLITIES} from '../fms/play/upper14-state';
import {NATIVE_CHARACTER_POOL} from '../fms/play/native-economy/character-generation';
import {personSkills} from '../fms/play/court16-people';
import {actualForces47} from '../fms/play/force-runtime47';
import {travelFeatures47} from '../fms/play/civilization47-army-ai';
import type {PoliticalRun47} from '../fms/play/civilization47-diplomatic-world';

type Run=PoliticalRun47;
/** Static diplomatic geography (war30-geography diplomaticProvinceView): land provinces numbered in
 * landIds order (= world.provinces order, asserted), then water provinces; their neighbour lists;
 * positions for claim distances; each land province's land neighbours, centre, string id and the
 * travel-graph sea components touching it (claimEntry47). */
export function diplomacyStatic(r:Run){
  const geo=r.diplomaticGeography;
  if(JSON.stringify(geo.landIds)!==JSON.stringify(r.world.provinces.map(p=>p.id))||JSON.stringify(r.nativeWars.provinceIds)!==JSON.stringify(geo.landIds))throw Error('diplomatic province order differs from world order');
  const numbers=new Map(geo.landIds.map((id,i)=>[id,i+1])),coasts=new Map(geo.landIds.map(id=>[id,[] as number[]]));
  for(const w of geo.water)for(const id of w.landIds)coasts.get(id)!.push(w.id);
  const g=actualForces47(r).spatial.graph,features=travelFeatures47(g);
  const wet=(id:string)=>[...new Set((g.byProvince.get(id)??[]).flatMap(cell=>g.cells.get(cell)!.links.map(l=>g.cells.get(l.to)!).filter(c=>c.surface==='sea').map(c=>features.get(c.id)!)))].sort();
  return {
    land:r.world.provinces.map(p=>({id:p.id,neighbors:[...p.neighbors.map(id=>numbers.get(id)!),...coasts.get(p.id)!],land:p.neighbors.map(id=>numbers.get(id)!-1),x:p.center.x,y:p.center.y,wet:wet(p.id)})),
    water:geo.water.map(p=>({id:p.id,neighbors:[...p.landIds.map(id=>numbers.get(id)!),...p.neighbors],x:p.center.x,y:p.center.y})),
  };
}
/** Everything evaluateDeclaration47 reads, for one moment of a web run. */
export function diplomacySnapshot(r:Run){
  const w=r.world,s=r.nativeDiplomacy,index=new Map(w.nations.map((n,i)=>[n.id,i])),provinceIndex=new Map(w.provinces.map((p,i)=>[p.id,i]));
  return {
    gameTime:r.life.gameTime,originTime:s.originTime,secondsPerDay:r.life.secondsPerDay,start:r.life.startDate,day:w.day,worldAuto:r.diplomacy.worldAuto,rng:s.rng,draws:s.draws,
    nations:w.nations.map(n=>{const d=s.nations[n.id],leaderId=r.people.nations[n.id].leaderId,p=leaderId===null?null:r.people.persons[leaderId],a=allianceOf46(r,n.id),lord=overlord46(r,n.id);
      return {id:r.people.nations[n.id].id,provinces:orderedWar28Provinces(r,n.id).map(p=>provinceIndex.get(p.id)!),overlord:lord===null?-1:index.get(lord)!,auto:r.diplomacy.nations[n.id]===true,
        expansionism:d.expansionism,culture:CULTURE_IDS47.indexOf(r.civilization.nations[n.id].cultureId as never)+1,polity:POLITIES.indexOf(r.upperCombat.nations[n.id].polity),
        alliance:a?r.alliances.records.indexOf(a):-1,
        leader:p?{alive:(p as unknown as {alive?:unknown}).alive===true,traits:p.traits.map(name=>{const t=NATIVE_CHARACTER_POOL.find(t=>t.name===name)!;return {name,bonus:'relationshipBonus'in t?Number(t.relationshipBonus):0};}),diplomatic:personSkills(r.people.persons[p.id]).diplomatic}:null,
        activeTime:d.activeTime,passiveTime:d.passiveTime,pools:{...d.pools},strength:war26Strength(w,r,n.id),
        troops:[...w.armies,...r.transports.cargo.map(c=>c.army)].filter(a=>a.nationId===n.id&&a.status!=='destroyed').map(a=>a.troops),ships:r.navy.fleets.filter(f=>f.nationId===n.id&&f.status!=='lost').map(f=>f.ships)};}),
    cultures:w.provinces.map(p=>CULTURE_IDS47.indexOf(r.sovereignty.provinces[p.id].mapCultureId as never)+1),
    connected:w.provinces.map(p=>r.upperCombat.provinces[p.id].connected===true),
    relations:s.relations.map(p=>({a:index.get(p.a)!,b:index.get(p.b)!,lastWar:p.lastWar,warCount:p.warCount})),
    statecraft:w.statecraft!.relations.map(p=>({a:index.get(p.a)!,b:index.get(p.b)!,war:p.status==='war',truceUntilDay:p.truceUntilDay??0})),
    alliances:r.alliances.records.map(a=>({ended:a.endedTick!==null,members:a.members.map(id=>index.get(id)!)})),
    vassals:r.vassals.records.filter(v=>v.endedTick===null).map(v=>[index.get(v.overlordId)!,index.get(v.vassalId)!]),
  };
}
/** The monthly diplomacy calendar (advanceDiplomaticSchedule46): current month, last day, and each
 * nation's drawn update day and last updated month. */
export function diplomacySchedule(r:Run){
  const s=r.nativeDiplomacy;
  return {month:s.month,lastDay:s.lastDay,nations:r.world.nations.map(n=>({updateDay:s.nations[n.id].updateDay,updatedMonth:s.nations[n.id].updatedMonth}))};
}
