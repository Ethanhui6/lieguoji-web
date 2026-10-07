import {initialAlliances36,assertAlliances36,type Alliances36} from './war36-alliance';
import {initialRebellion36,assertRebellion36,type Rebellion36} from './war36-rebellion';
import {assertWars36} from './war36-validation';
import type {War36Wars} from './war36-wars';
import {assertWar27Run} from './war27-model';
import {war27View} from './war28-model';
import {war28View} from './war29-model';
import {assertDiplomacy} from './war29-diplomacy';
import {initialTribute36,assertTribute36,type Tribute36} from './war36-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war35-model';
import {initialVassals36,assertVassals36,type Vassals36} from './war36-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war35-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy36,assertNativeDiplomacy36,type NativeDiplomacy36} from './war36-state';
export type War36Run=Omit<War29Run,'version'|'rules'|'engine'|'nativeWars'>&{version:36;rules:'fms-war-36';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy36;vassals:Vassals36;tribute:Tribute36;rebellion:Rebellion36;nativeWars:War36Wars;alliances:Alliances36};
export type GameRun=OldRun|War36Run;
export function war29View(r:War36Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;void rebellion;void alliances;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war36Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy36,vassals:Vassals36=initialVassals36(),tribute:Tribute36=initialTribute36(r.world.day),rebellion:Rebellion36=initialRebellion36(r.world.day),alliances:Alliances36=initialAlliances36(r,true)):War36Run=>({...r,version:36,rules:'fms-war-36',engine:__FMS_WAR36_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar36Candidate(r:War29Run):War36Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war36Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy36(base,'explicit-copy'));assertWar36Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War36Run)=>oldDynasty(r.version===36?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War36Run)=>oldVoyage(r.version===36?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War36Run)=>oldRestoration(r.version===36?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War36Run)=>oldCourt(r.version===36?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War36Run)=>oldChronicle(r.version===36?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War36Run)=>oldCampaign(r.version===36?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War36Run)=>oldTactics(r.version===36?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War36Run)=>oldMuster(r.version===36?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===36?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===36?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${r.rebellion.revision}/${r.alliances.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar36Live(v:unknown):asserts v is War36Run{const r=v as War36Run;if(r?.version!==36||r.rules!=='fms-war-36'||r.engine!==__FMS_WAR36_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute','rebellion','alliances'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertWar27Run(war27View(war28View(war29View(r))));assertDiplomacy(r.diplomacy,r.world);assertWars36(r.nativeWars,r);assertNativeDiplomacy36(r.nativeDiplomacy,r);assertVassals36(r.vassals,r);assertTribute36(r.tribute,r);assertRebellion36(r.rebellion,r);assertAlliances36(r.alliances,r);}
export function assertWar36Run(v:unknown):asserts v is War36Run{assertWar36Live(v);assertDiplomaticGeography(v.diplomaticGeography,v);}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===36)assertWar36Run(v);else assertOld(v);}
