import {assertLife22,assertGameRun as assertOld,life22Wrap,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,type Life22Run,type GameRun as OldRun} from './life22-model';
import type {Restoration19Run} from './restoration19-model';
import type {LifeState} from './life22-state';
import type {DestinyState} from './destiny20-state';
import type {KinState} from './dynasty23-state';
import {assertKin} from './dynasty23-validation';
export type Dynasty23Run=Omit<Life22Run,'version'|'rules'|'engine'>&{version:23;rules:'fms-dynasty-23';engine:string;kin:KinState};
export type GameRun=OldRun|Dynasty23Run;
export function life22View(r:Dynasty23Run):Life22Run{const {kin,...base}=r;void kin;return {...base,version:22,rules:'fms-life-22',engine:__FMS_LIFE22_ENGINE__};}
export function dynasty23Wrap(r:Life22Run,kin:KinState):Dynasty23Run;
export function dynasty23Wrap(r:Restoration19Run,destiny:DestinyState,life:LifeState,kin:KinState):Dynasty23Run;
export function dynasty23Wrap(r:Life22Run|Restoration19Run,d:KinState|DestinyState,life?:LifeState,kin?:KinState):Dynasty23Run{const base=r.version===22?r:life22Wrap(r,d as DestinyState,life!);return {...base,version:23,rules:'fms-dynasty-23',engine:__FMS_DYNASTY23_ENGINE__,kin:kin??d as KinState};}
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|Dynasty23Run)=>oldRestoration(r.version===23?life22View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|Dynasty23Run)=>oldCourt(r.version===23?life22View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|Dynasty23Run)=>oldChronicle(r.version===23?life22View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|Dynasty23Run)=>oldCampaign(r.version===23?life22View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|Dynasty23Run)=>oldTactics(r.version===23?life22View(r):r);
export const muster21View=(r:Life22Run|Dynasty23Run)=>oldMuster(r.version===23?life22View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===23?life22View(r):r);
export const gameStamp=(r:GameRun)=>r.version===23?`${r.version}/${r.engine}/${oldStamp(life22View(r))}/${r.kin.revision}`:oldStamp(r);
export function assertDynasty23(v:unknown):asserts v is Dynasty23Run{const r=v as Dynasty23Run;if(r?.version!==23||r.rules!=='fms-dynasty-23'||r.engine!==__FMS_DYNASTY23_ENGINE__)throw Error('家族世界版本不同，已保留原档。');const old=life22View(r);assertLife22(old);assertKin(r.kin,old);}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===23)assertDynasty23(v);else assertOld(v);}
