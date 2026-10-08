import {beforeAll,describe,it,expect} from 'vitest';
import {grid} from './fixture.test-support';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {settleCivilizationDay47} from './civilization47-daily';
import {advanceFamilyCalendar47,assertFamilyCalendar47} from './civilization47-calendar';
import {advanceCivilizationMilitary47} from './civilization47-military';
import {actualForces47} from './force-runtime47';
import {beginArmyTravel47,armyTravelLocation47} from './army-travel47-state';
import {forceKey47} from './force-motion47';
import {settleFleetFood47,finishDailyForces47} from './civilization47-upkeep';
import {monthlyArmyFees47} from './civilization47-fiscal';
import {musterMonth47} from './civilization47-monthly-muster';
import {graphFor46} from './war46-geography';
import {assertForceSpeed47} from './force-speed47';
import {sourceLegionStrength} from './muster21-rules';
import {nativeMonthlyEmergencyQuantity} from './native-economy/emergency-muster';
import {personTraits} from './court16-people';
import {nativeGoldBattleModifier,defaultPoliticalCombat} from './native-combat/upper-efficiency';
import {economicEthnic47} from './civilization47-economy';

let base:FoundingForces47,dayOne:FoundingForces47,dayThirty:FoundingForces47;
const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
// Explicit no-AI fixture, never a playable-world claim. Combat uses real people.
const noOrders=()=>undefined;
/** Positions and fiscal data are fixture inputs. Advancing the calendar here
 * does not claim that preceding economic days or AI were simulated. */
function pending(day:number){const r=structuredClone(base);for(let tick=1;tick<=day*120;tick++){r.clock.tick=tick;r.world.day=Math.floor(tick/120)-(tick===day*120?1:0);advanceFamilyCalendar47(r,tick,tick===day*120);}r.forceClock.now=r.clock.tick;r.dailyEconomy.lastDay=r.world.day;r.dailyEconomy.lastMusterMonth=Math.floor(r.world.day/30);return r;}
beforeAll(()=>{base=createFoundingForces47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),5,60,'peace',{mode:'culture-generated',enabled:['chinese','japanese','english','arab','roman']});dayOne=pending(1);dayThirty=pending(30);},30000);
function stock(r:FoundingForces47,id:string){return r.world.statecraft!.provinces.find(p=>p.provinceId===id)!;}
function atSea(r:FoundingForces47,id:string,moving=false){const graph=actualForces47(r).spatial.graph,cell=[...graph.cells.values()].find(c=>c.surface==='sea'&&c.links.some(l=>graph.cells.get(l.to)!.surface==='sea'))!,to=cell.links.find(l=>graph.cells.get(l.to)!.surface==='sea')!.to;r.armyPositions.records[id]=beginArmyTravel47(id,moving?[cell.id,to]:[cell.id],graph);return cell;}
function fleetAway(r:FoundingForces47){const fleet=r.navy.fleets[0],graph=actualForces47(r).spatial.graph,cell=[...graph.cells.values()].find(c=>c.surface==='sea'&&c.face!==fleet.node)!;r.fleetPositions.records[fleet.id]=beginArmyTravel47(fleet.id,[cell.id],graph);return fleet;}

