import {assertWar27Run,assertGameRun as assertOld,dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage,type War27Run,type GameRun as OldRun} from './war27-model';
import type {War28State} from './war28-state';
import {assertWar28} from './war28-validation';
export type War28Run=Omit<War27Run,'version'|'rules'|'engine'>&{version:28;rules:'fms-war-28';engine:string;nativeWars:War28State};
export type GameRun=OldRun|War28Run;
export function war27View(r:War28Run):War27Run{const {nativeWars,...base}=r;void nativeWars;return {...base,version:27,rules:'fms-war-27',engine:__FMS_WAR27_ENGINE__};}
export const war28Wrap=(r:War27Run,nativeWars:War28State):War28Run=>({...r,version:28,rules:'fms-war-28',engine:__FMS_WAR28_ENGINE__,nativeWars});
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War28Run)=>oldDynasty(r.version===28?war27View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War28Run)=>oldVoyage(r.version===28?war27View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War28Run)=>oldRestoration(r.version===28?war27View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War28Run)=>oldCourt(r.version===28?war27View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War28Run)=>oldChronicle(r.version===28?war27View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War28Run)=>oldCampaign(r.version===28?war27View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War28Run)=>oldTactics(r.version===28?war27View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War28Run)=>oldMuster(r.version===28?war27View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===28?war27View(r):r);
export const gameStamp=(r:GameRun)=>r.version===28?`${r.version}/${r.engine}/${r.nativeWars.revision}/${oldStamp(war27View(r))}`:oldStamp(r);
export function assertWar28Run(v:unknown):asserts v is War28Run{const r=v as War28Run;if(r?.version!==28||r.rules!=='fms-war-28'||r.engine!==__FMS_WAR28_ENGINE__)throw Error('战争历史版本不同，已保留原档。');assertWar27Run(war27View(r));assertWar28(r.nativeWars,r);}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===28)assertWar28Run(v);else assertOld(v);}
