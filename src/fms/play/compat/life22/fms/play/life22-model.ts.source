import {assertMuster21,assertGameRun as assertOld,muster21Wrap,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,type GameRun as OldRun,type Muster21Run} from './muster21-model';
import type {Restoration19Run} from './restoration19-model';
import type {DestinyState} from './destiny20-state';
import {assertLife22 as assertLife,type LifeState} from './life22-state';
export type Life22Run=Omit<Muster21Run,'version'|'rules'|'engine'>&{version:22;rules:'fms-life-22';engine:string;life:LifeState};
export type GameRun=OldRun|Life22Run;
/** Remove only this version's known sidecar; retain unknown siblings for guards. */
export function muster21View(r:Life22Run):Muster21Run{const {life,...base}=r;void life;return {...base,version:21,rules:'fms-muster-21',engine:__FMS_MUSTER21_ENGINE__};}
export const life22Wrap=(r:Restoration19Run,destiny:DestinyState,life:LifeState):Life22Run=>({...muster21Wrap(r,destiny),version:22,rules:'fms-life-22',engine:__FMS_LIFE22_ENGINE__,life});
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|Life22Run)=>oldRestoration(r.version===22?muster21View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|Life22Run)=>oldCourt(r.version===22?muster21View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|Life22Run)=>oldChronicle(r.version===22?muster21View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|Life22Run)=>oldCampaign(r.version===22?muster21View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|Life22Run)=>oldTactics(r.version===22?muster21View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===22?muster21View(r):r);
export const gameStamp=(r:GameRun)=>r.version===22?`${r.version}/${r.engine}/${oldStamp(muster21View(r))}/${r.life.revision}`:oldStamp(r);
export function assertLife22(r:unknown):asserts r is Life22Run{const a=r as Life22Run;if(a?.version!==22||a.rules!=='fms-life-22'||a.engine!==__FMS_LIFE22_ENGINE__)throw Error('世界版本不同，已保留原档。');assertMuster21(muster21View(a));assertLife(a.life,a);}
export function assertGameRun(r:unknown):asserts r is GameRun{if((r as GameRun)?.version===22)assertLife22(r);else assertOld(r);}
