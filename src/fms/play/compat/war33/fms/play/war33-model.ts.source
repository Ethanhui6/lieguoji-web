import {initialRebellion33,assertRebellion33,type Rebellion33} from './war33-rebellion';
import {assertWars33} from './war33-validation';
import type {War33Wars} from './war33-wars';
import {assertWar27Run} from './war27-model';
import {war27View} from './war28-model';
import {war28View} from './war29-model';
import {assertDiplomacy} from './war29-diplomacy';
import {initialTribute33,assertTribute33,type Tribute33} from './war33-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war32-model';
import {initialVassals33,assertVassals33,type Vassals33} from './war33-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war32-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy33,assertNativeDiplomacy33,type NativeDiplomacy33} from './war33-state';
export type War33Run=Omit<War29Run,'version'|'rules'|'engine'|'nativeWars'>&{version:33;rules:'fms-war-33';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy33;vassals:Vassals33;tribute:Tribute33;rebellion:Rebellion33;nativeWars:War33Wars};
export type GameRun=OldRun|War33Run;
export function war29View(r:War33Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;void rebellion;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war33Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy33,vassals:Vassals33=initialVassals33(),tribute:Tribute33=initialTribute33(r.world.day),rebellion:Rebellion33=initialRebellion33(r.world.day)):War33Run=>({...r,version:33,rules:'fms-war-33',engine:__FMS_WAR33_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar33Candidate(r:War29Run):War33Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war33Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy33(base,'explicit-copy'));assertWar33Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War33Run)=>oldDynasty(r.version===33?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War33Run)=>oldVoyage(r.version===33?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War33Run)=>oldRestoration(r.version===33?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War33Run)=>oldCourt(r.version===33?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War33Run)=>oldChronicle(r.version===33?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War33Run)=>oldCampaign(r.version===33?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War33Run)=>oldTactics(r.version===33?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War33Run)=>oldMuster(r.version===33?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===33?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===33?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${r.rebellion.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar33Live(v:unknown):asserts v is War33Run{const r=v as War33Run;if(r?.version!==33||r.rules!=='fms-war-33'||r.engine!==__FMS_WAR33_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute','rebellion'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertWar27Run(war27View(war28View(war29View(r))));assertDiplomacy(r.diplomacy,r.world);assertWars33(r.nativeWars,r);assertNativeDiplomacy33(r.nativeDiplomacy,r);assertVassals33(r.vassals,r);assertTribute33(r.tribute,r);assertRebellion33(r.rebellion,r);}
export function assertWar33Run(v:unknown):asserts v is War33Run{assertWar33Live(v);assertDiplomaticGeography(v.diplomaticGeography,v);}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===33)assertWar33Run(v);else assertOld(v);}
