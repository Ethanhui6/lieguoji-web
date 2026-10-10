import {assertFmsDocument,type FmsDocument} from '../model';
import {initializeManagement} from '../../compat/v0_4/sim/statecraft';
import {validateCivilizationWorld47} from './civilization47-world-validation';
import type {Point,World} from '../../sim/types';
import {settlementRegions} from './settlement25-regions';
import {polygonArea} from './settlement25-mesh';
import {settlementPalette} from './settlement25-palette';
import {initialCivilization47,initialCivilizationChronicle47,nationName47,cityName47,assertCivilization47,validateCultureSetup47,type WorldCultureSetup47} from './civilization47-names';
import {initialPeopleAndLife22} from './life22-people';
import {attachFamilies47} from './civilization47-family';
import {attachOrigins47} from './civilization47-origins';
import {attachHouses47} from './civilization47-houses';
import {attachHouseGovernance47} from './civilization47-house-governance';

/** Actual terrain/world/founding-person creation phase for full47. No call to
 * old create/initialNaming, no temporary fake EasternFantasy identity. This is
 * not an enabled session: military/fiscal/kin lifecycle and storage still need
 * the new owner. Geometry is the existing measured web settlement algorithm. */
export function createCivilizationWorld47(document:FmsDocument,count:number,cityCount:number,relations:'peace'|'war',setup:WorldCultureSetup47) {
  assertFmsDocument(document);if(!Number.isInteger(count)||count<2||count>24||count>cityCount||!['peace','war'].includes(relations))throw Error('新世界国家、城市或关系配置无效。');validateCultureSetup47(setup,count);
  const terrain=structuredClone(document),scale=1000/Math.max(terrain.width,terrain.height),regions=settlementRegions(terrain,cityCount),distance=(a:Point,b:Point)=>(a.x-b.x)**2+(a.y-b.y)**2;
  const seeds=[regions.reduce((best,r,i)=>polygonArea(r.ring)>polygonArea(regions[best].ring)?i:best,0)];
  while(seeds.length<count){let best=-1,score=-1;regions.forEach((r,i)=>{if(seeds.includes(i))return;const d=Math.min(...seeds.map(s=>distance(r.center,regions[s].center)));if(d>score){best=i;score=d;}});seeds.push(best);}
  const owners=new Int32Array(regions.length).fill(-1),queue=[...seeds];seeds.forEach((s,i)=>{owners[s]=i;});
  for(let head=0;head<queue.length;head++)for(const next of regions[queue[head]].neighbors)if(owners[next]<0){owners[next]=owners[queue[head]];queue.push(next);}
  regions.forEach((r,i)=>{if(owners[i]<0)owners[i]=seeds.reduce((best,s,n)=>distance(r.center,regions[s].center)<distance(r.center,regions[seeds[best]].center)?n:best,0);});
  const civilization=initialCivilization47(terrain.worldId,count,[...owners],setup),point=(p:Point)=>({x:p.x*scale,y:p.y*scale});
  const provinces=regions.map((r,i)=>({id:`p-${i}`,name:cityName47(civilization.cities['c-'+i]),polygon:r.ring.map(point),center:point(r.center),label:point(r.center),terrain:r.height>65?'mountain' as const:r.height>45?'forest' as const:'plain' as const,legalOwner:`n-${owners[i]}`,controller:`n-${owners[i]}`,neighbors:[...r.neighbors].map(n=>'p-'+n),supply:80}));
  const cities=regions.map((r,i)=>({id:'c-'+i,name:cityName47(civilization.cities['c-'+i]),provinceId:'p-'+i,position:point(r.center),label:point(r.center),fort:seeds.includes(i)?2:0}));
  const nations=seeds.map((s,i)=>({id:'n-'+i,name:nationName47(civilization.nations['n-'+i]),color:settlementPalette[i],capitalId:'c-'+s,regimeId:'regime-'+i,dynastyId:'dynasty-'+i})),id='fms-'+crypto.randomUUID();
  const raw:World={schemaVersion:1,rulesVersion:'0.1.0',scenario:'custom-world',custom:{id,name:'我的诸国世界',seed:terrain.worldId,rivers:[]},mode:'sandbox',day:0,nations,provinces,cities,armies:[],events:[],nextEventId:1};
  if(!validateCivilizationWorld47(raw))throw Error('文化世界地理或实体引用无效，原稿未改动。');
  const world=initializeManagement(raw,relations,(w,kind,text,reason)=>{w.events.push({id:w.nextEventId++,day:w.day,kind,text,reason});});
  if(!validateCivilizationWorld47(world))throw Error('文化世界治理初始化无效，原稿未改动。');
  const clock={version:1 as const,tick:0},chronicle=initialCivilizationChronicle47(world,civilization),{people,life}=initialPeopleAndLife22({world,clock,chronicle});
  assertCivilization47(civilization,world,chronicle);
  return attachHouseGovernance47(attachHouses47(attachOrigins47(attachFamilies47({id,terrain,scale,world,clock,civilization,chronicle,people,life}))));
}
