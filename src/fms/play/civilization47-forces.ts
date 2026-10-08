import type {FmsDocument} from '../model';
import {createGovernmentWorld47,type Government47} from './civilization47-government';
import {assertGovernmentOpening47} from './civilization47-government-validation';
import type {WorldCultureSetup47} from './civilization47-names';
import type {EconomySetup47} from './civilization47-economy';
import {initialBattles} from './battle';
import {initialOccupation} from './occupation';
import {initialTransports} from './transport';
import {initialVoyages} from './voyage24-state';
import {initialVassals46} from './war46-vassals';
import {buildDiplomaticGeography} from './war30-geography';
import {buildHarbors46,graphFor46,type HarborLayout46} from './war46-geography';
import {initialPorts46} from './war46-ports';
import {initialNavy} from './navy';
import {initialWar26,reconcileWar26} from './war26-state';
import {war26Strength} from './war26-strength';
import {initialLosses} from './war27-losses';
import {initialWar28,importUnknownWars28} from './war47-wars';
import {initialForceContacts47} from './force-motion47';
import {initialForceClock47} from './force-clock47';
import {initialForceDamage47} from './force-losses47';
import {buildArmyTravelGraph47} from './army-travel47-graph';
import {beginArmyTravel47} from './army-travel47-state';
import type {ArmyPositions47} from './army-presence47';
import type {MilitaryRun47} from './force-tick47';
import {actualForces47} from './force-runtime47';
import {initialForceSpeed47,type ForceSpeed47} from './force-speed47';
import {TICKS_PER_DAY} from './clock';

export type NavalOpening47={version:1;rule:'qualified-starter-debit-v1';firstEventId:number;charges:{fleetId:string;homeId:string;crew:number;grain:number}[]};
/** All fields consumed by the real47 military phase, using real-culture
 * creation. This still needs daily settlement/live validation/Store49 before
 * it is a complete playable run; no version or legacy culture is fabricated. */
