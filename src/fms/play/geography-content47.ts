import type {FmsDocument} from '../model';
import type {World} from '../../sim/types';
import type {DiplomaticGeography} from './war30-geography';
import type {FiscalState} from './fiscal15-state';
import type {HarborLayout46} from './war46-geography';
type StaticMilitaryLeaves47={finance?:FiscalState;harbors?:HarborLayout46};

/** Cache witnesses own their data. Dependencies are compared by content;
 * only deeply frozen leaves and the private, commit-checked numeric read
 * window can reuse a comparison. Identity or the old short binding alone is
 * not proof. Exotic objects still reach the authoritative validator. */
const LIMIT=2_000_000;
const immutable=new WeakMap<object,number>(),typedShapes=new WeakSet<object>();
const immutableMatches=new WeakMap<object,WeakSet<object>>();
const numericWindows=new WeakMap<object,WeakMap<object,boolean>>();
type Budget={left:number};
// Keep the hot numeric scan separate from descriptor/prototype traversal so
// the engine can optimize it as a dense typed-array loop. Buffers remain
// writable: every sample is still compared, including same-buffer aliases.
function sameSamples(a:Uint32Array|Int32Array,b:Uint32Array|Int32Array){
 for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;
 return true;
}
function equal(a:unknown,b:unknown,budget:Budget,depth:number):boolean{
 if(--budget.left<0||depth>64)return false;
 if(typeof a==='number')return Number.isFinite(a)&&Object.is(a,b);
 if(a===null||typeof a==='string'||typeof a==='boolean')return a===b;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 const fixed=immutable.get(a);if(fixed!==undefined&&(a===b||immutable.has(b)&&immutableMatches.get(a)?.has(b))){budget.left-=fixed-1;return budget.left>=0;}
 const proto=Object.getPrototypeOf(a);
 if(proto!==Object.getPrototypeOf(b))return false;
 if(proto===Uint32Array.prototype||proto===Int32Array.prototype){
  const x=a as Uint32Array|Int32Array,y=b as typeof x;
  if(x.length!==y.length||!typedShapes.has(x)&&(Object.getOwnPropertyNames(x).length!==x.length||Object.getOwnPropertySymbols(x).length))return false;
  budget.left-=x.length;if(budget.left<0)return false;
  const window=numericWindows.get(x),known=window?.get(y);
  if(known!==undefined)return known;
  const matches=sameSamples(x,y);window?.set(y,matches);return matches;
 }
 if(proto!==Object.prototype&&proto!==Array.prototype)return false;
 if(Object.getOwnPropertySymbols(a).length)return false;
 const keys=Object.getOwnPropertyNames(a),other=Object.getOwnPropertyNames(b);
 if(keys.length!==other.length)return false;
 if(Array.isArray(a)&&(a.length!==(b as unknown[]).length||keys.length!==a.length+1))return false;
 for(const k of keys){
  const d=Object.getOwnPropertyDescriptor(a,k),e=Object.getOwnPropertyDescriptor(b,k);
  if(k==='toJSON'||!d||!e||!('value'in d)||!('value'in e)||d.enumerable!==e.enumerable||!equal(d.value,e.value,budget,depth+1))return false;
 }
 if(fixed!==undefined&&immutable.has(b)){let matches=immutableMatches.get(a);if(!matches){matches=new WeakSet();immutableMatches.set(a,matches);}matches.add(b);}
 return true;
}
export function sameGeographyContent47(a:unknown,b:unknown){return equal(a,b,{left:LIMIT},0);}
export const certifiedGeography47=(value:object)=>immutable.has(value);
/** Display receiver only: the decoded static baseline (terrain sites and
 * adjacency, sea partition, province outlines) is reused for every update of
 * one Worker epoch, so certify it once like the owned session does. */
