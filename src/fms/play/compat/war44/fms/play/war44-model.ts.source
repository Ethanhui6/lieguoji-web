import {buildHarbors44,graphFor44 as graphFor,assertHarbors44,assertHarborSchema44,type HarborLayout44} from './war44-geography';
import {assertNavy} from './war44-navy';
import {harborCells44} from './war44-harbor';
import {initialPorts44,assertPorts44,type Ports44} from './war44-ports';
import {initialGarrison44,assertGarrison44,type Garrison44} from './war44-garrison';
import {initialDeployment44,assertDeployment44,assertDeploymentPorts44,type NavalDeployment44} from './war44-deployment';
import {initialAlliances44,assertAlliances44,type Alliances44} from './war44-alliance';
import {initialRebellion44,assertRebellion44,type Rebellion44} from './war44-rebellion';
import {assertWars44} from './war44-validation';
import type {War44Wars} from './war44-wars';
import {assertWar27Run} from './war27-model';
import {war27View} from './war28-model';
import {war28View} from './war29-model';
import {assertDiplomacy} from './war29-diplomacy';
import {initialTribute44,assertTribute44,type Tribute44} from './war44-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war43-model';
import {initialVassals44,assertVassals44,type Vassals44} from './war44-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war43-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy44,assertNativeDiplomacy44,type NativeDiplomacy44} from './war44-state';
export type War44Run=Omit<War29Run,'version'|'rules'|'engine'|'nativeWars'>&{version:44;rules:'fms-war-44';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy44;vassals:Vassals44;tribute:Tribute44;rebellion:Rebellion44;nativeWars:War44Wars;alliances:Alliances44;navalDeployment:NavalDeployment44;garrison:Garrison44;portControl:Ports44;harbors:HarborLayout44};
export type GameRun=OldRun|War44Run;
export function war29View(r:War44Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl,harbors,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;void rebellion;void alliances;void navalDeployment;void garrison;void portControl;void harbors;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war44Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy44,vassals:Vassals44=initialVassals44(),tribute:Tribute44=initialTribute44(r.world.day),rebellion:Rebellion44=initialRebellion44(r.world.day),alliances:Alliances44=initialAlliances44(r,true),navalDeployment:NavalDeployment44=initialDeployment44(r),garrison:Garrison44=initialGarrison44(r),portControl:Ports44=initialPorts44(r,graphFor({...r,harbors:buildHarbors44(r,'preserved-anchor-v1')})),harbors:HarborLayout44=buildHarbors44(r,'preserved-anchor-v1')):War44Run=>({...r,version:44,rules:'fms-war-44',engine:__FMS_WAR44_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl,harbors});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar44Candidate(r:War29Run):War44Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war44Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy44(base,'explicit-copy'));assertWar44Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War44Run)=>oldDynasty(r.version===44?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War44Run)=>oldVoyage(r.version===44?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War44Run)=>oldRestoration(r.version===44?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War44Run)=>oldCourt(r.version===44?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War44Run)=>oldChronicle(r.version===44?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War44Run)=>oldCampaign(r.version===44?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War44Run)=>oldTactics(r.version===44?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War44Run)=>oldMuster(r.version===44?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===44?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===44?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${r.rebellion.revision}/${r.alliances.revision}/${r.navalDeployment.revision}/${r.garrison.revision}/${r.portControl.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar44Live(v:unknown):asserts v is War44Run{const r=v as War44Run;if(r?.version!==44||r.rules!=='fms-war-44'||r.engine!==__FMS_WAR44_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute','rebellion','alliances','navalDeployment','garrison','portControl','harbors'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertHarborSchema44(r.harbors);const graph=graphFor(r);assertNavy(r.navy,r.world,graph);
 // Validate the extended sailing endpoint contract first, then give frozen
 // legacy validators a stationary navy projection only. Actual saved/rendered
 // positions and routes are NEVER replaced by that validation projection.
 for(const f of r.navy.fleets){const a=r.navalDeployment.fleets[f.id];if(f.status==='sailing'&&!f.targetId&&(!a?.returning||f.route.length!==1))throw Error('战后航段记录损坏。');if(a?.loiterNode!==null&&a?.loiterNode!==undefined&&(a.loiterNode!==f.route.at(-1)&&a.loiterNode!==f.node||!a.assignedPortId||!harborCells44(graph,a.assignedPortId).has(a.loiterNode)))throw Error('港湾游弋目标损坏。');}
 const base=war27View(war28View(war29View(r)));assertWar27Run({...base,navy:{...base.navy,fleets:base.navy.fleets.map(f=>({...f,route:[],progress:0,dockId:null,targetId:null,status:f.status==='lost'?'lost':'anchored'}))}});assertDiplomacy(r.diplomacy,r.world);assertWars44(r.nativeWars,r);assertNativeDiplomacy44(r.nativeDiplomacy,r);assertVassals44(r.vassals,r);assertTribute44(r.tribute,r);assertRebellion44(r.rebellion,r);assertAlliances44(r.alliances,r);assertDeployment44(r.navalDeployment,r);assertGarrison44(r.garrison,r);assertPorts44(r.portControl,r);}
export function assertWar44Run(v:unknown):asserts v is War44Run{assertHarbors44(v as War44Run);assertWar44Live(v);assertPorts44(v.portControl,v,graphFor(v));assertDiplomaticGeography(v.diplomaticGeography,v);assertDeploymentPorts44(v.navalDeployment,graphFor(v));}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===44)assertWar44Run(v);else assertOld(v);}