export type FoundingForces47=Government47&MilitaryRun47&{harbors:HarborLayout46;navalOpening:NavalOpening47;forceSpeed:ForceSpeed47};
const fields=['battles','occupation','transports','reorganization','voyages','alliances','vassals','diplomaticGeography','harbors','navy','maritime','fleetPositions','portControl','warfare','losses','nativeWars','forceContacts','forceClock','forceDamage','navalOpening','forceSpeed'] as const;
const seed=(text:string)=>{let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
/** Private construction. The starter allocation is the existing WEB rule:
 * one affordable fleet at a qualified harbor, crew/grain debited exactly once.
 * Never run the old creation/refund/version-wrap pipeline. */
function build<T extends Government47>(input:T):T&FoundingForces47{
  const r=structuredClone(input),harbors=buildHarbors46(r),sea=graphFor46({...r,harbors}),firstEventId=r.world.nextEventId,next=initialNavy(r.world,sea);
  const navalOpening:NavalOpening47={version:1,rule:'qualified-starter-debit-v1',firstEventId,charges:next.navy.fleets.map(f=>({fleetId:f.id,homeId:sea.ports.find(p=>p.id===f.dockId)!.provinceId,crew:f.crew,grain:f.food}))};
  const world=next.world,navy=next.navy,graph=buildArmyTravelGraph47(r.terrain,world);
  const fleetPositions:ArmyPositions47={version:1,binding:r.armyPositions.binding,revision:0,records:{}};
  // The graph constructor preserves wet face n as cell2n+1. Use that exact
  // identity: tolerance-based global picking can select a land half at a very
  // narrow positive-area shore. beginArmyTravel47 also checks the real point.
  for(const fleet of navy.fleets){const point=sea.nodes.get(fleet.node)!.center,cell=graph.cells.get(fleet.node*2+1);if(!cell||cell.surface!=='sea'||cell.face!==fleet.node)throw Error('初始舰队不能精确对应真实海面，保留原候选。');fleetPositions.records[fleet.id]=beginArmyTravel47(fleet.id,[cell.id],graph,point);}
  const reorganization:MilitaryRun47['reorganization']={version:1,active:{},completed:{}},maritime:MilitaryRun47['maritime']={version:1,hulls:Object.fromEntries(navy.fleets.map(f=>[f.id,f.ships*100])),contacts:[],retreating:{}};
  // Same new-world alliance initial values; it consumes only actual time and
  // nation IDs, never the old LifePerson source discriminator.
  const alliances:MilitaryRun47['alliances']={version:1,revision:0,nextId:1,enabled:true,originTime:r.life.gameTime,originTick:r.clock.tick,records:[],lastAction:Object.fromEntries(world.nations.map(n=>[n.id,-100]))};
  const base={...r,world,navy,harbors,maritime,reorganization,battles:initialBattles(),occupation:initialOccupation(),transports:initialTransports(),voyages:initialVoyages(world),alliances,vassals:initialVassals46(),diplomaticGeography:buildDiplomaticGeography(r),fleetPositions};
  const warfare=initialWar26();reconcileWar26(world,warfare,sea,r.clock.tick,(w,id)=>war26Strength(w,base,id));
  const inputWars={...base,warfare},nativeWars=initialWar28(inputWars);importUnknownWars28(nativeWars,inputWars);
  const out={...inputWars,nativeWars,losses:initialLosses(world,warfare,r.clock.tick,false),portControl:initialPorts46(base,sea),forceContacts:initialForceContacts47(),forceClock:initialForceClock47(r.clock.tick,seed(`${world.custom!.seed}/force47`),r.life.secondsPerDay/TICKS_PER_DAY),forceDamage:initialForceDamage47(),forceSpeed:initialForceSpeed47(world,r.clock.tick),navalOpening};
  actualForces47(out);return out;
}
export function attachFoundingForces47<T extends Government47>(input:T):T&FoundingForces47{
  assertGovernmentOpening47(input);if(fields.some(k=>k in input))throw Error('海陆军事创建只能初始化一次。');
  const result=build(input);assertFoundingForces47(result);return result;
}
export function createFoundingForces47(terrain:FmsDocument,count:number,cityCount:number,relations:'peace'|'war',culture:WorldCultureSetup47,economy:EconomySetup47={}){
  return attachFoundingForces47(createGovernmentWorld47(terrain,count,cityCount,relations,culture,economy));
}
const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function same(a:unknown,b:unknown):boolean{
  if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&Object.keys(a).length===a.length&&Object.keys(b).length===b.length&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)&&Object.hasOwn(b,i)&&same(a[i],b[i])).every(Boolean);
  const aa=a as Record<string,unknown>,bb=b as Record<string,unknown>;return Object.keys(aa).length===Object.keys(bb).length&&Object.keys(aa).every(k=>Object.hasOwn(bb,k)&&same(aa[k],bb[k]));
}
/** Validate the exact unplayed creation receipt. A private reverse debit is
 * used only to replay the pre-navy opening; saved/rendered population and
 * fleet positions are never replaced. This is NOT a live47 save validator. */
export function assertFoundingForces47(r:FoundingForces47){
  const fail=()=>{throw Error('初始海陆编制、兵源或配粮凭据不一致，原世界未改动。');},receipt=r.navalOpening;
  if(!exact(receipt,['version','rule','firstEventId','charges'])||receipt.version!==1||receipt.rule!=='qualified-starter-debit-v1'||!Number.isSafeInteger(receipt.firstEventId)||receipt.firstEventId<1||receipt.firstEventId>r.world.nextEventId||!Array.isArray(receipt.charges)||Object.keys(receipt.charges).length!==receipt.charges.length||receipt.charges.length>r.world.nations.length)return fail();
  const before=structuredClone(r),seen=new Set<string>();
  for(let i=0;i<receipt.charges.length;i++){const charge=receipt.charges[i];if(!Object.hasOwn(receipt.charges,i)||!exact(charge,['fleetId','homeId','crew','grain'])||typeof charge.fleetId!=='string'||seen.has(charge.fleetId)||!Number.isSafeInteger(charge.crew)||charge.crew<0||!Number.isSafeInteger(charge.grain)||charge.grain<0)return fail();seen.add(charge.fleetId);
    const p=before.world.statecraft?.provinces.find(p=>p.provinceId===charge.homeId);if(!p)return fail();p.population+=charge.crew;p.grain+=charge.grain;
  }
  before.world.events=before.world.events.filter(e=>e.id<receipt.firstEventId);before.world.nextEventId=receipt.firstEventId;
  assertGovernmentOpening47(before);
  // Strip only the new initial military fields from this private replay input.
  const pure={...before} as Government47&Partial<Record<typeof fields[number],unknown>>;for(const key of fields)delete pure[key];
  const expected=build(pure);
  if(!same(r.world,expected.world)||fields.some(key=>!same(r[key],expected[key])))return fail();
}
