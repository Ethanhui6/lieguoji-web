import {assertFmsDocument,type FmsDocument} from '../model';
import {initializeManagement} from '../../compat/v0_4/sim/statecraft';
import {validateCivilizationWorld47} from './civilization47-world-validation';
import type {Point,World} from '../../sim/types';
import {settlementRegions} from './settlement25-regions';
import {settlementRegions47,SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {settlementPalette} from './settlement25-palette';
import {initialCivilization47,initialCivilizationChronicle47,nationName47,cityName47,assertCivilization47,validateCultureSetup47,type WorldCultureSetup47} from './civilization47-names';
import {initialPeopleAndLife22} from './life22-people';
import {attachFamilies47} from './civilization47-family';
import {attachOrigins47} from './civilization47-origins';
import {attachHouses47} from './civilization47-houses';
import {attachHouseGovernance47} from './civilization47-house-governance';
import {attachNobility47} from './civilization47-nobility';
import {assertOpeningLayout47,defaultLayout47,type OpeningLayout47} from './opening-layout47';

/** Actual terrain/world/founding-person creation phase for full47. No call to
 * old create/initialNaming, no temporary fake EasternFantasy identity. This is
 * not an enabled session: military/fiscal/kin lifecycle and storage still need
 * the new owner. Geometry is the existing measured web settlement algorithm. */
export function createCivilizationWorld47(document:FmsDocument,count:number,cityCount:number,relations:'peace'|'war',setup:WorldCultureSetup47,settlementAlgorithm?:typeof SETTLEMENT47_ALGORITHM,layout?:OpeningLayout47,families?:'original') {
  assertFmsDocument(document);if(!Number.isInteger(count)||count<2||count>24||count>cityCount||!['peace','war'].includes(relations)||settlementAlgorithm!==undefined&&settlementAlgorithm!==SETTLEMENT47_ALGORITHM)throw Error('新世界国家、城市或关系配置无效。');validateCultureSetup47(setup,count);
  const terrain=structuredClone(document),scale=1000/Math.max(terrain.width,terrain.height),regions=settlementAlgorithm?settlementRegions47(terrain,cityCount).regions:settlementRegions(terrain,cityCount);
  // A player layout (map editor: place/draw states) is used as given; otherwise the automatic opening.
  if(layout!==undefined){if(!settlementAlgorithm)throw Error('旧划分不支持自定义国家领土。');assertOpeningLayout47(layout,regions.length,count);}
  const {seeds,owners}=layout??defaultLayout47(regions,count);
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
  const base=attachOrigins47(attachFamilies47({id,terrain,scale,world,clock,civilization,chronicle,people,life}));
  // Original family system: noble families and family territories replace the web fief rules.
  const withHouses=()=>attachHouseGovernance47(attachHouses47(base));
  // Typed as the house variant: houses and houseGovernance are optional on every consumer.
  // reigns47: LeaderHistoryRecord snapshots, kept by worlds created since 0.5.37.
  if(families==='original')return {...attachNobility47(base),reigns47:{}} as unknown as ReturnType<typeof withHouses>;
  if(families!==undefined)throw Error('家族规则无效。');
  return withHouses();
}
