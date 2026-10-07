import {createLife22} from './life22-create';
import {initialLife22,reconcileLife22,advanceLife22} from './life22-state';
import {applyMuster21} from './muster21-rules';
import {campaignWrap} from './campaign-model';
import {Muster21Session,type GameCommand as OldCommand} from './muster21-session';
import type {Muster21Run} from './muster21-model';
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
import {advanceMuster21Tick} from './muster21-runtime';
import {advancePolitics,applyPolitics,type PoliticsAction} from './restoration19-politics';
import {reconcileNameEdits,type NamingState} from './restoration19-names';
import {restoration19Wrap} from './restoration19-model';
import {assertGameRun,life22Wrap,restoration19View,chronicleView,campaignView,court16View,type GameRun} from './life22-model';
import {reconcileDestiny,previewDestinyEdit,refreshDestinyTrait,type DestinyEdit} from './destiny20-state';
import type {GameEvent,World} from '../../sim/types';
export type GameCommand={type:'destiny-edit';edit:DestinyEdit;expected:{day:number;nextEventId:number;tick:number}}|Exclude<OldCommand,{type:'load'|'copy'|'create'}>|{type:'load';run:GameRun}|{type:'copy';run:GameRun}|(Extract<OldCommand,{type:'create'}>&{cultures?:string[]});
function political(run:ChronicleRun,naming:NamingState,people:CourtPeople,culture:CultureState,sovereignty:Sovereignty,upperCombat:UpperCombat,dayChanged:boolean,action?:PoliticsAction):ChronicleRun{
 const n={...run,naming,people,culture,sovereignty,upperCombat};if(action)applyPolitics(n,action);advancePolitics(n,dayChanged);const {naming:_,people:_p,culture:_c,sovereignty:_s,upperCombat:_u,...base}=n;void _;void _p;void _c;void _s;void _u;return base;
}
export class Life22Session{
 private old=new Muster21Session();private current?:GameRun;
 execute(c:GameCommand):{run:GameRun;world:World;halted?:GameEvent}{
  if(c.type==='load'){assertGameRun(c.run);if(c.run.version!==22)this.old.execute({type:'load',run:c.run});return this.install(structuredClone(c.run));}
  if(c.type==='create')return this.install(createLife22(c.terrain,c.count,c.relations,c.cultures));
  if(c.type==='copy'){
   assertGameRun(c.run);if(c.run.version===22)throw Error('已经是当前新版，无需复制。');
   const old=structuredClone(c.run.version===21?c.run:new Muster21Session().execute({type:'copy',run:c.run}).run as Muster21Run);old.id='fms-'+crypto.randomUUID();old.world.custom!.id=old.id;return this.install(life22Wrap(restoration19View(old),old.destiny,initialLife22(old)));
  }
  const r=this.current;if(!r)throw Error('请先创建或读取世界。');if(r.version!==22){const out=this.old.execute(c);return {...this.install(out.run),...(out.halted?{halted:out.halted}:{})};}
  if(c.type!=='step'&&(!('expected'in c)||!c.expected||![c.expected.day,c.expected.nextEventId,c.expected.tick].every(Number.isSafeInteger)||c.expected.day!==r.world.day||c.expected.nextEventId!==r.world.nextEventId||c.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化或缺少有效预览，请重新预览。');
  if(c.type==='destiny-edit'){const n=structuredClone(r),p=previewDestinyEdit(n,c.edit);if(!p.valid)throw Error(p.reason);refreshDestinyTrait(n.destiny,c.edit.nationId,c.edit.manifest);n.world.events.push({id:n.world.nextEventId++,day:n.world.day,kind:'system',text:p.reason,reason:p.details.join(' ')});n.world.events=n.world.events.slice(-160);return this.install(n);}
  if(c.type==='culture-edit'){const n=structuredClone(r);applyCultureEdit(n,c.edit);return this.install(n);}
  if(c.type==='appointment'){const n=structuredClone(r);applyAppointment(n,c.action);return this.install(n);}
  if(c.type==='combat-edit'){const base=applyCombatEdit(upper14View(fiscal15View(court16View(r))),c.edit,c.expected,c.runId);const destiny=structuredClone(r.destiny),id=c.edit.nationId;destiny.nations[id].destiny=base.upperCombat.nations[id].destiny;destiny.revision++;if(JSON.stringify(r.upperCombat.nations[id].traits)!==JSON.stringify(base.upperCombat.nations[id].traits))refreshDestinyTrait(destiny,id,destiny.nations[id].manifest);return this.install(life22Wrap(restoration19Wrap(court16Wrap(fiscal15Wrap(base,structuredClone(r.finance)),structuredClone(r.people)),structuredClone(r.culture),structuredClone(r.naming),structuredClone(r.sovereignty)),destiny,structuredClone(r.life)));}
  const life=structuredClone(r.life),destiny=structuredClone(r.destiny),naming=structuredClone(r.naming),sovereignty=structuredClone(r.sovereignty),people=structuredClone(r.people),culture=structuredClone(r.culture),upper=structuredClone(r.upperCombat),finance=structuredClone(r.finance);
  const pack=(n:ChronicleRun)=>restoration19Wrap(court16Wrap(fiscal15Wrap(upper14Wrap(terrain13Wrap(chronicle2Wrap(n),r.terrainContext),upper),finance),people),culture,naming,sovereignty);
  const wrap=(n:ChronicleRun)=>{reconcileNameEdits(naming,n.world);reconcileCultures({...n,naming,sovereignty},culture);reconcilePeople(n,people,sovereignty);reconcileLife22(life,people);reconcileUpper(n,upper);reconcileFiscal({...n,upperCombat:upper,people,culture},finance);const base=pack(n);reconcileDestiny(base,destiny);return life22Wrap(base,destiny,life);};
  if(c.type==='tick'||c.type==='step'){
   const ticks=c.type==='tick'?c.ticks:c.days*120;if(!Number.isInteger(ticks)||ticks<1||ticks>(c.type==='tick'?120:840)||(c.type==='step'&&!Number.isInteger(c.days))||(c.pauseOnBattle!==undefined&&typeof c.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
   let n={...chronicleView(r),chronicle:structuredClone(r.chronicle)},halted:GameEvent|undefined;const g=graphFor(maritimeView(tacticsView(campaignView(r)))),context={...r.terrainContext,upper,finance,people,culture,destiny};
   for(let i=0;i<ticks;i++){
    const before=n.world,first=before.nextEventId;advanceLife22(life,people,n.clock.tick+1);n=chronicleWrap(advanceMuster21Tick(campaignView(n),g,context),n.chronicle);captureTransitions(n.chronicle,before,n.world,n.clock.tick);n=political(n,naming,people,culture,sovereignty,upper,n.world.day!==before.day);reconcileCultures({...n,naming,sovereignty},culture);reconcilePeople(n,people,sovereignty);reconcileLife22(life,people);reconcileUpper(n,upper);reconcileFiscal({...n,upperCombat:upper,people,culture},finance);
    reconcileDestiny(pack(n),destiny);
    if(c.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&(isClash(n.world,e)||e.text==='舰队在海上接敌'));if(halted)break;}
   }
   return {...this.install(wrap(n)),...(halted?{halted}:{})};
  }
  if(c.type==='politics')return this.install(wrap(political(structuredClone(chronicleView(r)),naming,people,culture,sovereignty,upper,false,c.action)));
  let next:ChronicleRun;
  if(c.type==='naval'){
   const fleetId='fleetId'in c.action?c.action.fleetId:null;if(fleetId&&r.transports.cargo.some(v=>v.fleetId===fleetId))throw Error('载军舰队请使用运输航线，不能被普通巡航覆盖。');
   const base=maritimeView(tacticsView(campaignView(r))),moved=applyRealtimeNaval(r.world,r.navy,graphFor(base),c.action,{day:r.world.day,nextEventId:r.world.nextEventId}),maritime=structuredClone(r.maritime);
   if('fleetId'in c.action)delete maritime.retreating[c.action.fleetId];const sea=reconcileMaritime({...base,...moved,maritime});
   next={...chronicleView(r),...moved,...reconcileCombat(moved.world,r.battles,r.clock.tick),maritime:sea.maritime,chronicle:structuredClone(r.chronicle)};
  }else{
   next=c.type==='muster'?chronicleWrap(campaignWrap(applyMuster21(tacticsView(campaignView(r)),c.action,r),r.reorganization),structuredClone(r.chronicle)):applyRestorationCommand(restoration19View(r),c);
  }
  captureTransitions(next.chronicle,r.world,next.world,next.clock.tick);return this.install(wrap(political(next,naming,people,culture,sovereignty,upper,false)));
 }
 private install(run:GameRun){assertGameRun(run);this.current=run;return {run,world:run.world};}
}
