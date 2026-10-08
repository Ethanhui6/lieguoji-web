import {initialShipbuilding45,assertShipbuilding45,type Shipbuilding45} from './war45-shipbuilding';
import {buildHarbors45,graphFor45 as graphFor,assertHarbors45,assertHarborSchema45,type HarborLayout45} from './war45-geography';
import {assertNavy} from './war45-navy';
import {harborCells45} from './war45-harbor';
import {initialPorts45,assertPorts45,type Ports45} from './war45-ports';
import {initialGarrison45,assertGarrison45,type Garrison45} from './war45-garrison';
import {initialDeployment45,assertDeployment45,assertDeploymentPorts45,type NavalDeployment45} from './war45-deployment';
import {initialAlliances45,assertAlliances45,type Alliances45} from './war45-alliance';
import {initialRebellion45,assertRebellion45,type Rebellion45} from './war45-rebellion';
import {assertWars45} from './war45-validation';
import type {War45Wars} from './war45-wars';
import {assertWar27Run} from './war27-model';
import {war27View} from './war28-model';
import {war28View} from './war29-model';
import {assertDiplomacy} from './war29-diplomacy';
import {initialTribute45,assertTribute45,type Tribute45} from './war45-tribute';
import {assertWar29Run,type War29Run} from './war29-model';
import {assertGameRun as assertOld,type GameRun as OldRun} from './war44-model';
import {initialVassals45,assertVassals45,type Vassals45} from './war45-vassals';
import {dynasty23View as oldDynasty,restoration19View as oldRestoration,court16View as oldCourt,chronicleView as oldChronicle,campaignView as oldCampaign,tacticsView as oldTactics,presentationOf as oldPresentation,gameStamp as oldStamp,muster21View as oldMuster,voyage24View as oldVoyage} from './war44-model';
import {buildDiplomaticGeography,assertDiplomaticGeography,type DiplomaticGeography} from './war30-geography';
import {initialNativeDiplomacy45,assertNativeDiplomacy45,type NativeDiplomacy45} from './war45-state';
export type War45Run=Omit<War29Run,'version'|'rules'|'engine'|'nativeWars'>&{version:45;rules:'fms-war-45';engine:string;diplomaticGeography:DiplomaticGeography;nativeDiplomacy:NativeDiplomacy45;vassals:Vassals45;tribute:Tribute45;rebellion:Rebellion45;nativeWars:War45Wars;alliances:Alliances45;navalDeployment:NavalDeployment45;garrison:Garrison45;portControl:Ports45;harbors:HarborLayout45;shipbuilding:Shipbuilding45};
export type GameRun=OldRun|War45Run;
export function war29View(r:War45Run):War29Run{const {diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl,harbors,shipbuilding,...base}=r;void diplomaticGeography;void nativeDiplomacy;void vassals;void tribute;void rebellion;void alliances;void navalDeployment;void garrison;void portControl;void harbors;void shipbuilding;return {...base,version:29,rules:'fms-war-29',engine:__FMS_WAR29_ENGINE__};}
export const war45Wrap=(r:War29Run,diplomaticGeography:DiplomaticGeography,nativeDiplomacy:NativeDiplomacy45,vassals:Vassals45=initialVassals45(),tribute:Tribute45=initialTribute45(r.world.day),rebellion:Rebellion45=initialRebellion45(r.world.day),alliances:Alliances45=initialAlliances45(r,true),navalDeployment:NavalDeployment45=initialDeployment45(r),garrison:Garrison45=initialGarrison45(r),portControl:Ports45=initialPorts45(r,graphFor({...r,harbors:buildHarbors45(r,'preserved-anchor-v1')})),harbors:HarborLayout45=buildHarbors45(r,'preserved-anchor-v1'),shipbuilding:Shipbuilding45=initialShipbuilding45(r)):War45Run=>({...r,version:45,rules:'fms-war-45',engine:__FMS_WAR45_ENGINE__,diplomaticGeography,nativeDiplomacy,vassals,tribute,rebellion,alliances,navalDeployment,garrison,portControl,harbors,shipbuilding});
/** Explicit copy only: the existing run, IDs within its history, and DB remain
 * untouched. No old rule is run by pretending this candidate is v29. */
