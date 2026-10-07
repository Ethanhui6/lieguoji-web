import {assertFmsDocument,type FmsDocument} from '../model';
import {initializeStatecraft,validateWorld} from '../../compat/v0_4/sim/core';
import type {Point,World} from '../../sim/types';
import {initialNaming,type NamingState} from './naming18-names';
import {settlementPalette} from './settlement25-palette';
import {runEngine,type FmsRun} from './world';

import {settlementRegions} from './settlement25-regions';
import {polygonArea} from './settlement25-mesh';
export function createSettlement25Base(document:FmsDocument,countryCount:number,cityCount:number,relations:'peace'|'war',enabled?:readonly string[]):{base:Extract<FmsRun,{version:1}>;naming:NamingState}{
 assertFmsDocument(document);
 if(!Number.isInteger(countryCount)||countryCount<2||countryCount>24)throw Error('请选择 2—24 个国家。');
 if(countryCount>cityCount)throw Error('每个国家至少需要一座首都，国家数量不能超过城市数量。');
 if(relations!=='peace'&&relations!=='war')throw Error('开局关系无效。');
 const terrain=structuredClone(document),scale=1000/Math.max(terrain.width,terrain.height),regions=settlementRegions(terrain,cityCount);
  const distance = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const seeds = [regions.reduce((best, r, i) => polygonArea(r.ring) > polygonArea(regions[best].ring) ? i : best, 0)];
  while (seeds.length < countryCount) {
    let best = -1, score = -1;
    regions.forEach((r, i) => { if (seeds.includes(i)) return; const d = Math.min(...seeds.map(s => distance(r.center, regions[s].center))); if (d > score) { best = i; score = d; } });
    seeds.push(best);
  }
  const owners = new Int32Array(regions.length).fill(-1), queue = [...seeds]; seeds.forEach((s, i) => { owners[s] = i; });
  for (let head = 0; head < queue.length; head++) for (const next of regions[queue[head]].neighbors) if (owners[next] < 0) { owners[next] = owners[queue[head]]; queue.push(next); }
  // Disconnected islands may belong to a nearby state, but gain NO sea routes.
  regions.forEach((r, i) => { if (owners[i] < 0) owners[i] = seeds.reduce((best, s, n) => distance(r.center, regions[s].center) < distance(r.center, regions[seeds[best]].center) ? n : best, 0); });
  const naming=initialNaming(terrain,seeds.map(s=>regions[s].center),[...owners],enabled),names=seeds.map((_,i)=>naming.nations['n-'+i].name),places=regions.map((_,i)=>naming.cities['c-'+i].name),colors=settlementPalette;
  const point = (v: Point) => ({ x: v.x * scale, y: v.y * scale });
  const provinces = regions.map((r, i) => ({ id: `p-${i}`, name: places[i], polygon: r.ring.map(point), center: point(r.center), label: point(r.center), terrain: r.height > 65 ? 'mountain' as const : r.height > 45 ? 'forest' as const : 'plain' as const, legalOwner: `n-${owners[i]}`, controller: `n-${owners[i]}`, neighbors: [...r.neighbors].map(n => `p-${n}`), supply: 80 }));
  const cities = regions.map((r,i)=>({id:`c-${i}`,name:places[i],provinceId:`p-${i}`,position:point(r.center),label:point(r.center),fort:seeds.includes(i)?2:0}));
  const nations = seeds.map((s, i) => ({ id: `n-${i}`, name: names[i], color: colors[i], capitalId: `c-${s}`, regimeId: `regime-${i}`, dynastyId: `dynasty-${i}` }));
  const armies = seeds.map((s, i) => ({ id: `a-${i}`, name: `${names[i]}军`, nationId: `n-${i}`, provinceId: `p-${s}`, originId: `p-${s}`, troops: 2400 + (i % 3) * 800, morale: 85, supplies: 100, status: 'idle' as const, route: [], progress: 0 }));
  const id = `fms-${crypto.randomUUID()}`;
  const base: World = { schemaVersion: 1, rulesVersion: '0.1.0', scenario: 'custom-world', custom: { id, name: '我的诸国世界', seed: terrain.worldId, rivers: [] }, mode: 'sandbox', day: 0, nations, provinces, cities, armies, events: [], nextEventId: 1 };
  if (!validateWorld(base)) throw new Error('生成的世界未通过规则校验，原稿未改动。');
  const world = initializeStatecraft(base, relations);
  return {base:{version:1,id,engine:runEngine(),terrain,scale,world},naming};
}
