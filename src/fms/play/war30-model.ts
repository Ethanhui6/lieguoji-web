import {assertWar29Run,assertGameRun as assertOld,dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage,type War29Run,type GameRun as OldRun} from './war29-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
export type War30Run=Omit<War29Run,'version'|'rules'|'engine'>&{version:30;rules:'fms-war-30';engine:string;diplomaticGeography:DiplomaticGeography};
export type GameRun=OldRun|War30Run;
export function war29View(r:War30Run):War29Run{const {diplomaticGeography,...base}=r;void diplomaticGeography;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war30Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography):War30Run=>({...r,version:30,rules:'fms-war-30',engine:__FMS_WAR30_ENGINE__,diplomaticGeography});
/** Not wired to FmsGame until native diplomacy and the Worker are complete.
 * Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar30Candidate(r:War29Run):War30Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war30Wrap(base,buildDiplomaticGeography(base));assertWar30Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War30Run)=>oldDynasty(r.version===30?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War30Run)=>oldVoyage(r.version===30?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War30Run)=>oldRestoration(r.version===30?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War30Run)=>oldCourt(r.version===30?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War30Run)=>oldChronicle(r.version===30?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War30Run)=>oldCampaign(r.version===30?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War30Run)=>oldTactics(r.version===30?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War30Run)=>oldMuster(r.version===30?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===30?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===30?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${oldStamp(war29View(r))}`:oldStamp(r);
export function assertWar30Run(v:unknown):asserts v is War30Run{const r=v as War30Run;if(r?.version!==30||r.rules!=='fms-war-30'||r.engine!==__FMS_WAR30_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertWar29Run(war29View(r));assertDiplomaticGeography(r.diplomaticGeography,r);}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===30)assertWar30Run(v);else assertOld(v);}
