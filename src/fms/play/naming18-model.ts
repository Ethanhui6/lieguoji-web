import {assertGameRun as assertOld,presentationOf as oldPresentation,tacticsView as oldTactics,campaignView as oldCampaign,chronicleView as oldChronicle,court16View as previousCourtView,type Culture17Run,type GameRun as OldRun} from './culture17-model';
import {assertCourt16,type Court16Run} from './court16-model';
import {assertCultureSchema,assertCulture,type CultureState} from './naming18-culture';
import {assertNamingSchema,assertNaming} from './naming18-validation';
import type {NamingState} from './naming18-names';
export type Naming18Run=Omit<Court16Run,'version'|'rules'|'engine'>&{version:18;rules:'fms-naming-18';engine:string;culture:CultureState;naming:NamingState};
export type GameRun=OldRun|Naming18Run;
export function court16View(r:Naming18Run|Culture17Run):Court16Run{if(r.version===17)return previousCourtView(r);const {culture,naming,...base}=r;void culture;void naming;return {...base,version:16,rules:'fms-court-16',engine:__FMS_COURT16_ENGINE__};}
export const naming18Wrap=(r:Court16Run,culture:CultureState,naming:NamingState):Naming18Run=>({...r,version:18,rules:'fms-naming-18',engine:__FMS_NAMING18_ENGINE__,culture,naming});
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|Naming18Run)=>oldChronicle(r.version===18?court16View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|Naming18Run)=>oldCampaign(r.version===18?court16View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|Naming18Run)=>oldTactics(r.version===18?court16View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===18?court16View(r):r);
export const gameStamp=(r:GameRun)=>`${r.version}/${r.engine}/${r.id}/${r.world.day}/${r.world.nextEventId}/${'clock'in r?r.clock.tick:0}/${'people'in r?r.people.revision:0}/${'culture'in r?r.culture.revision:0}/${r.version===18?r.naming.revision:0}`;
export function assertNaming18(r:unknown):asserts r is Naming18Run{const a=r as Naming18Run;if(a?.version!==18||a.rules!=='fms-naming-18'||a.engine!==__FMS_NAMING18_ENGINE__)throw Error('世界版本不同，已保留原档。');assertNamingSchema(a.naming);assertCultureSchema(a.culture);assertCourt16(court16View(a));assertNaming(a.naming,a);assertCulture(a.culture,a);}
export function assertGameRun(r:unknown):asserts r is GameRun{if((r as GameRun)?.version===18)assertNaming18(r);else assertOld(r);}
