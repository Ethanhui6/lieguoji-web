import type {Population47} from './civilization47-population-types';
import {nameSeed} from './chronicle-records';
import {isoPlusDays,isoWholeYears} from './civilization47-iso-calendar';

/** Generated opening facts, NOT a simulation of unplayed historical wars.
 * The independent seed must never consume combat, politics or life RNG. */
export type Origins47={version:1;rule:'generated-opening-facts-v1';nations:Record<string,{foundedBeforeDays:number;rulerId:string;personId:number;reignBeforeDays:number}>};
export function buildOrigins47(r:Population47):Origins47{
 const nations:Origins47['nations']={};
 for(const n of r.world.nations){
  if(r.civilization.nations[n.id].origin!=='new-world')continue;
  const ruler=r.chronicle.leaders[n.id][0],personId=r.sovereignty.reigns[ruler.id],person=r.kin.persons[personId];
  if(!person||person.initialAge===null)throw Error('开篇国家缺少初任人物年龄。');
  const seed=`${r.world.custom!.seed}/opening-facts/${n.id}`;
  const foundedBeforeDays=365*(2+nameSeed(seed+'/state')%219)+nameSeed(seed+'/anniversary')%365;
  // This adult-accession bound is a web opening rule, not a recovered native roll.
  const available=Math.min(foundedBeforeDays,(person.initialAge-18)*365);
  const reignBeforeDays=1+nameSeed(seed+'/reign')%available;
  nations[n.id]={foundedBeforeDays,rulerId:ruler.id,personId,reignBeforeDays};
 }
 return {version:1,rule:'generated-opening-facts-v1',nations};
}
export function assertOrigins47(r:Population47){
 if(r.origins===undefined)return; // Old engines and isolated pre-opening fixtures.
 const expected=buildOrigins47(r);
 const equal=(a:unknown,b:unknown):boolean=>a===b||!!a&&!!b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));
 if(!equal(r.origins,expected))throw Error('开篇国龄或在位历史不一致，保留原世界。');
}
export function attachOrigins47<T extends Population47>(input:T):T&{origins:Origins47}{
 if(input.clock.tick!==0||input.origins!==undefined)throw Error('开篇历史只能建立一次。');
 const r=structuredClone(input),origins=buildOrigins47(r);
 for(const n of r.world.nations){const o=origins.nations[n.id],entry=r.chronicle.entries.find(e=>e.kind==='accession'&&e.people.some(p=>p.id===o.rulerId))!;
  const years=isoWholeYears(isoPlusDays(r.life.startDate,-o.foundedBeforeDays),r.life.startDate),reign=isoWholeYears(isoPlusDays(r.life.startDate,-o.reignBeforeDays),r.life.startDate);
  entry.text=`${n.name}开篇：建国已${years}年，${r.civilization.rulers[o.rulerId].name}已在位${reign>0?`${reign}年`:`${o.reignBeforeDays}日`}`;
  entry.reason='这是生成世界时的既有背景，并非今日建国或登基。现任人物及亲属具有真实登记的身份、年龄和关系；开篇以前的历代君主与战争未经模拟，不补造事件。';
 }
 return {...r,origins};
}
export function nationAge47(r:Population47,id:string){
 const before=r.origins?.nations[id]?.foundedBeforeDays??0;
 return {years:isoWholeYears(isoPlusDays(r.life.startDate,-before),r.life.currentDate),days:before+r.world.day,generated:before>0};
}
export function reignAge47(r:Population47,id:string){
 const ruler=r.chronicle.leaders[id]?.at(-1);if(!ruler)return null;
 const origin=r.origins?.nations[id],before=origin?.rulerId===ruler.id?origin.reignBeforeDays:0;
 const end=isoPlusDays(r.life.startDate,ruler.endedDay??r.world.day),start=isoPlusDays(r.life.startDate,ruler.ascendedDay-before);
 return {years:isoWholeYears(start,end),days:(ruler.endedDay??r.world.day)-ruler.ascendedDay+before,opening:before>0};
}
