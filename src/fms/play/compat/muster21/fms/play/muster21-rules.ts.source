import type {DestinyState} from './destiny20-state';
import type {UpperCombat} from './upper14-state';
import {personTraits,type CourtPeople} from './court16-people';
import {nativeMonthlyEmergencyQuantity} from './native-economy/emergency-muster';
import {previewMuster as oldPreview} from './tactics-muster';
export type MusterInputs={destiny:DestinyState;upperCombat:UpperCombat;people:CourtPeople};
import type {TacticsRun,ForceOrigin} from './tactics-model';
import {unitProfiles,type UnitKey} from './military-profile';
import {nationsAtWar} from './realtime-statecraft';
import {holdsNode} from './occupation';
export type MusterAction={type:'place';nationId:string;provinceId:string;count:number;unit:UnitKey}|{type:'mobilize';nationId:string}|{type:'occupation-rule';nationId:string;mode:'resistance'|'takeover'};
const living=(r:TacticsRun)=>[...r.world.armies,...r.transports.cargo.map(c=>c.army)].filter(a=>a.status!=='destroyed'&&a.troops>0);
export const musterEvent=(r:TacticsRun,text:string,reason:string)=>{r.world.events.push({id:r.world.nextEventId++,day:r.world.day,kind:'system',text,reason});r.world.events=r.world.events.slice(-160);};
export function sourceLegionStrength(population:number,median:number){if(median<=0)return 2000;const raw=Math.floor(Math.max(0,population)*2000/median);return Math.max(1000,Math.min(3000,Math.floor((raw+50)/100)*100));}
function strength(r:TacticsRun,p:string){const values=r.world.statecraft!.provinces.map(p=>p.population).sort((a,b)=>a-b),mid=values.length>>1,median=values.length%2?values[mid]:(values[mid-1]+values[mid])/2;return sourceLegionStrength(r.world.statecraft!.provinces.find(v=>v.provinceId===p)!.population,median);}
const land=(r:TacticsRun,id:string)=>r.world.provinces.filter(p=>p.controller===id&&p.legalOwner===id);
const safe=(r:TacticsRun,id:string,nation:string)=>!r.world.armies.some(a=>holdsNode(a)&&a.provinceId===id&&nationsAtWar(r.world,a.nationId,nation));
export function tacticsCapacity(r:TacticsRun,id:string){const regions=land(r,id),cap=regions.length?Math.max(1,Math.floor(regions.length*Math.fround(2/3))):0,armies=living(r).filter(a=>a.nationId===id);return {cap,target:cap,active:armies.filter(a=>r.tactics.forces[a.id].kind!=='emergency').length,emergency:armies.filter(a=>r.tactics.forces[a.id].kind==='emergency').length,nextDay:(Math.floor(r.world.day/30)+1)*30};}
function newForce(r:TacticsRun,nationId:string,provinceId:string,kind:ForceOrigin['kind'],unit?:UnitKey){
  let id:string;do{id=`force-${r.tactics.nextArmyId++}`;}while(r.tactics.forces[id]);
  const troops=strength(r,provinceId),key=unit??unitProfiles[(r.tactics.nextArmyId-2)%unitProfiles.length].key,p=r.world.provinces.find(p=>p.id===provinceId)!;
  const name=r.world.cities.find(c=>c.provinceId===p.id)?.name??p.name;
  r.world.armies.push({id,name:`${name}${kind==='emergency'?'动员':''}${unitProfiles.find(u=>u.key===key)!.name}`,nationId,provinceId,originId:provinceId,troops,morale:80,supplies:100,status:'idle',route:[],progress:0});
  r.units={...r.units,[id]:key};r.tactics.forces[id]={homeId:provinceId,kind,fullStrength:troops};return troops;
}
const slots=(r:TacticsRun)=>500-r.world.armies.length-r.transports.cargo.length;
/** Explicit web safety cap remains 500 records; source does not have this cap. */
/** Ordinary monthly emergency check, also exposed as a paused manual check.
 * This is not the native unrestricted EmergencyCallArmy(requested) entry. */
