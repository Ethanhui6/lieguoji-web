import {assertGameRun as assertOld,presentationOf as oldPresentation,tacticsView as oldTactics,campaignView as oldCampaign,chronicleView as oldChronicle,type GameRun as OldRun,type Fiscal15Run} from './fiscal15-model';
import {assertPeople,type CourtPeople} from './court16-people';
export type Court16Run=Omit<Fiscal15Run,'version'|'rules'|'engine'>&{version:16;rules:'fms-court-16';engine:string;people:CourtPeople};
export type GameRun=OldRun|Court16Run;
export function fiscal15View(r:Court16Run):Fiscal15Run{const {people,...base}=r;void people;return {...base,version:15,rules:'fms-fiscal-15',engine:__FMS_FISCAL15_ENGINE__};}
export const court16Wrap=(r:Fiscal15Run,people:CourtPeople):Court16Run=>({...r,version:16,rules:'fms-court-16',engine:__FMS_COURT16_ENGINE__,people});
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|Court16Run)=>oldChronicle(r.version===16?fiscal15View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|Court16Run)=>oldCampaign(r.version===16?fiscal15View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|Court16Run)=>oldTactics(r.version===16?fiscal15View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===16?fiscal15View(r):r);
export const gameStamp=(r:GameRun)=>`${r.version}/${r.engine}/${r.id}/${r.world.day}/${r.world.nextEventId}/${'clock'in r?r.clock.tick:0}/${r.version===16?r.people.revision:0}`;
export function assertCourt16(r:unknown):asserts r is Court16Run{const a=r as Court16Run;if(a?.version!==16||a.rules!=='fms-court-16'||a.engine!==__FMS_COURT16_ENGINE__)throw Error('世界版本不同，已保留原档。');assertOld(fiscal15View(a));assertPeople(a.people,a);}
export function assertGameRun(r:unknown):asserts r is GameRun{if((r as GameRun)?.version===16)assertCourt16(r);else assertOld(r);}
