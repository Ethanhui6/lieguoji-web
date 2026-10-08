import type {FmsDocument} from '../model';
import type {World} from '../../sim/types';
import type {DiplomaticGeography} from './war30-geography';

/** Cache witnesses own their data. Every hit compares every dependency again;
 * neither object identity nor the legacy short binding proves equality. Exotic
 * objects miss the cache and still pass through the authoritative validator. */
const LIMIT=2_000_000;
const immutable=new WeakMap<object,number>(),typedShapes=new WeakSet<object>();
type Budget={left:number};
function equal(a:unknown,b:unknown,budget:Budget,depth:number):boolean{
 if(--budget.left<0||depth>64)return false;
 if(typeof a==='number')return Number.isFinite(a)&&Object.is(a,b);
 if(a===null||typeof a==='string'||typeof a==='boolean')return a===b;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 const fixed=immutable.get(a);if(a===b&&fixed!==undefined){budget.left-=fixed-1;return budget.left>=0;}
 const proto=Object.getPrototypeOf(a);
 if(proto!==Object.getPrototypeOf(b))return false;
 if(proto===Uint32Array.prototype||proto===Int32Array.prototype){
  const x=a as Uint32Array|Int32Array,y=b as typeof x;
  if(x.length!==y.length||!typedShapes.has(x)&&(Object.getOwnPropertyNames(x).length!==x.length||Object.getOwnPropertySymbols(x).length))return false;
  budget.left-=x.length;if(budget.left<0)return false;
  for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;
  return true;
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
 return true;
}
export function sameGeographyContent47(a:unknown,b:unknown){return equal(a,b,{left:LIMIT},0);}
export const certifiedGeography47=(value:object)=>immutable.has(value);
export function copyGeographyContent47<T>(value:T):{value:T;cost:number}|null{
 const budget={left:LIMIT};if(!equal(value,value,budget,0))return null;
 // Immutable certified subtrees can safely be shared with the witness. Typed
 // buffers and every mutable record always get a private copy.
 const copy=(v:unknown):unknown=>{
  if(!v||typeof v!=='object'||immutable.has(v))return v;
  if(v instanceof Uint32Array)return new Uint32Array(v);
  if(v instanceof Int32Array)return new Int32Array(v);
  if(Array.isArray(v))return v.map(copy);
  return Object.fromEntries(Object.keys(v).map(k=>[k,copy((v as Record<string,unknown>)[k])]));
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
 * remain writable and are compared element by element on every cache hit. */
export function prepareOwnedGeography47(r:{terrain:FmsDocument;world:World;diplomaticGeography:unknown}){
 freezePlain(r.terrain.points);freezePlain(r.diplomaticGeography);
 for(const p of r.world.provinces){freezePlain(p.polygon);freezePlain(p.neighbors);}
 for(const a of [r.terrain.triangles,r.terrain.elevations]){
  if(typedShapes.has(a))continue;
  if((Object.getPrototypeOf(a)!==Uint32Array.prototype&&Object.getPrototypeOf(a)!==Int32Array.prototype)||!(a.buffer instanceof ArrayBuffer)||'resizable' in a.buffer&&a.buffer.resizable||Object.getOwnPropertyNames(a).length!==a.length||Object.getOwnPropertySymbols(a).length)continue;
  Object.preventExtensions(a);typedShapes.add(a);
 }
}
export function shareUnchangedProvinceGeometry47(source:World,target:World){
 const byId=new Map(source.provinces.map(p=>[p.id,p]));
 for(const p of target.provinces){const old=byId.get(p.id);if(!old)continue;
  if(immutable.has(old.polygon)&&sameGeographyContent47(p.polygon,old.polygon))p.polygon=old.polygon;
  if(immutable.has(old.neighbors)&&sameGeographyContent47(p.neighbors,old.neighbors))p.neighbors=old.neighbors;
 }
}
export function cloneMilitaryCandidate47<T extends {terrain:FmsDocument;world:World;diplomaticGeography:object}>(input:T):T{
 const {terrain,...mutable}=input,fixedWater=immutable.has(input.diplomaticGeography);
 const polygons=input.world.provinces.map(p=>immutable.has(p.polygon)),neighbors=input.world.provinces.map(p=>immutable.has(p.neighbors));
 // Omit only certified immutable leaves from the copy itself, instead of
 // copying a complete sea partition just to discard that copy afterwards.
 const plain={...mutable,diplomaticGeography:fixedWater?null:input.diplomaticGeography,world:{...input.world,provinces:input.world.provinces.map((p,i)=>({...p,polygon:polygons[i]?null:p.polygon,neighbors:neighbors[i]?null:p.neighbors}))}};
 const next={...structuredClone(plain),terrain} as unknown as T;
 if(fixedWater)next.diplomaticGeography=input.diplomaticGeography;
 next.world.provinces.forEach((p,i)=>{if(polygons[i])p.polygon=input.world.provinces[i].polygon;if(neighbors[i])p.neighbors=input.world.provinces[i].neighbors;});
 return next;
}
const waterRegions=new WeakMap<object,ReadonlyMap<number,number>>();
export function waterRegions47(s:DiplomaticGeography):ReadonlyMap<number,number>{
 const fixed=immutable.has(s),old=fixed?waterRegions.get(s):undefined;if(old)return old;
 const result=new Map<number,number>();for(const p of s.water)for(const face of p.faces)result.set(face,p.id);
 if(fixed)waterRegions.set(s,result);return result;
}
