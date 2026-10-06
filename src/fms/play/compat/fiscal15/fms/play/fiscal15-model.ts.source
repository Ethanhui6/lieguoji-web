import {assertGameRun as assertOld,presentationOf as oldPresentation,tacticsView as oldTactics,campaignView as oldCampaign,chronicleView as oldChronicle,type GameRun as OldRun,type Upper14Run} from './upper14-model';
import type {CampaignRun} from './campaign-model';
import type {ChronicleRun} from './chronicle-model';
import type {Chronicle2Run} from './chronicle2-model';
import type {Terrain13Run} from './terrain13-model';
import {assertFiscal,type FiscalState} from './fiscal15-state';
export type Fiscal15Run=Omit<Upper14Run,'version'|'rules'|'engine'> & {version:15;rules:'fms-fiscal-15';engine:string;finance:FiscalState};
export type GameRun=OldRun|Fiscal15Run;
export function upper14View(r:Fiscal15Run):Upper14Run{const {finance,...base}=r;void finance;return {...base,version:14,rules:'fms-upper-14',engine:__FMS_UPPER14_ENGINE__};}
export const fiscal15Wrap=(r:Upper14Run,finance:FiscalState):Fiscal15Run=>({...r,version:15,rules:'fms-fiscal-15',engine:__FMS_FISCAL15_ENGINE__,finance});
export const chronicleView=(r:Chronicle2Run|Terrain13Run|Upper14Run|Fiscal15Run)=>oldChronicle(r.version===15?upper14View(r):r);
export const campaignView=(r:ChronicleRun|Chronicle2Run|Terrain13Run|Upper14Run|Fiscal15Run)=>oldCampaign(r.version===15?upper14View(r):r);
export const tacticsView=(r:ChronicleRun|Chronicle2Run|Terrain13Run|Upper14Run|Fiscal15Run|CampaignRun)=>oldTactics(r.version===15?upper14View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===15?upper14View(r):r);
export const gameStamp=(r:GameRun)=>`${r.version}/${r.engine}/${r.id}/${r.world.day}/${r.world.nextEventId}/${'clock'in r?r.clock.tick:0}`;
export function assertFiscal15(r:unknown):asserts r is Fiscal15Run{const a=r as Fiscal15Run;if(a?.version!==15||a.rules!=='fms-fiscal-15'||a.engine!==__FMS_FISCAL15_ENGINE__)throw Error('世界版本不同，已保留原档。');assertOld(upper14View(a));assertFiscal(a.finance,a);}
export function assertGameRun(r:unknown):asserts r is GameRun{if((r as GameRun)?.version===15)assertFiscal15(r);else assertOld(r);}
