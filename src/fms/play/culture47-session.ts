import {assertFmsDocument,type FmsDocument} from '../model';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {validateCultureSetup47,editCivilization47,type WorldCultureSetup47,type CivilizationEdit47} from './civilization47-names';
import {advanceCivilizationMilitary47} from './civilization47-military';
import {settleArmyAutonomyDay47} from './civilization47-army-ai';
import {assertPopulation47} from './civilization47-population-validation';
import {previewFamilySuccession47,appointFamilyRuler47} from './civilization47-succession';
import {refreshLeaderCombat47} from './civilization47-combat-state';
import {grantHouse47,type HouseIntent47} from './civilization47-houses';
import {setHousePolicy47} from './civilization47-house-governance';
import type {PopulationStamp47} from './civilization47-population-types';
import {advanceSessionBatch47} from './session-advance47';
import {prepareOwnedGeography47,withOwnedNumericGeography47} from './geography-content47';
import {sameCulture47Value} from './culture47-equal';
import {withOwnedTravel47} from './owned-travel47';
import {Culture47DisplayEncoder} from './culture47-display';
import {actualForces47} from './force-runtime47';
import {armyTravelLocation47} from './army-travel47-state';
import {ForceDisplayTraceCollector47,type ForceMotionObserver47} from './force-display-trace47';
import type {DisplayFrame} from './motion';
import {activeSiegesFromSpace47} from './siege-display47';
import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {previewMilitary47,applyMilitary47,assertMilitaryIntent47,assertMilitaryExpected47,type MilitaryIntent47,type MilitaryExpected47} from './culture47-orders';
import {attachPolitics47,initializeOpeningWars47,advancePolitics47,finishPoliticalTick47,recordPoliticalOccupation47,assertPoliticalCommand47,applyPoliticalCommand47,previewPoliticalCommand47,type PoliticalCommand47,type PoliticalStamp47} from './civilization47-political-owner';

