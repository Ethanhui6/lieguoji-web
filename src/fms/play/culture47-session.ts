import {assertFmsDocument,type FmsDocument} from '../model';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {validateCultureSetup47,editCivilization47,type WorldCultureSetup47,type CivilizationEdit47} from './civilization47-names';
import {advanceCivilizationMilitary47} from './civilization47-military';
import {settleArmyAutonomyDay47} from './civilization47-army-ai';
import {assertPopulation47} from './civilization47-population-validation';
import {previewFamilySuccession47,appointFamilyRuler47} from './civilization47-succession';
import {refreshLeaderCombat47} from './civilization47-combat-state';
import {assertArmyAutonomy47} from './civilization47-army-ai-state';
import {assertNavalAutonomy47} from './civilization47-naval-ai-state';
import {actualForces47} from './force-runtime47';
import {armyTravelLocation47} from './army-travel47-state';
import type {DisplayFrame} from './motion';

// This local owner stores creation inputs and accepted commands, never accepts
// an unvalidated live47 snapshot. It is intentionally separate from Store48.
export const CULTURE47_RULE='real-culture-play-journal-1';
export type Culture47Opening={terrain:FmsDocument;count:number;cityCount:number;relations:'peace'|'war';setup:WorldCultureSetup47};
export type Culture47Action={kind:'advance';ticks:number}|{kind:'identity';edit:CivilizationEdit47}|{kind:'succession';nationId:string};
export type Culture47Journal={format:'lieguoji-culture-play';version:1;rule:typeof CULTURE47_RULE;engine:string;id:string;opening:Culture47Opening;actions:Culture47Action[]};
const exact=(x:unknown,keys:string[]):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const integer=(x:unknown,min:number,max:number):x is number=>Number.isSafeInteger(x)&&Number(x)>=min&&Number(x)<=max;
export function assertCulture47Journal(value:unknown):asserts value is Culture47Journal {
  if(!exact(value,['format','version','rule','engine','id','opening','actions'])||value.format!=='lieguoji-culture-play'||value.version!==1||value.rule!==CULTURE47_RULE||value.engine!==__CULTURE47_ENGINE__||typeof value.id!=='string'||!/^fms-[0-9a-f-]{36}$/i.test(value.id))throw Error('文化存档包含未知版本或字段，保留原档。');
  const o=value.opening;
  if(!exact(o,['terrain','count','cityCount','relations','setup'])||!integer(o.count,2,24)||!integer(o.cityCount,o.count,480)||!['peace','war'].includes(String(o.relations)))throw Error('文化世界创建记录无效。');
  assertFmsDocument(o.terrain);validateCultureSetup47(o.setup as WorldCultureSetup47,o.count);
  if(!Array.isArray(value.actions)||value.actions.length>20000)throw Error('文化指令记录过长或无效，原档保留。');
  let ticks=0;
  for(const a of value.actions){assertCulture47Action(a);if(a.kind==='advance')ticks+=a.ticks;}
  if(ticks>120000)throw Error('本地文化试玩的重放上限为 1000 日，存档保留。');
}
export function assertCulture47Action(a:unknown):asserts a is Culture47Action {
  if(!a||typeof a!=='object')throw Error('文化命令无效。');
  const v=a as Culture47Action;
  if(v.kind==='advance'&&exact(v,['kind','ticks'])&&integer(v.ticks,1,120))return;
  if(v.kind==='succession'&&exact(v,['kind','nationId'])&&typeof v.nationId==='string'&&/^n-\d+$/.test(v.nationId))return;
  if(v.kind==='identity'&&exact(v,['kind','edit'])&&v.edit&&typeof v.edit==='object'){
    const e=v.edit;
    if(e.kind==='city'&&exact(e,['kind','id','customName'])&&typeof e.id==='string'&&(e.customName===null||typeof e.customName==='string'))return;
    if(e.kind==='nation'&&exact(e,['kind','id','patch'])&&typeof e.id==='string'&&e.patch&&typeof e.patch==='object'&&!Array.isArray(e.patch)&&Object.keys(e.patch).length&&Object.keys(e.patch).every(k=>['polity','religionId','customName'].includes(k)))return;
  }
  throw Error('未知文化命令或未来字段，原世界未改动。');
}
const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
function apply(r:FoundingForces47,a:Culture47Action):FoundingForces47 {
  assertCulture47Action(a);
  if(a.kind==='advance'){
    let next=r,remaining=a.ticks;
    while(remaining){const take=Math.min(remaining,120-next.clock.tick%120),out=advanceCivilizationMilitary47(next,take,weights);next=out.dailyPending?settleArmyAutonomyDay47(out.run,weights):out.run;remaining-=take;}
    assertPopulation47(next);assertArmyAutonomy47(next);assertNavalAutonomy47(next);return next;
  }
  if(a.kind==='identity'){
    const next=editCivilization47(r,a.edit,r.civilization.revision);
    if(a.edit.kind==='nation')next.upperCombat.nations[a.edit.id].polity=next.civilization.nations[a.edit.id].polity;
    assertPopulation47(next);return next;
  }
  const p=previewFamilySuccession47(r,a.nationId),next=appointFamilyRuler47(r,a.nationId,p.expected);
  refreshLeaderCombat47(next,next.combatPersonnel);return next;
}
export function culture47Frame(r:FoundingForces47):DisplayFrame {
  const {spatial}=actualForces47(r);
  const points=(book:FoundingForces47['armyPositions'])=>new Map(Object.entries(book.records).map(([id,s])=>[id,armyTravelLocation47(s,spatial.graph).point]));
  return {armies:points(r.armyPositions),fleets:points(r.fleetPositions),alpha:1};
}
export class Culture47Session {
  private state?:{run:FoundingForces47;journal:Culture47Journal};
  create(opening:Culture47Opening){
    const journal:Culture47Journal={format:'lieguoji-culture-play',version:1,rule:CULTURE47_RULE,engine:__CULTURE47_ENGINE__,id:'fms-'+crypto.randomUUID(),opening:structuredClone(opening),actions:[]};
    const state=this.build(journal);this.state=state;return this.snapshot();
  }
  private build(journal:Culture47Journal){
    assertCulture47Journal(journal);const o=journal.opening;
    let run:FoundingForces47=createFoundingForces47(o.terrain,o.count,o.cityCount,o.relations,o.setup);
    run.id=journal.id;run.world.custom!.id=journal.id;
    for(const action of journal.actions)run=apply(run,action);
    return {run,journal:structuredClone(journal)};
  }
  load(journal:Culture47Journal){const candidate=this.build(journal);this.state=candidate;return this.snapshot();}
  execute(action:Culture47Action,sequence:number){
    const s=this.state;if(!s||sequence!==s.journal.actions.length)throw Error('世界已经推进，请重新操作。');
    const journal={...s.journal,actions:[...s.journal.actions,structuredClone(action)]};assertCulture47Journal(journal);
    const run=apply(s.run,action);this.state={run,journal};return this.snapshot();
  }
  snapshot(){if(!this.state)throw Error('请先创建或继续文化世界。');return structuredClone({...this.state,frame:culture47Frame(this.state.run)});}
}
