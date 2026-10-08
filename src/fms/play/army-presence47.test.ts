import {describe,it,expect} from 'vitest';
import type {Army} from '../../sim/types';
import type {TravelGraph47} from './army-travel47-graph';
import {armyPresence47,assertArmyPositions47,initialArmyPositions47} from './army-presence47';
import {beginArmyTravel47,advanceArmyTravel47,haltArmyTravel47} from './army-travel47-state';
import {nativeSeaProvinceAtWar} from './native-war/sea-war-presence';
function setup(){
 const g:TravelGraph47={scale:1,polygonWork:0,byProvince:new Map([['old-shore',[0]],['target-shore',[2]]]),cells:new Map([0,1,2].map(id=>[id,{id,face:id,surface:id===1?'sea':'land',provinceId:id===0?'old-shore':id===2?'target-shore':null,center:{x:id*10+5,y:5},polygon:[{x:id*10,y:0},{x:id*10+10,y:0},{x:id*10+10,y:10},{x:id*10,y:10}],links:[...(id>0?[{to:id-1,gate:{x:id*10,y:5},distance:10,toGate:5}]:[]),...(id<2?[{to:id+1,gate:{x:id*10+10,y:5},distance:10,toGate:5}]:[])]}]))};
 const armies=[{id:'army-1',nationId:'n-1',provinceId:'old-shore',troops:100,status:'idle'},{id:'army-2',nationId:'n-2',provinceId:'target-shore',troops:100,status:'idle'}] as Army[];
 const positions=initialArmyPositions47(armies.map((a,i)=>({armyId:a.id,provinceId:a.provinceId,point:{x:i*20+6,y:4}})),g,'terrain-test');return {g,armies,positions};
}
describe('v47 identity and actual membership ledger',()=>{
 it('initializes exact positions, round-trips halted sea identity, never adds land membership from a stale anchor',()=>{
  const {g,armies,positions}=setup();expect(armyPresence47(positions,g,armies).points.get('army-1')).toEqual({x:6,y:4});
  positions.records['army-1']=haltArmyTravel47(advanceArmyTravel47(beginArmyTravel47('army-1',[0,1,2],g),g,12,()=>1,()=>true).travel,g);
  const restored=JSON.parse(JSON.stringify(positions));assertArmyPositions47(restored,g,'terrain-test',armies.map(a=>a.id));
  const p=armyPresence47(restored,g,armies);expect(p.land.has('old-shore')).toBe(false);expect(p.sea.get(1)?.map(a=>a.id)).toEqual(['army-1']);expect(armies[0].provinceId).toBe('old-shore');expect(p.points.get('army-1')).toEqual({x:17,y:5});
 });
 it('only changes land presence on actual landing, including a revoked-entry coast stop',()=>{
  const {g,armies,positions}=setup();positions.records['army-1']=advanceArmyTravel47(beginArmyTravel47('army-1',[0,1,2],g),g,12,()=>1,()=>true).travel;
  positions.records['army-1']=advanceArmyTravel47(positions.records['army-1'],g,100,()=>1,c=>c.surface==='sea').travel;expect(armyPresence47(positions,g,armies).land.get('target-shore')!.map(a=>a.id)).toEqual(['army-2']);
  positions.records['army-1']=advanceArmyTravel47(positions.records['army-1'],g,1,()=>1,()=>true).travel;expect(armyPresence47(positions,g,armies).land.get('target-shore')!.map(a=>a.id)).toEqual(['army-1','army-2']);
 });
 it('rejects missing, duplicate, cargo and geometry identities without repairing the source',()=>{
  const {g,armies,positions}=setup(),ids=armies.map(a=>a.id),original=structuredClone(positions);
  expect(()=>assertArmyPositions47(positions,g,'different-terrain',ids)).toThrow();expect(()=>assertArmyPositions47(positions,g,'terrain-test',[...ids,ids[0]])).toThrow();expect(()=>assertArmyPositions47(positions,g,'terrain-test',ids,['army-1'])).toThrow();
  const missing=structuredClone(positions);delete missing.records['army-1'];expect(()=>assertArmyPositions47(missing,g,'terrain-test',ids)).toThrow();
  expect(positions).toEqual(original);expect(()=>initialArmyPositions47([{armyId:'army-1',provinceId:'old-shore',point:{x:25,y:5}}],g,'terrain-test')).toThrow(/无损/);
 });
 it('destroyed records remain saved but do not create supply or battle membership',()=>{
  const {g,armies,positions}=setup();armies[0].status='destroyed';expect(armyPresence47(positions,g,armies).points.has('army-1')).toBe(false);expect(positions.records['army-1']).toBeDefined();
 });
});
describe('native sea-province war trigger, distinct from Army damage',()=>{
 const enemy=(a:string,b:string)=>a==='n-a'&&b==='n-b';
 it.each([['Army/Army',['n-a','n-b'],[]],['Army/Navy',['n-a'],['n-b']],['Navy/Navy',[],['n-a','n-b']]] as const)('%s uses one combined presence set',(_,armies,navies)=>{expect(nativeSeaProvinceAtWar(false,armies,navies,enemy)).toBe(true);});
 it('is global to the sea province, so a neutral observer does not suppress another hostile pair',()=>{expect(nativeSeaProvinceAtWar(false,['neutral','n-a'],['n-b'],enemy)).toBe(true);});
 it('does not invent war on land, among friendly states, duplicate identities or absent units',()=>{
  expect(nativeSeaProvinceAtWar(true,['n-a','n-b'],[],enemy)).toBe(false);expect(nativeSeaProvinceAtWar(false,['n-a','n-a'],['neutral',null],enemy)).toBe(false);expect(nativeSeaProvinceAtWar(false,[null],[null],enemy)).toBe(false);
 });
});
