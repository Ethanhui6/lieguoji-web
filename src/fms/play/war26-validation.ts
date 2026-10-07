import type {War26State} from './war26-state';
import type {World} from '../../sim/types';
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:unknown,allowed:string[])=>record(v)&&Object.keys(v).every(k=>allowed.includes(k));
const integer=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
export function assertWar26Schema(v:unknown){
 const fail=()=>{throw Error('战争目标含未来规则或未知字段，已锁定读写。');};if(!record(v))return;
 if(v.version!=null&&v.version!==1||!keys(v,['version','revision','campaigns']))fail();
 if(Array.isArray(v.campaigns))for(const c of v.campaigns){if(!keys(c,['id','a','b','sinceDay','openedTick','endedTick','initialOwners','goals']))fail();if(record(c)&&Array.isArray(c.goals))for(const g of c.goals)if(!keys(g,['nationId','enemyId','provinceIds','requestedCount','entry']))fail();}
}
export function assertWar26(v:unknown,w:World,tick:number):asserts v is War26State{
 assertWar26Schema(v);const fail=()=>{throw Error('战争目标状态损坏，保留上一进度。');};if(!record(v)||v.version!==1||!integer(v.revision,0,Number.MAX_SAFE_INTEGER)||!Array.isArray(v.campaigns)||v.campaigns.length>1700)return fail();
 const nations=new Set(w.nations.map(n=>n.id)),places=new Map(w.provinces.map(p=>[p.id,p])),ids=new Set<string>();
 for(const c of v.campaigns){if(!record(c)||typeof c.id!=='string'||ids.has(c.id)||typeof c.a!=='string'||typeof c.b!=='string'||c.a>=c.b||!nations.has(c.a)||!nations.has(c.b)||!integer(c.sinceDay,0,w.day)||c.id!==`${c.a}/${c.b}/${c.sinceDay}`||!integer(c.openedTick,0,tick)||c.endedTick!==null&&!integer(c.endedTick,c.openedTick as number,tick)||!record(c.initialOwners)||Object.keys(c.initialOwners).length!==places.size||Object.entries(c.initialOwners).some(([id,owner])=>!places.has(id)||typeof owner!=='string'||!nations.has(owner))||!Array.isArray(c.goals)||c.goals.length!==2)return fail();ids.add(c.id);
  for(let i=0;i<2;i++){const g=c.goals[i],us=i?c.b:c.a,enemy=i?c.a:c.b;if(!record(g)||g.nationId!==us||g.enemyId!==enemy||!integer(g.requestedCount,0,Object.values(c.initialOwners as Record<string,string>).filter(owner=>owner===enemy).length)||!['land','sea','unavailable'].includes(g.entry as string)||!Array.isArray(g.provinceIds)||g.provinceIds.length>(g.requestedCount as number)||new Set(g.provinceIds).size!==g.provinceIds.length||g.provinceIds.some(id=>typeof id!=='string'||(c.initialOwners as Record<string,string>)[id]!==enemy)||g.entry==='unavailable'&&g.provinceIds.length||g.entry!=='unavailable'&&!g.provinceIds.length)return fail();
   if(g.provinceIds.length){const seen=new Set<string>(),allowed=new Set<string>(g.provinceIds),queue=[g.provinceIds[0] as string];seen.add(queue[0]);for(let j=0;j<queue.length;j++)for(const id of places.get(queue[j])!.neighbors)if(allowed.has(id)&&!seen.has(id)){seen.add(id);queue.push(id);}if(seen.size!==allowed.size)return fail();}
  }
 }
 for(const r of w.statecraft!.relations){const c=v.campaigns.find(c=>c.id===`${r.a}/${r.b}/${r.sinceDay}`&&c.endedTick===null);if((r.status==='war')!==!!c)return fail();}
 if(v.campaigns.some(c=>c.endedTick===null&&!w.statecraft!.relations.some(r=>r.status==='war'&&r.a===c.a&&r.b===c.b&&r.sinceDay===c.sinceDay)))fail();
}
