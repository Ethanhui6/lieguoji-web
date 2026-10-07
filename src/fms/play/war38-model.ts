import {initialGarrison38,assertGarrison38,type Garrison38} from './war38-garrison';
import {graphFor} from './naval-rules';
import {maritimeView} from './tactics-model';
import {tacticsView as campaignTacticsView} from './campaign-model';
import {initialDeployment38,assertDeployment38,assertDeploymentPorts38,type NavalDeployment38} from './war38-deployment';
import {initialAlliances38,assertAlliances38,type Alliances38} from './war38-alliance';
import {initialRebellion38,assertRebellion38,type Rebellion38} from './war38-rebellion';
import {assertWars38} from './war38-validation';
import type {War38Wars} from './war38-wars';
import {assertWar27Run} from './war27-model';
import {war27View} from './war28-model';
import {war28View} from './war29-model';
import {assertDiplomacy} from './war29-diplomacy';
import {initialTribute38,assertTribute38,type Tribute38} from './war38-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war37-model';
import {initialVassals38,assertVassals38,type Vassals38} from './war38-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war37-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy38,assertNativeDiplomacy38,type NativeDiplomacy38} from './war38-state';
export type War38Run=Omit<War29Run,'version'|'rules'|'engine'|'nativeWars'>&{version:38;rules:'fms-war-38';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy38;vassals:Vassals38;tribute:Tribute38;rebellion:Rebellion38;nativeWars:War38Wars;alliances:Alliances38;navalDeployment:NavalDeployment38;garrison:Garrison38};
export type GameRun=OldRun|War38Run;
export function war29View(r:War38Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;void rebellion;void alliances;void navalDeployment;void garrison;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war38Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy38,vassals:Vassals38=initialVassals38(),tribute:Tribute38=initialTribute38(r.world.day),rebellion:Rebellion38=initialRebellion38(r.world.day),alliances:Alliances38=initialAlliances38(r,true),navalDeployment:NavalDeployment38=initialDeployment38(r),garrison:Garrison38=initialGarrison38(r)):War38Run=>({...r,version:38,rules:'fms-war-38',engine:__FMS_WAR38_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar38Candidate(r:War29Run):War38Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war38Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy38(base,'explicit-copy'));assertWar38Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War38Run)=>oldDynasty(r.version===38?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War38Run)=>oldVoyage(r.version===38?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War38Run)=>oldRestoration(r.version===38?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War38Run)=>oldCourt(r.version===38?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War38Run)=>oldChronicle(r.version===38?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War38Run)=>oldCampaign(r.version===38?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War38Run)=>oldTactics(r.version===38?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War38Run)=>oldMuster(r.version===38?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===38?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===38?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${r.rebellion.revision}/${r.alliances.revision}/${r.navalDeployment.revision}/${r.garrison.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar38Live(v:unknown):asserts v is War38Run{const r=v as War38Run;if(r?.version!==38||r.rules!=='fms-war-38'||r.engine!==__FMS_WAR38_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute','rebellion','alliances','navalDeployment','garrison'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertWar27Run(war27View(war28View(war29View(r))));assertDiplomacy(r.diplomacy,r.world);assertWars38(r.nativeWars,r);assertNativeDiplomacy38(r.nativeDiplomacy,r);assertVassals38(r.vassals,r);assertTribute38(r.tribute,r);assertRebellion38(r.rebellion,r);assertAlliances38(r.alliances,r);assertDeployment38(r.navalDeployment,r);assertGarrison38(r.garrison,r);}
export function assertWar38Run(v:unknown):asserts v is War38Run{assertWar38Live(v);assertDiplomaticGeography(v.diplomaticGeography,v);assertDeploymentPorts38(v.navalDeployment,graphFor(maritimeView(campaignTacticsView(campaignView(v)))));}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===38)assertWar38Run(v);else assertOld(v);}
