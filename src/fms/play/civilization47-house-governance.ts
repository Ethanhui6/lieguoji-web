import type {Population47,PopulationStamp47} from './civilization47-population-types';
import {populationStamp47} from './civilization47-population-types';
import {assertPopulation47} from './civilization47-population-validation';
import {grantHouseOwned47,houseHousehold47,houseLands47,houseTitle47} from './civilization47-houses';
import {announce} from './civilization47-history';
import {isoPlusDays} from './civilization47-iso-calendar';
import {familyMembersAt47} from './civilization47-generations-ledger';

type HouseReturn47={familyId:number;provinceId:string;day:number;tick:number;entryId:number};
export type HouseGovernance47={version:1;rule:'household-fiefs-web-v1';lastMonth:number;enabled:Record<string,boolean>;automatic:number[];returns:HouseReturn47[]};
const exact=(x:unknown,keys:string[])=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const month47=(r:Population47)=>r.life.currentDate.year*12+r.life.currentDate.month-1;
const entryMonth47=(r:Population47,day:number)=>{const d=isoPlusDays(r.life.startDate,day);return d.year*12+d.month-1;};
export function attachHouseGovernance47<T extends Population47>(r:T):T&{houseGovernance:HouseGovernance47}{
 if(r.clock.tick!==0||!r.houses||r.houseGovernance)throw Error('自主分封只能初始化新世界。');
 return {...r,houseGovernance:{version:1,rule:'household-fiefs-web-v1',lastMonth:12,enabled:Object.fromEntries(r.world.nations.map(n=>[n.id,true])),automatic:[],returns:[]}};
}
export function setHousePolicy47<T extends Population47>(input:T,nationId:string,enabled:boolean,expected:PopulationStamp47):T {
 assertPopulation47(input);const stamp=populationStamp47(input);
 if(!exact(expected,Object.keys(stamp))||Object.entries(stamp).some(([k,v])=>expected[k as keyof PopulationStamp47]!==v))throw Error('家族设置已过期，请重试。');
 if(!input.houseGovernance||!Object.hasOwn(input.houseGovernance.enabled,nationId)||typeof enabled!=='boolean'||input.kin.revision>=2147483647)throw Error('自主分封设置无效。');
 const r=structuredClone(input);r.houseGovernance!.enabled[nationId]=enabled;r.kin.revision++;return r;
}
/** Explicit web scheduling, NOT the unrecovered RedistributeTerritoriesForState.
 * Native creation/succession operate on actual people. No RNG or fake events.
 * One household per country per six calendar months, leaving a main demesne. */
