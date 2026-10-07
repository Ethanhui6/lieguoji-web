import type {MilitaryAccess40} from './war40-access';
import {appointKinRuler,previewKinSuccession} from './dynasty23-succession';
import type {KinState} from './dynasty23-state';
import type {ChronicleRun} from './chronicle-model';
import {announce,regnalLabel,validRegnalName} from './chronicle-records';
import {appointRuler,nameSeed,restoreKnownRuler} from './restoration19-records';
import {newStateName,type NamingState} from './restoration19-names';
import {previewRebelIdentity} from './restoration19-identity';
import {knownRestorationPerson} from './restoration19-people';
import type {CourtPeople} from './court16-people';
import type {CultureState} from './restoration19-culture';
import type {Sovereignty} from './restoration19-sovereignty';
import {contains,type UpperCombat} from './upper14-state';
type NamedChronicle=ChronicleRun&{naming:NamingState;people:CourtPeople;culture:CultureState;sovereignty:Sovereignty;upperCombat:UpperCombat;kin:KinState;militaryAccess?:MilitaryAccess40};
import {statePalette} from './politics';
import {reconcileCombat} from './war40-battle';
import {reconcileOccupation} from './occupation';
import {transferEconomy} from '../../compat/v0_4/sim/statecraft';
export type PoliticsAction={type:'succession';nationId:string;regnalName?:string}|{type:'uprising'|'independence';nationId:string;provinceId:string};
export function previewPolitics(r:NamedChronicle,a:PoliticsAction){
  if(!a||!['succession','uprising','independence'].includes(a.type)||typeof a.nationId!=='string'||Object.keys(a).some(k=>!(a.type==='succession'?['type','nationId','regnalName']:['type','nationId','provinceId']).includes(k))||(a.type!=='succession'&&typeof a.provinceId!=='string'))return {valid:false,reason:'政治干预参数无效。',details:[] as string[]};
  const w=r.world,n=w.nations.find(n=>n.id===a.nationId),owned=w.provinces.filter(p=>p.controller===a.nationId);
  const no=(reason:string)=>({valid:false,reason,details:[] as string[]});
  if(!n||!owned.length)return no('这个国家已失去全部领土，当前没有可干预的政府。');
  if(a.type==='succession'){
    if(a.regnalName!==undefined&&!validRegnalName(a.regnalName))return no('王号请填写1—12个字，不含世数；系统会分别记录王号几世和国家任次。');
    const history=r.chronicle.leaders[n.id],regnalName=a.regnalName??history.at(-1)!.regnalName,regnalOrdinal=history.filter(l=>l.regnalName===regnalName).length+1;
    return {valid:true,reason:`为${n.name}安排传位：${regnalLabel({regnalName,regnalOrdinal})}，国家第${history.length+1}任君主。`,details:[previewKinSuccession(r,a.nationId),'前任退位，新君主身份与交接地点写入史书。','首次使用新王号从一世开始；沿用或恢复旧王号接续既有世数，国家历任顺序继续累加。']};
  }
  const p=owned.find(p=>p.id===a.provinceId);
  if(!p)return no('请选择这个国家当前控制的辖区。');
  if(owned.length<2)return no('不能把国家最后一块领土拆成另一个国家。');
  const identity=a.type==='uprising'?previewRebelIdentity(r,p.id):null;
  if(w.nations.length>=50&&!identity?.existingId)return no('本局已达50个国家记录上限；仍可重新启用匹配的历史国家。');
  const city=w.cities.find(c=>c.provinceId===p.id);
  if(!city)return no('该地尚无城市，请先创建史书新版副本补齐真实城市。');
  const ledger=w.statecraft!.provinces.find(v=>v.provinceId===p.id)!;
  if(a.type==='uprising'&&(w.armies.length+r.transports.cargo.length>=500||ledger.population<1000))return no('起义需要至少1000名当地人口和空余军队记录（含运输中的军团），不能凭空生成叛军。');
  return {valid:true,reason:`${p.name}${identity?.existingId?`起义，恢复${identity.name.name}`:a.type==='uprising'?`起义，建立${identity!.name.name}`:'宣布独立'}。`,details:[`只转移${p.name}这一块真实辖区及其城市、当地账本；首都设于${city.name}。`,a.type==='uprising'?'按省文化和原作候选规则确定国家身份，从当地人口动员叛军；实际位于该省的原控制国军队被清除，外地与运输中的部队保留。':'当地原控制国驻守军团加入新国；航行中的舰队和外地军队保持原属。',identity?.existingId?'保留历史国家、旧史与人物；存活旧君主复位目前使用网页选择规则，完整家族继承仍待接入。':'完整附庸解放和家族内战另行恢复，本操作为有限的上帝干预。']};
}
function succession(r:NamedChronicle,nationId:string,reason:string,regnalName?:string){
  const w=r.world,n=w.nations.find(n=>n.id===nationId)!,previous=r.chronicle.leaders[nationId]?.at(-1),next=appointKinRuler(r,nationId,regnalName),capital=w.cities.find(c=>c.id===n.capitalId);
  const place=capital&&w.provinces.find(p=>p.id===capital.provinceId)?.controller===nationId?capital.provinceId:null;
  announce(r.chronicle,w,r.clock.tick,'accession',`${n.name}传位：${regnalLabel(next)}（${next.name}）继位，为国家第${next.order}任君主`,reason,[nationId],place,[...(previous?[previous]:[]),next]);
}
/** One real province becomes a sovereign state. Complete native rebellion and
 * vassal formulas are not claimed; the web conditions and troop debit are explicit. */
