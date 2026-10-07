import {assertWar28Run,assertGameRun as assertOld,dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage,type War28Run,type GameRun as OldRun} from './war28-model';
import {assertDiplomacy,type DiplomacySettings} from './war29-diplomacy';
export type War29Run=Omit<War28Run,'version'|'rules'|'engine'>&{version:29;rules:'fms-war-29';engine:string;diplomacy:DiplomacySettings};
export type GameRun=OldRun|War29Run;
export function war28View(r:War29Run):War28Run{const {diplomacy,...base}=r;void diplomacy;return {...base,version:28,rules:'fms-war-28',engine:__FMS_WAR28_ENGINE__};}
export const war29Wrap=(r:War28Run,diplomacy:DiplomacySettings):War29Run=>({...r,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__,diplomacy});
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War29Run)=>oldDynasty(r.version===29?war28View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War29Run)=>oldVoyage(r.version===29?war28View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War29Run)=>oldRestoration(r.version===29?war28View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War29Run)=>oldCourt(r.version===29?war28View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War29Run)=>oldChronicle(r.version===29?war28View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War29Run)=>oldCampaign(r.version===29?war28View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War29Run)=>oldTactics(r.version===29?war28View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War29Run)=>oldMuster(r.version===29?war28View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===29?war28View(r):r);
export const gameStamp=(r:GameRun)=>r.version===29?`${r.version}/${r.engine}/${r.diplomacy.revision}/${oldStamp(war28View(r))}`:oldStamp(r);
export function assertWar29Run(v:unknown):asserts v is War29Run{const r=v as War29Run;if(r?.version!==29||r.rules!=='fms-war-29'||r.engine!==__FMS_WAR29_ENGINE__)throw Error('外交规则版本不同，已保留原档。');assertWar28Run(war28View(r));assertDiplomacy(r.diplomacy,r.world);}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===29)assertWar29Run(v);else assertOld(v);}
