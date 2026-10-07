import {assertNavy} from './war41-navy';
import {harborCells41} from './war41-harbor';
import {initialPorts41,assertPorts41,type Ports41} from './war41-ports';
import {initialGarrison41,assertGarrison41,type Garrison41} from './war41-garrison';
import {graphFor} from './naval-rules';
import {maritimeView} from './tactics-model';
import {tacticsView as campaignTacticsView} from './campaign-model';
import {initialDeployment41,assertDeployment41,assertDeploymentPorts41,type NavalDeployment41} from './war41-deployment';
import {initialAlliances41,assertAlliances41,type Alliances41} from './war41-alliance';
import {initialRebellion41,assertRebellion41,type Rebellion41} from './war41-rebellion';
import {assertWars41} from './war41-validation';
import type {War41Wars} from './war41-wars';
import {assertWar27Run} from './war27-model';
import {war27View} from './war28-model';
import {war28View} from './war29-model';
import {assertDiplomacy} from './war29-diplomacy';
import {initialTribute41,assertTribute41,type Tribute41} from './war41-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war40-model';
import {initialVassals41,assertVassals41,type Vassals41} from './war41-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war40-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy41,assertNativeDiplomacy41,type NativeDiplomacy41} from './war41-state';
export type War41Run=Omit<War29Run,'version'|'rules'|'engine'|'nativeWars'>&{version:41;rules:'fms-war-41';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy41;vassals:Vassals41;tribute:Tribute41;rebellion:Rebellion41;nativeWars:War41Wars;alliances:Alliances41;navalDeployment:NavalDeployment41;garrison:Garrison41;portControl:Ports41};
export type GameRun=OldRun|War41Run;
export function war29View(r:War41Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;void rebellion;void alliances;void navalDeployment;void garrison;void portControl;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war41Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy41,vassals:Vassals41=initialVassals41(),tribute:Tribute41=initialTribute41(r.world.day),rebellion:Rebellion41=initialRebellion41(r.world.day),alliances:Alliances41=initialAlliances41(r,true),navalDeployment:NavalDeployment41=initialDeployment41(r),garrison:Garrison41=initialGarrison41(r),portControl:Ports41=initialPorts41(r,graphFor(maritimeView(campaignTacticsView(campaignView(r)))))):War41Run=>({...r,version:41,rules:'fms-war-41',engine:__FMS_WAR41_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar41Candidate(r:War29Run):War41Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war41Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy41(base,'explicit-copy'));assertWar41Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War41Run)=>oldDynasty(r.version===41?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War41Run)=>oldVoyage(r.version===41?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War41Run)=>oldRestoration(r.version===41?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War41Run)=>oldCourt(r.version===41?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War41Run)=>oldChronicle(r.version===41?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War41Run)=>oldCampaign(r.version===41?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War41Run)=>oldTactics(r.version===41?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War41Run)=>oldMuster(r.version===41?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===41?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===41?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${r.rebellion.revision}/${r.alliances.revision}/${r.navalDeployment.revision}/${r.garrison.revision}/${r.portControl.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar41Live(v:unknown):asserts v is War41Run{const r=v as War41Run;if(r?.version!==41||r.rules!=='fms-war-41'||r.engine!==__FMS_WAR41_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute','rebellion','alliances','navalDeployment','garrison','portControl'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 const graph=graphFor(maritimeView(campaignTacticsView(campaignView(r))));assertNavy(r.navy,r.world,graph);
 // Validate the extended sailing endpoint contract first, then give frozen
 // legacy validators a stationary navy projection only. Actual saved/rendered
 // positions and routes are NEVER replaced by that validation projection.
 for(const f of r.navy.fleets){const a=r.navalDeployment.fleets[f.id];if(f.status==='sailing'&&!f.targetId&&(!a?.returning||f.route.length!==1))throw Error('战后航段记录损坏。');if(a?.loiterNode!==null&&a?.loiterNode!==undefined&&(a.loiterNode!==f.route.at(-1)&&a.loiterNode!==f.node||!a.assignedPortId||!harborCells41(graph,a.assignedPortId).has(a.loiterNode)))throw Error('港湾游弋目标损坏。');}
 const base=war27View(war28View(war29View(r)));assertWar27Run({...base,navy:{...base.navy,fleets:base.navy.fleets.map(f=>({...f,route:[],progress:0,dockId:null,targetId:null,status:f.status==='lost'?'lost':'anchored'}))}});assertDiplomacy(r.diplomacy,r.world);assertWars41(r.nativeWars,r);assertNativeDiplomacy41(r.nativeDiplomacy,r);assertVassals41(r.vassals,r);assertTribute41(r.tribute,r);assertRebellion41(r.rebellion,r);assertAlliances41(r.alliances,r);assertDeployment41(r.navalDeployment,r);assertGarrison41(r.garrison,r);assertPorts41(r.portControl,r);}
export function assertWar41Run(v:unknown):asserts v is War41Run{assertWar41Live(v);assertPorts41(v.portControl,v,graphFor(maritimeView(campaignTacticsView(campaignView(v)))));assertDiplomaticGeography(v.diplomaticGeography,v);assertDeploymentPorts41(v.navalDeployment,graphFor(maritimeView(campaignTacticsView(campaignView(v)))));}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===41)assertWar41Run(v);else assertOld(v);}
