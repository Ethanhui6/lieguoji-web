import {initialAlliances35,assertAlliances35,type Alliances35} from './war35-alliance';
import {initialRebellion35,assertRebellion35,type Rebellion35} from './war35-rebellion';
import {assertWars35} from './war35-validation';
import type {War35Wars} from './war35-wars';
import {assertWar27Run} from './war27-model';
import {war27View} from './war28-model';
import {war28View} from './war29-model';
import {assertDiplomacy} from './war29-diplomacy';
import {initialTribute35,assertTribute35,type Tribute35} from './war35-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war34-model';
import {initialVassals35,assertVassals35,type Vassals35} from './war35-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war34-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy35,assertNativeDiplomacy35,type NativeDiplomacy35} from './war35-state';
export type War35Run=Omit<War29Run,'version'|'rules'|'engine'|'nativeWars'>&{version:35;rules:'fms-war-35';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy35;vassals:Vassals35;tribute:Tribute35;rebellion:Rebellion35;nativeWars:War35Wars;alliances:Alliances35};
export type GameRun=OldRun|War35Run;
export function war29View(r:War35Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;void rebellion;void alliances;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war35Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy35,vassals:Vassals35=initialVassals35(),tribute:Tribute35=initialTribute35(r.world.day),rebellion:Rebellion35=initialRebellion35(r.world.day),alliances:Alliances35=initialAlliances35(r,true)):War35Run=>({...r,version:35,rules:'fms-war-35',engine:__FMS_WAR35_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar35Candidate(r:War29Run):War35Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war35Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy35(base,'explicit-copy'));assertWar35Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War35Run)=>oldDynasty(r.version===35?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War35Run)=>oldVoyage(r.version===35?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War35Run)=>oldRestoration(r.version===35?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War35Run)=>oldCourt(r.version===35?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War35Run)=>oldChronicle(r.version===35?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War35Run)=>oldCampaign(r.version===35?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War35Run)=>oldTactics(r.version===35?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War35Run)=>oldMuster(r.version===35?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===35?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===35?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${r.rebellion.revision}/${r.alliances.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar35Live(v:unknown):asserts v is War35Run{const r=v as War35Run;if(r?.version!==35||r.rules!=='fms-war-35'||r.engine!==__FMS_WAR35_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute','rebellion','alliances'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertWar27Run(war27View(war28View(war29View(r))));assertDiplomacy(r.diplomacy,r.world);assertWars35(r.nativeWars,r);assertNativeDiplomacy35(r.nativeDiplomacy,r);assertVassals35(r.vassals,r);assertTribute35(r.tribute,r);assertRebellion35(r.rebellion,r);assertAlliances35(r.alliances,r);}
export function assertWar35Run(v:unknown):asserts v is War35Run{assertWar35Live(v);assertDiplomaticGeography(v.diplomaticGeography,v);}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===35)assertWar35Run(v);else assertOld(v);}
