import {War46Session} from './war46-session';
import {portFixture45} from './war45.test-support';
import {assertWar46Run,type War46Run} from './war46-model';
import {graphFor46} from './war46-geography';
import {fixtureDate33} from './war33.test-support';
import type {War33Run} from './war33-model';
import {grid} from './fixture.test-support';
import {landComponents} from './voyage24-geography';
import {war26SeaRoutes} from './war26-sea';
export const stamp46=(r:War46Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
export const graph46=graphFor46;
export function portFixture46(){const r=new War46Session().execute({type:'copy',run:portFixture45()}).run as War46Run;r.diplomacy.worldAuto=false;for(const id of Object.keys(r.voyages.enabled))r.voyages.enabled[id]=false;return r;}
/** Synthetic Feb 9 boundary, not evidence of an organically played month. */
export function shipyardFixture46(){
 const r=portFixture46(),g=graph46(r),id='n-0';fixtureDate33(r as unknown as War33Run,39);
 const ports=g.ports.filter(p=>r.portControl.ports[p.provinceId].occupierId===id);const port=ports[0];if(!port)throw Error('no native fixture port');
 // Native one-controlled-port quota; other harbors are held by an opponent,
 // while the land ownership and its derived political data remain unchanged.
 for(const p of ports.slice(1))r.portControl.ports[p.provinceId].occupierId='n-3';
 const area=new Set(r.harbors.sites.find(p=>p.id===port.id)!.cells),far=[...g.nodes.values()].find(n=>n.ocean&&!area.has(n.id))!;
 for(const f of r.navy.fleets){f.node=far.id;f.route=[];f.progress=0;f.dockId=null;f.targetId=null;f.patrol=false;f.status='anchored';const d=r.navalDeployment.fleets[f.id];d.loiterNode=null;d.assignedPortId=null;d.returning=false;if(f.nationId===id){f.status='lost';f.crew=0;r.maritime.hulls[f.id]=0;}}
 r.voyages.manualFleets=r.navy.fleets.map(f=>f.id);r.voyages.manualArmies=r.world.armies.map(a=>a.id);
 const q=r.shipbuilding.nations[id];q.remaining=1;q.totalMonths=6;r.nativeDiplomacy.nations[id].updateDay=10;
 const l=r.world.statecraft!.provinces.find(v=>v.provinceId===port.provinceId)!;l.population=10000;l.grain=1000000;
 // Refresh mutable state against the fixed day using the ordinary load guard.
 assertWar46Run(r);return {run:r,nationId:id,portId:port.id,provinceId:port.provinceId};
}
export function combinedFixture46(){
 const s=new War46Session();let r=portFixture46();s.execute({type:'load',run:r});r=s.execute({type:'action',action:{type:'declare-war',nationId:'n-0',targetNationId:'n-3'},expected:stamp46(r)}).run as War46Run;
 const p=graph46(r).ports.find(v=>r.world.provinces.find(p=>p.id===v.provinceId)!.controller==='n-3')!;
 if(!p)throw Error('missing hostile port');const attacker=r.world.armies.find(a=>a.nationId==='n-0')!,defender=r.world.armies.find(a=>a.nationId==='n-3')!;
 for(const a of r.world.armies){a.route=[];a.progress=0;a.status='idle';if(a.id!==attacker.id&&a.id!==defender.id&&a.provinceId===p.provinceId)a.provinceId=r.world.provinces.find(q=>q.controller===a.nationId&&q.id!==p.provinceId)!.id;}
 for(const a of [attacker,defender]){a.provinceId=p.provinceId;a.troops=5000;a.supplies=100;a.morale=100;r.tactics.rounds[a.id]=1;}
 r.tactics.unopposed='resistance';r.voyages.manualArmies=r.world.armies.map(a=>a.id);r.voyages.manualFleets=r.navy.fleets.map(f=>f.id);for(const f of r.navy.fleets)f.patrol=false;
 assertWar46Run(r);return {run:r,provinceId:p.provinceId,portId:p.id,attackerId:attacker.id,defenderId:defender.id};
}
export const context46=(r:War46Run)=>({...r.terrainContext,upper:r.upperCombat,finance:r.finance,people:r.people,culture:r.culture,destiny:r.destiny});
/** Synthetic two-continent expedition, no personal save or visual parity claim. */
export function rendezvousFixture46(){
 const session=new War46Session();let r=session.execute({type:'create',terrain:grid((x,y)=>y>20&&y<230&&(x>20&&x<105||x>145&&x<230)?45:0),count:4,cityCount:60,relations:'peace'}).run as War46Run;
 r.diplomacy.worldAuto=false;for(const id of Object.keys(r.voyages.enabled))r.voyages.enabled[id]=false;
 const g=graph46(r),lands=landComponents(r.world,g),owner=(pid:string)=>r.world.provinces.find(p=>p.id===pid)!.controller;
 const from=g.ports.find(p=>g.ports.filter(v=>owner(v.provinceId)===owner(p.provinceId)).length>1&&g.ports.some(v=>owner(v.provinceId)!==owner(p.provinceId)&&lands.get(v.provinceId)!==lands.get(p.provinceId)))!;
 if(!from)throw Error('fixture needs home ports and foreign continent');
 const to=g.ports.find(p=>owner(p.provinceId)!==owner(from.provinceId)&&lands.get(p.provinceId)!==lands.get(from.provinceId))!,nationId=owner(from.provinceId),enemyId=owner(to.provinceId);
 session.execute({type:'load',run:r});r=session.execute({type:'action',action:{type:'declare-war',nationId,targetNationId:enemyId},expected:stamp46(r)}).run as War46Run;
 const route=war26SeaRoutes(r.world,g,nationId,r.warfare,id=>id===enemyId)[0];if(!route)throw Error('missing executable overseas goal');
 const far=g.ports.find(p=>owner(p.provinceId)===nationId&&p.node!==route.from.node&&p.id!==route.from.id)!;if(!far)throw Error('needs remote owned port');
 const army=r.world.armies.find(a=>a.nationId===nationId)!,fleet=r.navy.fleets.find(f=>f.nationId===nationId)!;
 army.provinceId=route.from.provinceId;army.route=[];army.progress=0;army.status='idle';army.troops=500;army.supplies=100;army.morale=100;
 fleet.node=far.node;fleet.route=[];fleet.progress=0;fleet.dockId=far.id;fleet.targetId=null;fleet.status='docked';fleet.patrol=true;fleet.food=fleet.crew*60;
 for(const f of r.navy.fleets)if(f.id!==fleet.id)f.patrol=false;
 r.voyages.manualFleets=r.navy.fleets.filter(f=>f.id!==fleet.id).map(f=>f.id);r.voyages.manualArmies=r.world.armies.filter(a=>a.id!==army.id).map(a=>a.id);r.voyages.enabled[nationId]=true;
 const d=r.navalDeployment.fleets[fleet.id];d.assignedPortId=null;d.loiterNode=null;d.returning=false;
 // All other armies are held by the player for repeatable logistics evidence.
 for(const a of r.world.armies)if(a.id!==army.id){a.route=[];a.progress=0;a.status='idle';if(a.provinceId===route.to.provinceId)a.provinceId=r.world.provinces.find(p=>p.controller===a.nationId&&p.id!==route.to.provinceId)!.id;}
 assertWar46Run(r);return {run:r,nationId,enemyId,armyId:army.id,fleetId:fleet.id,fromPortId:route.from.id,toPortId:route.to.id,startingPortId:far.id};
}