export function certifyDisplayGeography47(values:readonly unknown[]){for(const value of values)freezePlain(value);}
export function copyGeographyContent47<T>(value:T):{value:T;cost:number}|null{
 const budget={left:LIMIT};if(!equal(value,value,budget,0))return null;
 // Immutable certified subtrees can safely be shared with the witness. Typed
 // buffers and every mutable record always get a private copy.
 const copy=(v:unknown):unknown=>{
  if(!v||typeof v!=='object'||immutable.has(v))return v;
  if(v instanceof Uint32Array)return new Uint32Array(v);
  if(v instanceof Int32Array)return new Int32Array(v);
  // The witness copy is private to its cache and never written, so its plain
  // subtrees are certified too. Otherwise a certified live polygon never
  // memoizes its match with the witness and every lookup re-walks all points.
  if(Array.isArray(v)){const out=v.map(copy);freezePlain(out);return out;}
  const out=Object.fromEntries(Object.keys(v).map(k=>[k,copy((v as Record<string,unknown>)[k])]));freezePlain(out);return out;
 };
 return {value:copy(value) as T,cost:LIMIT-budget.left};
}
export function geographyDependencies47(r:{terrain:FmsDocument;world:World}){
 const t=r.terrain;
 return {width:t.width,height:t.height,points:t.points,triangles:t.triangles,elevations:t.elevations,
  provinces:r.world.provinces.map(p=>({id:p.id,polygon:p.polygon,neighbors:p.neighbors}))};
}
/** At most four worlds and two million primitive/record slots in total. */
export function retainGeographyWitness47<T extends {cost:number}>(cache:T[],entry:T){
 if(entry.cost>LIMIT)return;
 while(cache.length&&(cache.length>=4||cache.reduce((n,e)=>n+e.cost,0)+entry.cost>LIMIT))cache.shift();
 cache.push(entry);
}

function freezePlain(value:unknown):number|null{
 if(typeof value==='number')return Number.isFinite(value)?1:null;
 if(value===null||typeof value==='string'||typeof value==='boolean')return 1;
 if(!value||typeof value!=='object')return null;
 const known=immutable.get(value);if(known!==undefined)return known;
 const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==Array.prototype||Object.getOwnPropertySymbols(value).length)return null;
 const keys=Object.getOwnPropertyNames(value);if(Array.isArray(value)&&keys.length!==value.length+1)return null;
 let cost=1;
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(k==='toJSON'||!d||!('value'in d))return null;const size=freezePlain(d.value);if(size===null||(cost+=size)>LIMIT)return null;}
 Object.freeze(value);immutable.set(value,cost);return cost;
}
/** Only the private, successfully built/validated session calls this. Freezing
 * does not mark a live run or its mutable ledgers as trusted. Numeric buffers
 * remain writable. Outside the private action window, every cache hit compares
 * them element by element; the window also checks all samples before commit. */
export function prepareOwnedGeography47(r:{terrain:FmsDocument;world:World;diplomaticGeography?:unknown}&StaticMilitaryLeaves47){
 freezePlain(r.terrain.points);freezePlain(r.terrain.neighbors);freezePlain(r.diplomaticGeography);
 if(r.harbors)freezePlain(r.harbors);
 if(r.finance)for(const p of Object.values(r.finance.provinces))freezePlain(p.cellBiomes);
 for(const p of r.world.provinces){freezePlain(p.polygon);freezePlain(p.neighbors);}
 for(const a of [r.terrain.triangles,r.terrain.elevations]){
  if(typedShapes.has(a))continue;
  if((Object.getPrototypeOf(a)!==Uint32Array.prototype&&Object.getPrototypeOf(a)!==Int32Array.prototype)||!(a.buffer instanceof ArrayBuffer)||'resizable' in a.buffer&&a.buffer.resizable||Object.getOwnPropertyNames(a).length!==a.length||Object.getOwnPropertySymbols(a).length)continue;
  Object.preventExtensions(a);typedShapes.add(a);
 }
}
/** Only the synchronous, fixed Culture47Session action owner uses this window.
 * It owns fresh numeric buffers, compares each cache witness exactly on first
 * use, and checks the ENTIRE buffers again before returning to the commit.
 * No external callback, async work or mutable buffer escapes during the action.
 * A changed/detached buffer rejects the whole candidate; input stays untouched.
 * Public geometry/command helpers outside this window still scan every call. */
