import type {FoundingForces47} from './civilization47-forces';
import type {DiplomacySettings} from './war29-diplomacy';
import type {NativeDiplomacy46} from './civilization47-diplomatic-state';
import {nativeBuildWarSides,nativeOpposingPrincipals,type NativeSideMember} from './native-war/side-builder';
import {allianceOf46} from './war46-alliance';
import {overlord46} from './war46-vassals';
import {actualForces47} from './force-runtime47';
import {armyTravelPolicy47} from './army-commands47';
import {haltArmyTravel47} from './army-travel47-state';
import {travelFeatures47} from './civilization47-army-ai';
export type PoliticalRun47=FoundingForces47&{diplomacy:DiplomacySettings;nativeDiplomacy:NativeDiplomacy46};
export function buildParticipants47(r:PoliticalRun47,attacker:string,defender:string){
  const states=r.world.nations.map(n=>({id:r.people.nations[n.id].id,key:n.id,dead:!r.world.provinces.some(p=>p.controller===n.id)})),find=(id:string)=>states.find(n=>n.key===id)??null;
  const a=find(attacker),b=find(defender);if(!a||!b)throw Error('战争主攻或主守国家缺失。');
  const members=nativeBuildWarSides({attackerId:a.id,defenderId:b.id,internal:false,rebelStateId:-1,motherStateId:-1},r.life.gameTime,{
    state:id=>states.find(s=>s.id===id)??null,allianceMembers:s=>(allianceOf46(r,s.key)?.members??[]).map(find),
    isOverlord:s=>r.vassals.records.some(v=>v.endedTick===null&&v.overlordId===s.key),vassals:s=>r.vassals.records.filter(v=>v.endedTick===null&&v.overlordId===s.key).map(v=>find(v.vassalId)),
    isVassal:s=>overlord46(r,s.key)!==null,overlord:s=>{const id=overlord46(r,s.key);return id?find(id):null;},
  });if(!nativeOpposingPrincipals(members,a.id,b.id))throw Error('主攻与主守不能组成相对战方。');return members;
}
export function openCoalitionRelations47(r:PoliticalRun47,members:readonly NativeSideMember[]){
  const key=(id:number)=>r.world.nations.find(n=>r.people.nations[n.id].id===id)!.id;
  for(const a of members.filter(p=>p.side===0))for(const b of members.filter(p=>p.side===1)){
    const ka=key(a.stateId),kb=key(b.stateId),p=r.world.statecraft!.relations.find(p=>[p.a,p.b].includes(ka)&&[p.a,p.b].includes(kb));
    if(!p)throw Error('参战双方外交关系缺失。');if(p.status!=='war'){p.status='war';p.sinceDay=r.world.day;p.truceUntilDay=0;}
  }
}
/** WEB entry bridge for the recovered connected-claim builder. Real Army47
 * can cross from any valid shore; an existing pair of ports is not required.
 * Land components / shared sea components only establish a geographic entry;
 * actual orders still enforce current neutral borders, food and full routing. */
export function claimEntry47(r:PoliticalRun47,a:string,b:string):string|undefined{
  const ours=r.world.provinces.filter(p=>p.controller===a),enemy=r.world.provinces.filter(p=>p.controller===b),places=new Map(r.world.provinces.map(p=>[p.id,p]));
  const near=(p:typeof enemy[number])=>Math.min(...ours.map(q=>Math.hypot(p.center.x-q.center.x,p.center.y-q.center.y)));
  const land=enemy.filter(p=>p.neighbors.some(id=>places.get(id)?.controller===a)).sort((p,q)=>near(p)-near(q)||p.id.localeCompare(q.id));if(land.length)return land[0].id;
  const {spatial}=actualForces47(r),g=spatial.graph,features=travelFeatures47(g),wet=(id:string)=>new Set((g.byProvince.get(id)??[]).flatMap(cell=>g.cells.get(cell)!.links.map(l=>g.cells.get(l.to)!).filter(c=>c.surface==='sea').map(c=>features.get(c.id)!)));
  const seas=new Set(ours.flatMap(p=>[...wet(p.id)]));return enemy.filter(p=>[...wet(p.id)].some(s=>seas.has(s))).sort((p,q)=>near(p)-near(q)||p.id.localeCompare(q.id))[0]?.id;
}
/** Zero-time route invalidation preserves the precise point. No recall or
 * province-center teleport. Normal AI can route home on the next daily review. */
export function invalidatePoliticalRoutes47(r:PoliticalRun47){
  const {spatial}=actualForces47(r),g=spatial.graph,weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
  for(const a of r.world.armies){const t=r.armyPositions.records[a.id];if(t.status!=='moving')continue;const policy=armyTravelPolicy47(r,a,weights,a.status==='retreating');
    const rest=t.nodes.slice(t.leg+1);if(!rest.some(id=>{const c=g.cells.get(id)!;return c.surface==='land'&&!policy.canEnter(c.provinceId!);}))continue;
    // haltArmyTravel47 must preserve edge-local progress, not recenter a node.
    r.armyPositions.records[a.id]=haltArmyTravel47(t,g);r.armyPositions.revision++;
    const order=r.armyAutonomy.armies[a.id];order.targetId=null;order.campaignId=null;order.issuedTick=null;order.nextTick=r.clock.tick;order.decision='waiting';order.reason='外交改变了通行权，部队在实际位置停止，下一日重新评估。';r.armyAutonomy.revision++;
  }
}
