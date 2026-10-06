import {Culture17Session,type GameCommand as OldCommand} from './culture17-session';
import {court16View as oldCourtView,type Culture17Run} from './culture17-model';
import {court16Wrap,fiscal15View} from './court16-model';
import {fiscal15Wrap,upper14View} from './fiscal15-model';
import {upper14Wrap} from './upper14-model';
import {terrain13Wrap} from './terrain13-model';
import {chronicle2Wrap} from './chronicle2-model';
import {chronicleWrap,type ChronicleRun} from './chronicle-model';
import {CampaignSession} from './campaign-session';
import {tacticsView} from './campaign-model';
import {maritimeView} from './tactics-model';
import {graphFor} from './naval-rules';
import {applyRealtimeNaval} from './navy';
import {reconcileMaritime} from './maritime';
import {reconcileCombat} from './chronicle-battle';
import {captureTransitions} from './chronicle-records';
import {applyCombatEdit} from './upper14-edit';
import {reconcileUpper} from './upper14-state';
import {reconcilePeople,applyAppointment} from './court16-people';
import {isClash} from './observation';
import {initialCultures,reconcileCultures,applyCultureEdit} from './naming18-culture';
import {reconcileFiscal} from './naming18-state';
import {advanceNaming18Tick} from './naming18-runtime';
import {advancePolitics,applyPolitics,type PoliticsAction} from './naming18-politics';
import {legacyNaming,reconcileNameEdits,type NamingState} from './naming18-names';
import {createNaming18} from './naming18-create';
import {assertGameRun,naming18Wrap,chronicleView,campaignView,court16View,type GameRun} from './naming18-model';
import type {GameEvent,World} from '../../sim/types';
export type GameCommand=Exclude<OldCommand,{type:'load'|'copy'|'create'}>|{type:'load';run:GameRun}|{type:'copy';run:GameRun}|(Extract<OldCommand,{type:'create'}>&{cultures?:string[]});
function political(run:ChronicleRun,naming:NamingState,dayChanged:boolean,action?:PoliticsAction):ChronicleRun{
 const n={...run,naming};if(action)applyPolitics(n,action);advancePolitics(n,dayChanged);const {naming:_,...base}=n;void _;return base;
}
export class Naming18Session{
 private old=new Culture17Session();private current?:GameRun;
 execute(c:GameCommand):{run:GameRun;world:World;halted?:GameEvent}{
  if(c.type==='load'){assertGameRun(c.run);if(c.run.version!==18)this.old.execute({type:'load',run:c.run});return this.install(structuredClone(c.run));}
  if(c.type==='create')return this.install(createNaming18(c.terrain,c.count,c.relations,c.cultures));
  if(c.type==='copy'){
   assertGameRun(c.run);if(c.run.version===18)throw Error('已经是当前新版，无需复制。');
   const old=c.run.version===17?structuredClone(c.run):new Culture17Session().execute({type:'copy',run:c.run}).run as Culture17Run;
   const base=oldCourtView(old),naming=legacyNaming(old);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;
   return this.install(naming18Wrap(base,initialCultures({...base,naming},old.culture),naming));
  }
  const r=this.current;if(!r)throw Error('请先创建或读取世界。');if(r.version!==18){const out=this.old.execute(c);return {...this.install(out.run),...(out.halted?{halted:out.halted}:{})};}
  if(c.type!=='step'&&(!('expected'in c)||!c.expected||![c.expected.day,c.expected.nextEventId,c.expected.tick].every(Number.isSafeInteger)||c.expected.day!==r.world.day||c.expected.nextEventId!==r.world.nextEventId||c.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化或缺少有效预览，请重新预览。');
  if(c.type==='culture-edit'){const n=structuredClone(r);applyCultureEdit(n,c.edit);return this.install(n);}
  if(c.type==='appointment'){const n=structuredClone(r);applyAppointment(n,c.action);return this.install(n);}
  if(c.type==='combat-edit'){const base=applyCombatEdit(upper14View(fiscal15View(court16View(r))),c.edit,c.expected,c.runId);return this.install(naming18Wrap(court16Wrap(fiscal15Wrap(base,structuredClone(r.finance)),structuredClone(r.people)),structuredClone(r.culture),structuredClone(r.naming)));}
  const naming=structuredClone(r.naming),people=structuredClone(r.people),culture=structuredClone(r.culture),upper=structuredClone(r.upperCombat),finance=structuredClone(r.finance);
  const wrap=(n:ChronicleRun)=>{reconcileNameEdits(naming,n.world);reconcileCultures({...n,naming},culture);reconcilePeople(n,people);reconcileUpper(n,upper);reconcileFiscal({...n,upperCombat:upper,people,culture},finance);return naming18Wrap(court16Wrap(fiscal15Wrap(upper14Wrap(terrain13Wrap(chronicle2Wrap(n),r.terrainContext),upper),finance),people),culture,naming);};
  if(c.type==='tick'||c.type==='step'){
   const ticks=c.type==='tick'?c.ticks:c.days*120;if(!Number.isInteger(ticks)||ticks<1||ticks>(c.type==='tick'?120:840)||(c.type==='step'&&!Number.isInteger(c.days))||(c.pauseOnBattle!==undefined&&typeof c.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
   let n={...chronicleView(r),chronicle:structuredClone(r.chronicle)},halted:GameEvent|undefined;const g=graphFor(maritimeView(tacticsView(campaignView(r)))),context={...r.terrainContext,upper,finance,people,culture};
   for(let i=0;i<ticks;i++){
    const before=n.world,first=before.nextEventId;n=chronicleWrap(advanceNaming18Tick(campaignView(n),g,context),n.chronicle);captureTransitions(n.chronicle,before,n.world,n.clock.tick);n=political(n,naming,n.world.day!==before.day);reconcileCultures({...n,naming},culture);reconcilePeople(n,people);reconcileUpper(n,upper);reconcileFiscal({...n,upperCombat:upper,people,culture},finance);
    if(c.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&(isClash(n.world,e)||e.text==='舰队在海上接敌'));if(halted)break;}
   }
   return {...this.install(wrap(n)),...(halted?{halted}:{})};
  }
  if(c.type==='politics')return this.install(wrap(political(structuredClone(chronicleView(r)),naming,false,c.action)));
  let next:ChronicleRun;
  if(c.type==='naval'){
   const fleetId='fleetId'in c.action?c.action.fleetId:null;if(fleetId&&r.transports.cargo.some(v=>v.fleetId===fleetId))throw Error('载军舰队请使用运输航线，不能被普通巡航覆盖。');
   const base=maritimeView(tacticsView(campaignView(r))),moved=applyRealtimeNaval(r.world,r.navy,graphFor(base),c.action,{day:r.world.day,nextEventId:r.world.nextEventId}),maritime=structuredClone(r.maritime);
   if('fleetId'in c.action)delete maritime.retreating[c.action.fleetId];const sea=reconcileMaritime({...base,...moved,maritime});
   next={...chronicleView(r),...moved,...reconcileCombat(moved.world,r.battles,r.clock.tick),maritime:sea.maritime,chronicle:structuredClone(r.chronicle)};
  }else{
   const temporary=new CampaignSession();temporary.execute({type:'load',run:campaignView(r)});const out=temporary.execute(c);if(out.run.version!==10)throw Error('内部规则版本无效。');next=chronicleWrap(out.run,structuredClone(r.chronicle));
  }
  captureTransitions(next.chronicle,r.world,next.world,next.clock.tick);return this.install(wrap(political(next,naming,false)));
 }
 private install(run:GameRun){assertGameRun(run);this.current=run;return {run,world:run.world};}
}