// This local owner stores creation inputs and accepted commands, never accepts
// an unvalidated live47 snapshot. It is intentionally separate from Store48.
export const CULTURE47_RULE='real-culture-zh-politics-journal-2';
export type Culture47Opening={terrain:FmsDocument;count:number;cityCount:number;relations:'peace'|'war';setup:WorldCultureSetup47};
export type Culture47Action={kind:'family-policy';nationId:string;enabled:boolean;expected:PopulationStamp47}|{kind:'family';intent:HouseIntent47;expected:PopulationStamp47}|{kind:'advance';ticks:number}|{kind:'identity';edit:CivilizationEdit47}|{kind:'succession';nationId:string}|{kind:'politics';action:PoliticalCommand47;expected:PoliticalStamp47}|{kind:'military';intent:MilitaryIntent47;expected:MilitaryExpected47};
export const CULTURE47_CONTINUATION_SOURCE='dfd9fa64839f4bed6465b13c0a320ac629b3f57d51f3e468cf184f52f764c4e8';
export type Culture47Fork={engine:typeof CULTURE47_CONTINUATION_SOURCE;id:string;sequence:number};
export type Culture47Journal={format:'lieguoji-culture-play';version:1|2;rule:typeof CULTURE47_RULE;engine:string;id:string;opening:Culture47Opening;actions:Culture47Action[];fork?:Culture47Fork|null};
// A game has no fixed finish date. Bound each request, never the number of
// accepted requests over its lifetime. V1 retains its historical contract.
export const culture47Budget=(version:number)=>version===2?{actions:Infinity,ticks:Number.MAX_SAFE_INTEGER,days:null}:{actions:20000,ticks:120000,days:1000};
export type Culture47Progress={stage:'opening'|'replay';completed:number;total:number;ticks:number};
const exact=(x:unknown,keys:string[]):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const integer=(x:unknown,min:number,max:number):x is number=>Number.isSafeInteger(x)&&Number(x)>=min&&Number(x)<=max;
export function assertCulture47Journal(value:unknown):asserts value is Culture47Journal {
  const version=(value as Partial<Culture47Journal>|null)?.version;
  if(!exact(value,['format','version','rule','engine','id','opening','actions',...(version===2?['fork']:[])])||value.format!=='lieguoji-culture-play'||(version!==1&&version!==2)||value.rule!==CULTURE47_RULE||value.engine!==__CULTURE47_ENGINE__||typeof value.id!=='string'||!/^fms-[0-9a-f-]{36}$/i.test(value.id))throw Error('文化存档包含未知版本或字段，保留原档。');
  const o=value.opening;
  if(!exact(o,['terrain','count','cityCount','relations','setup'])||!integer(o.count,2,24)||!integer(o.cityCount,o.count,480)||!['peace','war'].includes(String(o.relations)))throw Error('文化世界创建记录无效。');
  assertFmsDocument(o.terrain);validateCultureSetup47(o.setup as WorldCultureSetup47,o.count);
  const budget=culture47Budget(version);
  if(!Array.isArray(value.actions)||value.actions.length>budget.actions)throw Error('文化指令记录过长或无效，原档保留。');
  const fork=version===2?value.fork:null;
  if(fork!==null&&(!exact(fork,['engine','id','sequence'])||fork.engine!==CULTURE47_CONTINUATION_SOURCE||typeof fork.id!=='string'||!/^fms-[0-9a-f-]{36}$/i.test(fork.id)||fork.id===value.id||!integer(fork.sequence,0,Math.min(value.actions.length,20000))))throw Error('续玩来源或分叉边界无效，原档保留。');
  let ticks=0;
  for(const [i,a] of value.actions.entries()){assertCulture47Action(a);if(a.kind==='advance')ticks+=a.ticks;if(fork&&i<Number(fork.sequence)&&ticks>120000)throw Error('来源超过原引擎预算，原档保留。');}
  if(!Number.isSafeInteger(ticks)||ticks>budget.ticks)throw Error(budget.days===null?'世界时钟已超出精确数值范围，存档保留。':`本地文化试玩的重放上限为 ${budget.days} 日，存档保留。`);
}
/** Only this direct predecessor has identical simulation rules. Keep every
 * source command and its old ID; change identity after the executed prefix.
 * The caller must independently load the frozen source and compare both runs
 * before persisting the candidate. No external live snapshot is imported. */
