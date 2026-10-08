import {beforeAll,describe,it,expect} from 'vitest';
import {nativeRegularScore47,nativeRegularTarget47,type RegularTarget47} from './native-war/army-target47';
import {createFoundingForces47,type FoundingForces47} from './civilization47-forces';
import {grid} from './fixture.test-support';
import {issueAutonomousArmyOrders47,regularCampaigns47,settleArmyAutonomyDay47,travelFeatures47} from './civilization47-army-ai';
import {assertArmyAutonomy47} from './civilization47-army-ai-state';
import {armyStamp47,applyArmyCommand47,issueArmyOrderOwned47} from './army-commands47';
import {actualForces47,advanceActualForces47} from './force-runtime47';
import {beginArmyTravel47,armyTravelLocation47} from './army-travel47-state';
import {locateTravelCell47} from './army-travel47-graph';
import {actualForceSpeed47} from './force-speed47';
import {advanceCivilizationMilitary47} from './civilization47-military';
import {advanceFamilyCalendar47} from './civilization47-calendar';
import {readArmySpace47} from './army-space47';
import {forceKey47} from './force-motion47';

const weights={preferPorts:false,portSeaFaces:new Set<number>(),oceanRouteFaces:new Set<number>()};
const target=(id:string,x:number,feature='land/0',port=false,protruding=false):RegularTarget47=>({id,center:{x,y:0},feature,port,protruding});
describe('original regular army target score',()=>{
  it('keeps distance, protrusion, cross-feature and home-distance ordering',()=>{
    const current={x:0,y:0},home={x:10,y:0};expect(nativeRegularScore47(current,home,'land/0',target('a',3))).toBe(16);
    expect(nativeRegularScore47(current,home,'land/0',target('a',3,'land/0',false,true))).toBe(13);
    expect(nativeRegularScore47(current,home,'land/0',target('a',3,'land/1'))).toBe(97);
  });
  it('uses hard same-feature then cross-feature port preference rather than globally lowest score',()=>{
    const from={x:0,y:0},same=target('same',1000),port=target('port',100,'land/1',true),other=target('other',1,'land/1');
    expect(nativeRegularTarget47(from,from,'land/0',[other,port,same])).toBe(same);expect(nativeRegularTarget47(from,from,'land/0',[other,port])).toBe(port);expect(nativeRegularTarget47(from,from,'land/0',[other])).toBe(other);
  });
  it('keeps enumeration ties and rejects overflowing or unordered scores naturally',()=>{
    const p={x:0,y:0},z=target('z',3),a=target('a',3);expect(nativeRegularTarget47(p,p,'land/0',[z,a])).toBe(z);expect(nativeRegularTarget47(p,p,'land/0',[a,z])).toBe(a);
    expect(nativeRegularTarget47(p,p,'land/0',[target('overflow',2e20),target('nan',NaN)])).toBeNull();
  });
  it('retains float32 square underflow before sqrt instead of substituting double hypot',()=>{
    const origin={x:0,y:0};expect(nativeRegularScore47(origin,origin,'land/0',target('tiny',1e-23))).toBe(0);
  });
});

let base:FoundingForces47;
beforeAll(()=>{base=createFoundingForces47(grid((x,y)=>y>20&&y<230&&(x>20&&x<105||x>145&&x<230)?45:0),2,24,'war',{mode:'culture-generated',enabled:['chinese','japanese']});},30000);
/** Explicit controlled two-island scenario. Ownership and placements are
 * fixture inputs, not a claim to replay the user's 900-day world. */
