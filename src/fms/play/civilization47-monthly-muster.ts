import type {FoundingForces47} from './civilization47-forces';
import {actualForces47} from './force-runtime47';
import {readArmySpace47,landHolders47} from './army-space47';
import {locateTravelCell47} from './army-travel47-graph';
import {beginArmyTravel47,haltArmyTravel47} from './army-travel47-state';
import {stateTraitsFor47,damageTraitsFor47} from './state-traits47';
import {initializedArmySpeed47} from './force-speed47';
import {reconcileCore} from './core-refresh51';
import {traitProjection} from './upper14-state';
import {initializedArmyBase} from './native-combat/state-traits';
import {sourceLegionStrength} from './muster21-rules';
import {unitProfiles} from './military-profile';
import {personTraits} from './court16-people';
import {nativeMonthlyEmergencyQuantity} from './native-economy/emergency-muster';
import {nationsAtWar} from './realtime-statecraft';
import {announce} from './civilization47-history';
import {initializedArmyCombat47} from './civilization47-combat-state';
import {initialArmyDecision47} from './civilization47-army-ai-state';

const alive=(a:FoundingForces47['world']['armies'][number])=>a.troops>0&&a.status!=='destroyed';
/** Owned candidate only. Preserves native muster kernels and documented web
 * caps/cooldowns while replacing every safety/retirement position query. */
/** One new Army at its home province (ArmyManager.CreateArmies for one province):
 * legion strength from the province against the world median population. */
