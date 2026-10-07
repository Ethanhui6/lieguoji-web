import type {World} from '../../sim/types';
import type {War26State} from './war26-state';

/** Web accounting, not the native kill/death unit or a war-score formula.
 * Every amount comes from a real deduction, never a before/after tick total.
 * Multi-enemy and inherited fractional damage remain explicitly unassigned. */
export const lossKinds=['combat','pursuit','rout','starvation','crew','hull','ships','cargo'] as const;
export type LossKind=typeof lossKinds[number];
export type LossCounts=Record<LossKind,number>;
export type LossAccount={total:LossCounts;unassigned:LossCounts};
export type LossCampaign={history:'complete'|'since-copy'|'unknown';fromTick:number;losses:Record<string,LossCounts>};
export type LossLedger={version:1;revision:number;originTick:number;source:'new-world'|'copy';nations:Record<string,LossAccount>;campaigns:Record<string,LossCampaign>};
export type LossSink=(nationId:string,kind:LossKind,amount:number,enemies?:string[])=>void;
export const zeroLosses=():LossCounts=>({combat:0,pursuit:0,rout:0,starvation:0,crew:0,hull:0,ships:0,cargo:0});
export function initialLosses(w:World,war:War26State,tick:number,copy:boolean):LossLedger{
 const ledger:LossLedger={version:1,revision:0,originTick:tick,source:copy?'copy':'new-world',nations:{},campaigns:{}};
 reconcileLosses(ledger,w,war,tick);
 if(copy)for(const c of war.campaigns)ledger.campaigns[c.id].history=c.endedTick===null?'since-copy':'unknown';
 return ledger;
}
export function reconcileLosses(s:LossLedger,w:World,war:War26State,tick:number){
 let changed=false;
 for(const n of w.nations)if(!s.nations[n.id]){s.nations[n.id]={total:zeroLosses(),unassigned:zeroLosses()};changed=true;}
 for(const c of war.campaigns)if(!s.campaigns[c.id]){s.campaigns[c.id]={history:'complete',fromTick:tick,losses:{[c.a]:zeroLosses(),[c.b]:zeroLosses()}};changed=true;}
 const ids=new Set(war.campaigns.map(c=>c.id));
 for(const id of Object.keys(s.campaigns))if(!ids.has(id)){delete s.campaigns[id];changed=true;}
 if(changed)s.revision=add(s.revision,1);
}
function add(a:number,b:number){const n=a+b;if(!Number.isSafeInteger(n)||n<0)throw Error('战损记录超过安全范围，此批未提交。');return n;}
/** A multi-country contact is counted once in the nation's unassigned bucket.
 * Do not credit its entire loss to every simultaneous bilateral campaign. */
export function lossRecorder(s:LossLedger,war:War26State):LossSink{
 return (nationId,kind,amount,enemies=[])=>{
  if(!Number.isSafeInteger(amount)||amount<0)throw Error('战损记录数值无效。');
  if(!amount)return;
  const account=s.nations[nationId];if(!account||!lossKinds.includes(kind))throw Error('战损所属国家或单位无效。');
  const sources=[...new Set(enemies)],campaign=sources.length===1&&kind!=='rout'&&kind!=='starvation'?war.campaigns.find(c=>c.endedTick===null&&((c.a===nationId&&c.b===sources[0])||(c.b===nationId&&c.a===sources[0]))):undefined;
  const target=campaign?s.campaigns[campaign.id]?.losses[nationId]:account.unassigned;
  if(!target)throw Error('战损缺少当前战争记录。');
  // Calculate first, then mutate this private command candidate together.
  const total=add(account.total[kind],amount),part=add(target[kind],amount),revision=add(s.revision,1);
  account.total[kind]=total;target[kind]=part;s.revision=revision;
 };
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const only=(v:unknown,keys:readonly string[])=>object(v)&&Object.keys(v).every(k=>keys.includes(k));
const exact=(v:unknown,keys:readonly string[])=>only(v,keys)&&Object.keys(v as object).length===keys.length;
const integer=(v:unknown,max=Number.MAX_SAFE_INTEGER)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
export function assertLossSchema(v:unknown){
 const fail=()=>{throw Error('战损记录含未来版本或未知字段，已锁定读写。');};
 if(!object(v))return;
 if(v.version!=null&&v.version!==1||!only(v,['version','revision','originTick','source','nations','campaigns']))fail();
 if(object(v.nations))for(const a of Object.values(v.nations)){if(!only(a,['total','unassigned']))fail();if(object(a))for(const field of ['total','unassigned'])if(object(a[field])&&!only(a[field],lossKinds))fail();}
 if(object(v.campaigns))for(const c of Object.values(v.campaigns)){if(!only(c,['history','fromTick','losses']))fail();if(object(c)&&object(c.losses))for(const n of Object.values(c.losses))if(object(n)&&!only(n,lossKinds))fail();}
}
export function assertLosses(v:unknown,w:World,war:War26State,tick:number):asserts v is LossLedger{
 assertLossSchema(v);const fail=()=>{throw Error('战损记录损坏，保留上一进度。');};
 if(!exact(v,['version','revision','originTick','source','nations','campaigns'])||!object(v)||v.version!==1||!integer(v.revision)||!integer(v.originTick,tick)||!['copy','new-world'].includes(v.source as string)||!exact(v.nations,w.nations.map(n=>n.id))||!exact(v.campaigns,war.campaigns.map(c=>c.id)))return fail();
 const s=v as unknown as LossLedger;
 const counts=(a:unknown)=>exact(a,lossKinds)&&Object.values(a as LossCounts).every(x=>integer(x));
 for(const a of Object.values(s.nations))if(!exact(a,['total','unassigned'])||!counts(a.total)||!counts(a.unassigned))return fail();
 for(const c of war.campaigns){const row=s.campaigns[c.id];if(!exact(row,['history','fromTick','losses'])||!['complete','since-copy','unknown'].includes(row.history)||!integer(row.fromTick,tick)||row.fromTick<s.originTick||!exact(row.losses,[c.a,c.b])||!Object.values(row.losses).every(counts)||row.history==='unknown'&&Object.values(row.losses).some(a=>Object.values(a).some(Boolean)))return fail();}
 for(const [id,a] of Object.entries(s.nations))for(const k of lossKinds){let sum=a.unassigned[k];for(const c of Object.values(s.campaigns)){sum+=c.losses[id]?.[k]??0;if(!integer(sum))return fail();}if(sum>a.total[k])return fail();}
}
