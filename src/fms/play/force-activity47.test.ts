import {beforeAll,describe,expect,it} from 'vitest';
import {Culture47Session} from './culture47-session';
import {grid} from './fixture.test-support';
import {actualForces47} from './force-runtime47';
import {beginArmyTravel47} from './army-travel47-state';
import {resistanceCapacity} from './occupation';
import {forceActivities47,forceActivity47,nationForceActivities47} from './force-activity47';

let base:ReturnType<Culture47Session['snapshot']>['run'];
beforeAll(()=>{base=new Culture47Session().create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:60,relations:'war',setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}}).run;},30000);

function declarePairWar(r:typeof base,a:string,b:string){
 const relation=r.world.statecraft!.relations.find(row=>(row.a===a&&row.b===b)||(row.a===b&&row.b===a));
 if(!relation)throw Error('测试世界缺少双边外交关系。');
 relation.status='war';
}

describe('committed real47 force activity projection',()=>{
 it('reports an army at its committed sea cell rather than its legacy province and does not mutate the run',()=>{
  const r=structuredClone(base),army=r.world.armies[0],{spatial}=actualForces47(r),sea=[...spatial.graph.cells.values()].find(cell=>cell.surface==='sea')!,target=r.world.provinces.find(p=>p.controller!==army.nationId)!;
  r.armyPositions.records[army.id]=beginArmyTravel47(army.id,[sea.id],spatial.graph);
  Object.assign(r.armyAutonomy.armies[army.id],{decision:'attacking',targetId:target.id,garrisonId:null,issuedTick:0,nextTick:0,reason:'测试：沿已确认海路前往目标。'});
  const before=structuredClone(r),activity=forceActivity47(r,'army',army.id)!;
  expect(activity.location).toEqual({kind:'sea',face:sea.face,label:'海上'});expect(activity.target).toEqual({kind:'province',id:target.id,label:target.name});expect(activity.decisionLabel).toBe('进攻中');expect(activity.siege).toBeNull();expect(r).toEqual(before);
 });
 it('shows only a presently verified hostile siege and keeps third-party inference out',()=>{
  const r=structuredClone(base),army=r.world.armies[0],target=r.world.provinces.find(p=>p.controller!==army.nationId)!,{spatial}=actualForces47(r),land=[...spatial.graph.cells.values()].find(cell=>cell.surface==='land'&&cell.provinceId===target.id)!;
  declarePairWar(r,army.nationId,target.controller);r.armyPositions.records[army.id]=beginArmyTravel47(army.id,[land.id],spatial.graph);
  const maximum=resistanceCapacity(r.world,target);r.occupation.sieges=[{provinceId:target.id,controller:target.controller,attacker:army.nationId,resistance:maximum/2,maximum,started:0,pulse:0}];
  const before=structuredClone(r),activity=forceActivity47(r,'army',army.id)!;
  expect(activity.location).toEqual({kind:'land',provinceId:target.id,label:target.name});expect(activity.siege).toMatchObject({provinceId:target.id,role:'attacker',progress:.5,remaining:maximum/2,maximum});expect(r).toEqual(before);
  const sea=[...spatial.graph.cells.values()].find(cell=>cell.surface==='sea')!;r.armyPositions.records[army.id]=beginArmyTravel47(army.id,[sea.id],spatial.graph);
  expect(forceActivity47(r,'army',army.id)!.siege).toBeNull();
 });
 it('resolves a fleet target through its real harbor site and returns only the requested nation',()=>{
  const r=structuredClone(base),fleet=r.navy.fleets.find(candidate=>candidate.status!=='lost'&&r.maritime.hulls[candidate.id]>0);
  if(!fleet)throw Error('测试世界缺少可用舰队。');
  const harbor=r.harbors.sites[0],province=r.world.provinces.find(p=>p.id===harbor.provinceId)!,city=r.world.cities.find(c=>c.id===harbor.capitalId);
  Object.assign(r.navalAutonomy.fleets[fleet.id],{decision:'guarding',assignedPortId:harbor.id,reason:'测试：按真实港口站点警戒。'});
  const before=structuredClone(r),activity=forceActivity47(r,'fleet',fleet.id)!;
  expect(activity.target).toEqual({kind:'port',id:harbor.id,label:city?`${city.name}港`:province.name});expect(activity.location.kind).toBe('sea');expect(activity.decisionLabel).toBe('海域警戒');expect(nationForceActivities47(r,fleet.nationId).every(row=>row.nationId===fleet.nationId)).toBe(true);expect(forceActivities47(r).some(row=>row.id===fleet.id&&row.kind==='fleet')).toBe(true);expect(r).toEqual(before);
 });
});
