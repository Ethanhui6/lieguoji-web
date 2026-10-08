import {assertNavy} from './war42-navy';
import {harborCells42} from './war42-harbor';
import {initialPorts42,assertPorts42,type Ports42} from './war42-ports';
import {initialGarrison42,assertGarrison42,type Garrison42} from './war42-garrison';
import {graphFor} from './naval-rules';
import {maritimeView} from './tactics-model';
import {tacticsView as campaignTacticsView} from './campaign-model';
import {initialDeployment42,assertDeployment42,assertDeploymentPorts42,type NavalDeployment42} from './war42-deployment';
import {initialAlliances42,assertAlliances42,type Alliances42} from './war42-alliance';
import {initialRebellion42,assertRebellion42,type Rebellion42} from './war42-rebellion';
import {assertWars42} from './war42-validation';
import type {War42Wars} from './war42-wars';
import {assertWar27Run} from './war27-model';
import {war27View} from './war28-model';
import {war28View} from './war29-model';
import {assertDiplomacy} from './war29-diplomacy';
import {initialTribute42,assertTribute42,type Tribute42} from './war42-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war41-model';
import {initialVassals42,assertVassals42,type Vassals42} from './war42-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war41-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy42,assertNativeDiplomacy42,type NativeDiplomacy42} from './war42-state';
export type War42Run=Omit<War29Run,'version'|'rules'|'engine'|'nativeWars'>&{version:42;rules:'fms-war-42';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy42;vassals:Vassals42;tribute:Tribute42;rebellion:Rebellion42;nativeWars:War42Wars;alliances:Alliances42;navalDeployment:NavalDeployment42;garrison:Garrison42;portControl:Ports42};
export type GameRun=OldRun|War42Run;
export function war29View(r:War42Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;void rebellion;void alliances;void navalDeployment;void garrison;void portControl;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war42Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy42,vassals:Vassals42=initialVassals42(),tribute:Tribute42=initialTribute42(r.world.day),rebellion:Rebellion42=initialRebellion42(r.world.day),alliances:Alliances42=initialAlliances42(r,true),navalDeployment:NavalDeployment42=initialDeployment42(r),garrison:Garrison42=initialGarrison42(r),portControl:Ports42=initialPorts42(r,graphFor(maritimeView(campaignTacticsView(campaignView(r)))))):War42Run=>({...r,version:42,rules:'fms-war-42',engine:__FMS_WAR42_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar42Candidate(r:War29Run):War42Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war42Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy42(base,'explicit-copy'));assertWar42Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War42Run)=>oldDynasty(r.version===42?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War42Run)=>oldVoyage(r.version===42?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War42Run)=>oldRestoration(r.version===42?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War42Run)=>oldCourt(r.version===42?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War42Run)=>oldChronicle(r.version===42?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War42Run)=>oldCampaign(r.version===42?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War42Run)=>oldTactics(r.version===42?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War42Run)=>oldMuster(r.version===42?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===42?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===42?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${r.rebellion.revision}/${r.alliances.revision}/${r.navalDeployment.revision}/${r.garrison.revision}/${r.portControl.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar42Live(v:unknown):asserts v is War42Run{const r=v as War42Run;if(r?.version!==42||r.rules!=='fms-war-42'||r.engine!==__FMS_WAR42_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute','rebellion','alliances','navalDeployment','garrison','portControl'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 const graph=graphFor(maritimeView(campaignTacticsView(campaignView(r))));assertNavy(r.navy,r.world,graph);
 // Validate the extended sailing endpoint contract first, then give frozen
 // legacy validators a stationary navy projection only. Actual saved/rendered
 // positions and routes are NEVER replaced by that validation projection.
 for(const f of r.navy.fleets){const a=r.navalDeployment.fleets[f.id];if(f.status==='sailing'&&!f.targetId&&(!a?.returning||f.route.length!==1))throw Error('战后航段记录损坏。');if(a?.loiterNode!==null&&a?.loiterNode!==undefined&&(a.loiterNode!==f.route.at(-1)&&a.loiterNode!==f.node||!a.assignedPortId||!harborCells42(graph,a.assignedPortId).has(a.loiterNode)))throw Error('港湾游弋目标损坏。');}
 const base=war27View(war28View(war29View(r)));assertWar27Run({...base,navy:{...base.navy,fleets:base.navy.fleets.map(f=>({...f,route:[],progress:0,dockId:null,targetId:null,status:f.status==='lost'?'lost':'anchored'}))}});assertDiplomacy(r.diplomacy,r.world);assertWars42(r.nativeWars,r);assertNativeDiplomacy42(r.nativeDiplomacy,r);assertVassals42(r.vassals,r);assertTribute42(r.tribute,r);assertRebellion42(r.rebellion,r);assertAlliances42(r.alliances,r);assertDeployment42(r.navalDeployment,r);assertGarrison42(r.garrison,r);assertPorts42(r.portControl,r);}
export function assertWar42Run(v:unknown):asserts v is War42Run{assertWar42Live(v);assertPorts42(v.portControl,v,graphFor(maritimeView(campaignTacticsView(campaignView(v)))));assertDiplomaticGeography(v.diplomaticGeography,v);assertDeploymentPorts42(v.navalDeployment,graphFor(maritimeView(campaignTacticsView(campaignView(v)))));}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===42)assertWar42Run(v);else assertOld(v);}
