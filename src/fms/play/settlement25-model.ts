import {assertVoyage24,assertGameRun as assertOld,dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,type Voyage24Run,type GameRun as OldRun} from './voyage24-model';
export type SettlementGeneration={version:1;method:'terrain-connected-unions-v1'|'preserved-world';cityCount:number;countryCount:number};
export type Settlement25Run=Omit<Voyage24Run,'version'|'rules'|'engine'>&{version:25;rules:'fms-settlement-25';engine:string;generation:SettlementGeneration};
export type GameRun=OldRun|Settlement25Run;
export function voyage24View(r:Settlement25Run):Voyage24Run{const {generation,...base}=r;void generation;return {...base,version:24,rules:'fms-voyage-24',engine:__FMS_VOYAGE24_ENGINE__};}
export const settlement25Wrap=(r:Voyage24Run,generation:SettlementGeneration):Settlement25Run=>({...r,version:25,rules:'fms-settlement-25',engine:__FMS_SETTLEMENT25_ENGINE__,generation});
export const dynasty23View=(r:Voyage24Run|Settlement25Run)=>oldDynasty(r.version===25?voyage24View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|Settlement25Run)=>oldRestoration(r.version===25?voyage24View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|Settlement25Run)=>oldCourt(r.version===25?voyage24View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|Settlement25Run)=>oldChronicle(r.version===25?voyage24View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|Settlement25Run)=>oldCampaign(r.version===25?voyage24View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|Settlement25Run)=>oldTactics(r.version===25?voyage24View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|Settlement25Run)=>oldMuster(r.version===25?voyage24View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===25?voyage24View(r):r);
export const gameStamp=(r:GameRun)=>r.version===25?`${r.version}/${r.engine}/${oldStamp(voyage24View(r))}`:oldStamp(r);
export function assertGenerationSchema(v:unknown){if(!v||typeof v!=='object')return;const r=v as Record<string,unknown>;if(r.version!=null&&r.version!==1||r.method!=null&&!['terrain-connected-unions-v1','preserved-world'].includes(r.method as string)||Object.keys(r).some(k=>!['version','method','cityCount','countryCount'].includes(k)))throw Error('建国配置含未来规则，已锁定读写。');}
export function assertSettlement25(v:unknown):asserts v is Settlement25Run{
 const r=v as Settlement25Run;if(r?.version!==25||r.rules!=='fms-settlement-25'||r.engine!==__FMS_SETTLEMENT25_ENGINE__)throw Error('辖区世界版本不同，已保留原档。');
 assertVoyage24(voyage24View(r));assertGenerationSchema(r.generation);const g=r.generation;
 if(!g||g.version!==1||!['terrain-connected-unions-v1','preserved-world'].includes(g.method)||!Number.isInteger(g.cityCount)||g.cityCount<1||g.cityCount>1000||!Number.isInteger(g.countryCount)||g.countryCount<1||g.countryCount>50||g.method==='terrain-connected-unions-v1'&&(g.cityCount<2||g.cityCount>480||g.countryCount<2||g.countryCount>24||g.countryCount>g.cityCount))throw Error('建国配置损坏，原档已保留。');
}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===25)assertSettlement25(v);else assertOld(v);}
