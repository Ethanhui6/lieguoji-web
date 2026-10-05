import vocabulary from './eastern-names.json';
import type { World } from '../../sim/types';

/** Source: original EasternFantasy StateNames/CityNames. Pick without replacement,
 * as evidenced in PickRandomCities/RandomProvinceName/RandomStateName. Web uses a
 * stable seeded shuffle, not a claim of Unity random-sequence equivalence. */
function pool(names: readonly string[], seed: string): string[] {
  let state=2166136261;
  for(const char of seed)state=Math.imul(state^char.charCodeAt(0),16777619)>>>0;
  const result=[...names];
  for(let i=result.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
export function worldNames(seed:string,count:number){
  if(!Number.isInteger(count)||count<0||count>1000)throw new Error('地名数量超出已审核词库容量。');
  return {countries:pool(vocabulary.countries,seed+'/states'),places:pool(vocabulary.places,seed+'/places').slice(0,count)};
}

const cache=new WeakMap<World,World>();
/** Compatibility display adapter only. Do not mutate old saves, IDs, event prose
 * or engine state. Recognizes only our exact previous generated placeholders;
 * player-entered names and original country names are preserved. */
export function namedWorld(world:World):World{
  const cached=cache.get(world);if(cached)return cached;
  if(!world.custom){cache.set(world,world);return world;}
  const maxIndex=Math.max(-1,...world.provinces.map(p=>/^p-\d+$/.test(p.id)?Number(p.id.slice(2)):-1));
  if(maxIndex>=1000){cache.set(world,world);return world;}
  const names=worldNames(world.custom.seed,maxIndex+1),aliases=new Map<string,string>();
  const provinces=world.provinces.map(p=>{
    if(!/^p-\d+$/.test(p.id))return p;
    const index=Number(p.id.slice(2)),nation=world.nations.find(n=>n.id===p.legalOwner);
    if(p.name!==`${nation?.name}·${index+1}区`)return p;
    const name=names.places[index];aliases.set(p.name,name);return {...p,name};
  });
  const cities=world.cities.map(c=>{
    if(!/^c-\d+$/.test(c.id))return c;
    const index=Number(c.id.slice(2)),p=world.provinces.find(p=>p.id===c.provinceId),nation=world.nations.find(n=>n.id===p?.legalOwner);
    if(!p||!aliases.has(p.name)||c.name!==`${nation?.name}${index+1}城`)return c;
    const name=names.places[index];aliases.set(c.name,name);return {...c,name};
  });
  if(!aliases.size){cache.set(world,world);return world;}
  const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp([...aliases.keys()].sort((a,b)=>b.length-a.length).map(escape).join('|'),'g');
  const prose=(s:string)=>s.replace(pattern,match=>aliases.get(match)!);
  const result={...world,provinces,cities,events:world.events.map(e=>({...e,text:prose(e.text),reason:prose(e.reason)}))};cache.set(world,result);return result;
}
