import type {TacticsRun,ForceOrigin} from './tactics-model';
import {isUnitKey,unitProfiles,type UnitKey} from './military-profile';
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
export function previewMuster(r:TacticsRun,a:MusterAction){
  const no=(reason:string)=>({valid:false,reason,details:[] as string[],count:0,places:[] as string[]});
  if(!a||!r.world.nations.some(n=>n.id===a.nationId))return no('请选择有效国家。');
  const keys=a.type==='place'?['type','nationId','provinceId','count','unit']:a.type==='occupation-rule'?['type','nationId','mode']:['type','nationId'];
  if(!['place','mobilize','occupation-rule'].includes(a.type)||Object.keys(a).length!==keys.length||!keys.every(k=>Object.hasOwn(a,k)))return no('布兵参数无效。');
  if(a.type==='occupation-rule'){if(!['resistance','takeover'].includes(a.mode))return no('占领规则无效。');return {valid:true,reason:a.mode==='takeover'?'无人驻防地区可直接接管。':'恢复原作的地区抵抗机制。',details:[a.mode==='takeover'?'这是网页沙盒规则：实际抵达且没有敌军才立即改变该地区实控。':'原作即使没有敌军，也需要军团攻击耗尽本地区抵抗。','规则作用于整个世界；仍禁止进攻和平国家。'],count:0,places:[]};}
  const owned=land(r,a.nationId),available=owned.filter(p=>safe(r,p.id,a.nationId));
  if(a.type==='place'){
    if(!Number.isInteger(a.count)||a.count<1||a.count>20||!isUnitKey(a.unit))return no('每批可放置1—20支有效兵种军团。');
    if(!available.some(p=>p.id===a.provinceId))return no('请选择本国合法、实控且没有敌军的地区。');
    if(slots(r)<a.count)return no('本世界军队记录容量不足，原部队和历史不会删除。');
    return {valid:true,reason:`在${owned.find(p=>p.id===a.provinceId)!.name}放置${a.count}支${unitProfiles.find(u=>u.key===a.unit)!.name}。`,details:[`每支兵力${strength(r,a.provinceId)}；作为上帝干预直接生成，不扣地方人口与粮储。`,'每批最多20支，只能放置在本国没有敌军的地区；世界最多保留500条军队记录。'],count:a.count,places:[a.provinceId]};
  }
  const month=Math.floor(r.world.day/30),history=r.tactics.mobilizations[a.nationId];
  if(history.lastMonth!==null&&month-history.lastMonth<12)return no(`本国最近已动员，距下一次还需${12-(month-history.lastMonth)}个月。`);
  if(history.recent.length===3&&month-history.recent[0]<60)return no('五年窗口内已动员三次，暂不能再次动员。');
  if(!available.length||!owned.some(p=>p.neighbors.some(id=>{const other=r.world.provinces.find(q=>q.id===id)!;return nationsAtWar(r.world,a.nationId,other.controller);})))return no('本国尚未与敌国形成陆地接壤，不能发动紧急动员。');
  // Source uses destiny + ruler traits. Neither exists in this schema: a
  // declared neutral destiny=50/no trait modifier gives 5 emergency forces.
  const count=5;if(slots(r)<count)return no('军队记录容量不足，本次动员不会部分生成。');
  return {valid:true,reason:'发动紧急动员，建立5支应急军。',details:['应急军不占常备名额，不扣地方人口和粮储。','部队将在本国没有敌军的地区集结。','两次动员至少间隔12个月，五年内最多三次；每月30日。和平后每月遣散约10%的应急军，只遣散驻守部队；运输与行军部队延后。'],count,places:available.map(p=>p.id)};
}
export function applyMuster(run:TacticsRun,a:MusterAction):TacticsRun{
  const p=previewMuster(run,a);if(!p.valid)throw Error(p.reason);const r={...structuredClone(run),terrain:run.terrain};
  if(a.type==='occupation-rule'){r.tactics.unopposed=a.mode;musterEvent(r,p.reason,p.details.join(' '));return r;}
  for(let i=0;i<p.count;i++){r.tactics.seed=(Math.imul(1664525,r.tactics.seed)+1013904223)>>>0;const province=p.places[r.tactics.seed%p.places.length];newForce(r,a.nationId,province,a.type==='place'?'manual':'emergency',a.type==='place'?a.unit:undefined);}
  if(a.type==='mobilize'){const m=r.tactics.mobilizations[a.nationId],month=Math.floor(r.world.day/30);m.lastMonth=month;m.recent=[...m.recent,month].slice(-3);}
  musterEvent(r,p.reason,p.details.join(' '));return r;
}
/** Native monthly recruitment uses home association and displayed/internal
 * conversion. No 10% population or ten-day grain test is imported from v8. */
export function regularMuster(run:TacticsRun,initial=false){let r={...structuredClone(run),terrain:run.terrain};if(!initial&&r.world.day%30!==0)return r;
  for(const n of r.world.nations){let formed=0,people=0;
    for(const p of land(r,n.id)){if(tacticsCapacity(r,n.id).active>=tacticsCapacity(r,n.id).target||slots(r)<=0)break;
      if(!safe(r,p.id,n.id)||living(r).some(a=>r.tactics.forces[a.id].homeId===p.id))continue;
      const l=r.world.statecraft!.provinces.find(v=>v.provinceId===p.id)!,cost=Math.round(strength(r,p.id)/10);if(l.population<cost)continue;
      newForce(r,n.id,p.id,'regular');l.population-=cost;people+=cost;formed++;
    }
    if(formed)musterEvent(r,`${n.name}新编${formed}支常备军`,`按领土三分之二目标与故乡编制征集；显示兵力为内部值×10，本次扣内部人口${people}。粮储未扣；持续供给仍按网页经济结算。`);
    if(initial)continue;
    const war=r.world.statecraft!.relations.some(x=>(x.a===n.id||x.b===n.id)&&x.status==='war');
    if(war){const action={type:'mobilize' as const,nationId:n.id};if(previewMuster(r,action).valid)r=applyMuster(r,action);}
    else{const emergency=r.world.armies.filter(a=>a.nationId===n.id&&a.status==='idle'&&r.tactics.forces[a.id].kind==='emergency'),total=living(r).filter(a=>a.nationId===n.id&&r.tactics.forces[a.id].kind==='emergency').length;
      const retired=emergency.slice(0,Math.ceil(total*.1));for(const a of retired){a.troops=0;a.status='destroyed';a.route=[];a.progress=0;delete r.battles.plans[a.id];}
      if(retired.length)musterEvent(r,`${n.name}遣散${retired.length}支应急军`,'恢复和平，按月退回应急编制；网页只遣散驻守中的部队，运输或未归营者延后。');}
  }return r;
}
