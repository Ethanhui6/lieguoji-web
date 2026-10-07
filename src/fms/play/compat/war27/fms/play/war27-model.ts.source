import {assertWar26Run,assertGameRun as assertOld,dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage,type War26Run,type GameRun as OldRun} from './war26-model';
import {assertLosses,type LossLedger} from './war27-losses';
export type War27Run=Omit<War26Run,'version'|'rules'|'engine'>&{version:27;rules:'fms-war-27';engine:string;losses:LossLedger};
export type GameRun=OldRun|War27Run;
export function war26View(r:War27Run):War26Run{const {losses,...base}=r;void losses;return {...base,version:26,rules:'fms-war-26',engine:__FMS_WAR26_ENGINE__};}
export const war27Wrap=(r:War26Run,losses:LossLedger):War27Run=>({...r,version:27,rules:'fms-war-27',engine:__FMS_WAR27_ENGINE__,losses});
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War27Run)=>oldDynasty(r.version===27?war26View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War27Run)=>oldVoyage(r.version===27?war26View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War27Run)=>oldRestoration(r.version===27?war26View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War27Run)=>oldCourt(r.version===27?war26View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War27Run)=>oldChronicle(r.version===27?war26View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War27Run)=>oldCampaign(r.version===27?war26View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War27Run)=>oldTactics(r.version===27?war26View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War27Run)=>oldMuster(r.version===27?war26View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===27?war26View(r):r);
export const gameStamp=(r:GameRun)=>r.version===27?`${r.version}/${r.engine}/${r.losses.revision}/${oldStamp(war26View(r))}`:oldStamp(r);
export function assertWar27Run(v:unknown):asserts v is War27Run{const r=v as War27Run;if(r?.version!==27||r.rules!=='fms-war-27'||r.engine!==__FMS_WAR27_ENGINE__)throw Error('战争目标版本不同，已保留原档。');assertWar26Run(war26View(r));assertLosses(r.losses,r.world,r.warfare,r.clock.tick);}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===27)assertWar27Run(v);else assertOld(v);}
