import {initialShipbuilding46,assertShipbuilding46,type Shipbuilding46} from './war46-shipbuilding';
import {buildHarbors46,graphFor46 as graphFor,assertHarbors46,assertHarborSchema46,type HarborLayout46} from './war46-geography';
import {assertNavy} from './war46-navy';
import {assertTransports} from './destiny20-structure';
import {seaGraph} from './sea-path';
import {harborCells46} from './war46-harbor';
import {initialPorts46,assertPorts46,type Ports46} from './war46-ports';
import {initialGarrison46,assertGarrison46,type Garrison46} from './war46-garrison';
import {initialDeployment46,assertDeployment46,assertDeploymentPorts46,type NavalDeployment46} from './war46-deployment';
import {initialAlliances46,assertAlliances46,type Alliances46} from './war46-alliance';
import {initialRebellion46,assertRebellion46,type Rebellion46} from './war46-rebellion';
import {assertWars46} from './war46-validation';
import type {War46Wars} from './war46-wars';
import {assertWar27Run} from './war27-model';
import {war27View} from './war28-model';
import {war28View} from './war29-model';
import {assertDiplomacy} from './war29-diplomacy';
import {initialTribute46,assertTribute46,type Tribute46} from './war46-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war45-model';
import {initialVassals46,assertVassals46,type Vassals46} from './war46-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war45-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy46,assertNativeDiplomacy46,type NativeDiplomacy46} from './war46-state';
export type War46Run=Omit<War29Run,'version'|'rules'|'engine'|'nativeWars'>&{version:46;rules:'fms-war-46';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy46;vassals:Vassals46;tribute:Tribute46;rebellion:Rebellion46;nativeWars:War46Wars;alliances:Alliances46;navalDeployment:NavalDeployment46;garrison:Garrison46;portControl:Ports46;harbors:HarborLayout46;shipbuilding:Shipbuilding46};
export type GameRun=OldRun|War46Run;
export function war29View(r:War46Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl,harbors,shipbuilding,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;void rebellion;void alliances;void navalDeployment;void garrison;void portControl;void harbors;void shipbuilding;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war46Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy46,vassals:Vassals46=initialVassals46(),tribute:Tribute46=initialTribute46(r.world.day),rebellion:Rebellion46=initialRebellion46(r.world.day),alliances:Alliances46=initialAlliances46(r,true),navalDeployment:NavalDeployment46=initialDeployment46(r),garrison:Garrison46=initialGarrison46(r),portControl:Ports46=initialPorts46(r,graphFor({...r,harbors:buildHarbors46(r,'preserved-anchor-v1')})),harbors:HarborLayout46=buildHarbors46(r,'preserved-anchor-v1'),shipbuilding:Shipbuilding46=initialShipbuilding46(r)):War46Run=>({...r,version:46,rules:'fms-war-46',engine:__FMS_WAR46_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl,harbors,shipbuilding});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar46Candidate(r:War29Run):War46Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war46Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy46(base,'explicit-copy'));assertWar46Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War46Run)=>oldDynasty(r.version===46?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War46Run)=>oldVoyage(r.version===46?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War46Run)=>oldRestoration(r.version===46?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War46Run)=>oldCourt(r.version===46?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War46Run)=>oldChronicle(r.version===46?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War46Run)=>oldCampaign(r.version===46?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War46Run)=>oldTactics(r.version===46?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War46Run)=>oldMuster(r.version===46?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===46?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===46?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${r.rebellion.revision}/${r.alliances.revision}/${r.navalDeployment.revision}/${r.garrison.revision}/${r.portControl.revision}/${r.shipbuilding.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar46Live(v:unknown):asserts v is War46Run{const r=v as War46Run;if(r?.version!==46||r.rules!=='fms-war-46'||r.engine!==__FMS_WAR46_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute','rebellion','alliances','navalDeployment','garrison','portControl','harbors','shipbuilding'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertShipbuilding46(r.shipbuilding,r);assertHarborSchema46(r.harbors);const graph=graphFor(r);assertNavy(r.navy,r.world,graph);
 // Validate the extended sailing endpoint contract first, then give frozen
 // legacy validators a stationary navy projection only. Actual saved/rendered
 // positions and routes are NEVER replaced by that validation projection.
 for(const f of r.navy.fleets){const a=r.navalDeployment.fleets[f.id];if(f.status==='sailing'&&!f.targetId&&(!a?.returning||f.route.length!==1))throw Error('战后航段记录损坏。');if(a?.loiterNode!==null&&a?.loiterNode!==undefined&&(a.loiterNode!==f.route.at(-1)&&a.loiterNode!==f.node||!a.assignedPortId||!harborCells46(graph,a.assignedPortId).has(a.loiterNode)))throw Error('港湾游弋目标损坏。');}
 const base=war27View(war28View(war29View(r)));
 // Validate REAL cargo endpoints and positions against the saved native harbor
 // layout before projecting stationary records for the old anchor validator.
 // Old validation assumes anchored passengers have already reached its port;
 // retaining a mid-sea node in that projection rejects every real voyage.
 assertTransports(r.transports,{...base,version:7,rules:'fms-transport-1'},graph);
 for(const cargo of r.transports.cargo){
  const fleet=r.navy.fleets.find(f=>f.id===cargo.fleetId)!,port=graph.ports.find(p=>p.id===cargo.targetPortId);
  // Ordinary patrols may stop anywhere in a harbor. Passengers must reach
  // their exact landing anchor, otherwise the next anchored tick cannot land.
  if(fleet.status==='sailing'&&(!port||fleet.route.at(-1)!==port.node))throw Error('运输航线未抵达指定登陆点，已保留原档。');
 }
 const oldGraph=seaGraph(r.terrain,r.world);
 assertWar27Run({...base,navy:{...base.navy,fleets:base.navy.fleets.map(f=>{
  const cargo=r.transports.cargo.find(c=>c.fleetId===f.id),target=cargo&&oldGraph.ports.find(p=>p.id===(cargo.targetPortId??cargo.fromPortId));
  if(cargo&&!target)throw Error('运输海港引用不兼容，已保留原档。');
  return {...f,node:target?.node??f.node,route:[],progress:0,dockId:null,targetId:null,status:f.status==='lost'?'lost':'anchored'};
 })}});assertDiplomacy(r.diplomacy,r.world);assertWars46(r.nativeWars,r);assertNativeDiplomacy46(r.nativeDiplomacy,r);assertVassals46(r.vassals,r);assertTribute46(r.tribute,r);assertRebellion46(r.rebellion,r);assertAlliances46(r.alliances,r);assertDeployment46(r.navalDeployment,r);assertGarrison46(r.garrison,r);assertPorts46(r.portControl,r);}
export function assertWar46Run(v:unknown):asserts v is War46Run{assertHarbors46(v as War46Run);assertWar46Live(v);assertPorts46(v.portControl,v,graphFor(v));assertDiplomaticGeography(v.diplomaticGeography,v);assertDeploymentPorts46(v.navalDeployment,graphFor(v));}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===46)assertWar46Run(v);else assertOld(v);}
