import {initializeHarborWorld43} from './war43-initial';
import {nationsAtWar} from './realtime-statecraft';
import {refreshNavalRoles43,reservedPortFleet43,reconcilePorts43,advancePorts43,startPortAssault43,cancelPortOrder43,settlePorts43,portAvailable43} from './war43-ports';
import {reconcileGarrison43,advanceGarrison43,resumeGarrison43} from './war43-garrison';
import {peaceDeployment43,reconcileDeployment43,advanceDeployment43,resumeDeployment43} from './war43-deployment';
import {militaryAccess43,type MilitaryAccess43} from './war43-access';
import {reconcileAlliances43,evaluateAlliance43,applyAlliance43,type AllianceEdit43} from './war43-alliance';
import {advanceRebellion43,setRebellion43} from './war43-rebellion';
import {coversPair43} from './war43-coalition';
import {advanceTribute43,setTribute43} from './war43-tribute';
import {War42Session as OldSession,type GameCommand as OldCommand} from './war42-session';
import {war29View as previousView,type War42Run as OldRun} from './war42-model';
import {overlord43,releaseVassal43,reconcileVassals43} from './war43-vassals';
import {war43Wrap,assertWar43Live} from './war43-model';
import type {War29Run} from './war29-model';
import {reconcileNativeDiplomacy43,advanceDiplomaticSchedule43} from './war43-state';
import {declareWar43,evaluateDeclaration43,refreshMilitaryTargets43} from './war43-declaration';
import {war29Wrap} from './war29-model';
import {reconcileDiplomacy,applyDiplomacy,type DiplomacyEdit} from './war29-diplomacy';
import {war28Wrap} from './war28-model';
import {importUnknownWars28,reconcileWar28Identities,reconcileParticipants28,war28DamageSink} from './war43-wars';
import {settlement25Wrap} from './settlement25-model';
import {war27Wrap} from './war27-model';
import {reconcileLosses,lossRecorder} from './war27-losses';
import {applyBattle} from './war43-battle';
import {reconcileOccupation} from './occupation';
import {war26Wrap} from './war26-model';
import {reconcileWar26} from './war26-state';
import {war26Strength} from './war26-strength';
import {voyage24Wrap} from './voyage24-model';
import {reconcileVoyages,yieldVoyages} from './voyage24-state';
import {advanceWar43Voyages} from './war43-voyages';
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
import {applyRestorationCommand} from './war43-commands';
import {tacticsView} from './campaign-model';
import {maritimeView} from './tactics-model';
import {graphFor43 as graphFor} from './war43-geography';
import {applyRealtimeNaval} from './war43-navy';
import {reconcileMaritime} from './maritime';
import {reconcileCombat} from './war43-battle';
import {captureTransitions} from './chronicle-records';
import {applyCombatEdit} from './destiny20-edit';
import {reconcileUpper} from './upper14-state';
import {applyAppointment} from './court16-people';
import {reconcilePeople} from './restoration19-people';
import {isClash} from './observation';
import {reconcileCultures,applyCultureEdit} from './restoration19-culture';
import {reconcileFiscal} from './restoration19-state';
import {advanceWar43Tick} from './war43-runtime';
import {advancePolitics,applyPolitics,type PoliticsAction} from './war43-politics';
import {reconcileNameEdits,type NamingState} from './restoration19-names';
import {restoration19Wrap} from './restoration19-model';
import {assertGameRun,restoration19View,chronicleView,campaignView,court16View,type GameRun} from './war43-model';
import {reconcileDestiny,previewDestinyEdit,refreshDestinyTrait,type DestinyEdit} from './destiny20-state';
import type {GameEvent,World} from '../../sim/types';
import {advanceWar43Peace,hasWar29Extinction} from './war43-peace';
import {settleWar43} from './war43-settlement';
export type GameCommand={type:'port-assault';fleetId:string;revision:number;runId:string;expected:{day:number;nextEventId:number;tick:number}}|{type:'army-garrison';armyId:string;revision:number;runId:string;expected:{day:number;nextEventId:number;tick:number}}|{type:'naval-deployment';fleetId:string;revision:number;runId:string;expected:{day:number;nextEventId:number;tick:number}}|{type:'alliance-edit';edit:AllianceEdit43;revision:number;runId:string;expected:{day:number;nextEventId:number;tick:number}}|{type:'rebellion-settings';enabled:boolean;revision:number;runId:string;expected:{day:number;nextEventId:number;tick:number}}|{type:'tribute-settings';enabled:boolean;revision:number;runId:string;expected:{day:number;nextEventId:number;tick:number}}|{type:'declare-cb';nationId:string;targetNationId:string;casusBelliId:1|3;expected:{day:number;nextEventId:number;tick:number}}|{type:'release-vassal';nationId:string;expected:{day:number;nextEventId:number;tick:number}}|{type:'diplomacy-settings';edit:DiplomacyEdit;runId:string;revision:number;expected:{day:number;nextEventId:number;tick:number}}|{type:'voyage-auto';nationId:string;enabled:boolean;expected:{day:number;nextEventId:number;tick:number}}|{type:'destiny-edit';edit:DestinyEdit;expected:{day:number;nextEventId:number;tick:number}}|Exclude<OldCommand,{type:'load'|'copy'|'create'}>|{type:'load';run:GameRun}|{type:'copy';run:GameRun}|(Extract<OldCommand,{type:'create'}>&{cultures?:string[]});
function political(run:ChronicleRun,naming:NamingState,people:CourtPeople,culture:CultureState,sovereignty:Sovereignty,upperCombat:UpperCombat,kin:KinState,dayChanged:boolean,action?:PoliticsAction,militaryAccess?:MilitaryAccess43):ChronicleRun{
 const n={...run,naming,people,culture,sovereignty,upperCombat,kin,militaryAccess};if(action)applyPolitics(n,action);advancePolitics(n,dayChanged);const {naming:_,people:_p,culture:_c,sovereignty:_s,upperCombat:_u,kin:_k,militaryAccess:_access,...base}=n;void _;void _p;void _c;void _s;void _u;void _k;void _access;return base;
}
export class War43Session{
 private old=new OldSession();private current?:GameRun;
 execute(c:GameCommand):{run:GameRun;world:World;halted?:GameEvent}{
  c=structuredClone(c);
  if(c.type==='load'){assertGameRun(c.run);if(c.run.version!==43)this.old.execute({type:'load',run:c.run});return this.install(structuredClone(c.run),false,false);}
  if(c.type==='create'){return this.installNew(new OldSession().execute(c).run as OldRun,false);}
  if(c.type==='copy'){
   assertGameRun(c.run);if(c.run.version===43)throw Error('已经是当前新版，无需复制。');
   const base=structuredClone(c.run.version===42?c.run:new OldSession().execute({type:'copy',run:c.run}).run as OldRun);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;return this.installNew(base);
  }
  const r=this.current;if(!r)throw Error('请先创建或读取世界。');if(r.version!==43){if(c.type==='port-assault')throw Error('旧版没有海港控制，请明确创建副本。');if(c.type==='army-garrison')throw Error('旧版没有驻防部署功能，请明确创建副本。');if(c.type==='naval-deployment')throw Error('旧版没有舰队部署功能，请明确创建副本。');const out=this.old.execute(c);return {...this.install(out.run),...(out.halted?{halted:out.halted}:{})};}
  if(c.type!=='step'&&(!('expected'in c)||!c.expected||![c.expected.day,c.expected.nextEventId,c.expected.tick].every(Number.isSafeInteger)||c.expected.day!==r.world.day||c.expected.nextEventId!==r.world.nextEventId||c.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化或缺少有效预览，请重新预览。');
  const access:MilitaryAccess43=(w,a,b)=>militaryAccess43({alliances,vassals})(w,a,b);
  const settings=structuredClone(r.diplomacy),nativeDiplomacy=structuredClone(r.nativeDiplomacy),vassals=structuredClone(r.vassals),tribute=structuredClone(r.tribute),rebellion=structuredClone(r.rebellion),alliances=structuredClone(r.alliances),navalDeployment=structuredClone(r.navalDeployment),garrison=structuredClone(r.garrison),portControl=structuredClone(r.portControl);
  const promote=(base:War29Run)=>war43Wrap(base,r.diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl,r.harbors);
  if(c.type==='port-assault'){if(c.runId!==r.id||c.revision!==r.portControl.revision||Object.keys(c).sort().join()!=='expected,fleetId,revision,runId,type')throw Error('夺港预览已过期或参数无效。');const n=structuredClone(r);startPortAssault43(n,n.portControl,n.voyages,graphFor({...n,harbors:r.harbors}),c.fleetId);return this.install(n);}
  if(c.type==='army-garrison'){if(c.runId!==r.id||c.revision!==r.garrison.revision||Object.keys(c).sort().join()!=='armyId,expected,revision,runId,type')throw Error('驻防预览已过期或参数无效。');const n=structuredClone(r);resumeGarrison43(n,n.voyages,n.garrison,c.armyId);return this.install(n);}
  if(c.type==='naval-deployment'){if(c.runId!==r.id||c.revision!==r.navalDeployment.revision||Object.keys(c).sort().join()!=='expected,fleetId,revision,runId,type')throw Error('舰队部署预览已过期或参数无效。');const n=structuredClone(r);resumeDeployment43(n,n.voyages,n.navalDeployment,c.fleetId);cancelPortOrder43(n.portControl,c.fleetId);return this.install(n);}
  if(c.type==='alliance-edit'){if(c.runId!==r.id||c.revision!==r.alliances.revision||Object.keys(c).sort().join()!=='edit,expected,revision,runId,type')throw Error('联盟预览已过期或参数无效。');const n=structuredClone(r);applyAlliance43(n,c.edit);Object.assign(n,reconcileCombat(n.world,n.battles,n.clock.tick,militaryAccess43(n)));return this.install(n);}
  if(c.type==='rebellion-settings'){if(c.runId!==r.id||Object.keys(c).sort().join()!=='enabled,expected,revision,runId,type')throw Error('附庸自主独立参数无效。');const n=structuredClone(r);setRebellion43(n,c.enabled,c.revision);return this.install(n);}
  if(c.type==='tribute-settings'){if(c.runId!==r.id||Object.keys(c).sort().join()!=='enabled,expected,revision,runId,type')throw Error('贡金设置参数无效。');const n=structuredClone(r);setTribute43(n,c.enabled,c.revision);return this.install(n);}
  if(c.type==='declare-cb'){if(![1,3].includes(c.casusBelliId)||Object.keys(c).sort().join()!=='casusBelliId,expected,nationId,targetNationId,type')throw Error('宣战理由无效。');const n=structuredClone(r);declareWar43(n,c.nationId,c.targetNationId,c.casusBelliId);return this.install(n);}
  if(c.type==='release-vassal'){if(Object.keys(c).sort().join()!=='expected,nationId,type'||!overlord43(r,c.nationId))throw Error('附庸关系已变化。');const n=structuredClone(r);releaseVassal43(n,c.nationId);return this.install(n);}
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
  const wrap=(n:ChronicleRun)=>{reconcileDiplomacy(settings,n.world);reconcileNameEdits(naming,n.world);reconcileCultures({...n,naming,sovereignty},culture);reconcilePeople(n,people,sovereignty);reconcileLife22(life,people);reconcileKin(kin,{people,life});reconcileUpper(n,upper);reconcileFiscal({...n,upperCombat:upper,people,culture},finance);const base=pack(n);reconcileDestiny(base,destiny);reconcileVoyages(n,voyages);reconcileWar26(n.world,warfare,graphFor(r),n.clock.tick,(w,id)=>war26Strength(w,n,id));reconcileLosses(losses,n.world,warfare,n.clock.tick);const result=war27Wrap(war26Wrap(settlement25Wrap(voyage24Wrap(dynasty23Wrap(base,destiny,life,kin),voyages),structuredClone(r.generation)),warfare),losses);reconcileWar28Identities(nativeWars,result);reconcileParticipants28(nativeWars,result);importUnknownWars28(nativeWars,result);const candidate=promote(war29Wrap(war28Wrap(result,nativeWars),settings));reconcileNativeDiplomacy43(nativeDiplomacy,candidate);reconcileVassals43(candidate);reconcileAlliances43(candidate);reconcileDeployment43(candidate,voyages,navalDeployment);reconcileGarrison43(candidate,voyages,garrison);reconcilePorts43(candidate,portControl,graphFor(candidate));return candidate;};
  if(c.type==='tick'||c.type==='step'){
   const ticks=c.type==='tick'?c.ticks:c.days*120;if(!Number.isInteger(ticks)||ticks<1||ticks>(c.type==='tick'?120:840)||(c.type==='step'&&!Number.isInteger(c.days))||(c.pauseOnBattle!==undefined&&typeof c.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
   let n={...chronicleView(r),chronicle:structuredClone(r.chronicle)},halted:GameEvent|undefined;const g=graphFor(r),context={...r.terrainContext,upper,finance,people,culture,destiny};
   for(let i=0;i<ticks;i++){
    peaceDeployment43(n,voyages,navalDeployment);const before=n.world,first=before.nextEventId;advanceLife22(life,people,n.clock.tick+1);reconcileKin(kin,{people,life});const reserved=new Set([...Object.keys(n.battles.plans),...Object.keys(n.reorganization.active),...Object.values(voyages.missions).filter(m=>m.phase==='assembling').map(m=>m.armyId)]);reconcileWar26(n.world,warfare,g,n.clock.tick,(w,id)=>war26Strength(w,n,id));reconcileLosses(losses,n.world,warfare,n.clock.tick);n=chronicleWrap(advanceWar43Tick(campaignView(n),g,context,{state:warfare,graph:g,voyages,reservedArmyIds:reserved,strength:(w,id)=>war26Strength(w,n,id)},record,rawDamage,declared,()=>false,access,(id,nation)=>portAvailable43(portControl,id,nation)),n.chronicle);refreshNavalRoles43(n,portControl,navalDeployment,g);n=advanceWar43Voyages(n,voyages,g,context,warfare,declared,()=>false,(id,nation)=>portAvailable43(portControl,id,nation),id=>reservedPortFleet43(n,portControl,voyages,navalDeployment,g,id));advancePorts43(n,portControl,voyages,g,navalDeployment);advanceDeployment43(n,voyages,navalDeployment,g,id=>reservedPortFleet43(n,portControl,voyages,navalDeployment,g,id),(id,nation)=>portAvailable43(portControl,id,nation),id=>portControl.fleets[id]?.forwardBaseId??null);advanceGarrison43(n,voyages,garrison,g,access,(a,b)=>alliances.records.some(v=>v.endedTick===null&&v.members.includes(a)&&v.members.includes(b)));captureTransitions(n.chronicle,before,n.world,n.clock.tick);n=political(n,naming,people,culture,sovereignty,upper,kin,n.world.day!==before.day,undefined,access);reconcileCultures({...n,naming,sovereignty},culture);reconcilePeople(n,people,sovereignty);reconcileLife22(life,people);reconcileKin(kin,{people,life});reconcileUpper(n,upper);reconcileFiscal({...n,upperCombat:upper,people,culture},finance);
    reconcileDestiny(pack(n),destiny);
    const observed={...r,...n,people,life,upperCombat:upper,warfare,finance};reconcileWar28Identities(nativeWars,observed);reconcileParticipants28(nativeWars,observed);importUnknownWars28(nativeWars,observed);
    if(n.world.day!==before.day||hasWar29Extinction({world:n.world,nativeWars})){const prePeace=n.world,candidate=wrap(n);advanceWar43Peace(candidate,n.world.day!==before.day);reconcileNativeDiplomacy43(nativeDiplomacy,candidate);n=political(chronicleView(candidate),naming,people,culture,sovereignty,upper,kin,false,undefined,access);captureTransitions(n.chronicle,prePeace,n.world,n.clock.tick);}
    if(n.world.day!==before.day){const candidate=wrap(n);advanceDiplomaticSchedule43(nativeDiplomacy,candidate,id=>{evaluateAlliance43(candidate,id);evaluateDeclaration43(candidate,id);});refreshMilitaryTargets43(candidate);advanceTribute43(candidate);advanceRebellion43(candidate);n=chronicleView(candidate);}
    if(c.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&(isClash(n.world,e)||e.text==='舰队在海上接敌'));if(halted)break;}
   }
   return {...this.install(wrap(n)),...(halted?{halted}:{})};
  }
  if(c.type==='action'&&c.action.type==='declare-war'){if(Object.keys(c.action).sort().join()!=='nationId,targetNationId,type')throw Error('宣战参数含未知字段。');const candidate=wrap(structuredClone(chronicleView(r)));declareWar43(candidate,c.action.nationId,c.action.targetNationId);return this.install(candidate);}
  if(c.type==='politics')return this.install(wrap(political(structuredClone(chronicleView(r)),naming,people,culture,sovereignty,upper,kin,false,c.action,access)));
  let next:ChronicleRun;
  const peaceAction=c.type==='action'&&c.action.type==='make-peace'?c.action:null;
  if(peaceAction){const p=previewVoyageDiplomacy(r.world,graphFor(r),peaceAction);if(!p.valid)throw Error(p.reason);}
  if(peaceAction&&nativeWars.campaigns.some(w=>w.endedTick===null&&w.history==='complete'&&coversPair43(w,nativeWars,peaceAction.nationId,peaceAction.targetNationId))){
   const candidate=wrap(structuredClone(chronicleView(r))),war=candidate.nativeWars.campaigns.find(w=>w.endedTick===null&&coversPair43(w,nativeWars,peaceAction.nationId,peaceAction.targetNationId))!;settleWar43(candidate,war,11);reconcileNativeDiplomacy43(nativeDiplomacy,candidate);next=chronicleView(candidate);
  }else if(c.type==='naval'){
   const fleetId='fleetId'in c.action?c.action.fleetId:null;if(fleetId&&r.transports.cargo.some(v=>v.fleetId===fleetId))throw Error('载军舰队请使用运输航线，不能被普通巡航覆盖。');
   const base=maritimeView(tacticsView(campaignView(r))),moved=applyRealtimeNaval(r.world,r.navy,graphFor(r),c.action,{day:r.world.day,nextEventId:r.world.nextEventId},(id,nation)=>portAvailable43(portControl,id,nation)),maritime=structuredClone(r.maritime);
   if('fleetId'in c.action)delete maritime.retreating[c.action.fleetId];const sea=reconcileMaritime({...base,...moved,maritime});
   next={...chronicleView(r),...moved,...reconcileCombat(moved.world,r.battles,r.clock.tick,access),maritime:sea.maritime,chronicle:structuredClone(r.chronicle)};
  }else if(c.type==='battle'){
   next=structuredClone(chronicleView(r));Object.assign(next,applyBattle(next.world,next.battles,next.units,c.action,record,access));next={...next,...reconcileCombat(next.world,next.battles,next.clock.tick,access),maritime:reconcileMaritime(maritimeView(tacticsView(campaignView(next)))).maritime,...reconcileOccupation(next.world,next.occupation)};
  }else{
   next=c.type==='muster'?chronicleWrap(campaignWrap(applyMuster21(tacticsView(campaignView(r)),c.action,r),r.reorganization),structuredClone(r.chronicle)):applyRestorationCommand(restoration19View(r),c,access,graphFor(r));
  }
  yieldVoyages(voyages,next,c);if((c.type==='naval'||c.type==='maritime'||c.type==='transport')&&'fleetId'in c.action)cancelPortOrder43(portControl,c.action.fleetId);
  if(c.type==='naval'&&c.action.type==='build-fleet')for(const f of next.navy.fleets)if(!r.navy.fleets.some(old=>old.id===f.id)){voyages.manualFleets.push(f.id);voyages.revision++;}
  captureTransitions(next.chronicle,r.world,next.world,next.clock.tick);return this.install(wrap(political(next,naming,people,culture,sovereignty,upper,kin,false,undefined,access)));
 }
 private installNew(base:OldRun,_copy=true){const next=war43Wrap(previousView(base),base.diplomaticGeography,base.nativeDiplomacy,base.vassals,base.tribute,base.rebellion,structuredClone(base.alliances),structuredClone(base.navalDeployment),structuredClone(base.garrison),structuredClone(base.portControl));if(!_copy)initializeHarborWorld43(next);return this.install(next,true);}
 private install(run:GameRun,checkGeometry=false,transition=true){if(run.version===43){reconcileAlliances43(run);peaceDeployment43(run,run.voyages,run.navalDeployment);const previous=this.current;if(transition&&previous?.version===43&&previous.id===run.id)settlePorts43(run,run.portControl,(a,b)=>nationsAtWar(previous.world,a,b));reconcilePorts43(run,run.portControl,graphFor(run));}if(run.version===43&&!checkGeometry)assertWar43Live(run);else assertGameRun(run);this.current=run;return structuredClone({run,world:run.world});}
}
