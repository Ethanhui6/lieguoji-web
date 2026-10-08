import type {Army,Point} from '../../sim/types';
import type {TravelGraph47} from './army-travel47-graph';
import {locateTravelCell47} from './army-travel47-graph';
import {armyTravelLocation47,assertArmyTravel47,beginArmyTravel47,type ArmyTravel47} from './army-travel47-state';

/** A persistent ledger for every Army, including halted/arrived sea units.
 * Old provinceId stays a compatibility/history reference, never a sea location.
 * Geometry binding is supplied by the versioned run's validated geography. */
export type ArmyPositions47={version:1;binding:string;revision:number;records:Record<string,ArmyTravel47>};
export type ArmyPositionSeed47={armyId:string;provinceId:string;point:Point};
export function initialArmyPositions47(seeds:readonly ArmyPositionSeed47[],g:TravelGraph47,binding:string):ArmyPositions47{
 const records:Record<string,ArmyTravel47>={};
 for(const seed of seeds){
  if(Object.hasOwn(records,seed.armyId))throw Error('军队位置身份重复。');
  const cell=locateTravelCell47(g,seed.point,seed.provinceId);if(!cell)throw Error('军队实际位置无法无损对应陆地，已保留原世界。');
  records[seed.armyId]=beginArmyTravel47(seed.armyId,[cell.id],g,seed.point);
 }
 const value:ArmyPositions47={version:1,binding,revision:0,records};assertArmyPositions47(value,g,binding,seeds.map(s=>s.armyId));return value;
}
/** This checks identity and geometry, not complete saved-run validity. The
 * v47 store must additionally validate finance, diplomacy and command state. */
export function assertArmyPositions47(value:unknown,g:TravelGraph47,binding:string,armyIds:readonly string[],cargoIds:readonly string[]=[]):asserts value is ArmyPositions47{
 const v=value as ArmyPositions47;
 if(!v||typeof v!=='object'||Object.keys(v).sort().join('/')!=='binding/records/revision/version'||v.version!==1||typeof binding!=='string'||!binding||v.binding!==binding||!Number.isSafeInteger(v.revision)||v.revision<0||!v.records||typeof v.records!=='object'||Array.isArray(v.records)||new Set(armyIds).size!==armyIds.length||Object.keys(v.records).length!==armyIds.length)throw Error('统一军队位置账无效，已保留原档。');
 const cargo=new Set(cargoIds);
 for(const id of armyIds){if(cargo.has(id)||!Object.hasOwn(v.records,id)||v.records[id]?.armyId!==id)throw Error('军队出现重复或缺失的位置身份。');assertArmyTravel47(v.records[id],g);}
}
export type ArmyPresence47={land:Map<string,Army[]>;sea:Map<number,Army[]>;points:Map<string,Point>};
/** Called before battle, occupation, supply or political presence queries.
 * A sea Army has no land membership, irrespective of its old provinceId. */
export function armyPresence47(positions:ArmyPositions47,g:TravelGraph47,armies:readonly Army[]):ArmyPresence47{
 assertArmyPositions47(positions,g,positions.binding,armies.map(a=>a.id));
 const land=new Map<string,Army[]>(),sea=new Map<number,Army[]>(),points=new Map<string,Point>();
 for(const army of armies){
  if(army.troops<=0||army.status==='destroyed')continue;
  const location=armyTravelLocation47(positions.records[army.id],g);points.set(army.id,location.point);
  if(location.onLand){const id=location.cell.provinceId!,group=land.get(id)??[];group.push(army);land.set(id,group);}
  else{const group=sea.get(location.cell.face)??[];group.push(army);sea.set(location.cell.face,group);}
 }
 return{land,sea,points};
}
