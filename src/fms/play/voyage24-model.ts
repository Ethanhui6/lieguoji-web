import {assertDynasty23,assertGameRun as assertOld,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,type Dynasty23Run,type GameRun as OldRun} from './dynasty23-model';
import {assertVoyages,type Voyages} from './voyage24-state';
export type Voyage24Run=Omit<Dynasty23Run,'version'|'rules'|'engine'>&{version:24;rules:'fms-voyage-24';engine:string;voyages:Voyages};
export type GameRun=OldRun|Voyage24Run;
export function dynasty23View(r:Voyage24Run):Dynasty23Run{const {voyages,...base}=r;void voyages;return {...base,version:23,rules:'fms-dynasty-23',engine:__FMS_DYNASTY23_ENGINE__};}
export const voyage24Wrap=(r:Dynasty23Run,voyages:Voyages):Voyage24Run=>({...r,version:24,rules:'fms-voyage-24',engine:__FMS_VOYAGE24_ENGINE__,voyages});
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|Voyage24Run)=>oldRestoration(r.version===24?dynasty23View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|Voyage24Run)=>oldCourt(r.version===24?dynasty23View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|Voyage24Run)=>oldChronicle(r.version===24?dynasty23View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|Voyage24Run)=>oldCampaign(r.version===24?dynasty23View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|Voyage24Run)=>oldTactics(r.version===24?dynasty23View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|Voyage24Run)=>oldMuster(r.version===24?dynasty23View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===24?dynasty23View(r):r);
export const gameStamp=(r:GameRun)=>r.version===24?`${r.version}/${r.engine}/${oldStamp(dynasty23View(r))}/${r.voyages.revision}`:oldStamp(r);
export function assertVoyage24(v:unknown):asserts v is Voyage24Run{const r=v as Voyage24Run;if(r?.version!==24||r.rules!=='fms-voyage-24'||r.engine!==__FMS_VOYAGE24_ENGINE__)throw Error('远征世界版本不同，已保留原档。');const old=dynasty23View(r);assertDynasty23(old);assertVoyages(r.voyages,old);}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===24)assertVoyage24(v);else assertOld(v);}
