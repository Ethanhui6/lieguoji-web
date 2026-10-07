/** Recovered WarProvinceQueryV2 leaves. Collection enumeration and province lookup
 * are explicit ports; see the recovery evidence before claiming native parity. */
import {nativeRoundToEven} from './native-economy/native-round';
export type NativeWarProvince={id:number;center:number;stateId:number;isLand:boolean;neighbors:Iterable<number>};
export type NativeWarPosition={x:number;y:number;z:number};
export type NativeWarLookup=(id:number)=>NativeWarProvince|null;
export interface NativeWarSet extends Iterable<number>{readonly size:number;has(id:number):boolean;add(id:number):unknown;delete(id:number):boolean}
/** IL2CPP HashSet<int>: enumerate slot indices; deleted slots are reused LIFO. */
export class NativeWarIdSet implements NativeWarSet{
 private slots:(number|undefined)[]=[];private free:number[]=[];private indices=new Map<number,number>();private revision=0;
 constructor(values:Iterable<number>=[]){for(const v of values)this.add(v);}
 get size(){return this.indices.size;}
 has(id:number){return this.indices.has(id);}
 add(id:number){if(this.has(id))return false;const slot=this.free.pop()??this.slots.length;this.slots[slot]=id;this.indices.set(id,slot);this.revision++;return true;}
 delete(id:number){const slot=this.indices.get(id);if(slot===undefined)return false;this.indices.delete(id);this.slots[slot]=undefined;this.free.push(slot);this.revision++;if(!this.size){this.slots=[];this.free=[];}return true;}
 [Symbol.iterator]():IterableIterator<number>{const version=this.revision;let i=0;return{[Symbol.iterator](){return this;},next:()=>{if(version!==this.revision)throw Error('Collection was modified during enumeration.');while(i<this.slots.length){const value=this.slots[i++];if(value!==undefined)return {value,done:false};}return{value:undefined,done:true};}};}
}
const f=Math.fround;
export const NATIVE_FLOAT_MAX=3.4028234663852886e38;
export const nativeWarRound=(value:number)=>nativeRoundToEven(Math.fround(value),0);
/** ChooseOccupyCount 668830. Strength is an explicit State.GetStrength port. */
export function nativeChooseOccupyCount(attackerStrength:number,defenderStrength:number,count:number){
 if(count<=1)return 1;const a=f(attackerStrength),d=f(defenderStrength),sum=f(a+d),share=sum>0?f(a/sum):f(.5),boost=Math.max(0,Math.min(1,f(f(share-f(.45))*2)));
 return Math.max(1,Math.min(count,Math.max(2,Math.ceil(f(f(count)/f(3))),nativeWarRound(f(f(count)*boost)))));
}
export function nativeProvinceDistance(left:NativeWarProvince|null,right:NativeWarProvince|null,getPositions:()=>readonly NativeWarPosition[]|null):number{
 const positions=getPositions();if(!left||!right)return NATIVE_FLOAT_MAX;
 if(positions&&left.center>=0&&right.center>=0&&left.center<positions.length&&right.center<positions.length){const a=positions[left.center],b=positions[right.center],dx=f(f(a.x)-f(b.x)),dy=f(f(a.y)-f(b.y)),dz=f(f(a.z)-f(b.z));return f(f(f(dy*dy)+f(dx*dx))+f(dz*dz));}
 const delta=(left.id-right.id)|0,negative=(-delta)|0;return f(negative<0?delta:negative);
}
export function nativeCompactFrontier(frontier:Iterable<number>,selected:{has(id:number):boolean},anchor:NativeWarProvince|null,defender:number,lookup:NativeWarLookup,distance:(a:NativeWarProvince,b:NativeWarProvince|null)=>number):NativeWarProvince|null{
 let best:NativeWarProvince|null=null,bestShared=-1,bestDistance=NATIVE_FLOAT_MAX;
 for(const id of frontier){const p=lookup(id);if(!p||!p.isLand||p.stateId!==defender)continue;let shared=0;for(const n of p.neighbors)if(selected.has(n))shared++;
  const d=f(distance(p,anchor));if(shared>bestShared||shared===bestShared&&(d<bestDistance||Math.abs(f(d-bestDistance))<f(.001)&&best!==null&&p.id<best.id)){best=p;bestShared=shared;bestDistance=d;}
 }return best;
}
export function nativeGrowClaimComponent(seed:NativeWarProvince|null,defender:number,targetCount:number,result:number[],selected:NativeWarSet,lookup:NativeWarLookup,distance:(a:NativeWarProvince,b:NativeWarProvince|null)=>number){
 if(!seed||!seed.isLand||seed.stateId!==defender||selected.has(seed.id))return;selected.add(seed.id);result.push(seed.id);nativeGrowClaimFrontier(seed,defender,targetCount,result,selected,lookup,distance,()=>new NativeWarIdSet());
}
export function nativeAppendDefenderNeighbors(p:NativeWarProvince,defender:number,selected:{has(id:number):boolean},frontier:{add(id:number):unknown},lookup:NativeWarLookup){
 for(const id of p.neighbors){if(selected.has(id))continue;const n=lookup(id);if(n&&n.isLand&&n.stateId===defender)frontier.add(n.id);}
}
export function nativeGrowClaimFrontier(anchor:NativeWarProvince|null,defender:number,targetCount:number,result:number[],selected:NativeWarSet,lookup:NativeWarLookup,distance:(a:NativeWarProvince,b:NativeWarProvince|null)=>number,createFrontier:()=>NativeWarSet){
 if(!anchor)return;const frontier=createFrontier();for(const id of selected){const p=lookup(id);if(p&&p.isLand&&p.stateId===defender)nativeAppendDefenderNeighbors(p,defender,selected,frontier,lookup);}
 while(result.length<targetCount&&frontier.size){const chosen=nativeCompactFrontier(frontier,selected,anchor,defender,lookup,distance);if(!chosen)return;frontier.delete(chosen.id);if(selected.has(chosen.id))continue;selected.add(chosen.id);result.push(chosen.id);nativeAppendDefenderNeighbors(chosen,defender,selected,frontier,lookup);}
}
