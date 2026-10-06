import {assertChronicle as assertOld,assertGameRun as assertOldGame,presentationOf as oldPresentation,tacticsView as oldTactics,campaignView as oldCampaign,type GameRun as OldRun,type ChronicleRun} from './chronicle-model';
import type {CampaignRun} from './campaign-model';
export type Chronicle2Run=Omit<ChronicleRun,'version'|'rules'|'engine'> & {version:12;rules:'fms-chronicle-2';engine:string};
export type GameRun=OldRun|Chronicle2Run;
export const chronicleView=(r:Chronicle2Run):ChronicleRun=>({...r,version:11,rules:'fms-chronicle-1',engine:__FMS_CHRONICLE_ENGINE__});
export const chronicle2Wrap=(r:ChronicleRun):Chronicle2Run=>({...r,version:12,rules:'fms-chronicle-2',engine:__FMS_CHRONICLE2_ENGINE__});
export const campaignView=(r:ChronicleRun|Chronicle2Run)=>oldCampaign(r.version===12?chronicleView(r):r);
export const tacticsView=(r:ChronicleRun|Chronicle2Run|CampaignRun)=>oldTactics(r.version===12?chronicleView(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===12?chronicleView(r):r);
export const gameStamp=(r:GameRun)=>`${r.version}/${r.engine}/${r.id}/${r.world.day}/${r.world.nextEventId}/${'clock'in r?r.clock.tick:0}`;
export function assertChronicle2(r:unknown):asserts r is Chronicle2Run{const a=r as Chronicle2Run;if(a?.version!==12||a.rules!=='fms-chronicle-2'||a.engine!==__FMS_CHRONICLE2_ENGINE__)throw Error('世界版本不同，已保留原档。');assertOld(chronicleView(a));}
export function assertGameRun(r:unknown):asserts r is GameRun{if((r as GameRun)?.version===12)assertChronicle2(r);else assertOldGame(r);}
