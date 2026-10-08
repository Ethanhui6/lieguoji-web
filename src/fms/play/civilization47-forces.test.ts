import {beforeAll,describe,it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {createGovernmentWorld47} from './civilization47-government';
import {attachFoundingForces47,assertFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {actualForces47} from './force-runtime47';
import {armyTravelLocation47} from './army-travel47-state';
import {graphFor46} from './war46-geography';
import {assertWars47} from './war47-validation';
import {assertLosses} from './war27-losses';
import {assertWar26} from './war26-validation';
import {applyArmyCommand47,armyStamp47} from './army-commands47';
import {advanceCivilizationMilitary47} from './civilization47-military';

let government:ReturnType<typeof createGovernmentWorld47>,founding:FoundingForces47;
const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
beforeAll(()=>{
  government=createGovernmentWorld47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),5,60,'war',{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman']});
  founding=attachFoundingForces47(government);
},20000);
describe('actual cultural creation joins the uniform military phase',()=>{
  it('owns all real military states without running an old version creator or six-culture aliases',()=>{
    assertFoundingForces47(founding);actualForces47(founding);expect('version' in founding).toBe(false);expect('culture' in founding).toBe(false);expect('navy' in government).toBe(false);
    expect(founding.world.armies).toEqual(government.world.armies);expect(founding.people).toEqual(government.people);expect(founding.finance).toEqual(government.finance);expect(founding.governmentOpening).toEqual(government.governmentOpening);
    expect(founding.battles.engagements).toEqual([]);expect(founding.maritime.contacts).toEqual([]);expect(founding.transports.cargo).toEqual([]);expect(founding.forceClock.draws).toBe(0);
  });
  it('creates affordable fleets at actual qualified harbors and accounts for every crew and grain debit',()=>{
    expect(founding.navy.fleets.length).toBeGreaterThan(0);const g=graphFor46(founding),space=actualForces47(founding),charges=founding.navalOpening.charges;
    expect(charges.length).toBe(founding.navy.fleets.length);
    for(const p of founding.world.statecraft!.provinces){const before=government.world.statecraft!.provinces.find(b=>b.provinceId===p.provinceId)!,local=charges.filter(c=>c.homeId===p.provinceId);expect(p.population).toBe(before.population-local.reduce((n,c)=>n+c.crew,0));expect(p.grain).toBe(before.grain-local.reduce((n,c)=>n+c.grain,0));}
    for(const fleet of founding.navy.fleets){const port=g.ports.find(p=>p.id===fleet.dockId)!,position=armyTravelLocation47(founding.fleetPositions.records[fleet.id],space.spatial.graph);expect(port).toBeDefined();expect(position.onLand).toBe(false);expect(position.cell.face).toBe(fleet.node);expect(position.cell.id).toBe(fleet.node*2+1);expect(position.point).toEqual(g.nodes.get(port.node)!.center);expect(founding.maritime.hulls[fleet.id]).toBe(fleet.ships*100);expect(charges.find(c=>c.fleetId===fleet.id)).toMatchObject({homeId:port.provinceId,crew:fleet.crew,grain:fleet.food});}
  });
  it('registers chosen initial wars without inventing a declaration initiator or victory demands',()=>{
    expect(founding.nativeWars.campaigns.length).toBeGreaterThan(0);expect(founding.nativeWars.campaigns.every(c=>c.history==='unknown'&&c.attacker===null&&c.startTime===null&&c.goals.length===0)).toBe(true);
    assertWars47(founding.nativeWars,founding);assertWar26(founding.warfare,founding.world,0);assertLosses(founding.losses,founding.world,founding.warfare,0);
  });
  it('connects a real creation army to saved native speed, command and the real family clock',()=>{
    const graph=actualForces47(founding).spatial.graph,a=founding.world.armies.find(a=>founding.world.provinces.find(p=>p.id===a.provinceId)!.neighbors.some(id=>founding.world.provinces.find(p=>p.id===id)!.controller===a.nationId))!,target=founding.world.provinces.find(p=>p.id===a.provinceId)!.neighbors.find(id=>founding.world.provinces.find(p=>p.id===id)!.controller===a.nationId)!;
    const input=structuredClone(founding),before=armyTravelLocation47(input.armyPositions.records[a.id],graph).point,command=applyArmyCommand47(input,{type:'army-move',armyId:a.id,target:{kind:'province',id:target},kind:'march'},armyStamp47(input),weights);
    const result=advanceCivilizationMilitary47(command,1,weights,()=>({navyCountToHull:1,army:()=>({efficiency:1,damageToArmy:40,multiplier:1}),navy:()=>({destiny:30,maritime:false,livingLeaderModifier:null})}));
    expect(armyTravelLocation47(result.run.armyPositions.records[a.id],graph).point).not.toEqual(before);expect(result.run.clock.tick).toBe(1);expect(result.dailyPending).toBe(false);expect(result.run.finance).toEqual(founding.finance);expect(result.run.civilization).toEqual(founding.civilization);expect(input).toEqual(founding);
    // Family advances, while finance/daily settlement is still a separate owner.
    expect(result.run.life.lastTick).toBe(1);expect(result.run.life.gameTime).toBe(Math.fround(result.run.life.secondsPerDay/120));expect(result.run.forceSpeed).toEqual(founding.forceSpeed);expect(()=>assertFoundingForces47(result.run)).toThrow();
  });
  it('clones the full candidate exactly and rejects repeated initialization without changing input',()=>{
    const copy=structuredClone(founding);assertFoundingForces47(copy);expect(copy).toEqual(founding);expect(()=>attachFoundingForces47(founding)).toThrow();expect(founding).toEqual(copy);
  });
  it.each(['crew','grain','sparse','future','fleetLocation','hull','missingArmy','futurePosition','tax','war','clock'] as const)('rejects a %s defect in the initial military receipt',fault=>{
    const r=structuredClone(founding),fleet=r.navy.fleets[0];
    if(fault==='crew')r.navalOpening.charges[0].crew++;if(fault==='grain')r.world.statecraft!.provinces[0].grain++;if(fault==='sparse')r.navalOpening.charges=Array(r.navalOpening.charges.length);if(fault==='future')Object.assign(r.navalOpening,{future:1});
    if(fault==='fleetLocation')r.fleetPositions.records[fleet.id]=structuredClone(r.armyPositions.records[r.world.armies[0].id]);if(fault==='hull')r.maritime.hulls[fleet.id]--;if(fault==='missingArmy')r.world.armies.pop();if(fault==='futurePosition')Object.assign(r.fleetPositions,{future:1});
    if(fault==='tax')r.finance.nations['n-0'].gold++;if(fault==='war')r.nativeWars.campaigns=[];if(fault==='clock')r.forceClock.rng++;
    const before=structuredClone(r);expect(()=>assertFoundingForces47(r)).toThrow();expect(r).toEqual(before);
  });
});
