import type {Point} from '../../sim/types';
import type {Region} from './settlement25-regions';
import {polygonArea} from './settlement25-mesh';

/** Player-edited opening territory, as in the original's map editor
 * (PlaceState / DrawState / SetAsCapital). Indices are settlement regions;
 * one region is one province and one city. seeds[i] is nation i's capital. */
export type OpeningLayout47={seeds:number[];owners:number[]};
type LayoutRegion=Pick<Region,'ring'|'center'|'neighbors'>;
const distance=(a:Point,b:Point)=>(a.x-b.x)**2+(a.y-b.y)**2;
export const MAX_OPENING_NATIONS47=24,MIN_OPENING_NATIONS47=2;

/** Exactly the automatic opening used before layouts existed: largest region
 * first, then farthest-point seeds, breadth-first growth, nearest seed for
 * unreachable islands. Worlds without a layout keep this result. */
export function defaultLayout47(regions:readonly LayoutRegion[],count:number):OpeningLayout47{
  const seeds=[regions.reduce((best,r,i)=>polygonArea(r.ring)>polygonArea(regions[best].ring)?i:best,0)];
  while(seeds.length<count){let best=-1,score=-1;regions.forEach((r,i)=>{if(seeds.includes(i))return;const d=Math.min(...seeds.map(s=>distance(r.center,regions[s].center)));if(d>score){best=i;score=d;}});seeds.push(best);}
  return {seeds,owners:grow(regions,seeds,new Int32Array(regions.length).fill(-1))};
}
/** Breadth-first from already owned regions; unreachable ones join the nearest seed. */
function grow(regions:readonly LayoutRegion[],seeds:readonly number[],owners:Int32Array):number[]{
  seeds.forEach((s,i)=>{owners[s]=i;});
  const queue=owners.reduce<number[]>((q,o,i)=>{if(o>=0&&!seeds.includes(i))q.push(i);return q;},[...seeds]);
  for(let head=0;head<queue.length;head++)for(const next of regions[queue[head]].neighbors)if(owners[next]<0){owners[next]=owners[queue[head]];queue.push(next);}
  regions.forEach((r,i)=>{if(owners[i]<0)owners[i]=seeds.reduce((best,s,n)=>distance(r.center,regions[s].center)<distance(r.center,regions[seeds[best]].center)?n:best,0);});
  return [...owners];
}

export function assertOpeningLayout47(value:unknown,regionCount:number,count:number):asserts value is OpeningLayout47{
  const fail=()=>{throw Error('国家领土布局无效，原稿未改动。');};
  const v=value as OpeningLayout47;
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('/')!=='owners/seeds'||!Array.isArray(v.seeds)||!Array.isArray(v.owners))fail();
  if(v.seeds.length!==count||v.owners.length!==regionCount||new Set(v.seeds).size!==count)fail();
  if(v.seeds.some(s=>!Number.isSafeInteger(s)||s<0||s>=regionCount)||v.owners.some(o=>!Number.isSafeInteger(o)||o<0||o>=count))fail();
  if(v.seeds.some((s,i)=>v.owners[s]!==i))fail();
}

// Editing operations return a new layout or null when the edit is not allowed.
const copy=(l:OpeningLayout47):OpeningLayout47=>({seeds:[...l.seeds],owners:[...l.owners]});
const capitalOf=(l:OpeningLayout47,region:number)=>l.seeds.indexOf(region);

/** DrawState: paint a region into a nation. A capital region never changes hands. */
export function assignRegion47(l:OpeningLayout47,region:number,nation:number):OpeningLayout47|null{
  if(l.owners[region]===nation||capitalOf(l,region)>=0||nation<0||nation>=l.seeds.length)return null;
  const next=copy(l);next.owners[region]=nation;return next;
}
/** SetAsCapital: only inside the nation's own territory. */
export function setCapital47(l:OpeningLayout47,region:number):OpeningLayout47|null{
  const nation=l.owners[region];
  if(nation===undefined||l.seeds[nation]===region)return null;
  const next=copy(l);next.seeds[nation]=region;return next;
}
/** PlaceState: a new nation founded on a non-capital region. */
export function placeNation47(l:OpeningLayout47,region:number):OpeningLayout47|null{
  if(l.seeds.length>=MAX_OPENING_NATIONS47||capitalOf(l,region)>=0||region<0||region>=l.owners.length)return null;
  const next=copy(l);next.seeds.push(region);next.owners[region]=next.seeds.length-1;return next;
}
/** Remove a nation; its land regrows from neighbouring nations. Later indices shift down. */
export function removeNation47(regions:readonly LayoutRegion[],l:OpeningLayout47,nation:number):OpeningLayout47|null{
  if(l.seeds.length<=MIN_OPENING_NATIONS47||nation<0||nation>=l.seeds.length)return null;
  const seeds=l.seeds.filter((_,i)=>i!==nation),owners=Int32Array.from(l.owners,o=>o===nation?-1:o>nation?o-1:o);
  return {seeds,owners:grow(regions,seeds,owners)};
}
