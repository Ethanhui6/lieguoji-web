import type {World} from '../../sim/types';
import type {ChronicleRun} from './chronicle-model';
import type {Dynasty23Run} from './dynasty23-model';
import type {GameCommand} from './voyage24-session';
import {graphFor} from './naval-rules';
import {campaignView} from './dynasty23-model';
import {tacticsView} from './campaign-model';
import {maritimeView} from './tactics-model';
export type VoyageMission={armyId:string;fleetId:string;fromPortId:string;toPortId:string;phase:'assembling'|'outbound'|'returning';startedTick:number};
export type Voyages={version:1;revision:number;enabled:Record<string,boolean>;missions:Record<string,VoyageMission>;decisions:Record<string,{atTick:number;text:string}>;nextCheck:Record<string,number>;manualArmies:string[];manualFleets:string[]};
export function initialVoyages(w:World):Voyages{return {version:1,revision:0,enabled:Object.fromEntries(w.nations.map(n=>[n.id,true])),missions:{},decisions:{},nextCheck:Object.fromEntries(w.nations.map(n=>[n.id,0])),manualArmies:[],manualFleets:[]};}
export function voyageDecision(s:Voyages,nationId:string,atTick:number,text:string){if(s.decisions[nationId]?.text!==text){s.decisions[nationId]={atTick,text};s.revision++;}}
export function reconcileVoyages(r:ChronicleRun,s:Voyages){
 for(const n of r.world.nations)if(!Object.hasOwn(s.enabled,n.id)){s.enabled[n.id]=true;s.nextCheck[n.id]=r.clock.tick;s.revision++;}
 for(const [id,m]of Object.entries(s.missions))if(!r.navy.fleets.some(f=>f.id===m.fleetId&&f.status!=='lost')||!r.transports.cargo.some(c=>c.army.id===m.armyId)&&!r.world.armies.some(a=>a.id===m.armyId&&a.status!=='destroyed')){delete s.missions[id];s.nextCheck[id]=r.clock.tick+1200;voyageDecision(s,id,r.clock.tick,'远征部队已损失，保留战史；重新评估兵力后再组织。');s.revision++;}
}
/** Explicit player orders reserve those actual IDs permanently from this AI.
 * Other units may still undertake overseas operations. No cancelled command
 * reaches this function; the session modifies a private candidate. */
export function yieldVoyages(s:Voyages,r:ChronicleRun,c:GameCommand){
 const armyId=c.type==='order'?c.order.armyId:'action'in c&&'armyId'in c.action?c.action.armyId:undefined;
 const fleetId='action'in c&&'fleetId'in c.action?c.action.fleetId:undefined;
 if(armyId&&!s.manualArmies.includes(armyId))s.manualArmies.push(armyId);
 if(fleetId&&!s.manualFleets.includes(fleetId))s.manualFleets.push(fleetId);
 for(const [id,m]of Object.entries(s.missions))if(m.armyId===armyId||m.fleetId===fleetId){delete s.missions[id];s.nextCheck[id]=r.clock.tick+120;voyageDecision(s,id,r.clock.tick,'玩家已接管该远征，自动调度不覆盖手动军令。');}
 if(armyId||fleetId)s.revision++;
}
const fields=['version','revision','enabled','missions','decisions','nextCheck','manualArmies','manualFleets'];
const missionFields=['armyId','fleetId','fromPortId','toPortId','phase','startedTick'];
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function assertVoyagesSchema(v:unknown){
 const unknown=(x:unknown,keys:string[])=>object(x)&&Object.keys(x).some(k=>!keys.includes(k));
 const s=v as Voyages;if(!s)return;
 if(s.version!=null&&s.version!==1||unknown(s,fields)||object(s.missions)&&Object.values(s.missions).some(m=>unknown(m,missionFields))||object(s.decisions)&&Object.values(s.decisions).some(d=>unknown(d,['atTick','text'])))throw Error('远征存档含未来规则或未知字段，已锁定读写。');
}
export function assertVoyages(v:unknown,r:Dynasty23Run){
 const s=v as Voyages,fail=()=>{throw Error('远征状态或引用损坏，已保留原档。');},integer=(n:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&Number(n)>=min&&Number(n)<=max,ids=r.world.nations.map(n=>n.id);
 if(!exact(s,fields)||s.version!==1||!integer(s.revision)||!exact(s.enabled,ids)||Object.values(s.enabled).some(v=>typeof v!=='boolean')||!exact(s.nextCheck,ids)||Object.values(s.nextCheck).some(t=>!integer(t,0,r.clock.tick+3600))||!object(s.missions)||!object(s.decisions))fail();
 const armies=[...r.world.armies,...r.transports.cargo.map(c=>c.army)],g=graphFor(maritimeView(tacticsView(campaignView(r))));
 if(!Array.isArray(s.manualArmies)||s.manualArmies.length>500||new Set(s.manualArmies).size!==s.manualArmies.length||s.manualArmies.some(id=>!armies.some(a=>a.id===id))||!Array.isArray(s.manualFleets)||s.manualFleets.length>200||new Set(s.manualFleets).size!==s.manualFleets.length||s.manualFleets.some(id=>!r.navy.fleets.some(f=>f.id===id)))fail();
 for(const [id,d]of Object.entries(s.decisions))if(!ids.includes(id)||!exact(d,['atTick','text'])||!integer(d.atTick,0,r.clock.tick)||typeof d.text!=='string'||!d.text||d.text.length>1000)fail();
 for(const [id,m]of Object.entries(s.missions)){
  if(!ids.includes(id)||!exact(m,missionFields)||!['assembling','outbound','returning'].includes(m.phase)||!integer(m.startedTick,0,r.clock.tick)||!g.ports.some(p=>p.id===m.fromPortId)||!g.ports.some(p=>p.id===m.toPortId)||!armies.some(a=>a.id===m.armyId&&a.nationId===id)||!r.navy.fleets.some(f=>f.id===m.fleetId&&f.nationId===id&&f.status!=='lost')||s.manualArmies.includes(m.armyId)||s.manualFleets.includes(m.fleetId))fail();
  const cargo=r.transports.cargo.find(c=>c.fleetId===m.fleetId);
  if(m.phase==='assembling'?!!cargo:!!cargo&&cargo.army.id!==m.armyId||m.phase==='outbound'&&!cargo)fail();
 }
}
