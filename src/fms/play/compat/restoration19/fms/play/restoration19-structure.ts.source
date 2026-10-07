import type {Restoration19Run} from './restoration19-model';
import type {ExpeditionRun,Transports} from './transport';
import {createMilitaryCore} from './restoration19-core';
import {assertFmsDocument} from '../model';
import {assertClock} from './clock';
import {assertNavy} from './navy';
import {assertBattles} from './battle';
import {assertOccupation} from './occupation';
import {assertMaritime,type MaritimeRun} from './maritime';
import {seaGraph,type SeaGraph} from './sea-path';
import {unitProfiles} from './military-profile';
import {assertChronicleState} from './chronicle-model';
import {assertTerrainContext} from './terrain13-context';
import {assertUpper} from './upper14-state';
import {assertFiscal} from './restoration19-state';
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
/** v19 validates unchanged structures directly. No fake cities, ownership
 * changes or shadow world are supplied to old validators. */
export function assertRestorationStructure(r:Restoration19Run){
 const fail=()=>{throw Error('复国世界数据无效，已保留原档。');};
 if(!exact(r,['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization','chronicle','terrainContext','upperCombat','finance','people','culture','naming','sovereignty']))fail();
 assertFmsDocument(r.terrain);
 if(r.terrain.elevations.some(h=>h!==Math.fround(h))||!r.units||typeof r.units!=='object'||Array.isArray(r.units)||!createMilitaryCore(r.units,true,true).validateWorld(r.world)||r.world.schemaVersion!==2||r.world.scenario!=='custom-world'||r.id!==r.world.custom?.id||r.scale!==1000/Math.max(r.terrain.width,r.terrain.height))fail();
 const g=seaGraph(r.terrain,r.world),m={...r,version:8 as const,rules:'fms-maritime-1' as const};
 assertClock(r.clock,r.world.day);assertNavy(r.navy,r.world,g);assertBattles(r.battles,r.world,r.clock.tick);assertOccupation(r.occupation,r.world,r.clock.tick);
 assertTransports(r.transports,{...r,version:7,rules:'fms-transport-1'},g);assertMaritime(r.maritime,m as MaritimeRun);
 assertTacticalState(r);assertReorganizationState(r);assertChronicleState(r.chronicle,r.world,r.clock.tick);assertTerrainContext(r.terrainContext,r.world,r.terrain.points.length);assertUpper(r.upperCombat,r);assertFiscal(r.finance,r);
}
function assertTacticalState(n:Restoration19Run){const fail=()=>{throw Error('战争编制或计时无效。');};
  const s=n.tactics;
  if(!exact(s,['version','nextArmyId','seed','forces','rounds','mobilizations','unopposed'])||s.version!==1||!Number.isSafeInteger(s.nextArmyId)||s.nextArmyId<1||!Number.isSafeInteger(s.seed)||s.seed<0||s.seed>0xffffffff||!['resistance','takeover'].includes(s.unopposed))fail();
  const armies=[...n.world.armies,...n.transports.cargo.map(c=>c.army)];
  if(!exact(s.forces,armies.map(a=>a.id))||!exact(s.mobilizations,n.world.nations.map(n=>n.id)))fail();
  if(!s.rounds||typeof s.rounds!=='object'||Array.isArray(s.rounds)||Object.entries(s.rounds).some(([id,t])=>!armies.some(a=>a.id===id)||!Number.isSafeInteger(t)||t<0||t>n.clock.tick+60))fail();
  for(const a of armies){const f=s.forces[a.id];if(!exact(f,['homeId','kind','fullStrength'])||!n.world.provinces.some(p=>p.id===f.homeId)||!['regular','emergency','manual'].includes(f.kind)||!Number.isInteger(f.fullStrength)||f.fullStrength<100||f.fullStrength>10000000)fail();}
  const month=Math.floor(n.world.day/30);
  for(const m of Object.values(s.mobilizations)){if(!exact(m,['lastMonth','recent'])||!Array.isArray(m.recent)||m.recent.length>3||m.recent.some((v,i)=>!Number.isInteger(v)||v<0||v>month||(i>0&&v<=m.recent[i-1]))||m.lastMonth!==(m.recent.at(-1)??null))fail();}
}
function assertReorganizationState(r:Restoration19Run){const fail=()=>{throw Error('重编记录无效。');};
const s=r.reorganization;
 if(!exact(s,['version','active','completed'])||s.version!==1)fail();
 for(const values of [s.active,s.completed])if(!values||typeof values!=='object'||Array.isArray(values))fail();
 const armies=[...r.world.armies,...r.transports.cargo.map(c=>c.army)];
 for(const [id,v]of Object.entries(s.active)){const a=r.world.armies.find(a=>a.id===id);if(!a||a.status==='destroyed'||a.troops<=0||r.tactics.forces[id].kind==='emergency'||!exact(v,['startedTick','fraction'])||!Number.isSafeInteger(v.startedTick)||v.startedTick<0||v.startedTick>r.clock.tick||!Number.isFinite(v.fraction)||v.fraction<0||v.fraction>=1)fail();}
 for(const [id,count]of Object.entries(s.completed))if(!armies.some(a=>a.id===id)||!Number.isSafeInteger(count)||count<1)fail();
}
export function assertTransports(value:unknown,r:Omit<ExpeditionRun,'transports'>,g:SeaGraph):asserts value is Transports{
  const s=value as Transports,fail=()=>{throw Error('运输状态或搭载引用损坏，已保留原档。');};
  if(!s||s.version!==1||Object.keys(s).sort().join()!=='cargo,version'||!Array.isArray(s.cargo)||s.cargo.length>200)fail();
  const ids=new Set(r.world.armies.map(a=>a.id)),fleets=new Set<string>();
  for(const c of s.cargo){
    if(!c||Object.keys(c).sort().join()!=='army,fleetId,fromPortId,targetPortId,unit'||!c.army)fail();
    const f=r.navy.fleets.find(f=>f.id===c.fleetId),origin=g.ports.find(p=>p.id===c.fromPortId);
    if(!f||f.status==='lost'||f.patrol||fleets.has(f.id)||!origin||c.army.provinceId!==origin.provinceId||c.army.nationId!==f.nationId||c.army.status!=='idle'||c.army.progress!==0||c.army.route.length||c.army.troops<=0||c.army.troops>f.ships*1000||ids.has(c.army.id)||!unitProfiles.some(u=>u.key===c.unit)||(c.targetPortId!==null&&!g.ports.some(p=>p.id===c.targetPortId)))fail();
    ids.add(c.army.id);fleets.add(f!.id);
    const target=g.ports.find(p=>p.id===(c.targetPortId??c.fromPortId));
    if(f!.status==='sailing'?(c.targetPortId!==f!.targetId):(!target||f!.node!==target.node))fail();
  }
  if(ids.size>500||!createMilitaryCore({...r.units,...Object.fromEntries(s.cargo.map(c=>[c.army.id,c.unit]))},true,true).validateWorld({...r.world,armies:[...r.world.armies,...s.cargo.map(c=>c.army)]}))fail();
}

