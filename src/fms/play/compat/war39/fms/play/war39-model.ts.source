import {initialPorts39,assertPorts39,type Ports39} from './war39-ports';
import {initialGarrison39,assertGarrison39,type Garrison39} from './war39-garrison';
import {graphFor} from './naval-rules';
import {maritimeView} from './tactics-model';
import {tacticsView as campaignTacticsView} from './campaign-model';
import {initialDeployment39,assertDeployment39,assertDeploymentPorts39,type NavalDeployment39} from './war39-deployment';
import {initialAlliances39,assertAlliances39,type Alliances39} from './war39-alliance';
import {initialRebellion39,assertRebellion39,type Rebellion39} from './war39-rebellion';
import {assertWars39} from './war39-validation';
import type {War39Wars} from './war39-wars';
import {assertWar27Run} from './war27-model';
import {war27View} from './war28-model';
import {war28View} from './war29-model';
import {assertDiplomacy} from './war29-diplomacy';
import {initialTribute39,assertTribute39,type Tribute39} from './war39-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war38-model';
import {initialVassals39,assertVassals39,type Vassals39} from './war39-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war38-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy39,assertNativeDiplomacy39,type NativeDiplomacy39} from './war39-state';
export type War39Run=Omit<War29Run,'version'|'rules'|'engine'|'nativeWars'>&{version:39;rules:'fms-war-39';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy39;vassals:Vassals39;tribute:Tribute39;rebellion:Rebellion39;nativeWars:War39Wars;alliances:Alliances39;navalDeployment:NavalDeployment39;garrison:Garrison39;portControl:Ports39};
export type GameRun=OldRun|War39Run;
export function war29View(r:War39Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;void rebellion;void alliances;void navalDeployment;void garrison;void portControl;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war39Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy39,vassals:Vassals39=initialVassals39(),tribute:Tribute39=initialTribute39(r.world.day),rebellion:Rebellion39=initialRebellion39(r.world.day),alliances:Alliances39=initialAlliances39(r,true),navalDeployment:NavalDeployment39=initialDeployment39(r),garrison:Garrison39=initialGarrison39(r),portControl:Ports39=initialPorts39(r,graphFor(maritimeView(campaignTacticsView(campaignView(r)))))):War39Run=>({...r,version:39,rules:'fms-war-39',engine:__FMS_WAR39_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar39Candidate(r:War29Run):War39Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war39Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy39(base,'explicit-copy'));assertWar39Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War39Run)=>oldDynasty(r.version===39?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War39Run)=>oldVoyage(r.version===39?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War39Run)=>oldRestoration(r.version===39?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War39Run)=>oldCourt(r.version===39?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War39Run)=>oldChronicle(r.version===39?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War39Run)=>oldCampaign(r.version===39?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War39Run)=>oldTactics(r.version===39?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War39Run)=>oldMuster(r.version===39?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===39?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===39?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${r.rebellion.revision}/${r.alliances.revision}/${r.navalDeployment.revision}/${r.garrison.revision}/${r.portControl.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar39Live(v:unknown):asserts v is War39Run{const r=v as War39Run;if(r?.version!==39||r.rules!=='fms-war-39'||r.engine!==__FMS_WAR39_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute','rebellion','alliances','navalDeployment','garrison','portControl'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertWar27Run(war27View(war28View(war29View(r))));assertDiplomacy(r.diplomacy,r.world);assertWars39(r.nativeWars,r);assertNativeDiplomacy39(r.nativeDiplomacy,r);assertVassals39(r.vassals,r);assertTribute39(r.tribute,r);assertRebellion39(r.rebellion,r);assertAlliances39(r.alliances,r);assertDeployment39(r.navalDeployment,r);assertGarrison39(r.garrison,r);assertPorts39(r.portControl,r);}
export function assertWar39Run(v:unknown):asserts v is War39Run{assertWar39Live(v);assertPorts39(v.portControl,v,graphFor(maritimeView(campaignTacticsView(campaignView(v)))));assertDiplomaticGeography(v.diplomaticGeography,v);assertDeploymentPorts39(v.navalDeployment,graphFor(maritimeView(campaignTacticsView(campaignView(v)))));}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===39)assertWar39Run(v);else assertOld(v);}
