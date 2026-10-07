import type {War35Run} from './war35-model';
import {nativeTributeAmount,nativeTributePayment} from './native-war/vassal-tribute';
import {nationsAtWar} from './tactics-statecraft';
import {isoPlusDays} from './native-economy/iso-calendar';

export type TributeReceipt35={id:number;vassalId:string;overlordId:string;relationIndex:number;tick:number;day:number;year:number;month:12;dateDay:number;status:'paid'|'insufficient'|'at-war';amount:number|null;income:number;rate:number;openingGold:number;closingGold:number;openingOverlordGold:number;closingOverlordGold:number};
export type Tribute35={version:1;revision:number;originDay:number;lastDay:number;enabled:boolean;nextId:number;receipts:TributeReceipt35[]};
// Explicit web default: enable the recovered tribute slice. Auto-rebellion is
// not claimed implemented by this separate, clearly named web switch.
export const initialTribute35=(day:number):Tribute35=>({version:1,revision:0,originDay:day,lastDay:day,enabled:true,nextId:1,receipts:[]});
const bump=(s:Tribute35)=>{if(!Number.isSafeInteger(s.revision+1))throw Error('贡金记录超过安全范围。');s.revision++;};
export function setTribute35(r:War35Run,enabled:boolean,revision:number){
 if(typeof enabled!=='boolean'||revision!==r.tribute.revision)throw Error('贡金设置已变化，请重新预览。');
 if(r.tribute.enabled!==enabled){r.tribute.enabled=enabled;bump(r.tribute);}
}
export function nextTribute35(r:War35Run,updateDay:number){
 const d=r.life.currentDate;return {year:d.year+(d.month===12&&d.day>=updateDay?1:0),month:12,day:updateDay};
}
export function quoteTribute35(r:War35Run,vassalId:string){
 const v=r.vassals.records.find(v=>v.vassalId===vassalId&&v.endedTick===null);if(!v)return null;
 const account=r.finance.nations[vassalId];return {amount:nativeTributeAmount(account.goldPerMonth,v.tributeRate),next:nextTribute35(r,v.updateDay)};
}
/** Called after the day's fiscal, peace and diplomatic updates, before commit.
 * The existing fiscal 30-day calendar remains unchanged; due dates use the
 * actual life calendar. Disabled/missed dates are never retroactively billed. */
export function advanceTribute35(r:War35Run){
 const s=r.tribute;if(r.world.day===s.lastDay)return;
 if(r.world.day!==s.lastDay+1)throw Error('贡金日历不连续，已取消本批。');
 s.lastDay=r.world.day;bump(s);
 const date=r.life.currentDate;if(!s.enabled||date.month!==12)return;
 const alive=new Set(r.world.provinces.map(p=>p.controller));
 for(const [relationIndex,v] of r.vassals.records.entries()){
  if(v.endedTick!==null||v.updateDay!==date.day||!alive.has(v.vassalId)||!alive.has(v.overlordId))continue;
  const a=r.finance.nations[v.vassalId],b=r.finance.nations[v.overlordId];
  const payment=nativeTributePayment({gold:a.gold,overlordGold:b.gold,goldPerMonth:a.goldPerMonth,rate:v.tributeRate,atWar:nationsAtWar(r.world,v.vassalId,v.overlordId)});
  if(!Number.isSafeInteger(s.nextId+1))throw Error('贡金序号超过安全范围。');
  s.receipts.push({id:s.nextId++,vassalId:v.vassalId,overlordId:v.overlordId,relationIndex,tick:r.clock.tick,day:r.world.day,year:date.year,month:12,dateDay:date.day,status:payment.status,amount:payment.amount,income:a.goldPerMonth,rate:v.tributeRate,openingGold:a.gold,closingGold:payment.gold,openingOverlordGold:b.gold,closingOverlordGold:payment.overlordGold});
  a.gold=payment.gold;b.gold=payment.overlordGold;
 }
 // UI audit ledger is a web addition; it does not create daily headline spam.
 s.receipts=s.receipts.slice(-256);
}
const stateKeys=['version','revision','originDay','lastDay','enabled','nextId','receipts'];
const receiptKeys=['id','vassalId','overlordId','relationIndex','tick','day','year','month','dateDay','status','amount','income','rate','openingGold','closingGold','openingOverlordGold','closingOverlordGold'];
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
export function assertTributeSchema35(v:unknown){const s=v as Tribute35|undefined;
 if(unknown(s,stateKeys)||s?.version!=null&&s.version!==1||Array.isArray(s?.receipts)&&s.receipts.some(v=>unknown(v,receiptKeys)||v?.status!=null&&!['paid','insufficient','at-war'].includes(v.status)))throw Error('贡金记录含未来规则或未知字段，已锁定读写。');
}
export function assertTribute35(s:Tribute35,r:War35Run){
 assertTributeSchema35(s);const fail=()=>{throw Error('贡金记录损坏，已保留原档。');};
 const int=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
 const money=(v:unknown)=>int(v,-2147483648,2147483647);
 if(!record(s)||Object.keys(s).length!==stateKeys.length||s.version!==1||!int(s.revision)||!int(s.originDay,0,r.world.day)||s.lastDay!==r.world.day||typeof s.enabled!=='boolean'||!int(s.nextId,1)||!Array.isArray(s.receipts)||s.receipts.length>256)return fail();
 let previous=0,lastTick=0;const dates=new Set<string>();
 for(const row of s.receipts){
  if(!record(row)||Object.keys(row).length!==receiptKeys.length||!int(row.id,previous+1,s.nextId-1)||!int(row.day,s.originDay+1,r.world.day)||!int(row.tick,lastTick,r.clock.tick)||row.tick!==row.day*120||!int(row.year,1,r.life.currentDate.year)||row.month!==12||!int(row.dateDay,1,27)||!int(row.relationIndex,0,r.vassals.records.length-1)||![row.income,row.openingGold,row.closingGold,row.openingOverlordGold,row.closingOverlordGold].every(money))return fail();
  const v=r.vassals.records[row.relationIndex],date=isoPlusDays(r.life.startDate,row.day-r.life.originDay);
  if(!v||v.vassalId!==row.vassalId||v.overlordId!==row.overlordId||v.tick>row.tick||v.endedTick!==null&&v.endedTick<row.tick||row.rate!==v.tributeRate||row.dateDay!==v.updateDay||date.year!==row.year||date.month!==12||date.day!==row.dateDay)return fail();
  const key=JSON.stringify([row.relationIndex,row.year]);if(dates.has(key))return fail();dates.add(key);
  let expected;try{expected=nativeTributePayment({gold:row.openingGold,overlordGold:row.openingOverlordGold,goldPerMonth:row.income,rate:row.rate,atWar:row.status==='at-war'});}catch{return fail();}
  if(expected.status!==row.status||expected.amount!==row.amount||expected.gold!==row.closingGold||expected.overlordGold!==row.closingOverlordGold)return fail();
  previous=row.id;lastTick=row.tick;
 }
 if(s.receipts.length&&(previous!==s.nextId-1||s.receipts[0].id!==s.nextId-s.receipts.length)||!s.receipts.length&&s.nextId!==1)return fail();
}
