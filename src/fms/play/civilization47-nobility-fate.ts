import {recordHistory,type HistoricalKind} from './chronicle-records';
import {nobilityRandom47} from './civilization47-nobility-monthly';
import {diePersonOwned47} from './civilization47-lifecycle';
import type {NobilityRun47,Nobility47,NobleFamily47} from './civilization47-nobility';
import {f} from './native-economy/numeric';

/** FamilyFateDecision (Province.ConqueredBy 4511D0 when a family loses its last
 * land; State.ResolveFamiliesAfterDestruction 5D6C80): DecideFamilyFate
 * 846B60 with CalculateFateWeights 846010, then ExecuteSwearFealty 8488C0,
 * ExecutePartialRestore 847AB0, ExecuteDispossessed 846CE0, ExecutePurge
 * 848370 or ExecuteExile 847080; war merit then falls to a third.
 * Web adaptation: a family with a ruler's court record (a present or past
 * leader) keeps its state, since that record belongs to the state it ruled. */
export type FamilyFate47='fealty'|'restore'|'dispossessed'|'purge'|'exile';
/** WarType of the war in which the land was lost (WarContextBridgeV2.ResolveWarForFamilyFate). */
export type FateWar47=0|2|3|4|5|8|9|10|11|null;
type W={fealty:number;restore:number;dispossessed:number;purge:number;exile:number};
const alive=(r:NobilityRun47,id:string)=>r.world.provinces.some(p=>p.controller===id);
const leaderOf=(r:NobilityRun47,nationId:string)=>{const id=r.people.nations[nationId]?.leaderId;return id==null?null:r.kin.persons[id]??null;};
const familiesOf=(n:Nobility47,nationId:string)=>Object.keys(n.families).filter(id=>n.families[id].nationId===nationId);

