import type {NativeEthnic} from './native-combat/upper-efficiency';
import type {World} from '../../sim/types';
import type {ProvinceCells} from './fiscal15-state';

export const LIVELIHOODS47:readonly NativeEthnic[]=['FishAndHunting','Agriculture','Nomadic','Maritime','Commercial','Other'];
export type EconomySetup47=Record<string,NativeEthnic|'terrain'>;
export type Economy47={version:1;rule:'terrain-or-player-livelihood-v1';revision:number;nations:Record<string,{ethnic:NativeEthnic;source:'terrain-start'|'player-start';provinceIds:string[]}>};
export function validateEconomySetup47(setup:EconomySetup47,nationIds:readonly string[]){
  if(!setup||typeof setup!=='object'||Array.isArray(setup)||(Object.getPrototypeOf(setup)!==Object.prototype&&Object.getPrototypeOf(setup)!==null))throw Error('经济方式选择无效。');
  for(const [id,choice] of Object.entries(setup))if(!nationIds.includes(id)||choice!=='terrain'&&!LIVELIHOODS47.includes(choice))throw Error('经济方式或国家不存在。');
}
/** Web generation rule, deliberately independent of real-world ethnicity and
 * religion. Original five economic attributes feed native resource formulas;
 * their automatic assignment here is not the original six-culture weight pool. */
export function terrainLivelihood47(ids:readonly string[],cells:Record<string,ProvinceCells>):NativeEthnic{
  if(!ids.length)throw Error('经济方式缺少初始领土。');
  const counts=Array<number>(13).fill(0);let coastal=0;
  for(const id of ids){const p=cells[id];if(!p?.cellBiomes.length)throw Error('经济方式缺少实际地貌。');if(p.seaNeighbor)coastal++;for(const biome of p.cellBiomes){if(!Number.isInteger(biome)||biome<0||biome>12)throw Error('经济地貌无效。');counts[biome]++;}}
  const land=counts.slice(1).reduce((a,b)=>a+b,0);if(!land)throw Error('经济领土没有陆地。');
  if(coastal/ids.length>=.5)return 'Maritime';
  if((counts[1]+counts[2]+counts[4])/land>=.5)return 'Nomadic';
  if((counts[3]+counts[5]+counts[6]+counts[8]+counts[12])/land>=.5)return 'Agriculture';
  if((counts[7]+counts[9]+counts[10])/land>=.5)return 'FishAndHunting';
  return 'Other';
}
export function initialEconomy47(world:World,cells:Record<string,ProvinceCells>,setup:EconomySetup47):Economy47{
  validateEconomySetup47(setup,world.nations.map(n=>n.id));
  return {version:1,rule:'terrain-or-player-livelihood-v1',revision:0,nations:Object.fromEntries(world.nations.map(n=>{
    const provinceIds=world.provinces.filter(p=>p.controller===n.id&&p.legalOwner===n.id).map(p=>p.id),choice=Object.hasOwn(setup,n.id)?setup[n.id]:'terrain';
    return [n.id,{ethnic:choice==='terrain'?terrainLivelihood47(provinceIds,cells):choice,source:choice==='terrain'?'terrain-start':'player-start',provinceIds}];
  }))};
}
export function economicEthnic47(economy:Economy47,id:string):NativeEthnic{
  if(!Object.hasOwn(economy.nations,id)||!LIVELIHOODS47.includes(economy.nations[id].ethnic))throw Error('国家经济方式缺失，原账本未改动。');return economy.nations[id].ethnic;
}
export function assertEconomy47(e:Economy47,w:World,cells:Record<string,ProvinceCells>){
  const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),fail=()=>{throw Error('经济方式来源无效，原世界未改动。');};
  if(!exact(e,['version','rule','revision','nations'])||e.version!==1||e.rule!=='terrain-or-player-livelihood-v1'||!Number.isSafeInteger(e.revision)||e.revision<0||!exact(e.nations,w.nations.map(n=>n.id)))return fail();
  const provinces=new Set(w.provinces.map(p=>p.id)),all=new Set<string>();
  for(const row of Object.values(e.nations)){
    if(!exact(row,['ethnic','source','provinceIds'])||!LIVELIHOODS47.includes(row.ethnic)||!['terrain-start','player-start'].includes(row.source)||!Array.isArray(row.provinceIds)||!row.provinceIds.length||new Set(row.provinceIds).size!==row.provinceIds.length)return fail();
    for(const id of row.provinceIds){if(!provinces.has(id)||all.has(id))return fail();all.add(id);}
    if(row.source==='terrain-start'&&row.ethnic!==terrainLivelihood47(row.provinceIds,cells))return fail();
  }
  if(all.size!==provinces.size)return fail();
}
