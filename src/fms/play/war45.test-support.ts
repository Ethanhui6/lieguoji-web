import {War45Session} from './war45-session';
import {portFixture44} from './war44.test-support';
import {assertWar45Run,type War45Run} from './war45-model';
import {graphFor45} from './war45-geography';
import {fixtureDate33} from './war33.test-support';
import type {War33Run} from './war33-model';
export const stamp45=(r:War45Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
export const graph45=graphFor45;
export function portFixture45(){const r=new War45Session().execute({type:'copy',run:portFixture44()}).run as War45Run;r.diplomacy.worldAuto=false;for(const id of Object.keys(r.voyages.enabled))r.voyages.enabled[id]=false;return r;}
/** Synthetic Feb 9 boundary, not evidence of an organically played month. */
export function shipyardFixture45(){
 const r=portFixture45(),g=graph45(r),id='n-0';fixtureDate33(r as unknown as War33Run,39);
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
 assertWar45Run(r);return {run:r,nationId:id,portId:port.id,provinceId:port.provinceId};
}
export function combinedFixture45(){
 const s=new War45Session();let r=portFixture45();s.execute({type:'load',run:r});r=s.execute({type:'action',action:{type:'declare-war',nationId:'n-0',targetNationId:'n-3'},expected:stamp45(r)}).run as War45Run;
 const p=graph45(r).ports.find(v=>r.world.provinces.find(p=>p.id===v.provinceId)!.controller==='n-3')!;
 if(!p)throw Error('missing hostile port');const attacker=r.world.armies.find(a=>a.nationId==='n-0')!,defender=r.world.armies.find(a=>a.nationId==='n-3')!;
 for(const a of r.world.armies){a.route=[];a.progress=0;a.status='idle';if(a.id!==attacker.id&&a.id!==defender.id&&a.provinceId===p.provinceId)a.provinceId=r.world.provinces.find(q=>q.controller===a.nationId&&q.id!==p.provinceId)!.id;}
 for(const a of [attacker,defender]){a.provinceId=p.provinceId;a.troops=5000;a.supplies=100;a.morale=100;r.tactics.rounds[a.id]=1;}
 r.tactics.unopposed='resistance';r.voyages.manualArmies=r.world.armies.map(a=>a.id);r.voyages.manualFleets=r.navy.fleets.map(f=>f.id);for(const f of r.navy.fleets)f.patrol=false;
 assertWar45Run(r);return {run:r,provinceId:p.provinceId,portId:p.id,attackerId:attacker.id,defenderId:defender.id};
}
export const context45=(r:War45Run)=>({...r.terrainContext,upper:r.upperCombat,finance:r.finance,people:r.people,culture:r.culture,destiny:r.destiny});
