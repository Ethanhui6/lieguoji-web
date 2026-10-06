import {assertGameRun as assertOld,assertTactics,maritimeView,type GameRun as OldRun,type TacticsRun} from './tactics-model';
export type Reorganization={version:1;active:Record<string,{startedTick:number;fraction:number}>;completed:Record<string,number>};
export type CampaignRun=Omit<TacticsRun,'version'|'rules'|'engine'> & {version:10;rules:'fms-campaign-1';engine:string;reorganization:Reorganization};
export type GameRun=OldRun|CampaignRun;
export function tacticsView(r:CampaignRun):TacticsRun{const {reorganization,...rest}=r;void reorganization;return {...rest,version:9,rules:'fms-tactics-1',engine:__FMS_TACTICS_ENGINE__};}
export const campaignWrap=(r:TacticsRun,reorganization:Reorganization):CampaignRun=>({...r,version:10,rules:'fms-campaign-1',engine:__FMS_CAMPAIGN_ENGINE__,reorganization});
export const withCampaign=(r:TacticsRun)=>campaignWrap(r,{version:1,active:{},completed:{}});
export const presentationOf=(r:GameRun)=>r.version===10?maritimeView(tacticsView(r)):r.version===9?maritimeView(r):r;
export const gameStamp=(r:GameRun)=>`${r.version}/${r.engine}/${r.id}/${r.world.day}/${r.world.nextEventId}/${'clock'in r?r.clock.tick:0}`;
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function assertCampaign(raw:unknown):asserts raw is CampaignRun{
 const r=raw as CampaignRun,fail=()=>{throw Error('重编世界数据无效，已保留原档。');};
 if(!exact(r,['version','rules','engine','id','terrain','scale','world','units','navy','clock','battles','occupation','transports','maritime','tactics','reorganization'])||r.version!==10||r.rules!=='fms-campaign-1'||r.engine!==__FMS_CAMPAIGN_ENGINE__)fail();
 assertTactics(tacticsView(r));const s=r.reorganization;
 if(!exact(s,['version','active','completed'])||s.version!==1)fail();
 for(const values of [s.active,s.completed])if(!values||typeof values!=='object'||Array.isArray(values))fail();
 const armies=[...r.world.armies,...r.transports.cargo.map(c=>c.army)];
 for(const [id,v]of Object.entries(s.active)){const a=r.world.armies.find(a=>a.id===id);if(!a||a.status==='destroyed'||a.troops<=0||r.tactics.forces[id].kind==='emergency'||!exact(v,['startedTick','fraction'])||!Number.isSafeInteger(v.startedTick)||v.startedTick<0||v.startedTick>r.clock.tick||!Number.isFinite(v.fraction)||v.fraction<0||v.fraction>=1)fail();}
 for(const [id,count]of Object.entries(s.completed))if(!armies.some(a=>a.id===id)||!Number.isSafeInteger(count)||count<1)fail();
}
export function assertGameRun(r:unknown):asserts r is GameRun{if((r as GameRun)?.version===10)assertCampaign(r);else assertOld(r);}