describe('atomic real47 food, monthly tax and muster candidate',()=>{
  it('settles a real military day boundary once, preserves input and resumes the next tick',()=>{
    const before=structuredClone(base),pendingRun=advanceCivilizationMilitary47(base,120,weights).run;
    const out=settleCivilizationDay47(pendingRun,noOrders);
    expect(base).toEqual(before);expect(pendingRun.world.day).toBe(0);expect(out.world.day).toBe(1);expect(out.dailyEconomy).toEqual({version:1,lastDay:1,lastMusterMonth:0});expect(out.life).toEqual(pendingRun.life);assertFamilyCalendar47(out);
    expect(out.world.statecraft!.nations.every(n=>n.lastLedger?.day===1)).toBe(true);expect(out.armyPositions.revision).toBe(pendingRun.armyPositions.revision+1);expect(out.finance).toEqual(pendingRun.finance);
    expect(()=>settleCivilizationDay47(out,noOrders)).toThrow();expect(advanceCivilizationMilitary47(out,1,weights).run.clock.tick).toBe(121);
  },30000);
  it('sea armies consume once without drawing grain from their stale land anchor',()=>{
    const r=structuredClone(dayOne),a=r.world.armies[0],home=a.provinceId;atSea(r,a.id);a.supplies=50;
    const out=settleCivilizationDay47(r,noOrders),after=out.world.armies.find(v=>v.id===a.id)!;
    expect(after.supplies).toBe(46);expect(after.provinceId).toBe(home);expect(after.troops).toBe(a.troops);expect(after.morale).toBe(a.morale);
    expect(armyTravelLocation47(out.armyPositions.records[a.id],actualForces47(out).spatial.graph).onLand).toBe(false);
  });
  it('safe stopped home armies replenish while idle-but-moving armies do not',()=>{
    const r=structuredClone(dayOne),a=r.world.armies[0],graph=actualForces47(r).spatial.graph,location=armyTravelLocation47(r.armyPositions.records[a.id],graph),link=location.cell.links.find(l=>graph.cells.get(l.to)!.provinceId===a.provinceId)!;
    expect(link).toBeDefined();stock(r,a.provinceId).grain=1_000_000;a.supplies=50;a.morale=50;
    const stopped=settleCivilizationDay47(r,noOrders).world.armies.find(v=>v.id===a.id)!;expect(stopped.supplies).toBeGreaterThan(46);expect(stopped.morale).toBe(53);
    r.armyPositions.records[a.id]=beginArmyTravel47(a.id,[location.cell.id,link.to],graph,location.point);expect(a.status).toBe('idle');
    const moving=settleCivilizationDay47(r,noOrders).world.armies.find(v=>v.id===a.id)!;expect(moving.supplies).toBe(44);expect(moving.morale).toBe(50);
  });
  it('starvation removes a held force and its deadline without erasing history or inventing combat kills',()=>{
    const r=structuredClone(dayOne),a=r.world.armies[0],b=r.world.armies.find(v=>v.nationId!==a.nationId)!,sea=atSea(r,a.id),graph=actualForces47(r).spatial.graph;
    r.armyPositions.records[b.id]=beginArmyTravel47(b.id,[sea.id],graph);for(const rel of r.world.statecraft!.relations)if([a.nationId,b.nationId].includes(rel.a)&&[a.nationId,b.nationId].includes(rel.b))rel.status='war';
    a.troops=1;a.supplies=0;b.supplies=100;finishDailyForces47(r);const key=forceKey47({kind:'army',id:a.id});expect(r.forceContacts.pairs.length).toBeGreaterThan(0);expect(r.forceClock.deadlines[key]).toBeDefined();r.forceDamage.carry[key]=.4;r.forceDamage.losses[key]=3;
    const out=settleCivilizationDay47(r,noOrders),dead=out.world.armies.find(v=>v.id===a.id)!;
    expect(dead.status).toBe('destroyed');expect(dead.troops).toBe(0);expect(out.forceContacts.pairs.some(p=>p.a===key||p.b===key)).toBe(false);expect(out.forceClock.deadlines[key]).toBeUndefined();expect(out.forceDamage).toEqual(r.forceDamage);
    expect(out.losses.nations[a.nationId].total.starvation).toBe(1);expect(out.losses.nations[a.nationId].unassigned.starvation).toBe(1);expect(out.losses.nations[a.nationId].total.combat).toBe(0);expect(out.armyPositions.records[a.id].status).toBe('halted');
    expect(advanceCivilizationMilitary47(out,1,weights).run.clock.tick).toBe(121);
  });
  it('retries from the same private pending state deterministically, including JSON reload',()=>{
    const r=structuredClone(dayThirty),before=structuredClone(r),out=settleCivilizationDay47(r,noOrders),{terrain,...state}=r;
    expect(settleCivilizationDay47({...JSON.parse(JSON.stringify(state)),terrain},noOrders)).toEqual(out);expect(r).toEqual(before);expect(out.dailyEconomy.lastMusterMonth).toBe(1);
  });
  it('uses actual sea transit for the 420 gold fee and caches gold combat before the fee',()=>{
    const r=structuredClone(dayThirty),a=r.world.armies[0];atSea(r,a.id,true);expect(monthlyArmyFees47(r,a.nationId).cost).toBe(420);
    const out=settleCivilizationDay47(r,noOrders),account=out.finance.nations[a.nationId],ledger=account.ledger!;
    expect(account.armyCostGold).toBe(420);expect(account.gold).toBe(ledger.goldBeforeArmyCost-420);expect(account.goldBattleModifier).toBe(nativeGoldBattleModifier(ledger.goldBeforeArmyCost,defaultPoliticalCombat(out.upperCombat.nations[a.nationId].polity).goldProduction,economicEthnic47(out.economy,a.nationId)));expect(ledger.day).toBe(30);
    r.armyPositions.records[a.id].status='halted';expect(monthlyArmyFees47(r,a.nationId).cost).toBe(0);
  });
  it('orders observe tax before muster and destiny; a replacement joins every real military ledger',()=>{
    const r=structuredClone(dayThirty),a=r.world.armies[0],nation=a.nationId,home=r.tactics.forces[a.id].homeId,oldIds=new Set(r.world.armies.map(a=>a.id));a.troops=0;a.status='destroyed';let populationBefore=0,expectedTroops=0;
    const out=settleCivilizationDay47(r,owned=>{
      expect(owned.finance.nations[nation].lastMonth).toBe(1);expect(owned.destiny.nations[nation].lastMonth).toBe(0);expect(owned.world.armies.length).toBe(r.world.armies.length);
      populationBefore=stock(owned,home).population;const values=owned.world.statecraft!.provinces.map(p=>p.population).sort((a,b)=>a-b),m=values.length>>1;expectedTroops=sourceLegionStrength(populationBefore,(values[m-1]+values[m])/2);return undefined;
    });
    const replacement=out.world.armies.find(a=>!oldIds.has(a.id)&&out.tactics.forces[a.id].homeId===home)!;expect(replacement).toBeDefined();expect(replacement.troops).toBe(expectedTroops);expect(stock(out,home).population).toBe(populationBefore-Math.round(expectedTroops/10));expect(out.units[replacement.id]).toBeDefined();expect(out.upperCombat.armies[replacement.id].initializedTick).toBe(3600);expect(out.forceSpeed.armies[replacement.id].initializedTick).toBe(3600);assertForceSpeed47(out.forceSpeed,out.world,3600);
    const position=armyTravelLocation47(out.armyPositions.records[replacement.id],actualForces47(out).spatial.graph);expect(position.onLand).toBe(true);expect(position.point).toEqual(out.world.provinces.find(p=>p.id===home)!.center);expect(out.destiny.nations[nation].lastMonth).toBe(1);
    const settled=structuredClone(out);musterMonth47(out);expect(out).toEqual(settled);expect(advanceCivilizationMilitary47(out,1,weights).run.clock.tick).toBe(3601);
  });
  it('mobilizes from actual safe core locations and respects the saved cooldown on repeated month entry',()=>{
    const r=structuredClone(dayThirty),p=r.world.provinces.find(p=>p.neighbors.some(id=>r.world.provinces.find(v=>v.id===id)!.controller!==p.controller))!,other=r.world.provinces.find(v=>p.neighbors.includes(v.id)&&v.controller!==p.controller)!.controller,id=p.controller;
    for(const rel of r.world.statecraft!.relations)if([id,other].includes(rel.a)&&[id,other].includes(rel.b))rel.status='war';r.upperCombat.nations[id].coreThreshold=100;r.destiny.nations[id].destiny=50;r.upperCombat.nations[id].destiny=50;
    const person=r.people.persons[r.people.nations[id].leaderId!];person.traits=[];r.kin.persons[person.id].traits=[];const expected=nativeMonthlyEmergencyQuantity(50,personTraits(person)).count,oldIds=new Set(r.world.armies.map(a=>a.id));
    const out=settleCivilizationDay47(r,noOrders),emergency=out.world.armies.filter(a=>a.nationId===id&&!oldIds.has(a.id)&&out.tactics.forces[a.id].kind==='emergency');expect(emergency.length).toBe(expected);expect(expected).toBeGreaterThan(0);expect(out.tactics.mobilizations[id].lastMonth).toBe(1);
    const snapshot=structuredClone(out);musterMonth47(out);expect(out).toEqual(snapshot);expect(emergency.every(a=>out.forceSpeed.armies[a.id]&&out.armyPositions.records[a.id])).toBe(true);
  });
  it('peace retirement excludes idle armies still at sea or in transit and adds no war losses',()=>{
    const r=structuredClone(dayThirty),nation=r.world.armies[0].nationId,forces=r.world.armies.filter(a=>a.nationId===nation).slice(0,3);expect(forces.length).toBe(3);
    for(const a of forces)r.tactics.forces[a.id].kind='emergency';atSea(r,forces[0].id,true);atSea(r,forces[1].id);const out=settleCivilizationDay47(r,noOrders);
    expect(out.world.armies.find(a=>a.id===forces[0].id)!.troops).toBeGreaterThan(0);expect(out.world.armies.find(a=>a.id===forces[1].id)!.troops).toBeGreaterThan(0);expect(out.world.armies.find(a=>a.id===forces[2].id)!.status).toBe('destroyed');expect(out.losses.nations[nation]).toEqual(r.losses.nations[nation]);
  });
  it('rolls back late order failure and final revision overflow',()=>{
    for(const failure of ['orders','revision']){const r=structuredClone(dayThirty);if(failure==='revision')r.armyPositions.revision=Number.MAX_SAFE_INTEGER;const before=structuredClone(r);expect(()=>settleCivilizationDay47(r,()=>{if(failure==='orders')throw Error('late fixture failure');return undefined;})).toThrow();expect(r).toEqual(before);}
  });
  it('rejects asynchronous order hooks without exposing a late-mutated result',async()=>{
    const r=structuredClone(dayOne),before=structuredClone(r);let finished=false;
    // @ts-expect-error The synchronous owner must reject an async hook statically as well.
    expect(()=>settleCivilizationDay47(r,async owned=>{await Promise.resolve();owned.world.day=999;finished=true;})).toThrow(/同步/);
    await Promise.resolve();expect(finished).toBe(true);expect(r).toEqual(before);
  });
  it.each(['grain','population','supplies','fleetFood','financeMonth','destinyMonth','capacity'] as const)('rejects invalid %s at entry without partial daily writes',fault=>{
    const r=structuredClone(dayThirty),id=r.world.nations[0].id;
    if(fault==='grain')r.world.statecraft!.provinces[0].grain=NaN;if(fault==='population')r.world.statecraft!.provinces[0].population=NaN;if(fault==='supplies')r.world.armies[0].supplies=NaN;if(fault==='fleetFood')r.navy.fleets[0].food=NaN;if(fault==='financeMonth')r.finance.nations[id].lastMonth=Infinity;if(fault==='destinyMonth')r.destiny.nations[id].lastMonth=Infinity;if(fault==='capacity')r.finance.provinces[r.world.provinces[0].id].maxPopulation=NaN;
    const before=structuredClone(r);expect(()=>settleCivilizationDay47(r,noOrders)).toThrow();expect(r).toEqual(before);
  });
  it('rejects resources corrupted by the order stage before returning a daily candidate',()=>{
    const r=structuredClone(dayOne),before=structuredClone(r);expect(()=>settleCivilizationDay47(r,owned=>{owned.world.statecraft!.provinces[0].grain=NaN;return undefined;})).toThrow(/粮/);expect(r).toEqual(before);
  });
});

