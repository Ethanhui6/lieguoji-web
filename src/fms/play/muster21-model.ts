import {assertDestiny20,assertGameRun as assertOld,restoration19View as oldRestoration,destiny20Wrap,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,type GameRun as OldRun,type Destiny20Run} from './destiny20-model';
import type {Restoration19Run} from './restoration19-model';
import type {DestinyState} from './destiny20-state';
export type Muster21Run=Omit<Destiny20Run,'version'|'rules'|'engine'>&{version:21;rules:'fms-muster-21';engine:string};
export type GameRun=OldRun|Muster21Run;
/** Same persisted shape, new execution only. Unknown fields remain present. */
export const destiny20View=(r:Muster21Run):Destiny20Run=>({...r,version:20,rules:'fms-destiny-20',engine:__FMS_DESTINY20_ENGINE__});
export const restoration19View=(r:Destiny20Run|Muster21Run)=>oldRestoration(r.version===21?destiny20View(r):r);
export const muster21Wrap=(r:Restoration19Run,destiny:DestinyState):Muster21Run=>({...destiny20Wrap(r,destiny),version:21,rules:'fms-muster-21',engine:__FMS_MUSTER21_ENGINE__});
export const court16View=(r:Parameters<typeof oldCourt>[0]|Muster21Run)=>oldCourt(r.version===21?destiny20View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|Muster21Run)=>oldChronicle(r.version===21?destiny20View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|Muster21Run)=>oldCampaign(r.version===21?destiny20View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|Muster21Run)=>oldTactics(r.version===21?destiny20View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===21?destiny20View(r):r);
export const gameStamp=(r:GameRun)=>r.version===21?`${r.version}/${r.engine}/${oldStamp(destiny20View(r))}`:oldStamp(r);
export function assertMuster21(r:unknown):asserts r is Muster21Run{const a=r as Muster21Run;if(a?.version!==21||a.rules!=='fms-muster-21'||a.engine!==__FMS_MUSTER21_ENGINE__)throw Error('世界版本不同，已保留原档。');assertDestiny20(destiny20View(a));}
export function assertGameRun(r:unknown):asserts r is GameRun{if((r as GameRun)?.version===21)assertMuster21(r);else assertOld(r);}
