import type {War45Run} from './war45-model';
import {nativeNavyBuildMonths,nativeNavyQuota,nativeNavyQueueMonth,type NativeNavyQueue} from './native-war/naval-construction';
import traits from './native-economy/character-traits.json';
import {applyNaval,previewNaval} from './war45-navy';
import {inHarbor45} from './war45-harbor';
import {portAvailable45} from './war45-ports';
import type {SeaGraph} from './sea-path';
type Input=Pick<War45Run,'world'|'life'|'navy'|'people'|'culture'|'portControl'|'maritime'|'transports'|'clock'>;
type NationQueue=NativeNavyQueue&{lastMonth:number;completed:number;lastPortId:string|null;blocked:string|null};
export type Shipbuilding45={version:1;revision:number;rng:number;draws:number;nations:Record<string,NationQueue>};
const month=(r:Pick<Input,'life'>)=>r.life.currentDate.year*12+r.life.currentDate.month-1;
const empty=(m:number):NationQueue=>({lastMonth:m,queued:0,remaining:0,totalMonths:0,completed:0,lastPortId:null,blocked:null});
export function initialShipbuilding45(r:Pick<Input,'world'|'life'>):Shipbuilding45{
 let rng=2166136261;for(const c of `${r.world.custom!.seed}/shipyard45`)rng=Math.imul(rng^c.charCodeAt(0),16777619);
 return {version:1,revision:0,rng:rng>>>0,draws:0,nations:Object.fromEntries(r.world.nations.map(n=>[n.id,empty(month(r))]))};
}
const revise=(s:Shipbuilding45)=>{if(!Number.isSafeInteger(s.revision+1))throw Error('造船记录超过安全范围。');s.revision++;};
export function reconcileShipbuilding45(s:Shipbuilding45,r:Pick<Input,'world'|'life'>){for(const n of r.world.nations)if(!s.nations[n.id]){s.nations[n.id]=empty(month(r));revise(s);}}
/** Separate persisted web RNG; never consumes diplomacy RNG or claims Unity parity. */
function random(s:Shipbuilding45){if(!Number.isSafeInteger(s.draws+1))throw Error('造船随机记录超过安全范围。');s.rng=(s.rng+0x6d2b79f5)>>>0;let t=s.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);s.draws++;return ((t^(t>>>14))>>>0)/4294967296;}
export function shipbuildingQuote45(r:Input,id:string,g:SeaGraph){
 const controlled=g.ports.filter(p=>r.portControl.ports[p.provinceId]?.occupierId===id);
 const blocked=Object.values(r.portControl.ports).some(p=>p.landOwnerId===id&&p.occupierId!==id);
 const leaderId=r.people.nations[id]?.leaderId,leader=leaderId==null?undefined:r.people.persons[leaderId];
 const modifiers=leader?.alive?leader.traits.map(name=>traits.traits.find(t=>t.name===name)?.warshipBuildTimeMultiplier??1):[];
 return {controlled,blocked,months:nativeNavyBuildMonths(r.culture.nations[id]?.ethnic??'',modifiers,blocked),quota:nativeNavyQuota(controlled.length),active:r.navy.fleets.filter(f=>f.nationId===id&&f.status!=='lost').length};
}
/** Called once on the country's assigned monthly update, BEFORE diplomacy.
 * Web differences: existing excess fleets are retained (they may carry armies);
 * one completed native Navy maps to one existing 40-crew web ship. A blocked
 * launch waits for the next monthly check, preserving completed construction.
 * Crew/grain reserve, friendly land ownership and safe history caps still apply.
 */
export function advanceShipbuilding45(r:Input,s:Shipbuilding45,id:string,g:SeaGraph){
 reconcileShipbuilding45(s,r);const q=s.nations[id];if(q.lastMonth===month(r))return;
 if(q.lastMonth>month(r))throw Error('造船月份倒退，已取消推进。');q.lastMonth=month(r);q.blocked=null;
 const quote=shipbuildingQuote45(r,id,g);if(!nativeNavyQueueMonth(q,quote.controlled.length,quote.active,quote.months)){revise(s);return;}
 // Native SelectNavyBuildPort prefers ports with NO navy of ANY country.
 // Browser presence uses the very same wet harbor cells as battle and control.
 const free=quote.controlled.filter(p=>!r.navy.fleets.some(f=>f.status!=='lost'&&inHarbor45(g,p.id,f)));
 const pool=free.length?free:quote.controlled,port=pool[Math.floor(random(s)*pool.length)];
 const wait=(reason:string)=>{q.remaining=1;q.blocked=reason;revise(s);};
 if(!port||!free.length){wait('港湾已有舰队，等待空闲泊位。');return;}
 const action={type:'build-fleet' as const,nationId:id,portId:port.id,ships:1};
 const available=(province:string,nation:string)=>portAvailable45(r.portControl,province,nation);
 const preview=previewNaval(r.world,r.navy,g,action,available);if(!preview.valid){wait(preview.reason);return;}
 if(!Number.isSafeInteger(q.completed+1))throw Error('完工舰队计数超过安全范围。');
 const result=applyNaval(r.world,r.navy,g,action,{day:r.world.day,nextEventId:r.world.nextEventId},available);
 r.world=result.world;r.navy=result.navy;
 const fleet=r.navy.fleets.at(-1)!;r.maritime.hulls[fleet.id]=fleet.ships*100;
 q.completed++;q.lastPortId=port.id;revise(s);
}
const rootKeys=['version','revision','rng','draws','nations'],queueKeys=['lastMonth','queued','remaining','totalMonths','completed','lastPortId','blocked'];
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
export function assertShipbuildingSchema45(v:unknown){const s=v as Shipbuilding45|undefined;if(unknown(s,rootKeys)||s?.version!=null&&s.version!==1||record(s?.nations)&&Object.values(s.nations).some(q=>unknown(q,queueKeys)))throw Error('造船记录含未来规则或未知字段，已锁定读写。');}
export function assertShipbuilding45(s:Shipbuilding45,r:Pick<War45Run,'world'|'life'|'harbors'>){
 assertShipbuildingSchema45(s);const fail=()=>{throw Error('造船记录损坏，已保留原档。');};const int=(v:unknown,max=Number.MAX_SAFE_INTEGER)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
 if(!record(s)||Object.keys(s).length!==rootKeys.length||s.version!==1||!int(s.revision)||!int(s.rng,4294967295)||!int(s.draws)||!record(s.nations)||Object.keys(s.nations).length!==r.world.nations.length)return fail();
 for(const n of r.world.nations){const q=s.nations[n.id];if(!record(q)||Object.keys(q).length!==queueKeys.length||!int(q.lastMonth,month(r))||q.lastMonth<12||!int(q.queued,r.world.provinces.length)||!int(q.remaining,1000000)||!int(q.totalMonths,1000000)||q.remaining>q.totalMonths||!int(q.completed)||q.lastPortId!==null&&!r.harbors.sites.some(p=>p.id===q.lastPortId)||q.blocked!==null&&(typeof q.blocked!=='string'||!q.blocked||q.blocked.length>200)||q.blocked!==null&&q.remaining!==1)return fail();}
}
