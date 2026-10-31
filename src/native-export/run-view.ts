import type {FoundingForces47} from '../fms/play/civilization47-forces';
import type {Population47} from '../fms/play/civilization47-population-types';

export type Run=FoundingForces47&Population47;
/** The part of the run the people lifecycle reads and writes, with the world slimmed to what it
 * looks up and the chronicle trimmed to its last entries (it only appends). */
export function peopleView(r:Run){
  const w=r.world;
  return structuredClone({
    clock:r.clock,
    world:{day:w.day,nextEventId:w.nextEventId,events:w.events,custom:{seed:w.custom!.seed},nations:w.nations.map(n=>({id:n.id,name:n.name,capitalId:n.capitalId})),
      provinces:w.provinces.map(p=>({id:p.id,name:p.name,controller:p.controller,legalOwner:p.legalOwner,center:p.center})),cities:w.cities.map(c=>({id:c.id,name:c.name,provinceId:c.provinceId}))},
    kin:r.kin,life:r.life,people:r.people,civilization:r.civilization,sovereignty:r.sovereignty,nobility:(r as {nobility?:unknown}).nobility??null,
    nativeWars:{campaigns:r.nativeWars.campaigns.map(c=>({attacker:c.attacker,defender:c.defender,endedTick:c.endedTick,internal:c.internal?{casusBelliId:(c.internal as {casusBelliId?:number}).casusBelliId??null}:null}))},
    chronicle:{...r.chronicle,entries:r.chronicle.entries.slice(-3)},
  });
}
export type Patch={p:string[];v?:unknown;d?:1}[];
/** Set/delete operations turning `a` into `b`: objects recurse, arrays and values are replaced. */
export function patch(a:unknown,b:unknown,path:string[]=[],out:Patch=[]):Patch{
  const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
  if(object(a)&&object(b)){
    for(const k of Object.keys(b))if(!Object.hasOwn(a,k))out.push({p:[...path,k],v:b[k]});else patch(a[k],b[k],[...path,k],out);
    for(const k of Object.keys(a))if(!Object.hasOwn(b,k))out.push({p:[...path,k],d:1});
  }else if(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.length>0&&a.some(x=>x&&typeof x==='object')){
    // Same-length arrays of records recurse by index (the path segment is the index).
    for(let i=0;i<a.length;i++)patch(a[i],b[i],[...path,String(i)],out);
  }else if(JSON.stringify(a)!==JSON.stringify(b))out.push({p:path,v:b});
  return out;
}

