import {createFmsOriginalDocument,originalGridFor} from '../fms/original/original-document';
import {generateFmsFullMap,prepareFmsFullMapPreview} from '../fms/full-map-terrain';
import {Culture47Session,type Culture47Opening,type Culture47Journal} from '../fms/play/culture47-session';
import {SETTLEMENT47_ALGORITHM} from '../fms/play/settlement47-regions';
import {populationStamp47} from '../fms/play/civilization47-population-types';
import {ARMY_RETIREMENT_RULE47} from '../fms/play/army-retirement47';
import {ARMY_RECOVERY_RULE47} from '../fms/play/army-recovery47';
import {FRAME_LOOP_RULE47} from '../fms/play/frame-loop47';
import {ARMY_BATCH_RULE47} from '../fms/play/army-batch47';
import {FOUNDING_RULE47} from '../fms/play/civilization47-founding-time';
import {OFFICE_RULE47} from '../fms/play/civilization47-offices';
import {ORIGINAL_ARMY_RULE47} from '../fms/play/civilization47-original-army';
import {SEED_TERRAIN_TEMPLATES} from '../world/seed-terrain';
import {encodeWire47,decodeWire47} from '../fms/play/wire47';
import {withFastChecks47} from '../fms/play/checks47';
import {TICKS_PER_DAY} from '../fms/play/clock';
import {actualForces47} from '../fms/play/force-runtime47';
import {readArmySpace47} from '../fms/play/army-space47';
import {wanderPoint} from '../fms/play/army-wander47';
import {remainingArmyTravelPoints47} from '../fms/play/army-travel47-state';
import {previewMilitary47} from '../fms/play/culture47-orders';
import {previewPoliticalCommand47} from '../fms/play/civilization47-political-owner';
import {originalCellProvinces} from '../fms/original/original-politics';
import {stateLabelBoxes47} from '../fms/play/original-labels47';
import {CASUS_BELLI_NAMES47,warGoalDesc47} from '../fms/play/casus-labels47';
import type {PoliticalRun47} from '../fms/play/civilization47-diplomatic-world';
import type {FoundingForces47} from '../fms/play/civilization47-forces';
import {buildWorldMap} from './world-map';

/** The web engine inside the native app (ios-native): the app hosts it in an invisible WebKit
 * context (for the JavaScript JIT) and draws everything natively. Every rule is the web's own
 * Culture47Session; this file only creates worlds, forwards commands and reports compact state.
 * All functions return JSON strings (the binary map as base64). */

type Snapshot=ReturnType<Culture47Session['snapshot']>;
type Run=PoliticalRun47&FoundingForces47;
let session:Culture47Session|undefined;
let current:Snapshot|undefined;
let labelInput:{cellsX:number;points:[number,number][];heights:ArrayLike<number>;cells:Int32Array|number[]}|undefined;
let labelOwners='';

const ENABLE=[['enable-retirement',ARMY_RETIREMENT_RULE47],['enable-recovery',ARMY_RECOVERY_RULE47],['enable-frame-loop',FRAME_LOOP_RULE47],
  ['enable-army-batch',ARMY_BATCH_RULE47],['enable-foundings',FOUNDING_RULE47],['enable-offices',OFFICE_RULE47],['enable-original-army',ORIGINAL_ARMY_RULE47]] as const;

function uuid(){
  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function base64(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);}
const run=()=>{if(!current)throw Error('世界尚未载入。');return current.run as unknown as Run;};

async function mapOf(terrain:Culture47Opening['terrain'],r:Run,options:{seed:string;template:string}){
  const built=await buildWorldMap(terrain,r,options),grid=(await originalGridFor(terrain))!;
  labelInput={cellsX:grid.cellsX,points:grid.points as [number,number][],heights:terrain.elevations,cells:originalCellProvinces(terrain,r.world.provinces,r.scale)};
  labelOwners='';
  return {bin:base64(built.bin),meta:built.meta};
}

/** Generates a new world exactly as the web's 生成地图 + 从当前地图创建文化世界 (CultureWorld47.tsx):
 * the original 20k grid, a recovered terrain template, then the culture opening and its rule actions. */
