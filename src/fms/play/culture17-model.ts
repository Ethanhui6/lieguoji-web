import {assertGameRun as assertOld,presentationOf as oldPresentation,tacticsView as oldTactics,campaignView as oldCampaign,chronicleView as oldChronicle,type GameRun as OldRun,type Court16Run} from './court16-model';
import {assertCulture,type CultureState} from './culture17-culture';
export type Culture17Run=Omit<Court16Run,'version'|'rules'|'engine'>&{version:17;rules:'fms-culture-17';engine:string;culture:CultureState};
export type GameRun=OldRun|Culture17Run;
export function court16View(r:Culture17Run):Court16Run{const {culture,...base}=r;void culture;return {...base,version:16,rules:'fms-court-16',engine:__FMS_COURT16_ENGINE__};}
export const culture17Wrap=(r:Court16Run,culture:CultureState):Culture17Run=>({...r,version:17,rules:'fms-culture-17',engine:__FMS_CULTURE17_ENGINE__,culture});
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|Culture17Run)=>oldChronicle(r.version===17?court16View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|Culture17Run)=>oldCampaign(r.version===17?court16View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|Culture17Run)=>oldTactics(r.version===17?court16View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===17?court16View(r):r);
export const gameStamp=(r:GameRun)=>`${r.version}/${r.engine}/${r.id}/${r.world.day}/${r.world.nextEventId}/${'clock'in r?r.clock.tick:0}/${'people'in r?r.people.revision:0}/${r.version===17?r.culture.revision:0}`;
export function assertCulture17(r:unknown):asserts r is Culture17Run{const a=r as Culture17Run;if(a?.version!==17||a.rules!=='fms-culture-17'||a.engine!==__FMS_CULTURE17_ENGINE__)throw Error('世界版本不同，已保留原档。');assertOld(court16View(a));assertCulture(a.culture,a);}
export function assertGameRun(r:unknown):asserts r is GameRun{if((r as GameRun)?.version===17)assertCulture17(r);else assertOld(r);}
