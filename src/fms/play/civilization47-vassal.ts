import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {nativeMakeVassalImmediate,type NativeVassalContext} from './native-war/vassal-effect';
import type {NativeEffectNation} from './native-war/settlement-effects';
import {nativeLeaveWarDisposition} from './native-war/participation-leave';
import {nativeWar46} from './war47-wars';
import {opposedPairs46,coversPair46} from './war46-coalition';
import {settleWar47,reconcileDiplomaticForces47} from './civilization47-war-settlement';
import {diplomacyRandom46} from './civilization47-diplomatic-state';
import {leaveAlliance47} from './civilization47-alliance';
import {announce} from './civilization47-history';

/** Original VassalManager bound to the live 47 run. PlayerController.MakeVassal
 * makes the clicked state the vassal of the selected one (VassalManager.MakeVassal
 * → MakeVassalCore, recovered as nativeMakeVassalImmediate). History texts are
 * the original VassalizationEvent / VassalLiberationEvent / ...ByDestructionEvent. */
const bump=(r:PoliticalRun47)=>{if(!Number.isSafeInteger(r.vassals.revision+1))throw Error('附庸关系超过安全范围。');r.vassals.revision++;};
const name=(r:PoliticalRun47,id:string)=>r.world.nations.find(n=>n.id===id)!.name;
const alive=(r:PoliticalRun47,id:string)=>r.world.provinces.some(p=>p.controller===id);

/** LeaveAllWarV2 (war46 leaveWars46) on the 47 war owner: a primary side ends
 * the war (reason 2); other participants leave and their pairs make peace. */
export function leaveWars47(r:PoliticalRun47,id:string){
  const stateId=r.people.nations[id].id;
  for(const c of [...r.nativeWars.campaigns]){
    if(c.endedTick!==null)continue;
    const disposition=nativeLeaveWarDisposition(nativeWar46(c),stateId);
    if(disposition==='absent')continue;
    if(disposition==='end'){settleWar47(r,c,2);continue;}
    const member=c.participants.find(p=>p.stateId===stateId)!,pairs=opposedPairs46(r.nativeWars,c).filter(p=>p.includes(id));
    if(!c.coalition)throw Error('退战缺少参战来源，原世界未改动。');
    c.participants=c.participants.filter(p=>p.stateId!==stateId);
    c.coalition.departures.push({...member,tick:r.clock.tick});r.nativeWars.revision++;
    for(const [a,b]of pairs){
      if(r.nativeWars.campaigns.some(other=>other.endedTick===null&&coversPair46(other,r.nativeWars,a,b)))continue;
      const rel=r.world.statecraft!.relations.find(p=>[p.a,p.b].includes(a)&&[p.a,p.b].includes(b));
      if(rel&&rel.status==='war'){rel.status='peace';rel.sinceDay=r.world.day;rel.truceUntilDay=r.world.day+10;}
    }
    r.world.events.push({id:r.world.nextEventId++,day:r.world.day,kind:'diplomacy',text:`${name(r,id)}退出战争`,reason:'宗属关系变更后退出参战；原阵营其余国家继续作战。'});r.world.events=r.world.events.slice(-160);
    if(disposition==='remove-and-end')settleWar47(r,c,2);
  }
  reconcileDiplomaticForces47(r,new Set());
}

export function makeVassal47(r:PoliticalRun47,vassalId:string,overlordId:string){
  const states=new Map<string,NativeEffectNation>();
  for(const n of r.world.nations){const id=r.people.nations[n.id].id;states.set(n.id,{id,name:n.name,religionId:null,dead:!alive(r,n.id),provinces:[],gold:0,goldPerMonth:0,armyCostGold:0} as unknown as NativeEffectNation);}
  const c:NativeVassalContext={pending:[],vassalStates:new Map(),overlordToVassals:new Map()};
  for(const v of r.vassals.records.filter(v=>v.endedTick===null)){const a=states.get(v.vassalId)!,b=states.get(v.overlordId)!;
    c.vassalStates.set(a.id,{vassal:a,overlord:b,vassalizationTime:v.time,tributeRate:v.tributeRate,armyCapMultiplier:v.armyCapMultiplier,rebellionReason:'',updateDayInMonth:v.updateDay});
    const list=c.overlordToVassals.get(b.id)??[];list.push(a);c.overlordToVassals.set(b.id,list);}
  const result=nativeMakeVassalImmediate(c,states.get(vassalId)??null,states.get(overlordId)??null,{
    legacyWars:()=>[],leaveLegacyWar:()=>{},forceLeaveAlliance:()=>{leaveAlliance47(r,vassalId,true);},gameTime:()=>r.life.gameTime,
    randomInt:(min,max)=>min+Math.floor(diplomacyRandom46(r.nativeDiplomacy)*(max-min)),
    leaveAllWarV2:()=>{const native=c.vassalStates.get(r.people.nations[vassalId].id)!;
      r.vassals.records.push({vassalId,overlordId,time:native.vassalizationTime,tick:r.clock.tick,tributeRate:native.tributeRate,armyCapMultiplier:native.armyCapMultiplier,updateDay:native.updateDayInMonth,endedTick:null,endReason:null});bump(r);
      leaveWars47(r,vassalId);},
    createEvent:(lord,vassal)=>({text:`${vassal.name}成为${lord.name}的傀儡国`,reason:'附庸关系建立：退出联盟与已有战争，停止自主外战；国家与城市保留。'}),
    recordStateHistory:()=>{},recordWorldHistory:e=>{announce(r.chronicle,r.world,r.clock.tick,'diplomacy',e.text,e.reason,[vassalId,overlordId],null);},logMadeVassal:()=>{},drawVassalArrow:()=>{},
  });
  if(!result.success)throw Error(result.reason??'无法收为附庸。');
}
/** VassalManager.ReleaseVassal (解除附庸). */
export function releaseVassal47(r:PoliticalRun47,vassalId:string,overlordDestroyed=false){
  const v=r.vassals.records.find(v=>v.vassalId===vassalId&&v.endedTick===null);if(!v)return false;
  v.endedTick=r.clock.tick;v.endReason=overlordDestroyed?'overlord-destroyed':'released';bump(r);
  announce(r.chronicle,r.world,r.clock.tick,'diplomacy',overlordDestroyed?`${name(r,vassalId)}因${name(r,v.overlordId)}的灭亡而获得独立`:`${name(r,vassalId)}从${name(r,v.overlordId)}的统治下获得独立`,
    overlordDestroyed?'宗主失去全部领土，附庸恢复独立外交。':'解除附庸：宗属关系结束，恢复独立外交。',[vassalId,v.overlordId],null);
  return true;
}
/** A destroyed vassal ends silently; a destroyed overlord frees its vassals. */
export function reconcileVassals47(r:PoliticalRun47){
  for(const v of r.vassals.records.filter(v=>v.endedTick===null)){
    if(!alive(r,v.vassalId)){v.endedTick=r.clock.tick;v.endReason='vassal-destroyed';bump(r);}
    else if(!alive(r,v.overlordId))releaseVassal47(r,v.vassalId,true);
  }
}
