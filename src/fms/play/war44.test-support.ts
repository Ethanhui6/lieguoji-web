import {War44Session} from './war44-session';
import {portFixture43} from './war43.test-support';
import {assertWar44Run,type War44Run} from './war44-model';
import {graphFor44} from './war44-geography';
export const stamp44=(r:War44Run)=>({day:r.world.day,nextEventId:r.world.nextEventId,tick:r.clock.tick});
export const graph44=graphFor44;
export function portFixture44(){const r=new War44Session().execute({type:'copy',run:portFixture43()}).run as War44Run;r.diplomacy.worldAuto=false;for(const id of Object.keys(r.voyages.enabled))r.voyages.enabled[id]=false;return r;}
export function combinedFixture44(){
 const s=new War44Session();let r=portFixture44();s.execute({type:'load',run:r});r=s.execute({type:'action',action:{type:'declare-war',nationId:'n-0',targetNationId:'n-3'},expected:stamp44(r)}).run as War44Run;
 const p=graph44(r).ports.find(v=>r.world.provinces.find(p=>p.id===v.provinceId)!.controller==='n-3')!;
 if(!p)throw Error('missing hostile port');const attacker=r.world.armies.find(a=>a.nationId==='n-0')!,defender=r.world.armies.find(a=>a.nationId==='n-3')!;
 for(const a of r.world.armies){a.route=[];a.progress=0;a.status='idle';if(a.id!==attacker.id&&a.id!==defender.id&&a.provinceId===p.provinceId)a.provinceId=r.world.provinces.find(q=>q.controller===a.nationId&&q.id!==p.provinceId)!.id;}
 for(const a of [attacker,defender]){a.provinceId=p.provinceId;a.troops=5000;a.supplies=100;a.morale=100;r.tactics.rounds[a.id]=1;}
 r.tactics.unopposed='resistance';r.voyages.manualArmies=r.world.armies.map(a=>a.id);r.voyages.manualFleets=r.navy.fleets.map(f=>f.id);for(const f of r.navy.fleets)f.patrol=false;
 assertWar44Run(r);return {run:r,provinceId:p.provinceId,portId:p.id,attackerId:attacker.id,defenderId:defender.id};
}
export const context44=(r:War44Run)=>({...r.terrainContext,upper:r.upperCombat,finance:r.finance,people:r.people,culture:r.culture,destiny:r.destiny});