export function previewMuster21(r:TacticsRun,a:MusterAction,inputs:MusterInputs){
  if(a?.type!=='mobilize')return oldPreview(r,a);
  const no=(reason:string)=>({valid:false,reason,details:[] as string[],count:0,places:[] as string[]});
  if(Object.keys(a).length!==2||!Object.hasOwn(a,'nationId')||!r.world.nations.some(n=>n.id===a.nationId))return no('请选择有效国家和动员命令。');
  const id=a.nationId,month=Math.floor(r.world.day/30),history=r.tactics.mobilizations[id];
  if(!r.world.statecraft!.relations.some(x=>(x.a===id||x.b===id)&&x.status==='war'))return no('本国尚未参战，不能发动普通紧急动员。');
  if(history.lastMonth!==null&&month-history.lastMonth<12)return no('本国最近已动员，距下一次还需'+(12-(month-history.lastMonth))+'个月。');
  if(history.recent.length===3&&month-history.recent[0]<60)return no('五年窗口内已动员三次，暂不能再次动员。');
  const combat=inputs.upperCombat.nations[id],owned=r.world.provinces.filter(p=>p.controller===id);
  const cores=owned.filter(p=>inputs.upperCombat.provinces[p.id].distance<=combat.coreThreshold),coreIds=new Set(cores.map(p=>p.id));
  const exposed=cores.some(p=>p.neighbors.some(other=>{const q=r.world.provinces.find(v=>v.id===other);return q&&!coreIds.has(other)&&nationsAtWar(r.world,id,q.controller);}));
  if(!exposed)return no('敌国尚未接近本国核心领土，普通紧急动员条件未满足。');
  const personId=inputs.people.nations[id].leaderId,person=personId===null?null:inputs.people.persons[String(personId)];
  if(personId!==null&&(!person||!person.alive||person.nationId!==id))throw Error('动员的君主档案无效，已保留当前世界。');
  const traits=person?personTraits(person):null,destiny=inputs.destiny.nations[id].destiny,quantity=nativeMonthlyEmergencyQuantity(destiny,traits);
  if(!quantity.allowed)return no('君主的主和特性禁止紧急动员；常备征募和上帝布兵仍可使用。');
  if(!Number.isSafeInteger(quantity.count)||quantity.count<0)return no('本次动员数量超出可执行范围。');
  const available=(cores.length?cores:owned).filter(p=>safe(r,p.id,id));
  if(!available.length)return no('本国核心集结地均有敌军，当前网页安全规则暂停动员。');
  if(slots(r)<quantity.count)return no('军队记录容量不足，需要'+quantity.count+'个空位；本次不会部分生成。');
  return {valid:true,reason:quantity.count?'发动紧急动员，建立'+quantity.count+'支应急军。':'国运为0，本次建立0支应急军，仍记录动员冷却。',details:[
    '国运 '+destiny.toFixed(2)+' ÷ 100 × 10 × 君主动员倍率 '+quantity.multiplier.toFixed(2)+'，向上取整得到 '+quantity.count+' 支。',
    '应急军不占常备名额，不扣人口和粮储；优先核心领土，每支独立抽取集结地。网页额外避开驻敌地区。',
    '两次至少间隔12个月，五年内最多三次。网页每30日为一个月；此按钮提前检查普通月检条件，非无条件神谕征召。',
    '和平后每月遣散约10%的应急军；行军与运输中的部队延后。世界最多保留500条军队记录。'
  ],count:quantity.count,places:available.map(p=>p.id)};
}
export function applyMuster21(run:TacticsRun,a:MusterAction,inputs:MusterInputs):TacticsRun{
  const p=previewMuster21(run,a,inputs);if(!p.valid)throw Error(p.reason);const r={...structuredClone(run),terrain:run.terrain};
  if(a.type==='occupation-rule'){r.tactics.unopposed=a.mode;musterEvent(r,p.reason,p.details.join(' '));return r;}
  if(a.type==='mobilize'){const m=r.tactics.mobilizations[a.nationId],month=Math.floor(r.world.day/30);m.lastMonth=month;m.recent=[...m.recent,month].slice(-3);}
  for(let i=0;i<p.count;i++){r.tactics.seed=(Math.imul(1664525,r.tactics.seed)+1013904223)>>>0;const province=p.places[r.tactics.seed%p.places.length];newForce(r,a.nationId,province,a.type==='place'?'manual':'emergency',a.type==='place'?a.unit:undefined);}

  musterEvent(r,p.reason,p.details.join(' '));return r;
}
/** Native monthly recruitment uses home association and displayed/internal
 * conversion. No 10% population or ten-day grain test is imported from v8. */
export function regularMuster21(run:TacticsRun,inputs:MusterInputs,initial=false){let r={...structuredClone(run),terrain:run.terrain};if(!initial&&r.world.day%30!==0)return r;
  for(const n of r.world.nations){let formed=0,people=0;
    for(const p of land(r,n.id)){if(tacticsCapacity(r,n.id).active>=tacticsCapacity(r,n.id).target||slots(r)<=0)break;
      if(!safe(r,p.id,n.id)||living(r).some(a=>r.tactics.forces[a.id].homeId===p.id))continue;
      const l=r.world.statecraft!.provinces.find(v=>v.provinceId===p.id)!,cost=Math.round(strength(r,p.id)/10);if(l.population<cost)continue;
      newForce(r,n.id,p.id,'regular');l.population-=cost;people+=cost;formed++;
    }
    if(formed)musterEvent(r,`${n.name}新编${formed}支常备军`,`按领土三分之二目标与故乡编制征集；显示兵力为内部值×10，本次扣内部人口${people}。粮储未扣；持续供给仍按网页经济结算。`);
    if(initial)continue;
    const war=r.world.statecraft!.relations.some(x=>(x.a===n.id||x.b===n.id)&&x.status==='war');
    if(war){const action={type:'mobilize' as const,nationId:n.id};if(previewMuster21(r,action,inputs).valid)r=applyMuster21(r,action,inputs);}
    else{const emergency=r.world.armies.filter(a=>a.nationId===n.id&&a.status==='idle'&&r.tactics.forces[a.id].kind==='emergency'),total=living(r).filter(a=>a.nationId===n.id&&r.tactics.forces[a.id].kind==='emergency').length;
      const retired=emergency.slice(0,Math.ceil(total*.1));for(const a of retired){a.troops=0;a.status='destroyed';a.route=[];a.progress=0;delete r.battles.plans[a.id];}
      if(retired.length)musterEvent(r,`${n.name}遣散${retired.length}支应急军`,'恢复和平，按月退回应急编制；网页只遣散驻守中的部队，运输或未归营者延后。');}
  }return r;
}
