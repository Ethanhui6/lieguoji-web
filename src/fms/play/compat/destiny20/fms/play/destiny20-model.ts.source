import {assertGameRun as assertOld,presentationOf as oldPresentation,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,type GameRun as OldRun,type Restoration19Run} from './restoration19-model';
import {assertPeople} from './restoration19-people';
import {assertNaming} from './restoration19-validation';
import {assertCulture} from './restoration19-culture';
import {assertSovereignty} from './restoration19-sovereignty';
import {assertDestiny,type DestinyState} from './destiny20-state';
import {assertDestinyStructure} from './destiny20-structure';
export type Destiny20Run=Omit<Restoration19Run,'version'|'rules'|'engine'>&{version:20;rules:'fms-destiny-20';engine:string;destiny:DestinyState};
export type GameRun=OldRun|Destiny20Run;
export function restoration19View(r:Destiny20Run):Restoration19Run{const {destiny,...base}=r;void destiny;return {...base,version:19,rules:'fms-restoration-19',engine:__FMS_RESTORATION19_ENGINE__};}
export const destiny20Wrap=(r:Restoration19Run,destiny:DestinyState):Destiny20Run=>({...r,version:20,rules:'fms-destiny-20',engine:__FMS_DESTINY20_ENGINE__,destiny});
export const court16View=(r:Parameters<typeof oldCourt>[0]|Destiny20Run)=>oldCourt(r.version===20?restoration19View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|Destiny20Run)=>oldChronicle(r.version===20?restoration19View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|Destiny20Run)=>oldCampaign(r.version===20?restoration19View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|Destiny20Run)=>oldTactics(r.version===20?restoration19View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===20?restoration19View(r):r);
export const gameStamp=(r:GameRun)=>`${r.version}/${r.engine}/${r.id}/${r.world.day}/${r.world.nextEventId}/${'clock'in r?r.clock.tick:0}/${'people'in r?r.people.revision:0}/${'culture'in r?r.culture.revision:0}/${'naming'in r?r.naming.revision:0}/${'sovereignty'in r?r.sovereignty.revision:0}/${r.version===20?r.destiny.revision:0}`;
export function assertDestiny20(r:unknown):asserts r is Destiny20Run{const a=r as Destiny20Run;if(a?.version!==20||a.rules!=='fms-destiny-20'||a.engine!==__FMS_DESTINY20_ENGINE__)throw Error('世界版本不同，已保留原档。');assertDestinyStructure(a);const v=restoration19View(a);assertPeople(a.people,a,a.sovereignty);assertNaming(a.naming,a);assertCulture(a.culture,a);assertSovereignty(a.sovereignty,a);assertDestiny(a.destiny,v);}
export function assertGameRun(r:unknown):asserts r is GameRun{if((r as GameRun)?.version===20)assertDestiny20(r);else assertOld(r);}
