import {CampaignSession,type GameCommand as OldCommand} from './campaign-session';
import {withCampaign} from './campaign-model';
import {assertChronicle,assertGameRun,campaignView,chronicleWrap,withChronicle,type ChronicleRun,type GameRun} from './chronicle-model';
import {createDistrictRun} from './district-world';
import {withOccupation} from './runtime';
import {withTransport} from './transport-runtime';
import {withMaritime,reconcileMaritime} from './maritime';
import {initialNavy,applyRealtimeNaval} from './navy';
import {reconcileCombat} from './chronicle-battle';
import {seaGraph} from './sea-path';
import {initialTactics,tacticsWrap,maritimeView} from './tactics-model';
import {regularMuster} from './tactics-muster';
import {advanceChronicleTick} from './chronicle-runtime';
import {tacticsView} from './campaign-model';
import {graphFor} from './naval-rules';
import {isClash} from './observation';
import {captureTransitions} from './chronicle-records';
import {advancePolitics,applyPolitics,type PoliticsAction} from './chronicle-politics';
import type {PlayVersion} from './session';
import type {GameEvent,World} from '../../sim/types';
export type GameCommand=Exclude<OldCommand,{type:'load'|'copy'}>|{type:'load';run:GameRun}|{type:'copy';run:GameRun}|{type:'politics';action:PoliticsAction;expected:PlayVersion};
export class ChronicleSession{
  private old=new CampaignSession();private current?:GameRun;
  execute(c:GameCommand):{run:GameRun;world:World;halted?:GameEvent}{
    if(c.type==='load'){assertGameRun(c.run);if(c.run.version!==11)this.old.execute({type:'load',run:c.run});return this.install(structuredClone(c.run));}
    if(c.type==='create'){
      const base=createDistrictRun(c.terrain,c.count,c.relations);base.world.armies=[];
      let sea=withMaritime(withTransport(withOccupation(base,true)));const graph=seaGraph(sea.terrain,sea.world);
      sea=reconcileMaritime({...sea,...initialNavy(sea.world,graph)});
      return this.install(withChronicle(withCampaign(regularMuster(tacticsWrap(sea,initialTactics(sea)),true))));
    }
    if(c.type==='copy'){
      assertGameRun(c.run);if(c.run.version===11)throw Error('已经是细地图史书版，无需复制。');
      const base=c.run.version===10?structuredClone(c.run):new CampaignSession().execute({type:'copy',run:c.run}).run;
      if(base.version!==10)throw Error('复制基础版本失败。');
      base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;
      for(const p of base.world.provinces)if(!base.world.cities.some(c=>c.provinceId===p.id)){let id=`city-${p.id}`,suffix=1;while(base.world.cities.some(c=>c.id===id))id=`city-${p.id}-${suffix++}`;base.world.cities.push({id,name:p.name,provinceId:p.id,position:{...p.center},label:{...p.center},fort:0});}
      return this.install(withChronicle(base));
    }
    const r=this.current;if(!r)throw Error('请先创建或读取世界。');
    if(r.version!==11){if(c.type==='politics')throw Error('请创建史书新版副本再使用政治干预。');const out=this.old.execute(c);return {...this.install(out.run),...(out.halted?{halted:out.halted}:{})};}
    if(c.type!=='step'&&(!('expected'in c)||!c.expected||![c.expected.day,c.expected.nextEventId,c.expected.tick].every(Number.isSafeInteger)||c.expected.day!==r.world.day||c.expected.nextEventId!==r.world.nextEventId||c.expected.tick!==r.clock.tick))throw Error('模拟时刻已变化或缺少有效预览，请重新预览。');
    if(c.type==='tick'||c.type==='step'){
      const ticks=c.type==='tick'?c.ticks:c.days*120;if(!Number.isInteger(ticks)||ticks<1||ticks>(c.type==='tick'?120:840)||(c.type==='step'&&!Number.isInteger(c.days))||(c.pauseOnBattle!==undefined&&typeof c.pauseOnBattle!=='boolean'))throw Error('推进参数无效。');
      let n:ChronicleRun={...r,chronicle:structuredClone(r.chronicle)},halted:GameEvent|undefined;const g=graphFor(maritimeView(tacticsView(campaignView(r))));
      for(let i=0;i<ticks;i++){
        const before=n.world,first=before.nextEventId;n=chronicleWrap(advanceChronicleTick(campaignView(n),g),n.chronicle);
        captureTransitions(n.chronicle,before,n.world,n.clock.tick);advancePolitics(n,n.world.day!==before.day);
        if(c.pauseOnBattle){halted=n.world.events.find(e=>e.id>=first&&(isClash(n.world,e)||e.text==='舰队在海上接敌'));if(halted)break;}
      }
      assertChronicle(n);this.current=n;return {run:n,world:n.world,...(halted?{halted}:{})};
    }
    if(c.type==='politics'){const n=structuredClone(r);applyPolitics(n,c.action);advancePolitics(n,false);return this.install(n);}
    if(c.type==='naval'){
      // The frozen facade reloads the complete terrain through four legacy
      // sessions for this command. Use its same guarded rules once in v11.
      const fleetId='fleetId'in c.action?c.action.fleetId:null;
      if(fleetId&&r.transports.cargo.some(v=>v.fleetId===fleetId))throw Error('载军舰队请使用运输航线，不能被普通巡航覆盖。');
      const base=maritimeView(tacticsView(campaignView(r))),moved=applyRealtimeNaval(r.world,r.navy,graphFor(base),c.action,{day:r.world.day,nextEventId:r.world.nextEventId}),maritime=structuredClone(r.maritime);
      if('fleetId'in c.action)delete maritime.retreating[c.action.fleetId];
      const sea=reconcileMaritime({...base,...moved,maritime});
      const n:ChronicleRun={...r,...moved,...reconcileCombat(moved.world,r.battles,r.clock.tick),maritime:sea.maritime,chronicle:structuredClone(r.chronicle)};
      captureTransitions(n.chronicle,r.world,n.world,n.clock.tick);advancePolitics(n,false);return this.install(n);
    }
    this.old.execute({type:'load',run:campaignView(r)});const out=this.old.execute(c);if(out.run.version!==10)throw Error('内部规则版本无效。');
    const n=chronicleWrap(out.run,structuredClone(r.chronicle));captureTransitions(n.chronicle,r.world,n.world,n.clock.tick);advancePolitics(n,false);return this.install(n);
  }
  private install(r:GameRun){assertGameRun(r);this.current=r;return {run:r,world:r.world};}
}
