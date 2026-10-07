import {initialRebellion34,assertRebellion34,type Rebellion34} from './war34-rebellion';
import {assertWars34} from './war34-validation';
import type {War34Wars} from './war34-wars';
import {assertWar27Run} from './war27-model';
import {war27View} from './war28-model';
import {war28View} from './war29-model';
import {assertDiplomacy} from './war29-diplomacy';
import {initialTribute34,assertTribute34,type Tribute34} from './war34-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war33-model';
import {initialVassals34,assertVassals34,type Vassals34} from './war34-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war33-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy34,assertNativeDiplomacy34,type NativeDiplomacy34} from './war34-state';
export type War34Run=Omit<War29Run,'version'|'rules'|'engine'|'nativeWars'>&{version:34;rules:'fms-war-34';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy34;vassals:Vassals34;tribute:Tribute34;rebellion:Rebellion34;nativeWars:War34Wars};
export type GameRun=OldRun|War34Run;
export function war29View(r:War34Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;void rebellion;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war34Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy34,vassals:Vassals34=initialVassals34(),tribute:Tribute34=initialTribute34(r.world.day),rebellion:Rebellion34=initialRebellion34(r.world.day)):War34Run=>({...r,version:34,rules:'fms-war-34',engine:__FMS_WAR34_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar34Candidate(r:War29Run):War34Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war34Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy34(base,'explicit-copy'));assertWar34Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War34Run)=>oldDynasty(r.version===34?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War34Run)=>oldVoyage(r.version===34?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War34Run)=>oldRestoration(r.version===34?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War34Run)=>oldCourt(r.version===34?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War34Run)=>oldChronicle(r.version===34?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War34Run)=>oldCampaign(r.version===34?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War34Run)=>oldTactics(r.version===34?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War34Run)=>oldMuster(r.version===34?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===34?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===34?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${r.rebellion.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar34Live(v:unknown):asserts v is War34Run{const r=v as War34Run;if(r?.version!==34||r.rules!=='fms-war-34'||r.engine!==__FMS_WAR34_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute','rebellion'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertWar27Run(war27View(war28View(war29View(r))));assertDiplomacy(r.diplomacy,r.world);assertWars34(r.nativeWars,r);assertNativeDiplomacy34(r.nativeDiplomacy,r);assertVassals34(r.vassals,r);assertTribute34(r.tribute,r);assertRebellion34(r.rebellion,r);}
export function assertWar34Run(v:unknown):asserts v is War34Run{assertWar34Live(v);assertDiplomaticGeography(v.diplomaticGeography,v);}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===34)assertWar34Run(v);else assertOld(v);}
