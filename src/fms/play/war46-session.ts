import {advanceShipbuilding46,reconcileShipbuilding46} from './war46-shipbuilding';
import {nationsAtWar} from './realtime-statecraft';
import {refreshNavalRoles46,reservedPortFleet46,reconcilePorts46,advancePorts46,startPortAssault46,cancelPortOrder46,settlePorts46,portAvailable46} from './war46-ports';
import {reconcileGarrison46,advanceGarrison46,resumeGarrison46} from './war46-garrison';
import {peaceDeployment46,reconcileDeployment46,advanceDeployment46,resumeDeployment46} from './war46-deployment';
import {militaryAccess46,type MilitaryAccess46} from './war46-access';
import {reconcileAlliances46,evaluateAlliance46,applyAlliance46,type AllianceEdit46} from './war46-alliance';
import {advanceRebellion46,setRebellion46} from './war46-rebellion';
import {coversPair46} from './war46-coalition';
import {advanceTribute46,setTribute46} from './war46-tribute';
import {War45Session as OldSession,type GameCommand as OldCommand} from './war45-session';
import {war29View as previousView,type War45Run as OldRun} from './war45-model';
import {overlord46,releaseVassal46,reconcileVassals46} from './war46-vassals';
import {war46Wrap,assertWar46Live} from './war46-model';
import type {War29Run} from './war29-model';
import {reconcileNativeDiplomacy46,advanceDiplomaticSchedule46} from './war46-state';
import {declareWar46,evaluateDeclaration46,refreshMilitaryTargets46} from './war46-declaration';
import {war29Wrap} from './war29-model';
import {reconcileDiplomacy,applyDiplomacy,type DiplomacyEdit} from './war29-diplomacy';
import {war28Wrap} from './war28-model';
import {importUnknownWars28,reconcileWar28Identities,reconcileParticipants28,war28DamageSink} from './war46-wars';
import {settlement25Wrap} from './settlement25-model';
import {war27Wrap} from './war27-model';
import {reconcileLosses,lossRecorder} from './war27-losses';
import {applyBattle} from './war46-battle';
import {reconcileOccupation} from './occupation';
import {war26Wrap} from './war26-model';
import {reconcileWar26} from './war26-state';
import {war26Strength} from './war26-strength';
import {voyage24Wrap} from './voyage24-model';
import {reconcileVoyages} from './voyage24-state';
import {advanceWar46Voyages,yieldRendezvous46} from './war46-voyages';
import {previewVoyageDiplomacy} from './voyage24-diplomacy';
import {reconcileKin,type KinState} from './dynasty23-state';
import {reconcileLife22,advanceLife22} from './life22-state';
import {applyMuster21} from './muster21-rules';
import {campaignWrap} from './campaign-model';
import {dynasty23Wrap} from './dynasty23-model';
import type {Sovereignty} from './restoration19-sovereignty';
import type {CultureState} from './restoration19-culture';
import type {CourtPeople} from './court16-people';
import type {UpperCombat} from './upper14-state';
import {court16Wrap,fiscal15View} from './court16-model';
import {fiscal15Wrap,upper14View} from './fiscal15-model';
import {upper14Wrap} from './upper14-model';
import {terrain13Wrap} from './terrain13-model';
import {chronicle2Wrap} from './chronicle2-model';
import {chronicleWrap,type ChronicleRun} from './chronicle-model';
import {applyRestorationCommand} from './war46-commands';
import {tacticsView} from './campaign-model';
import {maritimeView} from './tactics-model';
import {graphFor46 as graphFor} from './war46-geography';
import {applyRealtimeNaval} from './war46-navy';
import {reconcileMaritime} from './maritime';
import {reconcileCombat} from './war46-battle';
import {captureTransitions} from './chronicle-records';
import {applyCombatEdit} from './destiny20-edit';
import {reconcileUpper} from './upper14-state';
import {applyAppointment} from './court16-people';
import {reconcilePeople} from './restoration19-people';
import {isClash} from './observation';
import {reconcileCultures,applyCultureEdit} from './restoration19-culture';
import {reconcileFiscal} from './restoration19-state';
import {advanceWar46Tick} from './war46-runtime';
import {advancePolitics,applyPolitics,type PoliticsAction} from './war46-politics';
import {reconcileNameEdits,type NamingState} from './restoration19-names';
import {restoration19Wrap} from './restoration19-model';
import {assertGameRun,restoration19View,chronicleView,campaignView,court16View,type GameRun} from './war46-model';
import {reconcileDestiny,previewDestinyEdit,refreshDestinyTrait,type DestinyEdit} from './destiny20-state';
import type {GameEvent,World} from '../../sim/types';
import {advanceWar46Peace,hasWar29Extinction} from './war46-peace';
import {settleWar46} from './war46-settlement';
export type GameCommand={type:'port-assault';fleetId:string;revision:number;runId:string;expected:{day:number;nextEventId:number;tick:number}}|{type:'army-garrison';armyId:string;revision:number;runId:string;expected:{day:number;nextEventId:number;tick:number}}|{type:'naval-deployment';fleetId:string;revision:number;runId:string;expected:{day:number;nextEventId:number;tick:number}}|{type:'alliance-edit';edit:AllianceEdit46;revision:number;runId:string;expected:{day:number;nextEventId:number;tick:number}}|{type:'rebellion-settings';enabled:boolean;revision:number;runId:string;expected:{day:number;nextEventId:number;tick:number}}|{type:'tribute-settings';enabled:boolean;revision:number;runId:string;expected:{day:number;nextEventId:number;tick:number}}|{type:'declare-cb';nationId:string;targetNationId:string;casusBelliId:1|3;expected:{day:number;nextEventId:number;tick:number}}|{type:'release-vassal';nationId:string;expected:{day:number;nextEventId:number;tick:number}}|{type:'diplomacy-settings';edit:DiplomacyEdit;runId:string;revision:number;expected:{day:number;nextEventId:number;tick:number}}|{type:'voyage-auto';nationId:string;enabled:boolean;expected:{day:number;nextEventId:number;tick:number}}|{type:'destiny-edit';edit:DestinyEdit;expected:{day:number;nextEventId:number;tick:number}}|Exclude<OldCommand,{type:'load'|'copy'|'create'}>|{type:'load';run:GameRun}|{type:'copy';run:GameRun}|(Extract<OldCommand,{type:'create'}>&{cultures?:string[]});
function political(run:ChronicleRun,naming:NamingState,people:CourtPeople,culture:CultureState,sovereignty:Sovereignty,upperCombat:UpperCombat,kin:KinState,dayChanged:boolean,action?:PoliticsAction,militaryAccess?:MilitaryAccess46):ChronicleRun{
 const n={...run,naming,people,culture,sovereignty,upperCombat,kin,militaryAccess};if(action)applyPolitics(n,action);advancePolitics(n,dayChanged);const {naming:_,people:_p,culture:_c,sovereignty:_s,upperCombat:_u,kin:_k,militaryAccess:_access,...base}=n;void _;void _p;void _c;void _s;void _u;void _k;void _access;return base;
}
export class War46Session{
 private old=new OldSession();private current?:GameRun;
 execute(c:GameCommand):{run:GameRun;world:World;halted?:GameEvent}{
  c=structuredClone(c);
  if(c.type==='load'){assertGameRun(c.run);if(c.run.version!==46)this.old.execute({type:'load',run:c.run});return this.install(structuredClone(c.run),false,false);}
  if(c.type==='create'){return this.installNew(new OldSession().execute(c).run as OldRun,false);}
  if(c.type==='copy'){
   assertGameRun(c.run);if(c.run.version===46)throw Error('已经是当前新版，无需复制。');
   const base=structuredClone(c.run.version===45?c.run:new OldSession().execute({type:'copy',run:c.run}).run as OldRun);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;return this.installNew(base);
  }
  const r=this.current;if(!r)throw Error('请先创建或读取世界。');if(r.version!==46){if(c.type==='port-assault')throw Error('旧版没有海港控制，请明确创建副本。');if(c.type==='army-garrison')throw Error('旧版没有驻防部署功能，请明确创建副本。');if(c.type==='naval-deployment')throw Error('旧版没有舰队部署功能，请明确创建副本。');const out=this.old.execute(c);return {...this.install(out.run),...(out.halted?{halted:out.halted}:{})};}
  if(c.type!=='step'&&(!('expected'in c)||!c.expected||![c.expected.day,c.expected.nextEventId,c.expected.tick].every(Number.isSafeInteger)||c.expected.day!==r.world.day||c.expected.nextEventId!==r.world.nextEventId||c.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化或缺少有效预览，请重新预览。');
  const access:MilitaryAccess46=(w,a,b)=>militaryAccess46({alliances,vassals})(w,a,b);
  const settings=structuredClone(r.diplomacy),nativeDiplomacy=structuredClone(r.nativeDiplomacy),vassals=structuredClone(r.vassals),tribute=structuredClone(r.tribute),rebellion=structuredClone(r.rebellion),alliances=structuredClone(r.alliances),navalDeployment=structuredClone(r.navalDeployment),garrison=structuredClone(r.garrison),portControl=structuredClone(r.portControl),shipbuilding=structuredClone(r.shipbuilding);
  const promote=(base:War29Run)=>war46Wrap(base,r.diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl,r.harbors,shipbuilding);
  if(c.type==='port-assault'){if(c.runId!==r.id||c.revision!==r.portControl.revision||Object.keys(c).sort().join()!=='expected,fleetId,revision,runId,type')throw Error('夺港预览已过期或参数无效。');const n=structuredClone(r);startPortAssault46(n,n.portControl,n.voyages,graphFor({...n,harbors:r.harbors}),c.fleetId);return this.install(n);}
  if(c.type==='army-garrison'){if(c.runId!==r.id||c.revision!==r.garrison.revision||Object.keys(c).sort().join()!=='armyId,expected,revision,runId,type')throw Error('驻防预览已过期或参数无效。');const n=structuredClone(r);resumeGarrison46(n,n.voyages,n.garrison,c.armyId);return this.install(n);}
  if(c.type==='naval-deployment'){if(c.runId!==r.id||c.revision!==r.navalDeployment.revision||Object.keys(c).sort().join()!=='expected,fleetId,revision,runId,type')throw Error('舰队部署预览已过期或参数无效。');const n=structuredClone(r);resumeDeployment46(n,n.voyages,n.navalDeployment,c.fleetId);cancelPortOrder46(n.portControl,c.fleetId);return this.install(n);}
  if(c.type==='alliance-edit'){if(c.runId!==r.id||c.revision!==r.alliances.revision||Object.keys(c).sort().join()!=='edit,expected,revision,runId,type')throw Error('联盟预览已过期或参数无效。');const n=structuredClone(r);applyAlliance46(n,c.edit);Object.assign(n,reconcileCombat(n.world,n.battles,n.clock.tick,militaryAccess46(n)));return this.install(n);}
  if(c.type==='rebellion-settings'){if(c.runId!==r.id||Object.keys(c).sort().join()!=='enabled,expected,revision,runId,type')throw Error('附庸自主独立参数无效。');const n=structuredClone(r);setRebellion46(n,c.enabled,c.revision);return this.install(n);}
  if(c.type==='tribute-settings'){if(c.runId!==r.id||Object.keys(c).sort().join()!=='enabled,expected,revision,runId,type')throw Error('贡金设置参数无效。');const n=structuredClone(r);setTribute46(n,c.enabled,c.revision);return this.install(n);}
  if(c.type==='declare-cb'){if(![1,3].includes(c.casusBelliId)||Object.keys(c).sort().join()!=='casusBelliId,expected,nationId,targetNationId,type')throw Error('宣战理由无效。');const n=structuredClone(r);declareWar46(n,c.nationId,c.targetNationId,c.casusBelliId);return this.install(n);}
  if(c.type==='release-vassal'){if(Object.keys(c).sort().join()!=='expected,nationId,type'||!overlord46(r,c.nationId))throw Error('附庸关系已变化。');const n=structuredClone(r);releaseVassal46(n,c.nationId);return this.install(n);}
  if(c.type==='diplomacy-settings'){if(c.runId!==r.id||c.revision!==r.diplomacy.revision)throw Error('外交设置预览已过期，请重新预览。');const candidate=structuredClone(r);applyDiplomacy(candidate,c.edit);return this.install(candidate);}
  if(c.type==='voyage-auto'){const n=structuredClone(r);if(typeof c.enabled!=='boolean'||!Object.hasOwn(n.voyages.enabled,c.nationId))throw Error('远征设置无效。');n.voyages.enabled[c.nationId]=c.enabled;n.voyages.revision++;return this.install(n);}
  if(c.type==='destiny-edit'){const n=structuredClone(r),p=previewDestinyEdit(n,c.edit);if(!p.valid)throw Error(p.reason);refreshDestinyTrait(n.destiny,c.edit.nationId,c.edit.manifest);n.world.events.push({id:n.world.nextEventId++,day:n.world.day,kind:'system',text:p.reason,reason:p.details.join(' ')});n.world.events=n.world.events.slice(-160);return this.install(n);}
  if(c.type==='culture-edit'){const n=structuredClone(r);applyCultureEdit(n,c.edit);return this.install(n);}
  if(c.type==='appointment'){const n=structuredClone(r);applyAppointment(n,c.action);return this.install(n);}
  if(c.type==='combat-edit'){const base=applyCombatEdit(upper14View(fiscal15View(court16View(r))),c.edit,c.expected,c.runId);const destiny=structuredClone(r.destiny),id=c.edit.nationId;destiny.nations[id].destiny=base.upperCombat.nations[id].destiny;destiny.revision++;if(JSON.stringify(r.upperCombat.nations[id].traits)!==JSON.stringify(base.upperCombat.nations[id].traits))refreshDestinyTrait(destiny,id,destiny.nations[id].manifest);return this.install(promote(war29Wrap(war28Wrap(war27Wrap(war26Wrap(settlement25Wrap(voyage24Wrap(dynasty23Wrap(restoration19Wrap(court16Wrap(fiscal15Wrap(base,structuredClone(r.finance)),structuredClone(r.people)),structuredClone(r.culture),structuredClone(r.naming),structuredClone(r.sovereignty)),destiny,structuredClone(r.life),structuredClone(r.kin)),structuredClone(r.voyages)),structuredClone(r.generation)),structuredClone(r.warfare)),structuredClone(r.losses)),structuredClone(r.nativeWars)),settings)));}
  const nativeWars=structuredClone(r.nativeWars),losses=structuredClone(r.losses),warfare=structuredClone(r.warfare),voyages=structuredClone(r.voyages),kin=structuredClone(r.kin),life=structuredClone(r.life),destiny=structuredClone(r.destiny),naming=structuredClone(r.naming),sovereignty=structuredClone(r.sovereignty),people=structuredClone(r.people),culture=structuredClone(r.culture),upper=structuredClone(r.upperCombat),finance=structuredClone(r.finance);
  const record=lossRecorder(losses,warfare),rawDamage=war28DamageSink(nativeWars,{...r,people});
  const declared=()=>{throw Error('旧自主宣战入口未关闭，本批已取消。');};
  const pack=(n:ChronicleRun)=>restoration19Wrap(court16Wrap(fiscal15Wrap(upper14Wrap(terrain13Wrap(chronicle2Wrap(n),r.terrainContext),upper),finance),people),culture,naming,sovereignty);
  const wrap=(n:ChronicleRun)=>{reconcileDiplomacy(settings,n.world);reconcileNameEdits(naming,n.world);reconcileCultures({...n,naming,sovereignty},culture);reconcilePeople(n,people,sovereignty);reconcileLife22(life,people);reconcileKin(kin,{people,life});reconcileUpper(n,upper);reconcileFiscal({...n,upperCombat:upper,people,culture},finance);const base=pack(n);reconcileDestiny(base,destiny);reconcileVoyages(n,voyages);reconcileWar26(n.world,warfare,graphFor(r),n.clock.tick,(w,id)=>war26Strength(w,n,id));reconcileLosses(losses,n.world,warfare,n.clock.tick);const result=war27Wrap(war26Wrap(settlement25Wrap(voyage24Wrap(dynasty23Wrap(base,destiny,life,kin),voyages),structuredClone(r.generation)),warfare),losses);reconcileWar28Identities(nativeWars,result);reconcileParticipants28(nativeWars,result);importUnknownWars28(nativeWars,result);const candidate=promote(war29Wrap(war28Wrap(result,nativeWars),settings));reconcileShipbuilding46(shipbuilding,candidate);reconcileNativeDiplomacy46(nativeDiplomacy,candidate);reconcileVassals46(candidate);reconcileAlliances46(candidate);reconcileDeployment46(candidate,voyages,navalDeployment);reconcileGarrison46(candidate,voyages,garrison);reconcilePorts46(candidate,portControl,graphFor(candidate));return candidate;};
  if(c.type==='tick'||c.type==='step'){
   const ticks=c.type==='tick'?c.ticks:c.days*120;if(!Number.isInteger(ticks)||ticks<1||ticks>(c.type==='tick'?120:840)||(c.type==='step'&&!Number.isInteger(c.days))||(c.pauseOnBattle!==undefined&&typeof c.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
   let n={...chronicleView(r),chronicle:structuredClone(r.chronicle),navy:structuredClone(r.navy),transports:structuredClone(r.transports)},halted:GameEvent|undefined;const g=graphFor(r),context={...r.terrainContext,upper,finance,people,culture,destiny};
   for(let i=0;i<ticks;i++){
    peaceDeployment46(n,voyages,navalDeployment);n=advanceWar46Voyages(n,voyages,g,context,warfare,declared,()=>false,(id,nation)=>portAvailable46(portControl,id,nation),id=>!!portControl.fleets[id]?.active||!!portControl.fleets[id]?.targetId,access);const before=n.world,first=before.nextEventId;advanceLife22(life,people,n.clock.tick+1);reconcileKin(kin,{people,life});const reserved=new Set([...Object.keys(n.battles.plans),...Object.keys(n.reorganization.active),...Object.values(voyages.missions).filter(m=>m.phase==='assembling').map(m=>m.armyId)]);reconcileWar26(n.world,warfare,g,n.clock.tick,(w,id)=>war26Strength(w,n,id));reconcileLosses(losses,n.world,warfare,n.clock.tick);n=chronicleWrap(advanceWar46Tick(campaignView(n),g,context,{state:warfare,graph:g,voyages,reservedArmyIds:reserved,strength:(w,id)=>war26Strength(w,n,id)},record,rawDamage,declared,()=>false,access,(id,nation)=>portAvailable46(portControl,id,nation),portControl),n.chronicle);refreshNavalRoles46(n,portControl,navalDeployment,g);advancePorts46(n,portControl,voyages,g,navalDeployment);advanceDeployment46(n,voyages,navalDeployment,g,id=>reservedPortFleet46(n,portControl,voyages,navalDeployment,g,id),(id,nation)=>portAvailable46(portControl,id,nation),id=>portControl.fleets[id]?.forwardBaseId??null);advanceGarrison46(n,voyages,garrison,g,access,(a,b)=>alliances.records.some(v=>v.endedTick===null&&v.members.includes(a)&&v.members.includes(b)));captureTransitions(n.chronicle,before,n.world,n.clock.tick);n=political(n,naming,people,culture,sovereignty,upper,kin,n.world.day!==before.day,undefined,access);reconcileCultures({...n,naming,sovereignty},culture);reconcilePeople(n,people,sovereignty);reconcileLife22(life,people);reconcileKin(kin,{people,life});reconcileUpper(n,upper);reconcileFiscal({...n,upperCombat:upper,people,culture},finance);
    reconcileDestiny(pack(n),destiny);
    const observed={...r,...n,people,life,upperCombat:upper,warfare,finance};reconcileWar28Identities(nativeWars,observed);reconcileParticipants28(nativeWars,observed);importUnknownWars28(nativeWars,observed);
    if(n.world.day!==before.day||hasWar29Extinction({world:n.world,nativeWars})){const prePeace=n.world,candidate=wrap(n);advanceWar46Peace(candidate,n.world.day!==before.day);reconcileNativeDiplomacy46(nativeDiplomacy,candidate);n=political(chronicleView(candidate),naming,people,culture,sovereignty,upper,kin,false,undefined,access);captureTransitions(n.chronicle,prePeace,n.world,n.clock.tick);}
    if(n.world.day!==before.day){const candidate=wrap(n);advanceDiplomaticSchedule46(nativeDiplomacy,candidate,id=>{advanceShipbuilding46(candidate,shipbuilding,id,g);evaluateAlliance46(candidate,id);evaluateDeclaration46(candidate,id);});refreshMilitaryTargets46(candidate);advanceTribute46(candidate);advanceRebellion46(candidate);n=chronicleView(candidate);}
    if(c.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&(isClash(n.world,e)||e.text==='舰队在海上接敌'));if(halted)break;}
   }
   return {...this.install(wrap(n)),...(halted?{halted}:{})};
  }
  if(c.type==='action'&&c.action.type==='declare-war'){if(Object.keys(c.action).sort().join()!=='nationId,targetNationId,type')throw Error('宣战参数含未知字段。');const candidate=wrap(structuredClone(chronicleView(r)));declareWar46(candidate,c.action.nationId,c.action.targetNationId);return this.install(candidate);}
  if(c.type==='politics')return this.install(wrap(political(structuredClone(chronicleView(r)),naming,people,culture,sovereignty,upper,kin,false,c.action,access)));
  let next:ChronicleRun;
  const peaceAction=c.type==='action'&&c.action.type==='make-peace'?c.action:null;
  if(peaceAction){const p=previewVoyageDiplomacy(r.world,graphFor(r),peaceAction);if(!p.valid)throw Error(p.reason);}
  if(peaceAction&&nativeWars.campaigns.some(w=>w.endedTick===null&&w.history==='complete'&&coversPair46(w,nativeWars,peaceAction.nationId,peaceAction.targetNationId))){
   const candidate=wrap(structuredClone(chronicleView(r))),war=candidate.nativeWars.campaigns.find(w=>w.endedTick===null&&coversPair46(w,nativeWars,peaceAction.nationId,peaceAction.targetNationId))!;settleWar46(candidate,war,11);reconcileNativeDiplomacy46(nativeDiplomacy,candidate);next=chronicleView(candidate);
  }else if(c.type==='naval'){
   const fleetId='fleetId'in c.action?c.action.fleetId:null;if(fleetId&&r.transports.cargo.some(v=>v.fleetId===fleetId))throw Error('载军舰队请使用运输航线，不能被普通巡航覆盖。');
   const base=maritimeView(tacticsView(campaignView(r))),moved=applyRealtimeNaval(r.world,r.navy,graphFor(r),c.action,{day:r.world.day,nextEventId:r.world.nextEventId},(id,nation)=>portAvailable46(portControl,id,nation)),maritime=structuredClone(r.maritime);
   if('fleetId'in c.action)delete maritime.retreating[c.action.fleetId];const sea=reconcileMaritime({...base,...moved,maritime});
   next={...chronicleView(r),...moved,...reconcileCombat(moved.world,r.battles,r.clock.tick,access),maritime:sea.maritime,chronicle:structuredClone(r.chronicle)};
  }else if(c.type==='battle'){
   next=structuredClone(chronicleView(r));Object.assign(next,applyBattle(next.world,next.battles,next.units,c.action,record,access));next={...next,...reconcileCombat(next.world,next.battles,next.clock.tick,access),maritime:reconcileMaritime(maritimeView(tacticsView(campaignView(next)))).maritime,...reconcileOccupation(next.world,next.occupation)};
  }else{
   next=c.type==='muster'?chronicleWrap(campaignWrap(applyMuster21(tacticsView(campaignView(r)),c.action,r),r.reorganization),structuredClone(r.chronicle)):applyRestorationCommand(restoration19View(r),c,access,graphFor(r));
  }
  yieldRendezvous46(voyages,next,c);if((c.type==='naval'||c.type==='maritime'||c.type==='transport')&&'fleetId'in c.action)cancelPortOrder46(portControl,c.action.fleetId);
  if(c.type==='naval'&&c.action.type==='build-fleet')for(const f of next.navy.fleets)if(!r.navy.fleets.some(old=>old.id===f.id)){voyages.manualFleets.push(f.id);voyages.revision++;}
  captureTransitions(next.chronicle,r.world,next.world,next.clock.tick);return this.install(wrap(political(next,naming,people,culture,sovereignty,upper,kin,false,undefined,access)));
 }
 private installNew(base:OldRun,_copy=true){return this.install(war46Wrap(previousView(base),base.diplomaticGeography,base.nativeDiplomacy,base.vassals,base.tribute,base.rebellion,structuredClone(base.alliances),structuredClone(base.navalDeployment),structuredClone(base.garrison),structuredClone(base.portControl),structuredClone(base.harbors),structuredClone(base.shipbuilding)),true);}
 private install(run:GameRun,checkGeometry=false,transition=true){if(run.version===46){reconcileAlliances46(run);peaceDeployment46(run,run.voyages,run.navalDeployment);const previous=this.current;if(transition&&previous?.version===46&&previous.id===run.id)settlePorts46(run,run.portControl,(a,b)=>nationsAtWar(previous.world,a,b));reconcilePorts46(run,run.portControl,graphFor(run));}if(run.version===46&&!checkGeometry)assertWar46Live(run);else assertGameRun(run);this.current=run;return structuredClone({run,world:run.world});}
}