export function copyWar45Candidate(r:War29Run):War45Run{assertWar29Run(r);const base=structuredClone(r);base.id='fms-'+crypto.randomUUID();base.world.custom!.id=base.id;const result=war45Wrap(base,buildDiplomaticGeography(base),initialNativeDiplomacy45(base,'explicit-copy'));assertWar45Run(result);return result;}
export const dynasty23View=(r:Parameters<typeof oldDynasty>[0]|War45Run)=>oldDynasty(r.version===45?war29View(r):r);
export const voyage24View=(r:Parameters<typeof oldVoyage>[0]|War45Run)=>oldVoyage(r.version===45?war29View(r):r);
export const restoration19View=(r:Parameters<typeof oldRestoration>[0]|War45Run)=>oldRestoration(r.version===45?war29View(r):r);
export const court16View=(r:Parameters<typeof oldCourt>[0]|War45Run)=>oldCourt(r.version===45?war29View(r):r);
export const chronicleView=(r:Parameters<typeof oldChronicle>[0]|War45Run)=>oldChronicle(r.version===45?war29View(r):r);
export const campaignView=(r:Parameters<typeof oldCampaign>[0]|War45Run)=>oldCampaign(r.version===45?war29View(r):r);
export const tacticsView=(r:Parameters<typeof oldTactics>[0]|War45Run)=>oldTactics(r.version===45?war29View(r):r);
export const muster21View=(r:Parameters<typeof oldMuster>[0]|War45Run)=>oldMuster(r.version===45?war29View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===45?war29View(r):r);
export const gameStamp=(r:GameRun)=>r.version===45?`${r.version}/${r.engine}/${r.diplomaticGeography.binding}/${r.nativeDiplomacy.revision}/${r.nativeDiplomacy.draws}/${r.vassals.revision}/${r.tribute.revision}/${r.rebellion.revision}/${r.alliances.revision}/${r.navalDeployment.revision}/${r.garrison.revision}/${r.portControl.revision}/${r.shipbuilding.revision}/${oldStamp(war29View(r))}`:oldStamp(r);
/** Mutable-state guard for the session's privately owned, validated geometry.
 * Never use this in storage/load or to accept caller-owned terrain. */
export function assertWar45Live(v:unknown):asserts v is War45Run{const r=v as War45Run;if(r?.version!==45||r.rules!=='fms-war-45'||r.engine!==__FMS_WAR45_ENGINE__)throw Error('外交规则版本不同，已保留原档。');
 const keys=['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty','destiny','life','kin','voyages','generation','warfare','losses','nativeWars','diplomacy','diplomaticGeography','nativeDiplomacy','vassals','tribute','rebellion','alliances','navalDeployment','garrison','portControl','harbors','shipbuilding'];
 if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('外交存档含未来规则或未知字段，已锁定读写。');
 assertShipbuilding45(r.shipbuilding,r);assertHarborSchema45(r.harbors);const graph=graphFor(r);assertNavy(r.navy,r.world,graph);
 // Validate the extended sailing endpoint contract first, then give frozen
 // legacy validators a stationary navy projection only. Actual saved/rendered
 // positions and routes are NEVER replaced by that validation projection.
 for(const f of r.navy.fleets){const a=r.navalDeployment.fleets[f.id];if(f.status==='sailing'&&!f.targetId&&(!a?.returning||f.route.length!==1))throw Error('战后航段记录损坏。');if(a?.loiterNode!==null&&a?.loiterNode!==undefined&&(a.loiterNode!==f.route.at(-1)&&a.loiterNode!==f.node||!a.assignedPortId||!harborCells45(graph,a.assignedPortId).has(a.loiterNode)))throw Error('港湾游弋目标损坏。');}
 const base=war27View(war28View(war29View(r)));assertWar27Run({...base,navy:{...base.navy,fleets:base.navy.fleets.map(f=>({...f,route:[],progress:0,dockId:null,targetId:null,status:f.status==='lost'?'lost':'anchored'}))}});assertDiplomacy(r.diplomacy,r.world);assertWars45(r.nativeWars,r);assertNativeDiplomacy45(r.nativeDiplomacy,r);assertVassals45(r.vassals,r);assertTribute45(r.tribute,r);assertRebellion45(r.rebellion,r);assertAlliances45(r.alliances,r);assertDeployment45(r.navalDeployment,r);assertGarrison45(r.garrison,r);assertPorts45(r.portControl,r);}
export function assertWar45Run(v:unknown):asserts v is War45Run{assertHarbors45(v as War45Run);assertWar45Live(v);assertPorts45(v.portControl,v,graphFor(v));assertDiplomaticGeography(v.diplomaticGeography,v);assertDeploymentPorts45(v.navalDeployment,graphFor(v));}
export function assertGameRun(v:unknown):asserts v is GameRun{if((v as GameRun)?.version===45)assertWar45Run(v);else assertOld(v);}
