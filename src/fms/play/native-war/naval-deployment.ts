/** GameAssembly d42658a…; TryGetIdleDeploymentTarget 0x41CB40 and
 * WeightedRandomPortSelection 0x4206D0. Inputs already passed controller,
 * peace land-owner and sea-feature filters. Unity enumeration/RNG order is
 * not reproduced by the browser adapter. All scalar operations are float32. */
export type NativeIdlePort={id:string;present:number;assigned:number};
const f=Math.fround;
export function nativeIdlePortWeights(ports:NativeIdlePort[],war:boolean,preferred:string|null,current:string|null,home:string|null){
 const rows=ports.map(p=>{const count=Math.max(p.present,p.assigned);let weight=f(1/f(count+1));
  if(p.id===preferred)weight=f(weight*f(1.35));if(p.id===current)weight=f(weight*f(1.2));if(p.id===home)weight=f(weight*f(war?.95:1.15));
  const crowded=count>=(war?3:2);if(crowded)weight=Math.max(f(.05),f(weight*f(.25)));
  return {...p,count,crowded,weight};
 });const free=rows.filter(p=>!p.crowded);return free.length?free:rows;
}
export function nativeChooseIdlePort<T extends {weight:number}>(rows:T[],draw:()=>number):T|null{
 if(!rows.length)return null;let total=0;for(const row of rows)total=f(total+Math.max(0,row.weight));
 if(total<=0)return rows[Math.min(rows.length-1,Math.floor(draw()*rows.length))];
 const pick=f(f(draw())*total);let sum=0;for(const row of rows){sum=f(sum+Math.max(0,row.weight));if(sum>=pick)return row;}return rows[rows.length-1];
}
/** UpdateIdle 0x426EC0: unscaled seconds in desktop original. The web caller
 * explicitly maps these durations onto its persisted simulation clock. */
export function nativeIdleDelay(war:boolean,draw:()=>number){const lo=war?12:18,hi=war?20:32;return f(lo+f(f(draw())*(hi-lo)));}
