import {assertFmsRun,type FmsRun} from './world';
import type {MaritimeRun} from './maritime';
export type ForceOrigin={homeId:string;kind:'regular'|'emergency'|'manual';fullStrength:number};
export type TacticsState={version:1;nextArmyId:number;seed:number;forces:Record<string,ForceOrigin>;rounds:Record<string,number>;mobilizations:Record<string,{lastMonth:number|null;recent:number[]}>;unopposed:'resistance'|'takeover'};
export type TacticsRun=Omit<MaritimeRun,'version'|'rules'|'engine'> & {version:9;rules:'fms-tactics-1';engine:string;tactics:TacticsState};
export type GameRun=FmsRun|TacticsRun;
/** Shared structures only. This view must never be persisted or used to identify
 * an engine. The owner keeps the actual version 9 snapshot separately. */
export function maritimeView(r:TacticsRun):MaritimeRun{const {tactics,...rest}=r;void tactics;return {...rest,version:8,rules:'fms-maritime-1',engine:__FMS_PLAY_ENGINE__};}
export const presentationOf=(r:GameRun):FmsRun=>r.version===9?maritimeView(r):r;
export const gameStamp=(r:GameRun)=>`${r.version}/${r.engine}/${r.id}/${r.world.day}/${r.world.nextEventId}/${'clock'in r?r.clock.tick:0}`;
export const tacticsWrap=(r:MaritimeRun,tactics:TacticsState):TacticsRun=>({...r,version:9,rules:'fms-tactics-1',engine:__FMS_TACTICS_ENGINE__,tactics});
export function initialTactics(r:MaritimeRun):TacticsState{return {version:1,nextArmyId:1,seed:147901,rounds:{},unopposed:'takeover',forces:Object.fromEntries([...r.world.armies,...r.transports.cargo.map(c=>c.army)].map(a=>[a.id,{homeId:a.originId,kind:'regular',fullStrength:Math.max(1000,a.troops)}])),mobilizations:Object.fromEntries(r.world.nations.map(n=>[n.id,{lastMonth:null,recent:[]}]))};}
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function assertTactics(r:unknown):asserts r is TacticsRun{
  const n=r as TacticsRun,fail=()=>{throw Error('新版战争数据或规则无效，已保留原档。');};
  if(!exact(n,['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics'])||n.version!==9||n.rules!=='fms-tactics-1'||n.engine!==__FMS_TACTICS_ENGINE__)fail();
  assertFmsRun(maritimeView(n));
  const s=n.tactics;
  if(!exact(s,['version','nextArmyId','seed','forces','rounds','mobilizations','unopposed'])||s.version!==1||!Number.isSafeInteger(s.nextArmyId)||s.nextArmyId<1||!Number.isSafeInteger(s.seed)||s.seed<0||s.seed>0xffffffff||!['resistance','takeover'].includes(s.unopposed))fail();
  const armies=[...n.world.armies,...n.transports.cargo.map(c=>c.army)];
  if(!exact(s.forces,armies.map(a=>a.id))||!exact(s.mobilizations,n.world.nations.map(n=>n.id)))fail();
  if(!s.rounds||typeof s.rounds!=='object'||Array.isArray(s.rounds)||Object.entries(s.rounds).some(([id,t])=>!armies.some(a=>a.id===id)||!Number.isSafeInteger(t)||t<0||t>n.clock.tick+60))fail();
  for(const a of armies){const f=s.forces[a.id];if(!exact(f,['homeId','kind','fullStrength'])||!n.world.provinces.some(p=>p.id===f.homeId)||!['regular','emergency','manual'].includes(f.kind)||!Number.isInteger(f.fullStrength)||f.fullStrength<100||f.fullStrength>10000000)fail();}
  const month=Math.floor(n.world.day/30);
  for(const m of Object.values(s.mobilizations)){if(!exact(m,['lastMonth','recent'])||!Array.isArray(m.recent)||m.recent.length>3||m.recent.some((v,i)=>!Number.isInteger(v)||v<0||v>month||(i>0&&v<=m.recent[i-1]))||m.lastMonth!==(m.recent.at(-1)??null))fail();}
}
export function assertGameRun(r:unknown):asserts r is GameRun{if((r as GameRun)?.version===9)assertTactics(r);else assertFmsRun(r);}