function islands(){const r=structuredClone(base),[west,east]=r.world.nations.map(n=>n.id),g=actualForces47(r).spatial.graph;
  for(const p of r.world.provinces)p.controller=p.legalOwner=p.center.x<500?west:east;
  for(const a of r.world.armies){const p=r.world.provinces.find(p=>p.controller===a.nationId)!;r.armyPositions.records[a.id]=beginArmyTravel47(a.id,[locateTravelCell47(g,p.center,p.id)!.id],g,p.center);r.tactics.forces[a.id].homeId=p.id;}
  r.harbors={...r.harbors,sites:[]};r.navy.fleets=[];r.fleetPositions.records={};r.maritime.hulls={};r.portControl.fleets={};r.portControl.attackFleetIds=[];
  // Direct daily-order phase fixture. Full-calendar day ownership is tested separately.
  r.clock.tick=120;r.world.day=1;return r;
}
function nextDay(r:FoundingForces47){r.clock.tick+=120;r.world.day++;}
describe('real47 owned and autonomous Army orders',()=>{
  it('uses one command core without turning automated armies into manual units',()=>{
    const r=islands(),a=r.world.armies[0],p=r.world.provinces.find(p=>p.controller!==a.nationId)!,command={type:'army-move' as const,armyId:a.id,target:{kind:'province' as const,id:p.id},kind:'march' as const};
    const player=applyArmyCommand47(r,command,armyStamp47(r),weights),ai=structuredClone(r);issueArmyOrderOwned47(ai,command,weights,'autonomous');
    expect(ai.armyPositions).toEqual(player.armyPositions);expect(ai.world.armies).toEqual(player.world.armies);expect(ai.voyages).toEqual(r.voyages);expect(player.voyages.manualArmies).toContain(a.id);
    const before=structuredClone(player);expect(()=>issueArmyOrderOwned47(player,command,weights,'autonomous')).toThrow(/玩家/);expect(player).toEqual(before);
  });
  it('assigns actual enemy land across water with no ports, fleet or cargo, and reaches it through the movement primitive',()=>{
    const r=islands();issueAutonomousArmyOrders47(r,weights);const a=r.world.armies[0],row=r.armyAutonomy.armies[a.id],g=actualForces47(r).spatial.graph,path=r.armyPositions.records[a.id];
    expect(row.decision).toBe('attacking');expect(g.cells.get(path.nodes.at(-1)!)!.surface).toBe('land');expect(g.cells.get(path.nodes.at(-1)!)!.provinceId).toBe(row.targetId);expect(path.nodes.some(id=>g.cells.get(id)!.surface==='sea')).toBe(true);expect(r.transports.cargo).toHaveLength(0);expect(r.voyages.manualArmies).toHaveLength(0);
    // Isolate travel from casualties/economic days to prove actual shoreline
    // traversal; the full900-day naval campaign remains a separate acceptance.
    for(const b of r.world.armies)if(b.id!==a.id){b.troops=0;b.status='destroyed';}
    const oldAnchor=a.provinceId,start=armyTravelLocation47(path,g).point,out=advanceActualForces47(r,10_000_000,weights,actualForceSpeed47).run,at=readArmySpace47(out.world,actualForces47(out).spatial).byArmy.get(a.id)!;
    expect(at.province?.id).toBe(row.targetId);expect(at.travel.status).toBe('arrived');expect(at.army.provinceId).toBe(oldAnchor);expect(at.point).not.toEqual(start);
  });
  it('preserves an ongoing offensive route and its exact progress across daily decisions and JSON reload',()=>{
    let r=islands();issueAutonomousArmyOrders47(r,weights);r=advanceActualForces47(r,1,weights,actualForceSpeed47).run;const positions=structuredClone(r.armyPositions),events=r.world.nextEventId;nextDay(r);const {terrain,...state}=r,reload={...JSON.parse(JSON.stringify(state)),terrain};
    issueAutonomousArmyOrders47(r,weights);issueAutonomousArmyOrders47(reload,weights);expect(r.armyPositions).toEqual(positions);expect(r.world.nextEventId).toBe(events);expect(reload.armyAutonomy).toEqual(r.armyAutonomy);expect(reload.armyPositions).toEqual(r.armyPositions);
    const before=structuredClone(r);issueAutonomousArmyOrders47(r,weights);expect(r).toEqual(before);
  });
  it('reselects a land target after conquest instead of waiting forever at the captured destination',()=>{
    const r=islands();issueAutonomousArmyOrders47(r,weights);const a=r.world.armies[0],row=r.armyAutonomy.armies[a.id],old=row.targetId!,g=actualForces47(r).spatial.graph,p=r.world.provinces.find(p=>p.id===old)!;p.controller=a.nationId;
    // This fixture represents a completed conquest; surviving enemies still
    // inside the province would correctly require combat before a new march.
    for(const b of r.world.armies)if(b.nationId!==a.nationId&&armyTravelLocation47(r.armyPositions.records[b.id],g).cell.provinceId===old){b.status='destroyed';b.troops=0;}
    const nodes=r.armyPositions.records[a.id].nodes;r.armyPositions.records[a.id]=beginArmyTravel47(a.id,[nodes.at(-1)!],g);nextDay(r);issueAutonomousArmyOrders47(r,weights);
    expect(row.targetId).not.toBe(old);expect(row.decision,row.reason).toBe('attacking');expect(g.cells.get(r.armyPositions.records[a.id].nodes.at(-1)!)!.surface).toBe('land');expect(r.armyPositions.records[a.id].origin).toEqual(g.cells.get(nodes.at(-1)!)!.center);
  });
  it('honors player control and actual contact keys even if an old status label is idle',()=>{
    const r=islands(),a=r.world.armies[0];r.voyages.manualArmies=[a.id];issueAutonomousArmyOrders47(r,weights);expect(r.armyAutonomy.armies[a.id].decision).toBe('manual');expect(r.armyPositions.records[a.id].status).toBe('arrived');
    r.voyages.manualArmies=[];nextDay(r);const before=structuredClone(r.armyPositions.records[a.id]),p=r.world.armies[1];r.forceContacts.pairs=[{a:forceKey47({kind:'army',id:a.id}),b:forceKey47({kind:'army',id:p.id}),cellA:0,cellB:0,pointA:{x:0,y:0},pointB:{x:0,y:0},area:'fixture-held'}];issueAutonomousArmyOrders47(r,weights);expect(r.armyAutonomy.armies[a.id].decision).toBe('busy');expect(r.armyPositions.records[a.id]).toEqual(before);
    expect(()=>issueArmyOrderOwned47(r,{type:'army-move',armyId:a.id,kind:'march',target:{kind:'province',id:a.provinceId}},weights,'autonomous')).toThrow(/交锋/);
  });
  it('clears offensive intent after peace without restarting the old route or entering neutral land',()=>{
    const r=islands();issueAutonomousArmyOrders47(r,weights);const a=r.world.armies[0];for(const rel of r.world.statecraft!.relations)rel.status='peace';for(const war of r.nativeWars.campaigns)war.endedTick=r.clock.tick;nextDay(r);issueAutonomousArmyOrders47(r,weights);
    expect(r.armyPositions.records[a.id].status).toBe('halted');expect(r.armyAutonomy.armies[a.id].decision).toBe('waiting');expect(r.armyAutonomy.armies[a.id].targetId).toBeNull();
  });
  it('rests on actual home land when low on food rather than resetting a journey from the stale home anchor',()=>{
    let r=islands();issueAutonomousArmyOrders47(r,weights);r=advanceActualForces47(r,1,weights,actualForceSpeed47).run;const a=r.world.armies[0],g=actualForces47(r).spatial.graph,before=armyTravelLocation47(r.armyPositions.records[a.id],g).point;a.supplies=20;nextDay(r);issueAutonomousArmyOrders47(r,weights);
    expect(r.armyAutonomy.armies[a.id].decision).toBe('resting');expect(r.armyPositions.records[a.id].status).toBe('halted');expect(armyTravelLocation47(r.armyPositions.records[a.id],g).point).toEqual(before);
  });
  it('halts an invalid sea offensive when no homeland remains instead of reviving the stale route next day',()=>{
    const r=islands();issueAutonomousArmyOrders47(r,weights);const a=r.world.armies[0],g=actualForces47(r).spatial.graph,old=r.armyPositions.records[a.id],seaIndex=old.nodes.findIndex(id=>g.cells.get(id)!.surface==='sea');
    expect(seaIndex).toBeGreaterThan(0);r.armyPositions.records[a.id]=beginArmyTravel47(a.id,old.nodes.slice(seaIndex),g);const before=armyTravelLocation47(r.armyPositions.records[a.id],g).point;
    const other=r.world.nations.find(n=>n.id!==a.nationId)!.id;for(const p of r.world.provinces)p.controller=other;
    for(const rel of r.world.statecraft!.relations)rel.status='peace';for(const war of r.nativeWars.campaigns)war.endedTick=r.clock.tick;
    nextDay(r);issueAutonomousArmyOrders47(r,weights);expect(r.armyAutonomy.armies[a.id].decision).toBe('no-route');expect(r.armyAutonomy.armies[a.id].targetId).toBeNull();expect(r.armyPositions.records[a.id].status).toBe('halted');expect(armyTravelLocation47(r.armyPositions.records[a.id],g).point).toEqual(before);
    const stopped=structuredClone(r.armyPositions.records[a.id]),events=r.world.nextEventId;nextDay(r);issueAutonomousArmyOrders47(r,weights);expect(r.armyPositions.records[a.id]).toEqual(stopped);expect(r.world.nextEventId).toBe(events);
  });
  it('replans a stopped retreat from a newly lost province through a remaining friendly border',()=>{
    const r=islands(),a=r.world.armies[0],g=actualForces47(r).spatial.graph,owned=new Set(r.world.provinces.filter(p=>p.controller===a.nationId).map(p=>p.id)),cell=[...g.cells.values()].find(c=>c.surface==='land'&&owned.has(c.provinceId!)&&c.links.some(l=>{const n=g.cells.get(l.to)!;return n.surface==='land'&&n.provinceId!==c.provinceId&&owned.has(n.provinceId!);}))!;
    r.world.provinces.find(p=>p.id===cell.provinceId)!.controller=r.world.nations.find(n=>n.id!==a.nationId)!.id;a.status='retreating';r.armyPositions.records[a.id]={...beginArmyTravel47(a.id,[cell.id],g),status:'halted'};
    issueAutonomousArmyOrders47(r,weights);expect(r.armyAutonomy.armies[a.id].decision).toBe('returning');expect(r.armyPositions.records[a.id].status).toBe('moving');expect(r.armyPositions.records[a.id].origin).toEqual(cell.center);expect(a.status).toBe('retreating');
  });
  it('keeps external-war enemies when the same pair also has an internal campaign, excluding departed participants',()=>{
    const r=islands(),war=r.nativeWars.campaigns[0],id=r.nativeWars.nationIds.find(v=>v[0]===war.participants[0].stateId)![1],other=r.nativeWars.nationIds.find(v=>v[0]===war.participants[1].stateId)![1],internal={...structuredClone(war),id:999,internal:{casusBelliId:16 as const,legacyType:10 as const,rebelStateId:war.participants[0].stateId,motherStateId:war.participants[1].stateId}};
    r.nativeWars.campaigns.push(internal);expect(regularCampaigns47(r,id).has(other)).toBe(true);war.participants=war.participants.slice(0,1);expect(regularCampaigns47(r,id).has(other)).toBe(false);
  });
  it('keeps sea and land Features separate and two disconnected islands distinct regardless of country changes',()=>{
    const r=islands(),g=actualForces47(r).spatial.graph,map=travelFeatures47(g),land=new Set([...g.cells.values()].filter(c=>c.surface==='land').map(c=>map.get(c.id))),sea=new Set([...g.cells.values()].filter(c=>c.surface==='sea').map(c=>map.get(c.id)));
    expect(land.size).toBe(2);expect([...land].every(id=>!sea.has(id))).toBe(true);for(const p of r.world.provinces)p.controller=r.world.nations[0].id;expect(travelFeatures47(g)).toBe(map);
  });
  it('settles a real military day into actual AI orders atomically, then continues military time',()=>{
    const pending=advanceCivilizationMilitary47(base,120,weights).run,before=structuredClone(pending),out=settleArmyAutonomyDay47(pending,weights);expect(pending).toEqual(before);expect(out.armyAutonomy.lastDay).toBe(1);expect(out.armyAutonomy.revision).toBe(1);assertArmyAutonomy47(out);expect(out.voyages.manualArmies).toHaveLength(0);expect(advanceCivilizationMilitary47(out,1,weights).run.clock.tick).toBe(121);
    pending.armyAutonomy.revision=Number.MAX_SAFE_INTEGER;const invalid=structuredClone(pending);expect(()=>settleArmyAutonomyDay47(pending,weights)).toThrow();expect(pending).toEqual(invalid);
  },30000);
  it('registers monthly recruits in the same AI ledger after the command stage',()=>{
    const r=structuredClone(base),a=r.world.armies[0];a.troops=0;a.status='destroyed';
    for(let tick=1;tick<=3600;tick++){r.clock.tick=tick;r.world.day=Math.floor(tick/120)-(tick===3600?1:0);advanceFamilyCalendar47(r,tick,tick===3600);}r.forceClock.now=3600;r.dailyEconomy.lastDay=29;r.armyAutonomy.lastDay=29;
    const old=new Set(r.world.armies.map(a=>a.id)),out=settleArmyAutonomyDay47(r,weights),added=out.world.armies.filter(a=>!old.has(a.id));expect(added.length).toBeGreaterThan(0);expect(added.every(a=>out.armyAutonomy.armies[a.id].decision==='waiting')).toBe(true);assertArmyAutonomy47(out);
  });
  it.each(['future','staleDay','unknownTarget','unknownCampaign','futureTick','missingArmy'])('rejects %s AI records instead of silently replacing them',fault=>{
    const r=islands(),row=r.armyAutonomy.armies[r.world.armies[0].id];if(fault==='future')Object.assign(r.armyAutonomy,{future:true});if(fault==='staleDay')r.armyAutonomy.lastDay=-1;if(fault==='unknownTarget')row.targetId='missing';if(fault==='unknownCampaign')row.campaignId=999;if(fault==='futureTick')row.issuedTick=121;if(fault==='missingArmy')delete r.armyAutonomy.armies[r.world.armies[0].id];const before=structuredClone(r);expect(()=>issueAutonomousArmyOrders47(r,weights)).toThrow();expect(r).toEqual(before);
  });
});
