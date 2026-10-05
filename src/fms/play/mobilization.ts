import type { World, Province } from '../../compat/v0_4/sim/types';
import { unitProfiles, type UnitAssignments, type UnitKey } from './military-profile';

const alive=(a:World['armies'][number])=>a.status!=='destroyed'&&a.troops>0;
const grainCost=(troops:number)=>Math.ceil(troops*100/6);
const locals=(w:World,id:string)=>w.provinces.filter(p=>p.controller===id&&p.legalOwner===id);
/** Original monthly province ratio; 30/nation and 500/history are web bounds. */
export function militaryCapacity(w:World,id:string){
  const land=locals(w,id),cap=land.length?Math.min(30,Math.max(1,Math.floor(land.length*2/3))):0;
  const war=w.statecraft!.relations.some(r=>(r.a===id||r.b===id)&&r.status==='war');
  const priority=w.statecraft!.nations.find(n=>n.nationId===id)!.priority;
  const target=Math.ceil(cap*(war||priority==='military'?1:priority==='civilian'?.4:.65));
  return {cap,target,active:w.armies.filter(a=>a.nationId===id&&alive(a)).length,nextDay:(Math.floor(w.day/30)+1)*30};
}
function medianPopulation(w:World){const values=w.statecraft!.provinces.map(p=>p.population).filter(p=>p>0).sort((a,b)=>a-b);return values.length?values[Math.floor(values.length/2)]:1;}
/** Source population-relative displayed strength; web uses actual people, not x10 counters. */
export function legionStrength(population:number,median:number){return Math.max(1000,Math.min(3000,Math.round(population/Math.max(1,median)*20)*100));}
function unitChoice(w:World,units:UnitAssignments,nationId:string):UnitKey {
  const counts=new Map(unitProfiles.map(u=>[u.key,w.armies.filter(a=>a.nationId===nationId&&alive(a)&&units[a.id]===u.key).length]));
  return [...unitProfiles].sort((a,b)=>(counts.get(a.key)!+1)/a.weight-(counts.get(b.key)!+1)/b.weight)[0].key;
}
function event(w:World,text:string,reason:string){w.events.push({id:w.nextEventId++,day:w.day,kind:'system',text,reason});if(w.events.length>160)w.events.splice(0,w.events.length-160);}
/** Executed before the next economy ledger, with population and full new supply debit.
 * Source monthly recruitment + bounded web adaptation of gradual reorganization. */
export function mobilize(world:World,assignments:UnitAssignments,initial=false){
  const w=structuredClone(world),units={...assignments},median=medianPopulation(w),day=w.day+1;
  const local=new Map(w.statecraft!.provinces.map(p=>[p.provinceId,p]));
  const available=(p:Province)=>!w.armies.some(a=>a.provinceId===p.id&&a.progress===0&&a.status==='fighting');
  const affordable=(p:Province,max:number)=>{const l=local.get(p.id)!;return Math.max(0,Math.min(max,Math.floor(l.population*.1),l.population-100,Math.floor((l.grain-l.population*10)*6/100)));};
  for(const n of w.nations){
    let recruited=0,reinforced=0,spent=0;
    const provinces=locals(w,n.id).filter(available).sort((a,b)=>local.get(b.id)!.population-local.get(a.id)!.population||a.id.localeCompare(b.id));
    if(!initial&&day%5===0){
      for(const a of w.armies.filter(a=>a.nationId===n.id&&a.status==='idle'&&alive(a))){
        const p=provinces.find(p=>p.id===a.provinceId);if(!p)continue;
        const l=local.get(p.id)!,target=legionStrength(l.population,median);
        const amount=affordable(p,Math.min(target-a.troops,Math.ceil(target*.1)));if(amount<1)continue;
        const oldTroops=a.troops;
        // Existing ration stock plus 100 supply points for each incoming soldier.
        a.troops+=amount;a.supplies=(oldTroops*a.supplies+amount*100)/a.troops;
        l.population-=amount;l.grain-=grainCost(amount);reinforced+=amount;spent+=grainCost(amount);
      }
    }
    if(initial||day%30===0){
      const {target}=militaryCapacity(w,n.id);
      for(const p of provinces){
        if(militaryCapacity(w,n.id).active>=target||w.armies.length>=500)break;
        if(w.armies.some(a=>a.nationId===n.id&&a.provinceId===p.id&&alive(a)))continue;
        const l=local.get(p.id)!,troops=affordable(p,legionStrength(l.population,median));if(troops<300)continue;
        const key=unitChoice(w,units,n.id),place=w.cities.find(c=>c.provinceId===p.id)?.name??p.name;
        let id=`muster-${w.nextEventId}-${w.armies.length}`;while(units[id])id+='a';
        w.armies.push({id,name:`${place}${unitProfiles.find(u=>u.key===key)!.name}`,nationId:n.id,provinceId:p.id,originId:p.id,troops,morale:initial?80:65,supplies:100,status:'idle',route:[],progress:0});
        units[id]=key;l.population-=troops;l.grain-=grainCost(troops);recruited++;spent+=grainCost(troops);
      }
    }
    if(recruited||reinforced)event(w,`${n.name}整军：新编${recruited}支，补员${reinforced}人`,`${initial?'开局编制':'下一日日结前整军'}；兵员来自所在辖区，配粮支出${spent}人日粮，保留当地十日民粮。常规军规模按受控领土与国策调整，月度检查缺额，驻守部队每五日渐进补员。`);
  }
  return {world:w,units};
}
