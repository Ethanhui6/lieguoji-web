import {War26Session,type GameCommand as OldCommand} from './war26-session';
import {settlement25Wrap} from './settlement25-model';
import type {War26Run} from './war26-model';
import {war27Wrap} from './war27-model';
import {initialLosses,reconcileLosses,lossRecorder} from './war27-losses';
import {applyBattle} from './war27-battle';
import {reconcileOccupation} from './occupation';
import {war26Wrap} from './war26-model';
import {reconcileWar26} from './war26-state';
import {war26Strength} from './war26-strength';
import {voyage24Wrap} from './voyage24-model';
import {reconcileVoyages,yieldVoyages} from './voyage24-state';
import {advanceWar26Voyages} from './war26-voyages';
import {applyVoyageDiplomacy} from './voyage24-diplomacy';
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
import {applyRestorationCommand} from './restoration19-commands';
import {tacticsView} from './campaign-model';
import {maritimeView} from './tactics-model';
import {graphFor} from './naval-rules';
import {applyRealtimeNaval} from './navy';
import {reconcileMaritime} from './maritime';
import {reconcileCombat} from './chronicle-battle';
import {captureTransitions} from './chronicle-records';
import {applyCombatEdit} from './destiny20-edit';
import {reconcileUpper} from './upper14-state';
import {applyAppointment} from './court16-people';
import {reconcilePeople} from './restoration19-people';
import {isClash} from './observation';
import {reconcileCultures,applyCultureEdit} from './restoration19-culture';
import {reconcileFiscal} from './restoration19-state';
import {advanceWar27Tick} from './war27-runtime';
import {advancePolitics,applyPolitics,type PoliticsAction} from './dynasty23-politics';
import {reconcileNameEdits,type NamingState} from './restoration19-names';
import {restoration19Wrap} from './restoration19-model';
import {assertGameRun,restoration19View,chronicleView,campaignView,court16View,type GameRun} from './war27-model';
import {reconcileDestiny,previewDestinyEdit,refreshDestinyTrait,type DestinyEdit} from './destiny20-state';
import type {GameEvent,World} from '../../sim/types';
export type GameCommand={type:'voyage-auto';nationId:string;enabled:boolean;expected:{day:number;nextEventId:number;tick:number}}|{type:'destiny-edit';edit:DestinyEdit;expected:{day:number;nextEventId:number;tick:number}}|Exclude<OldCommand,{type:'load'|'copy'|'create'}>|{type:'load';run:GameRun}|{type:'copy';run:GameRun}|(Extract<OldCommand,{type:'create'}>&{cultures?:string[]});
function political(run:ChronicleRun,naming:NamingState,people:CourtPeople,culture:CultureState,sovereignty:Sovereignty,upperCombat:UpperCombat,kin:KinState,dayChanged:boolean,action?:PoliticsAction):ChronicleRun{
 const n={...run,naming,people,culture,sovereignty,upperCombat,kin};if(action)applyPolitics(n,action);advancePolitics(n,dayChanged);const {naming:_,people:_p,culture:_c,sovereignty:_s,upperCombat:_u,kin:_k,...base}=n;void _;void _p;void _c;void _s;void _u;void _k;return base;
}
export class War27Session{
 private old=new War26Session();private current?:GameRun;
 execute(c:GameCommand):{run:GameRun;world:World;halted?:GameEvent}{
  if(c.type==='load'){assertGameRun(c.run);if(c.run.version!==27)this.old.execute({type:'load',run:c.run});return this.install(structuredClone(c.run));}
  if(c.type==='create'){return this.installNew(new War26Session().execute(c).run as War26Run);}
  if(c.type==='copy'){
   assertGameRun(c.run);if(c.run.version===27)throw Error('已经是当前新版，无需复制。');
   const base=structuredClone(c.run.version===26?c.run:new War26Session().execute({type:'copy',run:c.run}).run as War26Run);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;return this.installNew(base,true);
  }
  const r=this.current;if(!r)throw Error('请先创建或读取世界。');if(r.version!==27){const out=this.old.execute(c);return {...this.install(out.run),...(out.halted?{halted:out.halted}:{})};}
  if(c.type!=='step'&&(!('expected'in c)||!c.expected||![c.expected.day,c.expected.nextEventId,c.expected.tick].every(Number.isSafeInteger)||c.expected.day!==r.world.day||c.expected.nextEventId!==r.world.nextEventId||c.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化或缺少有效预览，请重新预览。');
  if(c.type==='voyage-auto'){const n=structuredClone(r);if(typeof c.enabled!=='boolean'||!Object.hasOwn(n.voyages.enabled,c.nationId))throw Error('远征设置无效。');n.voyages.enabled[c.nationId]=c.enabled;n.voyages.revision++;return this.install(n);}
  if(c.type==='destiny-edit'){const n=structuredClone(r),p=previewDestinyEdit(n,c.edit);if(!p.valid)throw Error(p.reason);refreshDestinyTrait(n.destiny,c.edit.nationId,c.edit.manifest);n.world.events.push({id:n.world.nextEventId++,day:n.world.day,kind:'system',text:p.reason,reason:p.details.join(' ')});n.world.events=n.world.events.slice(-160);return this.install(n);}
  if(c.type==='culture-edit'){const n=structuredClone(r);applyCultureEdit(n,c.edit);return this.install(n);}
  if(c.type==='appointment'){const n=structuredClone(r);applyAppointment(n,c.action);return this.install(n);}
  if(c.type==='combat-edit'){const base=applyCombatEdit(upper14View(fiscal15View(court16View(r))),c.edit,c.expected,c.runId);const destiny=structuredClone(r.destiny),id=c.edit.nationId;destiny.nations[id].destiny=base.upperCombat.nations[id].destiny;destiny.revision++;if(JSON.stringify(r.upperCombat.nations[id].traits)!==JSON.stringify(base.upperCombat.nations[id].traits))refreshDestinyTrait(destiny,id,destiny.nations[id].manifest);return this.install(war27Wrap(war26Wrap(settlement25Wrap(voyage24Wrap(dynasty23Wrap(restoration19Wrap(court16Wrap(fiscal15Wrap(base,structuredClone(r.finance)),structuredClone(r.people)),structuredClone(r.culture),structuredClone(r.naming),structuredClone(r.sovereignty)),destiny,structuredClone(r.life),structuredClone(r.kin)),structuredClone(r.voyages)),structuredClone(r.generation)),structuredClone(r.warfare)),structuredClone(r.losses)));}
  const losses=structuredClone(r.losses),warfare=structuredClone(r.warfare),voyages=structuredClone(r.voyages),kin=structuredClone(r.kin),life=structuredClone(r.life),destiny=structuredClone(r.destiny),naming=structuredClone(r.naming),sovereignty=structuredClone(r.sovereignty),people=structuredClone(r.people),culture=structuredClone(r.culture),upper=structuredClone(r.upperCombat),finance=structuredClone(r.finance);
  const record=lossRecorder(losses,warfare);
  const pack=(n:ChronicleRun)=>restoration19Wrap(court16Wrap(fiscal15Wrap(upper14Wrap(terrain13Wrap(chronicle2Wrap(n),r.terrainContext),upper),finance),people),culture,naming,sovereignty);
  const wrap=(n:ChronicleRun)=>{reconcileNameEdits(naming,n.world);reconcileCultures({...n,naming,sovereignty},culture);reconcilePeople(n,people,sovereignty);reconcileLife22(life,people);reconcileKin(kin,{people,life});reconcileUpper(n,upper);reconcileFiscal({...n,upperCombat:upper,people,culture},finance);const base=pack(n);reconcileDestiny(base,destiny);reconcileVoyages(n,voyages);reconcileWar26(n.world,warfare,graphFor(maritimeView(tacticsView(campaignView(r)))),n.clock.tick,(w,id)=>war26Strength(w,n,id));reconcileLosses(losses,n.world,warfare,n.clock.tick);return war27Wrap(war26Wrap(settlement25Wrap(voyage24Wrap(dynasty23Wrap(base,destiny,life,kin),voyages),structuredClone(r.generation)),warfare),losses);};
  if(c.type==='tick'||c.type==='step'){
   const ticks=c.type==='tick'?c.ticks:c.days*120;if(!Number.isInteger(ticks)||ticks<1||ticks>(c.type==='tick'?120:840)||(c.type==='step'&&!Number.isInteger(c.days))||(c.pauseOnBattle!==undefined&&typeof c.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
   let n={...chronicleView(r),chronicle:structuredClone(r.chronicle)},halted:GameEvent|undefined;const g=graphFor(maritimeView(tacticsView(campaignView(r)))),context={...r.terrainContext,upper,finance,people,culture,destiny};
   for(let i=0;i<ticks;i++){
    const before=n.world,first=before.nextEventId;advanceLife22(life,people,n.clock.tick+1);reconcileKin(kin,{people,life});const reserved=new Set([...Object.keys(n.battles.plans),...Object.keys(n.reorganization.active),...Object.values(voyages.missions).filter(m=>m.phase==='assembling').map(m=>m.armyId)]);reconcileWar26(n.world,warfare,g,n.clock.tick,(w,id)=>war26Strength(w,n,id));reconcileLosses(losses,n.world,warfare,n.clock.tick);n=chronicleWrap(advanceWar27Tick(campaignView(n),g,context,{state:warfare,graph:g,voyages,reservedArmyIds:reserved,strength:(w,id)=>war26Strength(w,n,id)},record),n.chronicle);n=advanceWar26Voyages(n,voyages,g,context,warfare);captureTransitions(n.chronicle,before,n.world,n.clock.tick);n=political(n,naming,people,culture,sovereignty,upper,kin,n.world.day!==before.day);reconcileCultures({...n,naming,sovereignty},culture);reconcilePeople(n,people,sovereignty);reconcileLife22(life,people);reconcileKin(kin,{people,life});reconcileUpper(n,upper);reconcileFiscal({...n,upperCombat:upper,people,culture},finance);
    reconcileDestiny(pack(n),destiny);
    if(c.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&(isClash(n.world,e)||e.text==='舰队在海上接敌'));if(halted)break;}
   }
   return {...this.install(wrap(n)),...(halted?{halted}:{})};
  }
  if(c.type==='politics')return this.install(wrap(political(structuredClone(chronicleView(r)),naming,people,culture,sovereignty,upper,kin,false,c.action)));
  let next:ChronicleRun;
  if(c.type==='naval'){
   const fleetId='fleetId'in c.action?c.action.fleetId:null;if(fleetId&&r.transports.cargo.some(v=>v.fleetId===fleetId))throw Error('载军舰队请使用运输航线，不能被普通巡航覆盖。');
   const base=maritimeView(tacticsView(campaignView(r))),moved=applyRealtimeNaval(r.world,r.navy,graphFor(base),c.action,{day:r.world.day,nextEventId:r.world.nextEventId}),maritime=structuredClone(r.maritime);
   if('fleetId'in c.action)delete maritime.retreating[c.action.fleetId];const sea=reconcileMaritime({...base,...moved,maritime});
   next={...chronicleView(r),...moved,...reconcileCombat(moved.world,r.battles,r.clock.tick),maritime:sea.maritime,chronicle:structuredClone(r.chronicle)};
  }else if(c.type==='battle'){
   next=structuredClone(chronicleView(r));Object.assign(next,applyBattle(next.world,next.battles,next.units,c.action,record));next={...next,...reconcileCombat(next.world,next.battles,next.clock.tick),maritime:reconcileMaritime(maritimeView(tacticsView(campaignView(next)))).maritime,...reconcileOccupation(next.world,next.occupation)};
  }else{
   next=c.type==='action'&&c.action.type==='declare-war'?applyVoyageDiplomacy(chronicleView(r),graphFor(maritimeView(tacticsView(campaignView(r)))),c.action,c.expected):c.type==='muster'?chronicleWrap(campaignWrap(applyMuster21(tacticsView(campaignView(r)),c.action,r),r.reorganization),structuredClone(r.chronicle)):applyRestorationCommand(restoration19View(r),c);
  }
  yieldVoyages(voyages,next,c);
  if(c.type==='naval'&&c.action.type==='build-fleet')for(const f of next.navy.fleets)if(!r.navy.fleets.some(old=>old.id===f.id)){voyages.manualFleets.push(f.id);voyages.revision++;}
  captureTransitions(next.chronicle,r.world,next.world,next.clock.tick);return this.install(wrap(political(next,naming,people,culture,sovereignty,upper,kin,false)));
 }
 private installNew(base:War26Run,copy=false){return this.install(war27Wrap(base,initialLosses(base.world,base.warfare,base.clock.tick,copy)));}
 private install(run:GameRun){assertGameRun(run);this.current=run;return {run,world:run.world};}
}
