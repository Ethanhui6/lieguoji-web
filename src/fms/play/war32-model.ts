import {initialTribute32,assertTribute32,type Tribute32} from './war32-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war31-model';
import {initialVassals32,assertVassals32,type Vassals32} from './war32-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war31-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy32,assertNativeDiplomacy32,type NativeDiplomacy32} from './war32-state';
export type War32Run=Omit<War29Run,'version'|'rules'|'engine'>&{version:32;rules:'fms-war-32';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy32;vassals:Vassals32;tribute:Tribute32};
export type GameRun=OldRun|War32Run;
export function war29View(r:War32Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war32Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy32,vassals:Vassals32=initialVassals32(),tribute:Tribute32=initialTribute32(r.world.day)):War32Run=>({...r,version:32,rules:'fms-war-32',engine:__FMS_WAR32_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar32Candidate(r:War29Run):War32Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war32Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy32(base,'explicit-copy'));assertWar32Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War32Run)=>oldDynasty(r.version===32?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War32Run)=>oldVoyage(r.version===32?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War32Run)=>oldRestoration(r.version===32?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War32Run)=>oldCourt(r.version===32?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War32Run)=>oldChronicle(r.version===32?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War32Run)=>oldCampaign(r.version===32?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War32Run)=>oldTactics(r.version===32?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War32Run)=>oldMuster(r.version===32?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===32?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===32?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar32Live(v:unknown):asserts v is War32Run{const r=v as War32Run;if(r?.version!==32||r.rules!=='fms-war-32'||r.engine!==__FMS_WAR32_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertWar29Run(war29View(r));assertNativeDiplomacy32(r.nativeDiplomacy,r);assertVassals32(r.vassals,r);assertTribute32(r.tribute,r);}
export function assertWar32Run(v:unknown):asserts v is War32Run{assertWar32Live(v);assertDiplomaticGeography(v.diplomaticGeography,v);}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===32)assertWar32Run(v);else assertOld(v);}