export function continuationJournal47(source:Culture47Journal):Culture47Journal {
  if(source.engine!==CULTURE47_CONTINUATION_SOURCE||source.version!==1||Object.keys(source).length!==7)throw Error('此版本尚未通过续玩对照，原档保持。');
  assertCulture47Journal({...source,engine:__CULTURE47_ENGINE__});
  return {...structuredClone(source),version:2,engine:__CULTURE47_ENGINE__,id:'fms-'+crypto.randomUUID(),fork:{engine:CULTURE47_CONTINUATION_SOURCE,id:source.id,sequence:source.actions.length}};
}
export function assertCulture47Action(a:unknown):asserts a is Culture47Action {
  if(!a||typeof a!=='object')throw Error('文化命令无效。');
  const v=a as Culture47Action;
  if(v.kind==='family-policy'&&exact(v,['kind','nationId','enabled','expected'])&&typeof v.nationId==='string'&&typeof v.enabled==='boolean'&&exact(v.expected,['id','day','tick','nextEventId','civilization','kin','people','sovereignty','nextEntryId']))return;
  if(v.kind==='military'&&exact(v,['kind','intent','expected'])){assertMilitaryIntent47(v.intent);assertMilitaryExpected47(v.expected,v.intent.force);return;}
  if(v.kind==='politics'&&exact(v,['kind','action','expected'])&&exact(v.expected,['runId','day','tick','nextEventId','diplomacy','wars','civilization'])){assertPoliticalCommand47(v.action);return;}
  if(v.kind==='family'&&exact(v,['kind','intent','expected'])&&exact(v.intent,['nationId','personId','provinceId'])&&typeof v.intent.nationId==='string'&&integer(v.intent.personId,1,2147483647)&&typeof v.intent.provinceId==='string'&&exact(v.expected,['id','day','tick','nextEventId','civilization','kin','people','sovereignty','nextEntryId']))return;
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
function apply(r:PoliticalRun47,a:Culture47Action,observe?:ForceMotionObserver47):PoliticalRun47 {
  assertCulture47Action(a);
  if(a.kind==='advance'){
    let next=r,remaining=a.ticks;
    while(remaining){const take=Math.min(remaining,120-next.clock.tick%120),out=advanceCivilizationMilitary47(next,take,weights,recordPoliticalOccupation47,finishPoliticalTick47,observe);next=out.dailyPending?settleArmyAutonomyDay47(out.run,weights):out.run;advancePolitics47(next,out.dailyPending);remaining-=take;}
    // advancePolitics47 just validated population and both autonomy ledgers.
    return next;
  }
  if(a.kind==='politics')return applyPoliticalCommand47(r,a.action,a.expected);
  if(a.kind==='family')return grantHouse47(r,a.intent,a.expected);
  if(a.kind==='family-policy')return setHousePolicy47(r,a.nationId,a.enabled,a.expected);
  if(a.kind==='military')return applyMilitary47(r,a.intent,a.expected);
  if(a.kind==='identity'){
    const next=editCivilization47(r,a.edit,r.civilization.revision);
    if(a.edit.kind==='nation')next.upperCombat.nations[a.edit.id].polity=next.civilization.nations[a.edit.id].polity;
    assertPopulation47(next);return next;
  }
  const p=previewFamilySuccession47(r,a.nationId),next=appointFamilyRuler47(r,a.nationId,p.expected);
  refreshLeaderCombat47(next,next.combatPersonnel);return next;
}
export function culture47Frame(r:FoundingForces47):DisplayFrame&{activeSieges?:string[]} {
  const {spatial}=actualForces47(r);
  const points=(book:FoundingForces47['armyPositions'])=>new Map(Object.entries(book.records).map(([id,s])=>[id,armyTravelLocation47(s,spatial.graph).point]));
  return {armies:points(r.armyPositions),fleets:points(r.fleetPositions),alpha:1,activeSieges:activeSiegesFromSpace47(r,spatial.space)};
}
export class Culture47Session {
  private state?:{run:PoliticalRun47;journal:Culture47Journal;ticks:number};
  private display=new Culture47DisplayEncoder();
  create(opening:Culture47Opening){
    const journal:Culture47Journal={format:'lieguoji-culture-play',version:2,fork:null,rule:CULTURE47_RULE,engine:__CULTURE47_ENGINE__,id:'fms-'+crypto.randomUUID(),opening:structuredClone(opening),actions:[]};
    const state=this.build(journal);this.state=state;this.display=new Culture47DisplayEncoder();return this.snapshot();
  }
  private build(journal:Culture47Journal,progress?:(p:Culture47Progress)=>void){
    assertCulture47Journal(journal);const o=journal.opening;
    progress?.({stage:'opening',completed:0,total:journal.actions.length,ticks:0});
    let run=attachPolitics47(createFoundingForces47(o.terrain,o.count,o.cityCount,'peace',o.setup));
    const fork=journal.fork;
    run.id=fork?.id??journal.id;run.world.custom!.id=run.id;
    if(o.relations==='war')initializeOpeningWars47(run);
    prepareOwnedGeography47(run);
    let completed=0,ticks=0;
    for(const action of journal.actions){if(fork&&completed===fork.sequence){run.id=journal.id;run.world.custom!.id=journal.id;}run=withOwnedNumericGeography47(run,candidate=>withOwnedTravel47(()=>apply(candidate,action)));prepareOwnedGeography47(run);completed++;if(action.kind==='advance')ticks+=action.ticks;progress?.({stage:'replay',completed,total:journal.actions.length,ticks});}
    if(fork&&completed===fork.sequence){run.id=journal.id;run.world.custom!.id=journal.id;}
    return {run,journal:structuredClone(journal),ticks};
  }
  load(journal:Culture47Journal,progress?:(p:Culture47Progress)=>void){const candidate=this.build(journal,progress);this.state=candidate;this.display=new Culture47DisplayEncoder();return this.snapshot();}
  verify(journal:Culture47Journal,progress?:(p:Culture47Progress)=>void):'witness'|'replay'{
    assertCulture47Journal(journal);
    const known=this.state?.journal;
    if(known&&journal.actions.length<=known.actions.length){
      const {actions:a,...header}=journal,{actions:b,...privateHeader}=known;
      if(sameCulture47Value(header,privateHeader)&&a.every((action,i)=>sameCulture47Value(action,b[i])))return 'witness';
    }
    // A different world or history must replay in a candidate; never replace
    // the currently running state just to verify a backup.
    this.build(journal,progress);return 'replay';
  }
  preview(action:PoliticalCommand47){if(!this.state)throw Error('请先创建世界。');return {...previewPoliticalCommand47(this.state.run,action),sequence:this.state.journal.actions.length};}
  previewOrder(intent:MilitaryIntent47){if(!this.state)throw Error('请先创建世界。');return {intent,preview:previewMilitary47(this.state.run,intent),sequence:this.state.journal.actions.length};}
  execute(action:Culture47Action,sequence:number){
    this.append([action],sequence);return this.snapshot();
  }
  executeDisplay(actions:Culture47Action[],sequence:number){
    if(!Array.isArray(actions)||actions.length<1||actions.length>4||actions.length>1&&actions.some(a=>a.kind!=='advance'))throw Error('推进批次无效，原进度保持。');
    const previous=this.state,trace=previous&&actions.every(a=>a.kind==='advance')?new ForceDisplayTraceCollector47(previous.run.id,sequence,previous.run.clock.tick):undefined;
    try {this.append(actions,sequence,trace?.observe);const packet=this.displaySnapshot(),motion=trace?.finish(this.state!.journal.actions.length,this.state!.run.clock.tick);return motion?{...packet,motion}:packet;}
    catch(error){this.state=previous;throw error;}
  }
  displaySnapshot(){if(!this.state)throw Error('请先创建世界。');const {run,journal}=this.state;return this.display.encode({run,journal,frame:culture47Frame(run)});}
  private append(actions:Culture47Action[],sequence:number,observe?:ForceMotionObserver47){
    const s=this.state;if(!s||sequence!==s.journal.actions.length)throw Error('世界已经推进，请重新操作。');
    const accepted=structuredClone(actions);let ticks=s.ticks;
    for(const action of accepted){assertCulture47Action(action);if(action.kind==='advance')ticks+=action.ticks;}
    const budget=culture47Budget(s.journal.version);
    if(s.journal.actions.length+accepted.length>budget.actions)throw Error('文化指令记录过长或无效，原档保留。');
    if(!Number.isSafeInteger(ticks)||ticks>budget.ticks)throw Error(budget.days===null?'世界时钟已超出精确数值范围，存档保留。':`本地文化试玩的重放上限为 ${budget.days} 日，存档保留。`);
    // Header and previous actions are privately owned and validated at ingress.
    // Only commit after every action and numeric-geography window succeeds.
    let run=s.run;
    if(accepted.every(a=>a.kind==='advance'))run=advanceSessionBatch47(run,accepted,weights,observe);
    else for(const action of accepted){run=withOwnedNumericGeography47(run,candidate=>withOwnedTravel47(()=>apply(candidate,action,observe)));prepareOwnedGeography47(run);}
    this.state={run,journal:{...s.journal,actions:[...s.journal.actions,...accepted]},ticks};
  }
  snapshot(){if(!this.state)throw Error('请先创建或继续文化世界。');const {run,journal}=this.state;return structuredClone({run,journal,frame:culture47Frame(run)});}
}