function secede(r:NamedChronicle,a:Exclude<PoliticsAction,{type:'succession'}>,reason:string){
  const w=r.world,c=r.chronicle,p=w.provinces.find(p=>p.id===a.provinceId)!,parent=w.nations.find(n=>n.id===a.nationId)!,city=w.cities.find(v=>v.provinceId===p.id)!;
  const identity=a.type==='uprising'?previewRebelIdentity(r,p.id):null,restored=!!identity?.existingId;
  let id=identity?.existingId??'';
  if(!id){do{id=`new-state-${c.nextNationId++}`;}while(w.nations.some(n=>n.id===id));}
  const name=identity?identity.name.name:newStateName(r.naming,w,id,parent.id);
  if(!restored){
    if(identity){r.naming.nations[id]=structuredClone(identity.name);r.naming.revision++;r.sovereignty.nativeRebels[id]={provinceId:p.id,parentId:parent.id};}
    let color=statePalette[c.nextNationId%statePalette.length],attempt=0;while(w.nations.some(n=>n.color.toLowerCase()===color.toLowerCase()))color='#'+((nameSeed(id)+ ++attempt*0x43755b)&0xffffff).toString(16).padStart(6,'0');
    w.nations.push({id,name,color,capitalId:city.id,regimeId:`regime-${id}`,dynastyId:`dynasty-${id}`});
    w.statecraft!.nations.push({nationId:id,priority:'balanced',lastLedger:null,lastDecision:null});
    for(const n of w.nations.filter(n=>n.id!==id)){const [left,right]=[n.id,id].sort();w.statecraft!.relations.push({a:left,b:right,status:n.id===parent.id&&a.type==='uprising'?'war':'peace',sinceDay:w.day,truceUntilDay:0});}
    r.tactics.mobilizations[id]={lastMonth:null,recent:[]};c.leaders[id]=[];r.sovereignty.restorations[id]=0;r.sovereignty.revision++;
  }else{
    const relation=w.statecraft!.relations.find(v=>v.a===id&&v.b===parent.id||v.b===id&&v.a===parent.id)!;
    relation.status='war';relation.sinceDay=w.day;relation.truceUntilDay=0;
  }
  // Native TryRebel overwrites the target capital even for a restored state.
  w.nations.find(n=>n.id===id)!.capitalId=city.id;
  if(parent.capitalId===city.id){
    const other=w.provinces.filter(v=>v.controller===parent.id&&v.id!==p.id),core=other.filter(v=>r.upperCombat.provinces[v.id].distance<=r.upperCombat.nations[parent.id].coreThreshold),pool=core.length?core:other;
    const next=pool[nameSeed(`${w.custom!.seed}/rebel-capital/${r.clock.tick}/${parent.id}`)%pool.length],capital=w.cities.find(v=>v.provinceId===next.id)!;
    parent.capitalId=capital.id;announce(c,w,r.clock.tick,'capital',`${parent.name}迁都${capital.name}`,'原首都发生地方分离；从其余辖区优先选择核心省会。',[parent.id],next.id);
  }
  p.controller=p.legalOwner=id;
  transferEconomy(w,p.id,parent.id,id);
  const leader=restored?restoreState(r,id,p.id):appointRuler(c,w,id,r.naming);c.unrest[p.id]={pressure:0,controller:id,sinceDay:w.day,cooldownUntil:w.day+780};
  if(a.type==='uprising'){
    // Native armiesInProvince is current spatial membership, not home/target.
    // Web road positions are continuous; polygon containment bridges cells.
    for(const army of w.armies){
      if(army.nationId!==parent.id||army.status==='destroyed')continue;
      const from=w.provinces.find(v=>v.id===army.provinceId)!.center,to=w.provinces.find(v=>v.id===army.route[0])?.center??from,point={x:from.x+(to.x-from.x)*army.progress,y:from.y+(to.y-from.y)*army.progress};
      if(!contains(p.polygon,point))continue;
      Object.assign(army,{troops:0,status:'destroyed',route:[],progress:0});delete r.battles.plans[army.id];delete r.tactics.rounds[army.id];delete r.reorganization.active[army.id];
    }
    const ledger=w.statecraft!.provinces.find(v=>v.provinceId===p.id)!,troops=Math.min(1600,Math.floor(ledger.population*.1));ledger.population-=troops;
    let suffix=1,armyId=`rebel-${id}`;while(w.armies.some(v=>v.id===armyId)||r.transports.cargo.some(v=>v.army.id===armyId))armyId=`rebel-${id}-${++suffix}`;
    w.armies.push({id:armyId,name:`${p.name}义军`,nationId:id,provinceId:p.id,originId:p.id,troops,morale:75,supplies:60,status:'idle',route:[],progress:0});
    r.units={...r.units,[armyId]:'Infantry'};r.tactics.forces[armyId]={homeId:p.id,kind:'regular',fullStrength:Math.max(2000,troops)};
  }else for(const army of w.armies.filter(v=>v.nationId===parent.id&&v.provinceId===p.id&&v.status==='idle')){army.nationId=id;r.tactics.forces[army.id].homeId=p.id;delete r.battles.plans[army.id];delete r.tactics.rounds[army.id];}
  Object.assign(r,reconcileCombat(w,r.battles,r.clock.tick,r.militaryAccess));Object.assign(r,reconcileOccupation(r.world,r.occupation));
  announce(c,r.world,r.clock.tick,a.type,`${p.name}${a.type==='uprising'?'爆发起义':'宣布独立'}，${name}${restored?'复国':'建立'}，${regnalLabel(leader)}（${leader.name}）为国家第${leader.order}任君主`,reason,[parent.id,id],p.id,[leader]);
}
function restoreState(r:NamedChronicle,id:string,provinceId:string){
  const person=knownRestorationPerson(r,id);delete r.chronicle.ended[id];
  const ruler=person?restoreKnownRuler(r.chronicle,r.world,id,r.naming,person,r.sovereignty):appointRuler(r.chronicle,r.world,id,r.naming);
  r.sovereignty.restorations[id]++;r.sovereignty.revision++;
  announce(r.chronicle,r.world,r.clock.tick,'restoration',`${r.world.nations.find(n=>n.id===id)!.name}重获领土，宣布复国`,person?'保留真实历史人物及能力，旧君主再次任职；选择最近已知存活前任为网页桥接，完整原家族选择尚待接入。':'重获实际辖区；当前没有可复位的已知存活人物，新任身份单独记录。',[id],provinceId,[ruler]);return ruler;
}
export function applyPolitics(r:NamedChronicle,a:PoliticsAction,automatic=false){
  const preview=previewPolitics(r,a);if(!preview.valid)throw Error(preview.reason);
  if(a.type==='succession')succession(r,a.nationId,automatic?'已到本版保存的交接日期；任期调度为网页适配，非完整原作寿命与继承公式。':'上帝干预安排传位；前后君主身份、王号世数与国家任次同时保存。',a.regnalName);
  else secede(r,a,automatic?'被征服地区持续至少360日并积累满100压力，达到网页地方起义条件；不是已复刻的原作叛乱概率。':`上帝干预：${preview.reason}`);
}
export function reconcileSovereignty(r:NamedChronicle){
  const w=r.world,c=r.chronicle;
  for(const n of w.nations){
    const land=w.provinces.filter(p=>p.controller===n.id),ended=Object.hasOwn(c.ended,n.id);
    if(!land.length&&!ended){
      c.ended[n.id]=w.day;const ruler=c.leaders[n.id]?.at(-1);if(ruler&&ruler.endedDay===null)ruler.endedDay=w.day;
      const city=w.cities.find(v=>v.id===n.capitalId)!;
      announce(c,w,r.clock.tick,'extinction',`${n.name}失去全部领土，国家覆亡`,'本版以实控领土归零记录政权终结；保留历史国家、城市与残余军团，不删除存档实体。',[n.id],city.provinceId,ruler?[ruler]:[]);
    }else if(land.length&&ended){restoreState(r,n.id,land[0].id);}
  }
}
export function advancePolitics(r:NamedChronicle,dayChanged:boolean){
  const w=r.world,c=r.chronicle;
  // Occupation can change several times within a day; each interruption resets
  // continuous occupation immediately, rather than waiting for the daily check.
  for(const p of w.provinces){const s=c.unrest[p.id];if(s.controller!==p.controller){s.controller=p.controller;s.sinceDay=w.day;s.pressure=0;}}
  reconcileSovereignty(r);if(!dayChanged)return;
  for(const n of [...w.nations]){const ruler=c.leaders[n.id]?.at(-1);if(!Object.hasOwn(c.ended,n.id)&&ruler&&ruler.termEndDay<=w.day)applyPolitics(r,{type:'succession',nationId:n.id},true);}
  for(const p of w.provinces){
    const s=c.unrest[p.id];
    const e=w.statecraft!.provinces.find(v=>v.provinceId===p.id)!;
    s.pressure=Math.max(0,Math.min(100,s.pressure+(p.legalOwner!==p.controller?1+(e.grain<e.population?1:0):-2)));
  }
  // Deterministic and at most one autonomous local uprising per monthly review.
  if(w.day%30===0)for(const p of w.provinces){const s=c.unrest[p.id],a:PoliticsAction={type:'uprising',nationId:p.controller,provinceId:p.id};if(s.pressure>=100&&w.day-s.sinceDay>=360&&w.day>=s.cooldownUntil&&previewPolitics(r,a).valid){applyPolitics(r,a,true);break;}}
}