export async function generate(optionsText:string){
  const o=JSON.parse(optionsText||'{}') as {seed?:string;template?:string;count?:number;cityCount?:number;relations?:'peace'|'war'};
  const random=crypto.getRandomValues(new Uint32Array(2));
  const seed=o.seed||String(random[0]),template=SEED_TERRAIN_TEMPLATES.some(t=>t.id===o.template)?o.template!:SEED_TERRAIN_TEMPLATES[random[1]%SEED_TERRAIN_TEMPLATES.length].id;
  const count=Math.max(2,Math.min(24,Math.round(o.count??8))),cityCount=Math.max(count,Math.min(480,Math.round(o.cityCount??count*10)));
  const blank=await createFmsOriginalDocument('20k');
  blank.worldId=uuid();
  const options={seed,template:template as typeof SEED_TERRAIN_TEMPLATES[number]['id']};
  const terrain=(await prepareFmsFullMapPreview(blank,{worldId:blank.worldId,baseRevision:blank.revision,...await generateFmsFullMap(blank,options,{yieldTask:async()=>{}})},options)).document;
  const opening:Culture47Opening={terrain,count,cityCount,relations:o.relations??'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,
    setup:{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman','german']},families:'original'};
  const s=new Culture47Session();
  let x=s.create(opening);
  for(const [kind,rule] of ENABLE)x=s.execute({kind,rule,expected:populationStamp47(x.run)} as never,x.journal.actions.length);
  session=s;current=x;
  return JSON.stringify({...await mapOf(terrain,run(),options),state:state()});
}

/** Advances whole days with the Worker's live fast path (journal replay stays strict). */
export function step(days:number){
  if(!session||!current)throw Error('世界尚未载入。');
  const n=Math.max(1,Math.min(3,Math.floor(days)));
  current=withFastChecks47(()=>session!.execute({kind:'advance',ticks:n*TICKS_PER_DAY} as never,current!.journal.actions.length));
  return JSON.stringify(state());
}

function nationIndex(r:Run){return new Map(r.world.nations.map((n,i)=>[n.id,i]));}

/** Compact state for the native views. Map positions are in map units (normalized / scale). */
export function state(){
  const r=run(),w=r.world,sc=r.scale,ni=nationIndex(r),pi=new Map(w.provinces.map((p,i)=>[p.id,i]));
  const forces=actualForces47(r),space=readArmySpace47(w,{...forces.spatial,positions:r.armyPositions});
  const citySpots=new Map<string,{x:number;y:number}[]>();for(const c of w.cities){const l=citySpots.get(c.provinceId)??[];l.push(c.position);citySpots.set(c.provinceId,l);}
  const owners=w.provinces.map(p=>ni.get(p.controller)??-1),ownerKey=owners.join(',');
  let labels:unknown=undefined;
  if(labelInput&&ownerKey!==labelOwners){
    const ids=w.provinces.map(p=>p.controller),singles=new Map<string,number>();for(const id of ids)singles.set(id,(singles.get(id)??0)+1);
    const li=labelInput;
    labels=stateLabelBoxes47({cellsX:li.cellsX,points:li.points},c=>li.heights[c]>=20&&li.cells[c]>=0?ids[li.cells[c]]:null,(key,cellCount)=>singles.get(key)===1&&cellCount<30)
      .map(b=>({nation:ni.get(b.key)!,x:b.x,y:b.y,width:b.width,height:b.height,fontMax:b.fontMax,fontMin:b.fontMin}));
    labelOwners=ownerKey;
  }
  const stock=new Map(w.statecraft!.provinces.map(p=>[p.provinceId,p]));
  const atWar=(a:string,b:string)=>w.statecraft!.relations.some(p=>p.status==='war'&&[p.a,p.b].includes(a)&&[p.a,p.b].includes(b));
  return {
    day:w.day,date:r.life.currentDate,
    owners,labels,
    nations:w.nations.map(n=>{const own=w.provinces.filter(p=>p.controller===n.id);return {
      provinces:own.length,cities:w.cities.filter(c=>own.some(p=>p.id===c.provinceId)).length,
      population:own.reduce((s,p)=>s+(stock.get(p.id)?.population??0),0),grain:own.reduce((s,p)=>s+(stock.get(p.id)?.grain??0),0),
      troops:w.armies.filter(a=>a.nationId===n.id&&a.status!=='destroyed').reduce((s,a)=>s+a.troops,0),
      gold:r.finance.nations[n.id]?.gold??0,destiny:r.destiny?.nations[n.id]?.destiny??0,
      enemies:w.nations.filter(m=>m.id!==n.id&&atWar(n.id,m.id)).map(m=>ni.get(m.id)!),alive:own.length>0};}),
    armies:w.armies.flatMap(a=>{const v=space.byArmy.get(a.id);if(!v)return [];const home=v.province;
      const at=home&&v.travel.status!=='moving'?wanderPoint(home.polygon,a.id,citySpots.get(home.id)):v.point;
      return [{id:a.id,name:a.name,nation:ni.get(a.nationId)!,troops:a.troops,unit:r.units[a.id]??'Infantry',status:a.status,travel:v.travel.status,
        province:home?pi.get(home.id)!:-1,supplies:Math.round(a.supplies),morale:Math.round(a.morale),x:at.x/sc,y:at.y/sc,manual:r.voyages.manualArmies.includes(a.id)}];}),
    wars:r.nativeWars.campaigns.filter(c=>c.endedTick===null).map(c=>{const d=r.nativeDiplomacy.declarations.find(x=>x.warId===c.id),goal=d?.goals[0];
      return {id:c.id,attacker:c.attacker?ni.get(c.attacker)??-1:-1,defender:c.defender?ni.get(c.defender)??-1:-1,
        casusBelli:d?CASUS_BELLI_NAMES47[d.casusBelliId]??'':'',goal:goal?warGoalDesc47(goal.type,goal.scope?.provinceIds?.length??0):'',
        startDay:Math.floor(c.openedTick/TICKS_PER_DAY),
        participants:c.participants.map(p=>({nation:ni.get(r.nativeWars.nationIds.find(v=>v[0]===p.stateId)?.[1]??'')??-1,side:p.side}))};}),
    sieges:r.occupation.sieges.map(s=>({province:pi.get(s.provinceId)??-1,nation:ni.get(s.controller)??-1,progress:s.maximum>0?s.resistance/s.maximum:0})),
    events:r.chronicle.entries.slice(-30).map(e=>({day:e.day,text:e.text,kind:e.kind})),
  };
}

/** Province details for the province sheet. */
export function province(index:number){
  const r=run(),w=r.world,p=w.provinces[index];if(!p)throw Error('地区不存在。');
  const stock=w.statecraft!.provinces.find(s=>s.provinceId===p.id),ni=nationIndex(r);
  return JSON.stringify({population:stock?.population??0,grain:stock?.grain??0,capacity:r.finance.provinces[p.id]?.maxPopulation??0,supply:p.supply,
    controller:ni.get(p.controller)??-1,owner:ni.get(p.legalOwner??p.controller)??-1});
}

/** The remaining route of an army, map units. */
export function route(armyId:string){
  const r=run(),g=actualForces47(r).spatial.graph,t=r.armyPositions.records[armyId];if(!t)return '[]';
  return JSON.stringify(remainingArmyTravelPoints47(t,g).map(p=>[p.x/r.scale,p.y/r.scale]));
}

function apply(action:unknown){
  if(!session||!current)throw Error('世界尚未载入。');
  current=withFastChecks47(()=>session!.execute(action as never,current!.journal.actions.length));
}
/** A player march or halt (army-commands47 through the session journal). */
export function order(armyId:string,provinceIndex:number){
  const r=run(),p=r.world.provinces[provinceIndex];
  const command=provinceIndex<0?{type:'army-halt' as const,armyId}:{type:'army-move' as const,armyId,target:{kind:'province' as const,id:p?.id??''},kind:'march' as const};
  const intent={force:'army' as const,command};
  const preview=previewMilitary47(structuredClone(r),intent) as {valid:boolean;reason:string;basedOn:unknown};
  if(!preview.valid)return JSON.stringify({ok:false,reason:preview.reason});
  try{apply({kind:'military',intent,expected:preview.basedOn});return JSON.stringify({ok:true,reason:preview.reason,state:state()});}
  catch(e){return JSON.stringify({ok:false,reason:e instanceof Error?e.message:'军令无法执行。'});}
}
/** Declare war or make peace between two nations (civilization47-political-owner). */
export function politics(type:'declare-war'|'make-peace',a:number,b:number){
  const r=run(),action={type,nationId:r.world.nations[a]?.id??'',targetNationId:r.world.nations[b]?.id??''};
  const preview=previewPoliticalCommand47(r,action as never);
  if(!preview.valid)return JSON.stringify({ok:false,reason:preview.reason});
  try{apply({kind:'politics',action,expected:preview.expected});return JSON.stringify({ok:true,reason:preview.reason,state:state()});}
  catch(e){return JSON.stringify({ok:false,reason:e instanceof Error?e.message:'外交命令无法执行。'});}
}

/** The save: the journal (opening + actions), replayed strictly on load. */
export function save(){
  if(!current)throw Error('世界尚未载入。');
  return encodeWire47({format:'lieguoji-native-game-1',journal:current.journal});
}
export async function load(text:string){
  const saved=decodeWire47(text) as {format:string;journal:Culture47Journal};
  if(saved.format!=='lieguoji-native-game-1')throw Error('这不是列国纪存档。');
  const s=new Culture47Session();current=s.load(saved.journal);session=s;
  const opening=saved.journal.opening as Culture47Opening,terrain=opening.terrain as Culture47Opening['terrain'];
  return JSON.stringify({...await mapOf(terrain,run(),{seed:'',template:''}),state:state()});
}
