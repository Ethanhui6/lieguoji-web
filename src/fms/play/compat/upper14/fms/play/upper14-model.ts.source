import {assertGameRun as assertOld,presentationOf as oldPresentation,tacticsView as oldTactics,campaignView as oldCampaign,chronicleView as oldChronicle,type GameRun as OldRun,type Terrain13Run} from './terrain13-model';
import type {CampaignRun} from './campaign-model';
import type {ChronicleRun} from './chronicle-model';
import type {Chronicle2Run} from './chronicle2-model';
import {assertUpper,type UpperCombat} from './upper14-state';
export type Upper14Run=Omit<Terrain13Run,'version'|'rules'|'engine'> & {version:14;rules:'fms-upper-14';engine:string;upperCombat:UpperCombat};
export type GameRun=OldRun|Upper14Run;
export function terrain13View(r:Upper14Run):Terrain13Run{const {upperCombat,...base}=r;void upperCombat;return {...base,version:13,rules:'fms-terrain-13',engine:__FMS_TERRAIN13_ENGINE__};}
export const upper14Wrap=(r:Terrain13Run,upperCombat:UpperCombat):Upper14Run=>({...r,version:14,rules:'fms-upper-14',engine:__FMS_UPPER14_ENGINE__,upperCombat});
export const chronicleView=(r:Chronicle2Run|Terrain13Run|Upper14Run)=>oldChronicle(r.version===14?terrain13View(r):r);
export const campaignView=(r:ChronicleRun|Chronicle2Run|Terrain13Run|Upper14Run)=>oldCampaign(r.version===14?terrain13View(r):r);
export const tacticsView=(r:ChronicleRun|Chronicle2Run|Terrain13Run|Upper14Run|CampaignRun)=>oldTactics(r.version===14?terrain13View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===14?terrain13View(r):r);
export const gameStamp=(r:GameRun)=>`${r.version}/${r.engine}/${r.id}/${r.world.day}/${r.world.nextEventId}/${'clock'in r?r.clock.tick:0}`;
export function assertUpper14(r:unknown):asserts r is Upper14Run{const a=r as Upper14Run;if(a?.version!==14||a.rules!=='fms-upper-14'||a.engine!==__FMS_UPPER14_ENGINE__)throw Error('世界版本不同，已保留原档。');assertOld(terrain13View(a));assertUpper(a.upperCombat,a);}
export function assertGameRun(r:unknown):asserts r is GameRun{if((r as GameRun)?.version===14)assertUpper14(r);else assertOld(r);}
