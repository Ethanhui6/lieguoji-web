import {initialPorts40,assertPorts40,type Ports40} from './war40-ports';
import {initialGarrison40,assertGarrison40,type Garrison40} from './war40-garrison';
import {graphFor} from './naval-rules';
import {maritimeView} from './tactics-model';
import {tacticsView as campaignTacticsView} from './campaign-model';
import {initialDeployment40,assertDeployment40,assertDeploymentPorts40,type NavalDeployment40} from './war40-deployment';
import {initialAlliances40,assertAlliances40,type Alliances40} from './war40-alliance';
import {initialRebellion40,assertRebellion40,type Rebellion40} from './war40-rebellion';
import {assertWars40} from './war40-validation';
import type {War40Wars} from './war40-wars';
import {assertWar27Run} from './war27-model';
import {war27View} from './war28-model';
import {war28View} from './war29-model';
import {assertDiplomacy} from './war29-diplomacy';
import {initialTribute40,assertTribute40,type Tribute40} from './war40-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war39-model';
import {initialVassals40,assertVassals40,type Vassals40} from './war40-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war39-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy40,assertNativeDiplomacy40,type NativeDiplomacy40} from './war40-state';
export type War40Run=Omit<War29Run,'version'|'rules'|'engine'|'nativeWars'>&{version:40;rules:'fms-war-40';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy40;vassals:Vassals40;tribute:Tribute40;rebellion:Rebellion40;nativeWars:War40Wars;alliances:Alliances40;navalDeployment:NavalDeployment40;garrison:Garrison40;portControl:Ports40};
export type GameRun=OldRun|War40Run;
export function war29View(r:War40Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;void rebellion;void alliances;void navalDeployment;void garrison;void portControl;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war40Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy40,vassals:Vassals40=initialVassals40(),tribute:Tribute40=initialTribute40(r.world.day),rebellion:Rebellion40=initialRebellion40(r.world.day),alliances:Alliances40=initialAlliances40(r,true),navalDeployment:NavalDeployment40=initialDeployment40(r),garrison:Garrison40=initialGarrison40(r),portControl:Ports40=initialPorts40(r,graphFor(maritimeView(campaignTacticsView(campaignView(r)))))):War40Run=>({...r,version:40,rules:'fms-war-40',engine:__FMS_WAR40_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar40Candidate(r:War29Run):War40Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war40Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy40(base,'explicit-copy'));assertWar40Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War40Run)=>oldDynasty(r.version===40?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War40Run)=>oldVoyage(r.version===40?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War40Run)=>oldRestoration(r.version===40?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War40Run)=>oldCourt(r.version===40?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War40Run)=>oldChronicle(r.version===40?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War40Run)=>oldCampaign(r.version===40?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War40Run)=>oldTactics(r.version===40?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War40Run)=>oldMuster(r.version===40?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===40?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===40?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${r.rebellion.revision}/${r.alliances.revision}/${r.navalDeployment.revision}/${r.garrison.revision}/${r.portControl.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar40Live(v:unknown):asserts v is War40Run{const r=v as War40Run;if(r?.version!==40||r.rules!=='fms-war-40'||r.engine!==__FMS_WAR40_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute','rebellion','alliances','navalDeployment','garrison','portControl'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertWar27Run(war27View(war28View(war29View(r))));assertDiplomacy(r.diplomacy,r.world);assertWars40(r.nativeWars,r);assertNativeDiplomacy40(r.nativeDiplomacy,r);assertVassals40(r.vassals,r);assertTribute40(r.tribute,r);assertRebellion40(r.rebellion,r);assertAlliances40(r.alliances,r);assertDeployment40(r.navalDeployment,r);assertGarrison40(r.garrison,r);assertPorts40(r.portControl,r);}
export function assertWar40Run(v:unknown):asserts v is War40Run{assertWar40Live(v);assertPorts40(v.portControl,v,graphFor(maritimeView(campaignTacticsView(campaignView(v)))));assertDiplomaticGeography(v.diplomaticGeography,v);assertDeploymentPorts40(v.navalDeployment,graphFor(maritimeView(campaignTacticsView(campaignView(v)))));}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===40)assertWar40Run(v);else assertOld(v);}
