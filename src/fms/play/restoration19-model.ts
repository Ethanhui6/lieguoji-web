import {assertGameRun as assertOld,presentationOf as oldPresentation,tacticsView as oldTactics,campaignView as oldCampaign,chronicleView as oldChronicle,court16View as oldCourtView,type Naming18Run,type GameRun as OldRun} from './naming18-model';
import {type Court16Run} from './court16-model';
import {assertRestorationStructure} from './restoration19-structure';
import {assertPeople} from './restoration19-people';
import {assertCultureSchema,assertCulture,type CultureState} from './restoration19-culture';
import {assertNamingSchema,assertNaming} from './restoration19-validation';
import {assertSovereigntySchema,assertSovereignty,type Sovereignty} from './restoration19-sovereignty';
import type {NamingState} from './restoration19-names';
export type Restoration19Run=Omit<Naming18Run,'version'|'rules'|'engine'|'culture'|'naming'>&{version:19;rules:'fms-restoration-19';engine:string;culture:CultureState;naming:NamingState;sovereignty:Sovereignty};
export type GameRun=OldRun|Restoration19Run;
export function court16View(r:Parameters<typeof oldCourtView>[0]|Restoration19Run):Court16Run{if(r.version!==19)return oldCourtView(r);const {culture,naming,sovereignty,...base}=r;void culture;void naming;void sovereignty;return {...base,version:16,rules:'fms-court-16',engine:__FMS_COURT16_ENGINE__};}
export const restoration19Wrap=(r:Court16Run,culture:CultureState,naming:NamingState,sovereignty:Sovereignty):Restoration19Run=>({...r,version:19,rules:'fms-restoration-19',engine:__FMS_RESTORATION19_ENGINE__,culture,naming,sovereignty});
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|Restoration19Run)=>oldChronicle(r.version===19?court16View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|Restoration19Run)=>oldCampaign(r.version===19?court16View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|Restoration19Run)=>oldTactics(r.version===19?court16View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===19?court16View(r):r);
export const gameStamp=(r:GameRun)=>`${r.version}/${r.engine}/${r.id}/${r.world.day}/${r.world.nextEventId}/${'clock'in r?r.clock.tick:0}/${'people'in r?r.people.revision:0}/${'culture'in r?r.culture.revision:0}/${'naming'in r?r.naming.revision:0}/${r.version===19?r.sovereignty.revision:0}`;
export function assertRestoration19(r:unknown):asserts r is Restoration19Run{const a=r as Restoration19Run;if(a?.version!==19||a.rules!=='fms-restoration-19'||a.engine!==__FMS_RESTORATION19_ENGINE__)throw Error('世界版本不同，已保留原档。');assertNamingSchema(a.naming);assertCultureSchema(a.culture);assertSovereigntySchema(a.sovereignty);assertRestorationStructure(a);assertPeople(a.people,a,a.sovereignty);assertNaming(a.naming,a);assertCulture(a.culture,a);assertSovereignty(a.sovereignty,a);}
export function assertGameRun(r:unknown):asserts r is GameRun{if((r as GameRun)?.version===19)assertRestoration19(r);else assertOld(r);}