/** Buffers adopted after a verified window, with their private pristine copies. */
const pristine=new WeakMap<object,Uint32Array|Int32Array>();
const changed='推演期间地形发生变化，取消本次候选并保留原世界。';
export function withOwnedNumericGeography47<T extends {terrain:FmsDocument}>(input:T,action:(candidate:T)=>T):T{
 // Fast path: the frozen terrain record and its two buffers were adopted by an
 // earlier verified window of this owner. Reuse them (keeping their memo of
 // exact witness comparisons) instead of copying ~0.5 MB per action; every
 // sample is still checked against the private pristine copy afterwards, and
 // any change is undone before the candidate is rejected.
 const t=input.terrain,keptTriangles=pristine.get(t.triangles),keptElevations=pristine.get(t.elevations);
 if(keptTriangles&&keptElevations&&Object.isFrozen(t)){
  const buffers=[t.triangles,t.elevations] as const,originals=[keptTriangles,keptElevations] as const;
  try{
   const result=action({...input}),returned=[result.terrain.triangles,result.terrain.elevations];
   for(let i=0;i<buffers.length;i++)if(buffers[i].length!==originals[i].length||!sameSamples(buffers[i],originals[i])||returned[i].length!==originals[i].length||!sameSamples(returned[i],originals[i]))throw Error(changed);
   return result;
  }catch(error){
   for(let i=0;i<buffers.length;i++)if(buffers[i].length===originals[i].length&&!sameSamples(buffers[i],originals[i])){(buffers[i] as Uint32Array).set(originals[i]);numericWindows.set(buffers[i],new WeakMap());}
   throw error;
  }
 }
 const originals=[new Uint32Array(input.terrain.triangles),new Int32Array(input.terrain.elevations)] as const;
 const triangles=new Uint32Array(originals[0]),elevations=new Int32Array(originals[1]);
 const buffers=[triangles,elevations] as const;
 const candidate={...input,terrain:{...input.terrain,triangles,elevations}};
 for(const a of buffers){Object.preventExtensions(a);typedShapes.add(a);numericWindows.set(a,new WeakMap());}
 let adopted=false;
 try{
  const result=action(candidate);
  const returned=[result.terrain.triangles,result.terrain.elevations];
  for(let i=0;i<buffers.length;i++)if(buffers[i].length!==originals[i].length||!sameSamples(buffers[i],originals[i])||returned[i].length!==originals[i].length||!sameSamples(returned[i],originals[i]))throw Error(changed);
  // The verified buffers become owned: later windows reuse them (fast path).
  if(result.terrain===candidate.terrain&&returned[0]===triangles&&returned[1]===elevations){
   Object.freeze(result.terrain);pristine.set(triangles,originals[0]);pristine.set(elevations,originals[1]);adopted=true;
  }
  return result;
 }finally{if(!adopted)for(const a of buffers)numericWindows.delete(a);}
}
export function shareUnchangedProvinceGeometry47(source:World,target:World){
 const byId=new Map(source.provinces.map(p=>[p.id,p]));
 for(const p of target.provinces){const old=byId.get(p.id);if(!old)continue;
  if(immutable.has(old.polygon)&&sameGeographyContent47(p.polygon,old.polygon))p.polygon=old.polygon;
  if(immutable.has(old.neighbors)&&sameGeographyContent47(p.neighbors,old.neighbors))p.neighbors=old.neighbors;
 }
}
export function cloneMilitaryCandidate47<T extends {terrain:FmsDocument;world:World;diplomaticGeography:object}&StaticMilitaryLeaves47>(input:T):T{
 const {terrain,...mutable}=input,fixedWater=immutable.has(input.diplomaticGeography);
 const polygons=input.world.provinces.map(p=>immutable.has(p.polygon)),neighbors=input.world.provinces.map(p=>immutable.has(p.neighbors));
 // Omit only certified immutable leaves from the copy itself, instead of
 // copying a complete sea partition just to discard that copy afterwards.
 const fixedHarbors=input.harbors&&immutable.has(input.harbors),biomes=new Map<string,number[]>();
 const plain={...mutable,diplomaticGeography:fixedWater?null:input.diplomaticGeography,world:{...input.world,provinces:input.world.provinces.map((p,i)=>({...p,polygon:polygons[i]?null:p.polygon,neighbors:neighbors[i]?null:p.neighbors}))}};
 if(fixedHarbors)plain.harbors=null as unknown as HarborLayout46;
 if(input.finance)plain.finance={...input.finance,provinces:Object.fromEntries(Object.entries(input.finance.provinces).map(([id,p])=>{
  if(!immutable.has(p.cellBiomes))return[id,p];
  biomes.set(id,p.cellBiomes);return[id,{...p,cellBiomes:[]}];
 }))};
 const next={...structuredClone(plain),terrain} as unknown as T;
 if(fixedWater)next.diplomaticGeography=input.diplomaticGeography;
 if(fixedHarbors)next.harbors=input.harbors;
 for(const [id,cells] of biomes)next.finance!.provinces[id].cellBiomes=cells;
 next.world.provinces.forEach((p,i)=>{if(polygons[i])p.polygon=input.world.provinces[i].polygon;if(neighbors[i])p.neighbors=input.world.provinces[i].neighbors;});
 return next;
}
const waterRegions=new WeakMap<object,ReadonlyMap<number,number>>();
export function waterRegions47(s:DiplomaticGeography):ReadonlyMap<number,number>{
 const fixed=immutable.has(s),old=fixed?waterRegions.get(s):undefined;if(old)return old;
 const result=new Map<number,number>();for(const p of s.water)for(const face of p.faces)result.set(face,p.id);
 if(fixed)waterRegions.set(s,result);return result;
}