export function fateWeights47(r:NobilityRun47,id:string,conqueror:string,war:FateWar47):W{
  const n=r.nobility!,fam=n.families[id],k=r.kin.families[id];
  const w:W={fealty:30,restore:20,dispossessed:40,purge:f(17.2),exile:25};
  if(familiesOf(n,conqueror).length<=3){w.fealty+=40;w.restore+=80;w.dispossessed-=20;w.purge=f(w.purge-8);w.exile-=15;}
  const leader=leaderOf(r,conqueror),patriarch=r.kin.persons[k.headId]??null;
  if(leader&&patriarch){
    if(leader.cultureName!==patriarch.cultureName){w.dispossessed+=20;w.purge=f(w.purge+10);}else{w.fealty+=40;w.restore+=20;w.purge=f(w.purge-20);}
    const traits=leader.traits??[];
    if(traits.length){
      if(traits.includes('Merciful')){w.restore+=50;w.fealty+=30;w.purge=f(w.purge-30);w.dispossessed-=15;}
      if(traits.includes('Cruel')){w.purge=f(w.purge+350);w.dispossessed+=5;w.restore-=40;w.fealty-=30;}
    }
  }
  if(leader){const rel=n.relations[id]?.[String(leader.familyId)];if(rel!==undefined){if(rel>50){w.fealty+=30;w.restore+=20;}else if(-50>rel){w.purge=f(w.purge+30);w.dispossessed+=10;}}}
  if(fam.influence>500){w.fealty+=15;w.restore+=10;w.purge=f(w.purge+20);}else if(200>fam.influence)w.dispossessed+=20;
  if(war===0){w.fealty+=10;w.restore+=10;w.purge=f(w.purge+1);}
  else if(war===2||war===4){w.purge=f(w.purge+49);w.dispossessed+=20;}
  else if(war===5||war===8){w.purge=f(w.purge+66);w.fealty-=25;}
  else if(war===9){w.purge=f(w.purge+59);w.fealty-=20;}
  else if(war===10){w.purge=f(w.purge+42);w.dispossessed+=15;}
  else if(war===11){w.purge=f(w.purge+52);w.fealty-=15;}
  if(!fam.ruling){
    if(leader&&patriarch&&leader.cultureName!==patriarch.cultureName)w.exile+=20;
    if(fam.influence>500)w.exile+=15;
    if(war===2||war===4||war===5||war===8||war===9||war===10||war===11)w.exile+=25;
  }else{
    const home=fam.nationId;
    if(alive(r,home)&&home!==conqueror){w.fealty=0;w.restore=0;w.dispossessed=0;w.purge=0;w.exile=100;}
    else {w.fealty=50;w.restore=0;w.dispossessed=30;w.purge=20;w.exile=0;}
  }
  const claims=Object.values(fam.historicalClaims).reduce((a,b)=>f(a+b),0);
  if(claims>20)w.restore=f(f(claims*f(.5))+w.restore);
  for(const key of Object.keys(w) as (keyof W)[])w[key]=Math.max(0,w[key]);
  return w;
}
export function decideFamilyFate47(r:NobilityRun47,id:string,conqueror:string,war:FateWar47):FamilyFate47{
  const n=r.nobility!,fam=n.families[id];
  if(fam.ruling&&alive(r,fam.nationId)&&fam.nationId!==conqueror)return 'exile';
  const w=fateWeights47(r,id,conqueror,war),total=f(f(f(f(w.restore+w.fealty)+w.dispossessed)+w.purge)+w.exile);
  const roll=nobilityRandom47(n).floatRange(0,total);let acc=f(w.fealty+0);
  if(acc>roll)return 'fealty';acc=f(acc+w.restore);if(acc>roll)return 'restore';
  acc=f(acc+w.dispossessed);if(acc>roll)return 'dispossessed';acc=f(acc+w.exile);if(acc>roll)return 'exile';
  return 'purge';
}
/** Family has a present or past ruler (a court record): it keeps its state in the web. */
const hasCourt=(r:NobilityRun47,id:string)=>{const k=r.kin.families[id];return [...k.memberIds,...k.collateralMemberIds].some(p=>Object.hasOwn(r.people.persons,String(p)));};
/** UpdateFamilyMembersAllegiance plus the web's family/state bookkeeping. */
export function moveFamily47(r:NobilityRun47,id:string,nationId:string){
  const n=r.nobility!,fam=n.families[id],k=r.kin.families[id];
  if(fam.nationId===nationId||hasCourt(r,id))return false;
  const stateId=r.people.nations[nationId].id;
  fam.nationId=nationId;fam.ruling=false;k.nationId=nationId;k.stateId=stateId;
  for(const pid of [...k.memberIds,...k.collateralMemberIds]){
    const p=r.kin.persons[pid];if(!p)continue;p.stateId=stateId;
    for(const role of p.roles)if(role.nativeKind==='spouse')role.stateId=stateId;
  }
  n.monthFamilies=n.monthFamilies.filter(v=>v!==id);r.kin.revision++;
  return true;
}
function release(n:Nobility47,fam:NobleFamily47){fam.controlledProvinces=[];}
function event(r:NobilityRun47,text:string,reason:string,nations:string[]){recordHistory(r.chronicle,r.world,r.clock.tick,'family' as HistoricalKind,text,reason,[...new Set(nations)].filter(id=>r.people.nations[id]),null);}
const name=(r:NobilityRun47,id:string)=>`${r.kin.families[id].surname}家族`,state=(r:NobilityRun47,id:string)=>r.world.nations.find(v=>v.id===id)?.name??id;
export function executeFamilyFate47(r:NobilityRun47,id:string,fate:FamilyFate47,conqueror:string){
  const n=r.nobility!,fam=n.families[id];if(!fam)return;
  const from=fam.nationId,wasRuling=fam.ruling;
  if(fate==='fealty'){
    fam.ruling=false;fam.influence=f(fam.influence*f(wasRuling?.7:.5));moveFamily47(r,id,conqueror);
    event(r,`${name(r,id)}向${state(r,conqueror)}宣誓效忠`,'失去全部领地后归附攻占方，影响力下降。',[from,conqueror]);
  }else if(fate==='restore')executePartialRestore(r,id,conqueror,from);
  else if(fate==='dispossessed')executeDispossessed(r,id,conqueror,from);
  else if(fate==='purge'){
    const k=r.kin.families[id];
    for(const pid of [...new Set([...k.memberIds,...k.collateralMemberIds])]){const p=r.kin.persons[pid];if(p?.isAlive)diePersonOwned47(r,p);}
    event(r,`${name(r,id)}遭到清洗`,`${state(r,conqueror)}处死了家族全部在世成员，家族就此消亡。`,[from,conqueror]);
    retire(r,n,id);
  }else executeExile(r,id,conqueror,from);
  // A ruling family that lost its rule leaves the state without one (0) until a new leader is appointed.
  if(wasRuling&&!Object.values(n.families).some(v=>v.nationId===from&&v.ruling))n.rulingFamilies[from]=0;
  // ReduceFamilyWarMerit.
  if(n.families[id])n.families[id].totalEnemyDestroyed=f(n.families[id].totalEnemyDestroyed*f(1/3));
}
function retire(r:NobilityRun47,n:Nobility47,id:string){
  const fam=n.families[id];delete n.families[id];n.extinct.push(Number(id));for(const c of Object.values(n.warContributions))delete c[id];n.monthFamilies=n.monthFamilies.filter(v=>v!==id);
  if(fam&&n.rulingFamilies[fam.nationId]===Number(id))n.rulingFamilies[fam.nationId]=0;
}
function executeDispossessed(r:NobilityRun47,id:string,conqueror:string,from:string){
  const n=r.nobility!,fam=n.families[id];
  release(n,fam);fam.influence=f(fam.influence*f(.2));fam.wealth=Math.trunc(f(fam.wealth*f(.5)));fam.ruling=false;
  if(!alive(r,from))moveFamily47(r,id,conqueror);
  event(r,`${name(r,id)}被剥夺全部领地`,'失去领地后影响力与财富大减。',[from,conqueror]);
}
/** CanReclaimProvince: free land, or a holder with more than one province that is outweighed. */
function canReclaim(r:NobilityRun47,provinceId:string,id:string,nationId:string){
  const n=r.nobility!,holder=Object.keys(n.families).find(v=>n.families[v].controlledProvinces.includes(provinceId));
  if(!holder)return true;const h=n.families[holder];if(h.controlledProvinces.length<=1)return false;
  const [m1,m2]=h.ruling?[2,3]:[1.5,2],me=n.families[id];
  const landed=familiesOf(n,nationId).filter(v=>n.families[v].controlledProvinces.length>0);
  const avg=landed.length?f(landed.reduce((a,v)=>a+n.families[v].controlledProvinces.length,0)/landed.length):1;
  return me.influence>f(h.influence*m1)||(me.historicalClaims[provinceId]??0)>f((h.historicalClaims[provinceId]??0)*m2)||h.controlledProvinces.length>f(avg*m2);
}
/** GrantProvinceToFamily: the former holder is compensated. */
function grant(r:NobilityRun47,provinceId:string,id:string){
  const n=r.nobility!,holder=Object.keys(n.families).find(v=>n.families[v].controlledProvinces.includes(provinceId));
  if(holder){const h=n.families[holder];h.controlledProvinces=h.controlledProvinces.filter(p=>p!==provinceId);h.influence=Math.min(1000,f(h.influence+(h.ruling?100:50)));h.wealth+=h.ruling?200:100;}
  const fam=n.families[id];if(!fam.controlledProvinces.includes(provinceId))fam.controlledProvinces.push(provinceId);
}
function executePartialRestore(r:NobilityRun47,id:string,conqueror:string,from:string){
  const n=r.nobility!,fam=n.families[id];
  const lands=Object.entries(fam.historicalClaims).filter(([p,claim])=>r.world.provinces.find(v=>v.id===p)?.controller===conqueror&&claim>=5&&canReclaim(r,p,id,conqueror)).map(([p,claim],i)=>({p,claim,i}));
  if(!lands.length){executeDispossessed(r,id,conqueror,from);return;}
  lands.sort((a,b)=>b.claim-a.claim||a.i-b.i);
  let ratio=fam.influence>500?f(.8):f(.5);
  if(lands.some(v=>v.p===fam.originalHomeProvinceId))ratio=f(ratio+f(.2));
  let count=Math.round(f(lands.length*ratio));count=Math.min(lands.length,Math.max(2,count));
  // The family moves first so the restored land counts for the conqueror's state.
  fam.ruling=false;fam.influence=f(fam.influence*f(.5));
  if(fam.nationId!==conqueror&&!moveFamily47(r,id,conqueror)){executeDispossessed(r,id,conqueror,from);return;}
  for(const v of lands.slice(0,count))grant(r,v.p,id);
  event(r,`${name(r,id)}在${state(r,conqueror)}治下收复${count}个故地`,'凭历史宣称部分恢复领地并归附攻占方。',[from,conqueror]);
}
function executeExile(r:NobilityRun47,id:string,conqueror:string,from:string){
  const n=r.nobility!,fam=n.families[id],random=nobilityRandom47(n);
  release(n,fam);
  let target:string|null=null;
  if(fam.ruling&&alive(r,from)&&from!==conqueror)target=from;
  else{
    let valid=r.world.nations.map(v=>v.id).filter(v=>v!==conqueror&&alive(r,v));
    if(alive(r,from)&&from!==conqueror){const leader=leaderOf(r,from),rel=leader&&leader.familyId>0?n.relations[id]?.[String(leader.familyId)]:undefined;
      if(rel!==undefined){if(rel>0)target=from;else if(-30>rel)valid=valid.filter(v=>v!==from);}}
    if(target===null&&valid.length){
      const patriarch=r.kin.persons[r.kin.families[id].headId]??null;
      if(!patriarch)target=valid[random.intRange(0,valid.length)];
      else{
        const liked=valid.filter(v=>{const l=leaderOf(r,v);return !!l&&l.familyId>0&&(n.relations[id]?.[String(l.familyId)]??-Infinity)>20;});
        const same=valid.filter(v=>leaderOf(r,v)?.cultureName===patriarch.cultureName);
        const pool=liked.length?liked:same.length?same:valid;target=pool[random.intRange(0,pool.length)];
      }
    }
  }
  if(target===null){executeDispossessed(r,id,conqueror,from);return;}
  fam.influence=f(fam.influence*f(.3));fam.wealth=Math.trunc(f(fam.wealth*f(.5)));fam.ruling=false;
  if(target!==fam.nationId)moveFamily47(r,id,target);
  const victor=leaderOf(r,conqueror),host=leaderOf(r,target);
  const rel=n.relations[id]??(n.relations[id]={});
  if(victor&&victor.familyId>0&&n.families[String(victor.familyId)])rel[String(victor.familyId)]=-15;
  if(host&&host.familyId>0&&n.families[String(host.familyId)]&&String(host.familyId)!==id)rel[String(host.familyId)]=15;
  event(r,`${name(r,id)}流亡${state(r,target)}`,`失去领地后离开，投奔${state(r,target)}。`,[from,conqueror,target]);
}
/** Province.ConqueredBy for the province's family: drop it; the last one decides the fate. */
export function familyLostProvince47(r:NobilityRun47,id:string,provinceId:string,conqueror:string,war:FateWar47){
  const n=r.nobility!,fam=n.families[id];if(!fam)return;
  fam.controlledProvinces=fam.controlledProvinces.filter(p=>p!==provinceId);
  if(fam.controlledProvinces.length===0&&conqueror!==fam.nationId)executeFamilyFate47(r,id,decideFamilyFate47(r,id,conqueror,war),conqueror);
}
/** Province.TryRebel → RemoveControlledProvince. */
export function releaseRebelProvince47(r:NobilityRun47,provinceId:string){
  const n=r.nobility;if(!n)return;for(const fam of Object.values(n.families))fam.controlledProvinces=fam.controlledProvinces.filter(p=>p!==provinceId);
}
