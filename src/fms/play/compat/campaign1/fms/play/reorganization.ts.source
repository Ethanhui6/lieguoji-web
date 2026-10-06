import type {Army} from '../../sim/types';
import {sourceLegionStrength,musterEvent} from './tactics-muster';
import {TACTICS_SECOND} from './tactics-rules';
import {tacticsView,type CampaignRun} from './campaign-model';
export const reorganizationDuration=(population:number)=>20-10*Math.max(0,Math.min(25000,population))/25000;
export function reorganizationStrength(r:CampaignRun,homeId:string){
 const values=r.world.statecraft!.provinces.map(p=>p.population).sort((a,b)=>a-b),i=values.length>>1,median=values.length%2?values[i]:(values[i-1]+values[i])/2;
 return sourceLegionStrength(r.world.statecraft!.provinces.find(p=>p.provinceId===homeId)!.population,median);
}
const living=(a:Army)=>a.status!=='destroyed'&&a.troops>0;
function event(r:CampaignRun,text:string,reason:string){const view=tacticsView(r);musterEvent(view,text,reason);r.world=view.world;}
/** Advance every authoritative tick, retaining fractional soldiers in the save.
 * Movement and damage remain active. Embarkation is blocked by the new facade
 * until completion; native reorganization-at-sea is not yet recovered. */
export function progressReorganization(r:CampaignRun){
 for(const [id,state]of Object.entries(r.reorganization.active)){
  const a=r.world.armies.find(a=>a.id===id);if(!a||!living(a)){delete r.reorganization.active[id];continue;}
  const home=r.tactics.forces[id].homeId,p=r.world.provinces.find(p=>p.id===home)!;
  if(p.controller!==a.nationId||p.legalOwner!==a.nationId){delete r.reorganization.active[id];event(r,`${a.name}停止重编`,'故乡已经失守，现有兵员保留；未继续凭空补充。');continue;}
  const full=reorganizationStrength(r,home),pop=r.world.statecraft!.provinces.find(p=>p.provinceId===home)!.population;
  const amount=full/(reorganizationDuration(pop)*TACTICS_SECOND)+state.fraction,whole=Math.floor(amount);state.fraction=amount-whole;
  a.troops=Math.min(full,a.troops+whole);r.tactics.forces[id].fullStrength=full;
  if(a.troops>=full){delete r.reorganization.active[id];r.reorganization.completed[id]=(r.reorganization.completed[id]??0)+1;event(r,`${a.name}完成重编`,`故乡军团已恢复至当前满编 ${full} 人；沿用原军团编号与兵种。`);}
 }
}
/** Only losses produced by this land tick may return; never revive historical
 * dead records, retired emergency armies or passengers lost with their ship. */
export function startReorganization(before:CampaignRun,r:CampaignRun){
 const previous=new Map(before.world.armies.filter(living).map(a=>[a.id,a]));
 const defeated=r.world.armies.filter(a=>previous.has(a.id)&&!living(a));
 const current=[...r.world.armies,...r.transports.cargo.map(c=>c.army)];
 for(const a of defeated){
  delete r.reorganization.active[a.id];const f=r.tactics.forces[a.id],home=r.world.provinces.find(p=>p.id===f.homeId)!;
  const homeCount=current.filter(other=>(living(other)||defeated.includes(other))&&other.nationId===a.nationId&&r.tactics.forces[other.id].homeId===home.id).length;
  if(f.kind==='emergency'||home.controller!==a.nationId||home.legalOwner!==a.nationId||homeCount>1)continue;
  const full=reorganizationStrength(r,home.id);Object.assign(a,{provinceId:home.id,originId:home.id,status:'idle',route:[],progress:0,troops:Math.max(1,Math.floor(full*.1)),morale:80,supplies:100});
  f.fullStrength=full;delete r.tactics.rounds[a.id];delete r.battles.plans[a.id];
  r.reorganization.active[a.id]={startedTick:r.clock.tick,fraction:0};
  event(r,`${a.name}在故乡重编`,`军团在战场被击溃后于${home.name}重新集结，以一成兵力连续补员；可移动和参战，仍会遭受损失。`);
 }
}
