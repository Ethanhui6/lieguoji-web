import {buildHarbors43,graphFor43 as graphFor,assertHarbors43,assertHarborSchema43,type HarborLayout43} from './war43-geography';
import {assertNavy} from './war43-navy';
import {harborCells43} from './war43-harbor';
import {initialPorts43,assertPorts43,type Ports43} from './war43-ports';
import {initialGarrison43,assertGarrison43,type Garrison43} from './war43-garrison';
import {initialDeployment43,assertDeployment43,assertDeploymentPorts43,type NavalDeployment43} from './war43-deployment';
import {initialAlliances43,assertAlliances43,type Alliances43} from './war43-alliance';
import {initialRebellion43,assertRebellion43,type Rebellion43} from './war43-rebellion';
import {assertWars43} from './war43-validation';
import type {War43Wars} from './war43-wars';
import {assertWar27Run} from './war27-model';
import {war27View} from './war28-model';
import {war28View} from './war29-model';
import {assertDiplomacy} from './war29-diplomacy';
import {initialTribute43,assertTribute43,type Tribute43} from './war43-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war42-model';
import {initialVassals43,assertVassals43,type Vassals43} from './war43-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war42-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy43,assertNativeDiplomacy43,type NativeDiplomacy43} from './war43-state';
export type War43Run=Omit<War29Run,'version'|'rules'|'engine'|'nativeWars'>&{version:43;rules:'fms-war-43';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy43;vassals:Vassals43;tribute:Tribute43;rebellion:Rebellion43;nativeWars:War43Wars;alliances:Alliances43;navalDeployment:NavalDeployment43;garrison:Garrison43;portControl:Ports43;harbors:HarborLayout43};
export type GameRun=OldRun|War43Run;
export function war29View(r:War43Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl,harbors,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;void rebellion;void alliances;void navalDeployment;void garrison;void portControl;void harbors;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war43Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy43,vassals:Vassals43=initialVassals43(),tribute:Tribute43=initialTribute43(r.world.day),rebellion:Rebellion43=initialRebellion43(r.world.day),alliances:Alliances43=initialAlliances43(r,true),navalDeployment:NavalDeployment43=initialDeployment43(r),garrison:Garrison43=initialGarrison43(r),portControl:Ports43=initialPorts43(r,graphFor({...r,harbors:buildHarbors43(r,'preserved-anchor-v1')})),harbors:HarborLayout43=buildHarbors43(r,'preserved-anchor-v1')):War43Run=>({...r,version:43,rules:'fms-war-43',engine:__FMS_WAR43_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl,harbors});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar43Candidate(r:War29Run):War43Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war43Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy43(base,'explicit-copy'));assertWar43Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War43Run)=>oldDynasty(r.version===43?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War43Run)=>oldVoyage(r.version===43?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War43Run)=>oldRestoration(r.version===43?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War43Run)=>oldCourt(r.version===43?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War43Run)=>oldChronicle(r.version===43?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War43Run)=>oldCampaign(r.version===43?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War43Run)=>oldTactics(r.version===43?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War43Run)=>oldMuster(r.version===43?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===43?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===43?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${r.rebellion.revision}/${r.alliances.revision}/${r.navalDeployment.revision}/${r.garrison.revision}/${r.portControl.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar43Live(v:unknown):asserts v is War43Run{const r=v as War43Run;if(r?.version!==43||r.rules!=='fms-war-43'||r.engine!==__FMS_WAR43_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute','rebellion','alliances','navalDeployment','garrison','portControl','harbors'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertHarborSchema43(r.harbors);const graph=graphFor(r);assertNavy(r.navy,r.world,graph);
 // Validate the extended sailing endpoint contract first, then give frozen
 // legacy validators a stationary navy projection only. Actual saved/rendered
 // positions and routes are NEVER replaced by that validation projection.
 for(const f of r.navy.fleets){const a=r.navalDeployment.fleets[f.id];if(f.status==='sailing'&&!f.targetId&&(!a?.returning||f.route.length!==1))throw Error('战后航段记录损坏。');if(a?.loiterNode!==null&&a?.loiterNode!==undefined&&(a.loiterNode!==f.route.at(-1)&&a.loiterNode!==f.node||!a.assignedPortId||!harborCells43(graph,a.assignedPortId).has(a.loiterNode)))throw Error('港湾游弋目标损坏。');}
 const base=war27View(war28View(war29View(r)));assertWar27Run({...base,navy:{...base.navy,fleets:base.navy.fleets.map(f=>({...f,route:[],progress:0,dockId:null,targetId:null,status:f.status==='lost'?'lost':'anchored'}))}});assertDiplomacy(r.diplomacy,r.world);assertWars43(r.nativeWars,r);assertNativeDiplomacy43(r.nativeDiplomacy,r);assertVassals43(r.vassals,r);assertTribute43(r.tribute,r);assertRebellion43(r.rebellion,r);assertAlliances43(r.alliances,r);assertDeployment43(r.navalDeployment,r);assertGarrison43(r.garrison,r);assertPorts43(r.portControl,r);}
export function assertWar43Run(v:unknown):asserts v is War43Run{assertHarbors43(v as War43Run);assertWar43Live(v);assertPorts43(v.portControl,v,graphFor(v));assertDiplomaticGeography(v.diplomaticGeography,v);assertDeploymentPorts43(v.navalDeployment,graphFor(v));}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===43)assertWar43Run(v);else assertOld(v);}