/** Legion strength of a new army from its home province (world median population). */
export function forceStrength47(r:FoundingForces47,homeId:string){const values=r.world.statecraft!.provinces.map(p=>p.population).sort((a,b)=>a-b),mid=values.length>>1,median=values.length%2?values[mid]:(values[mid-1]+values[mid])/2;return sourceLegionStrength(r.world.statecraft!.provinces.find(p=>p.provinceId===homeId)!.population,median);}
export function createForce47(r:FoundingForces47,spatial:ReturnType<typeof actualForces47>['spatial'],nationId:string,homeId:string,kind:'regular'|'emergency'):number{
  const strength=(homeId:string)=>forceStrength47(r,homeId);
    let id:string;do{if(!Number.isSafeInteger(r.tactics.nextArmyId)||r.tactics.nextArmyId<1||r.tactics.nextArmyId>=2147483647)throw Error('军队编号已达上限。');id='force-'+r.tactics.nextArmyId++;}while(Object.hasOwn(r.tactics.forces,id));
    const home=r.world.provinces.find(p=>p.id===homeId)!,cell=locateTravelCell47(spatial.graph,home.center,homeId);if(!cell)throw Error('新军集结点不在实际领土内。');
    const troops=strength(homeId),unit=unitProfiles[(r.tactics.nextArmyId-2)%unitProfiles.length],name=r.world.cities.find(c=>c.provinceId===homeId)?.name??home.name;
    r.world.armies.push({id,name:name+(kind==='emergency'?'动员':'')+unit.name,nationId,provinceId:homeId,originId:homeId,troops,morale:80,supplies:100,status:'idle',route:[],progress:0});
    r.units={...r.units,[id]:unit.key};r.tactics.forces[id]={homeId,kind,fullStrength:troops};r.armyPositions.records[id]=beginArmyTravel47(id,[cell.id],spatial.graph,home.center);
    r.forceSpeed.armies[id]=initializedArmySpeed47(r.world.custom!.seed,id,nationId,r.clock.tick,stateTraitsFor47(r,nationId).includes('CavalryTradition'));
    r.combatPersonnel.armies[id]=initializedArmyCombat47(nationId,r.clock.tick,damageTraitsFor47(r,nationId));
    r.armyAutonomy.armies[id]=initialArmyDecision47();
    r.upperCombat.armies[id]={base:initializedArmyBase(traitProjection(r.upperCombat.nations[nationId].traits)),initializedTick:r.clock.tick};return troops;
}
export function musterMonth47(r:FoundingForces47){
  const month=Math.floor(r.world.day/30);if(r.world.day%30!==0||r.dailyEconomy.lastMusterMonth>=month)return;
  if(r.transports.cargo.length)throw Error('旧承运军队尚未明确转成统一位置，不能接新征募。');
  reconcileCore(r.world,r.upperCombat);const {spatial}=actualForces47(r);
  const safe=(province:string,nation:string)=>!landHolders47(readArmySpace47(r.world,{...spatial,positions:r.armyPositions}),province).some(a=>nationsAtWar(r.world,a.nationId,nation));
  const strength=(homeId:string)=>forceStrength47(r,homeId);
  const create=(nationId:string,homeId:string,kind:'regular'|'emergency')=>createForce47(r,spatial,nationId,homeId,kind);
  for(const n of r.world.nations){
    const owned=r.world.provinces.filter(p=>p.controller===n.id),land=owned.filter(p=>p.legalOwner===n.id),cap=land.length?Math.max(1,Math.floor(land.length*Math.fround(2/3))):0;
    let formed=0,cost=0;
    for(const p of land){
      const live=r.world.armies.filter(alive);if(live.filter(a=>a.nationId===n.id&&r.tactics.forces[a.id].kind!=='emergency').length>=cap||r.world.armies.length>=500)break;
      if(!safe(p.id,n.id)||live.some(a=>r.tactics.forces[a.id].homeId===p.id))continue;
      const data=r.world.statecraft!.provinces.find(d=>d.provinceId===p.id)!,required=Math.round(strength(p.id)/10);if(data.population<required)continue;
      create(n.id,p.id,'regular');data.population-=required;formed++;cost+=required;
    }
    if(formed)announce(r.chronicle,r.world,r.clock.tick,'diplomacy',`${n.name}新编${formed}支常备军`,`按故乡编制征集，本次扣内部人口${cost}；每支新军同时建立真实位置、速度和基础战力记录。`,[n.id],null);
    const war=r.world.statecraft!.relations.some(v=>(v.a===n.id||v.b===n.id)&&v.status==='war');
    if(!war){
      const space=readArmySpace47(r.world,{...spatial,positions:r.armyPositions}),total=r.world.armies.filter(a=>alive(a)&&a.nationId===n.id&&r.tactics.forces[a.id].kind==='emergency').length;
      const eligible=[...space.byArmy.values()].filter(v=>v.army.nationId===n.id&&v.army.status==='idle'&&r.tactics.forces[v.army.id].kind==='emergency'&&v.province?.controller===n.id&&['arrived','halted'].includes(v.travel.status));
      for(const v of eligible.slice(0,Math.ceil(total*.1))){const a=v.army;a.troops=0;a.status='destroyed';a.morale=0;a.supplies=0;a.route=[];a.progress=0;r.armyPositions.records[a.id]=haltArmyTravel47(v.travel,spatial.graph);delete r.battles.plans[a.id];delete r.reorganization.active[a.id];delete r.tactics.rounds[a.id];}
      const count=Math.min(eligible.length,Math.ceil(total*.1));if(count)announce(r.chronicle,r.world,r.clock.tick,'diplomacy',`${n.name}遣散${count}支应急军`,'和平月结，仅遣散实际回到本国陆地停驻的应急军；海上、在途或尚未归国者保留。不记作战死。',[n.id],null);
      continue;
    }
    const history=r.tactics.mobilizations[n.id];if(history.lastMonth!==null&&month-history.lastMonth<12||history.recent.length===3&&month-history.recent[0]<60)continue;
    const u=r.upperCombat.nations[n.id],cores=owned.filter(p=>r.upperCombat.provinces[p.id].distance<=u.coreThreshold),ids=new Set(cores.map(p=>p.id));
    if(!cores.some(p=>p.neighbors.some(id=>!ids.has(id)&&nationsAtWar(r.world,n.id,r.world.provinces.find(p=>p.id===id)!.controller))))continue;
    const leaderId=r.people.nations[n.id].leaderId,person=leaderId===null?null:r.people.persons[leaderId];if(leaderId!==null&&(!person?.alive||person.nationId!==n.id))throw Error('紧急动员的君主引用无效。');
    const q=nativeMonthlyEmergencyQuantity(r.destiny.nations[n.id].destiny,person?personTraits(person):null),places=(cores.length?cores:owned).filter(p=>safe(p.id,n.id));
    if(!q.allowed||!Number.isSafeInteger(q.count)||q.count<0||!places.length||r.world.armies.length+q.count>500)continue;
    history.lastMonth=month;history.recent=[...history.recent,month].slice(-3);
    for(let i=0;i<q.count;i++){r.tactics.seed=(Math.imul(1664525,r.tactics.seed)+1013904223)>>>0;create(n.id,places[r.tactics.seed%places.length].id,'emergency');}
    if(q.count)announce(r.chronicle,r.world,r.clock.tick,'diplomacy',`${n.name}进行一次紧急动员，征招${q.count}个军团`,'原月检国运与君主特性决定数量；网页按安全核心集结、保留年度与五年冷却，不扣常备兵源或粮储。',[n.id],null);
  }
  r.dailyEconomy.lastMusterMonth=month;
}
