import {graphFor} from './naval-rules';
import {maritimeView} from './tactics-model';
import {tacticsView as campaignTacticsView} from './campaign-model';
import {initialDeployment37,assertDeployment37,assertDeploymentPorts37,type NavalDeployment37} from './war37-deployment';
import {initialAlliances37,assertAlliances37,type Alliances37} from './war37-alliance';
import {initialRebellion37,assertRebellion37,type Rebellion37} from './war37-rebellion';
import {assertWars37} from './war37-validation';
import type {War37Wars} from './war37-wars';
import {assertWar27Run} from './war27-model';
import {war27View} from './war28-model';
import {war28View} from './war29-model';
import {assertDiplomacy} from './war29-diplomacy';
import {initialTribute37,assertTribute37,type Tribute37} from './war37-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war36-model';
import {initialVassals37,assertVassals37,type Vassals37} from './war37-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war36-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy37,assertNativeDiplomacy37,type NativeDiplomacy37} from './war37-state';
export type War37Run=Omit<War29Run,'version'|'rules'|'engine'|'nativeWars'>&{version:37;rules:'fms-war-37';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy37;vassals:Vassals37;tribute:Tribute37;rebellion:Rebellion37;nativeWars:War37Wars;alliances:Alliances37;navalDeployment:NavalDeployment37};
export type GameRun=OldRun|War37Run;
export function war29View(r:War37Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;void rebellion;void alliances;void navalDeployment;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war37Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy37,vassals:Vassals37=initialVassals37(),tribute:Tribute37=initialTribute37(r.world.day),rebellion:Rebellion37=initialRebellion37(r.world.day),alliances:Alliances37=initialAlliances37(r,true),navalDeployment:NavalDeployment37=initialDeployment37(r)):War37Run=>({...r,version:37,rules:'fms-war-37',engine:__FMS_WAR37_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar37Candidate(r:War29Run):War37Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war37Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy37(base,'explicit-copy'));assertWar37Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War37Run)=>oldDynasty(r.version===37?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War37Run)=>oldVoyage(r.version===37?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War37Run)=>oldRestoration(r.version===37?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War37Run)=>oldCourt(r.version===37?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War37Run)=>oldChronicle(r.version===37?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War37Run)=>oldCampaign(r.version===37?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War37Run)=>oldTactics(r.version===37?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War37Run)=>oldMuster(r.version===37?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===37?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===37?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${r.rebellion.revision}/${r.alliances.revision}/${r.navalDeployment.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar37Live(v:unknown):asserts v is War37Run{const r=v as War37Run;if(r?.version!==37||r.rules!=='fms-war-37'||r.engine!==__FMS_WAR37_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute','rebellion','alliances','navalDeployment'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertWar27Run(war27View(war28View(war29View(r))));assertDiplomacy(r.diplomacy,r.world);assertWars37(r.nativeWars,r);assertNativeDiplomacy37(r.nativeDiplomacy,r);assertVassals37(r.vassals,r);assertTribute37(r.tribute,r);assertRebellion37(r.rebellion,r);assertAlliances37(r.alliances,r);assertDeployment37(r.navalDeployment,r);}
export function assertWar37Run(v:unknown):asserts v is War37Run{assertWar37Live(v);assertDiplomaticGeography(v.diplomaticGeography,v);assertDeploymentPorts37(v.navalDeployment,graphFor(maritimeView(campaignTacticsView(campaignView(v)))));}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===37)assertWar37Run(v);else assertOld(v);}