export function advanceHouseGovernance47(r:Population47):void {
 const s=r.houseGovernance;if(!s)return;const month=month47(r);if(month===s.lastMonth)return;
 assertPopulation47(r);if(month!==s.lastMonth+1)throw Error('家族分封月份不连续。');
 s.lastMonth=month;
 for(const g of r.houses!.grants){
  const members=r.generations?familyMembersAt47(r,g.familyId):g.memberIds;
  if(houseTitle47(r,g.provinceId)!==g.familyId||members.some(id=>r.kin.persons[id].isAlive))continue;
  const land=r.world.provinces.find(p=>p.id===g.provinceId)!;
  // Occupation is not extinction, and foreign-held titles cannot be confiscated here.
  if(land.legalOwner!==g.nationId||land.controller!==g.nationId)continue;
  if(r.kin.revision>=2147483647)break;
  const e=announce(r.chronicle,r.world,r.clock.tick,'diplomacy',`${r.world.nations.find(n=>n.id===g.nationId)!.name}：${land.name}支系绝嗣，封地归还主家`,'该支系所有已登记成员均已去世，本国仍实控且拥有法理权属。保留家谱、历任家主与分封记录，释放封地供后续分配。',[g.nationId],g.provinceId);
  s.returns.push({familyId:g.familyId,provinceId:g.provinceId,day:r.world.day,tick:r.clock.tick,entryId:e.id});r.kin.revision++;
 }
 for(const n of r.world.nations){
  if(!s.enabled[n.id])continue;
  const last=r.houses!.grants.filter(g=>g.nationId===n.id&&s.automatic.includes(g.familyId)).at(-1);
  if(last&&month<entryMonth47(r,last.day)+6)continue;
  const controlled=r.world.provinces.filter(p=>p.legalOwner===n.id&&p.controller===n.id),main=r.people.nations[n.id].id;
  const liveBranches=Object.values(r.kin.families).filter(f=>f.nationId===n.id&&f.id!==main&&f.memberIds.some(id=>r.kin.persons[id].isAlive));
  if(controlled.length<6||liveBranches.length>=Math.min(6,Math.floor(controlled.length/4)))continue;
  const lands=houseLands47(r,main),capital=r.world.cities.find(c=>c.id===n.capitalId)?.provinceId;
  if(lands.length<=Math.max(3,Math.ceil(controlled.length/2)))continue;
  const province=lands.filter(p=>p.id!==capital).sort((a,b)=>a.id.localeCompare(b.id,'en'))[0];
  const person=Object.values(r.kin.persons).filter(p=>p.familyId===main).sort((a,b)=>b.age-a.age||a.id-b.id).find(p=>houseHousehold47(r,p.id)!==null);
  if(!province||!person||r.houses!.nextFamilyId>=2147483647||r.houses!.grants.length>=4096||r.kin.revision>=2147483647)continue;
  const id=grantHouseOwned47(r,{nationId:n.id,personId:person.id,provinceId:province.id});s.automatic.push(id);
 }
 assertPopulation47(r);
}
export function assertHouseGovernance47(r:Population47):void {
 const s=r.houseGovernance;if(s===undefined)return;const fail=()=>{throw Error('自主分封或封地归还记录不一致，保留原世界。');};
 const grants=r.houses?.grants;if(!grants||!exact(s,['version','rule','lastMonth','enabled','automatic','returns'])||s.version!==1||s.rule!=='household-fiefs-web-v1'||!Number.isSafeInteger(s.lastMonth)||s.lastMonth<12||s.lastMonth>month47(r)||!exact(s.enabled,r.world.nations.map(n=>n.id))||Object.values(s.enabled).some(v=>typeof v!=='boolean')||!Array.isArray(s.automatic)||new Set(s.automatic).size!==s.automatic.length||!Array.isArray(s.returns)||s.returns.length>grants.length)return fail();
 const autoLast=new Map<string,number>();let automaticId=0;
 for(const id of s.automatic){const g=grants.find(g=>g.familyId===id);if(!g||id<=automaticId)return fail();const m=entryMonth47(r,g.day);if(m<13||m>s.lastMonth||m<(autoLast.get(g.nationId)??7)+6)return fail();autoLast.set(g.nationId,m);automaticId=id;}
 const returned=new Set<number>();let previousEntry=0;
 for(const v of s.returns){
  const g=grants.find(g=>g.familyId===v?.familyId),e=r.chronicle.entries.find(e=>e.id===v?.entryId);
  if(!exact(v,['familyId','provinceId','day','tick','entryId'])||!g||returned.has(v.familyId)||v.provinceId!==g.provinceId||v.entryId<=g.entryId||v.entryId<=previousEntry||!e||e.kind!=='diplomacy'||e.day!==v.day||e.tick!==v.tick||e.place?.id!==g.provinceId||e.nationIds.length!==1||e.nationIds[0]!==g.nationId||entryMonth47(r,v.day)>s.lastMonth||(r.generations?familyMembersAt47(r,g.familyId,v.entryId):g.memberIds).some(id=>{const d=r.kin.lifecycle.deaths.find(d=>d.personId===id);return r.kin.persons[id].isAlive||!d||d.tick>v.tick;}))return fail();
  returned.add(v.familyId);previousEntry=v.entryId;
 }
 const titles=new Map<string,number>();
 const ledger=[...grants.map(g=>({...g,kind:'grant' as const})),...s.returns.map(v=>({...v,kind:'return' as const}))].sort((a,b)=>a.entryId-b.entryId);
 const entries=new Set<number>();for(const row of ledger){if(entries.has(row.entryId))return fail();entries.add(row.entryId);if(row.kind==='grant'){if(titles.has(row.provinceId))return fail();titles.set(row.provinceId,row.familyId);}else{if(titles.get(row.provinceId)!==row.familyId)return fail();titles.delete(row.provinceId);}}
}