describe('fleet food uses the actual stopped anchor, not legacy dock IDs',()=>{
  it('refills at the exact owned anchor even with no legacy dock, debiting grain once',()=>{
    const r=structuredClone(dayOne),fleet=r.navy.fleets[0],port=graphFor46(r).ports.find(p=>p.id===fleet.dockId)!,data=stock(r,port.provinceId);expect(fleet).toBeDefined();fleet.dockId=null;fleet.food=0;data.grain=data.population*10+fleet.crew*60+500;const opening=data.grain;settleFleetFood47(r);
    expect(fleet.food).toBe(fleet.crew*59);expect(data.grain).toBe(opening-fleet.crew*60);expect(r.losses.nations[fleet.nationId].total.crew).toBe(0);
  });
  it('stale dock IDs at sea cannot refill; last full ration does not kill crew',()=>{
    const r=structuredClone(dayOne),fleet=fleetAway(r),crew=fleet.crew;expect(fleet.dockId).not.toBeNull();fleet.food=crew;settleFleetFood47(r);expect(fleet.food).toBe(0);expect(fleet.crew).toBe(crew);
    settleFleetFood47(r);expect(fleet.crew).toBe(crew-Math.max(1,Math.floor(crew*.05)));expect(r.maritime.hulls[fleet.id]).toBe(fleet.ships*100);expect(r.losses.nations[fleet.nationId].unassigned.crew).toBe(Math.max(1,Math.floor(crew*.05)));
  });
  it('being stopped in the harbor face away from its anchor does not refill',()=>{
    const r=structuredClone(dayOne),fleet=r.navy.fleets[0],graph=actualForces47(r).spatial.graph,at=armyTravelLocation47(r.fleetPositions.records[fleet.id],graph),vertex=at.cell.polygon.find(p=>Math.hypot(p.x-at.point.x,p.y-at.point.y)>1e-4)!;
    r.fleetPositions.records[fleet.id]=beginArmyTravel47(fleet.id,[at.cell.id],graph,{x:at.point.x*.99+vertex.x*.01,y:at.point.y*.99+vertex.y*.01});fleet.food=fleet.crew;settleFleetFood47(r);expect(fleet.food).toBe(0);
  });
  it('retreating or occupied-port fleets cannot refill even at their old anchor',()=>{
    for(const mode of ['retreat','occupied']){const r=structuredClone(dayOne),fleet=r.navy.fleets[0],port=graphFor46(r).ports.find(p=>p.id===fleet.dockId)!;fleet.food=fleet.crew;if(mode==='retreat')r.maritime.retreating[fleet.id]=r.clock.tick+1;else r.world.provinces.find(p=>p.id===port.provinceId)!.controller=r.world.nations.find(n=>n.id!==fleet.nationId)!.id;settleFleetFood47(r);expect(fleet.food).toBe(0);}
  });
  it('total crew starvation loses the ship at its real position and removes active orders and deadlines',()=>{
    const r=structuredClone(dayOne),fleet=fleetAway(r),position=structuredClone(r.fleetPositions.records[fleet.id]),hull=r.maritime.hulls[fleet.id];fleet.crew=1;fleet.food=0;const out=settleCivilizationDay47(r,noOrders),lost=out.navy.fleets.find(f=>f.id===fleet.id)!;
    expect(lost.status).toBe('lost');expect(lost.crew).toBe(0);expect(out.maritime.hulls[fleet.id]).toBe(0);expect(out.fleetPositions.records[fleet.id]).toEqual({...position,status:'halted'});expect(out.portControl.fleets[fleet.id]).toMatchObject({active:false,targetId:null,forwardBaseId:null});expect(out.portControl.attackFleetIds).not.toContain(fleet.id);
    expect(out.losses.nations[fleet.nationId].unassigned).toMatchObject({crew:1,hull,ships:fleet.ships,combat:0});expect(advanceCivilizationMilitary47(out,1,weights).run.clock.tick).toBe(121);
  });
});
