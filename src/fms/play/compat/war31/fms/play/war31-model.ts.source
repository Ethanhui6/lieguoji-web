import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war30-model';
import {initialVassals31,assertVassals31,type Vassals31} from './war31-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war30-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy31,assertNativeDiplomacy31,type NativeDiplomacy31} from './war31-state';
export type War31Run=Omit<War29Run,'version'|'rules'|'engine'>&{version:31;rules:'fms-war-31';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy31;vassals:Vassals31};
export type GameRun=OldRun|War31Run;
export function war29View(r:War31Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war31Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy31,vassals:Vassals31=initialVassals31()):War31Run=>({...r,version:31,rules:'fms-war-31',engine:__FMS_WAR31_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar31Candidate(r:War29Run):War31Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war31Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy31(base,'explicit-copy'));assertWar31Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War31Run)=>oldDynasty(r.version===31?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War31Run)=>oldVoyage(r.version===31?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War31Run)=>oldRestoration(r.version===31?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War31Run)=>oldCourt(r.version===31?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War31Run)=>oldChronicle(r.version===31?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War31Run)=>oldCampaign(r.version===31?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War31Run)=>oldTactics(r.version===31?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War31Run)=>oldMuster(r.version===31?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===31?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===31?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar31Live(v:unknown):asserts v is War31Run{const r=v as War31Run;if(r?.version!==31||r.rules!=='fms-war-31'||r.engine!==__FMS_WAR31_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertWar29Run(war29View(r));assertNativeDiplomacy31(r.nativeDiplomacy,r);assertVassals31(r.vassals,r);}
export function assertWar31Run(v:unknown):asserts v is War31Run{assertWar31Live(v);assertDiplomaticGeography(v.diplomaticGeography,v);}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===31)assertWar31Run(v);else assertOld(v);}
