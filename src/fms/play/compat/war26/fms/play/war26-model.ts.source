import {assertSettlement25,assertGameRun as assertOld,dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage,type Settlement25Run,type GameRun as OldRun} from './settlement25-model';
import type {War26State} from './war26-state';
import {assertWar26} from './war26-validation';
export type War26Run=Omit<Settlement25Run,'version'|'rules'|'engine'>&{version:26;rules:'fms-war-26';engine:string;warfare:War26State};
export type GameRun=OldRun|War26Run;
export function settlement25View(r:War26Run):Settlement25Run{const {warfare,...base}=r;void warfare;return {...base,version:25,rules:'fms-settlement-25',engine:__FMS_SETTLEMENT25_ENGINE__};}
export const war26Wrap=(r:Settlement25Run,warfare:War26State):War26Run=>({...r,version:26,rules:'fms-war-26',engine:__FMS_WAR26_ENGINE__,warfare});
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War26Run)=>oldDynasty(r.version===26?settlement25View(r):r);
export const voyage24View=(r:Settlement25Run|War26Run)=>oldVoyage(r.version===26?settlement25View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War26Run)=>oldRestoration(r.version===26?settlement25View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War26Run)=>oldCourt(r.version===26?settlement25View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War26Run)=>oldChronicle(r.version===26?settlement25View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War26Run)=>oldCampaign(r.version===26?settlement25View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War26Run)=>oldTactics(r.version===26?settlement25View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War26Run)=>oldMuster(r.version===26?settlement25View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===26?settlement25View(r):r);
export const gameStamp=(r:GameRun)=>r.version===26?`${r.version}/${r.engine}/${r.warfare.revision}/${oldStamp(settlement25View(r))}`:oldStamp(r);
export function assertWar26Run(v:unknown):asserts v is War26Run{const r=v as War26Run;if(r?.version!==26||r.rules!=='fms-war-26'||r.engine!==__FMS_WAR26_ENGINE__)throw Error('战争目标版本不同，已保留原档。');assertSettlement25(settlement25View(r));assertWar26(r.warfare,r.world,r.clock.tick);}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===26)assertWar26Run(v);else assertOld(v);}
