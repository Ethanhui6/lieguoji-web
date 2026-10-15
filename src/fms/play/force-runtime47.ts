import {waterRegions47} from './geography-content47';
import type {War46Run} from './war46-model';
import {assertArmyPositions47, type ArmyPositions47} from './army-presence47';
import {armySpatialFor47} from './army-geography47';
import {armyTravelPolicyFactory47, type ArmyMotionRun47, type ArmyRouteWeights47} from './army-commands47';
import {assertForceGeography47} from './force-geography-validation47';
import {nationsAtWar} from './realtime-statecraft';
import {militaryAccess46} from './war46-access';
import {readArmySpace47,type ArmySpace47} from './army-space47';
import {advanceForceContacts47,advanceSessionForceContacts47,assertContactRecordsOwned47,reconcileForceContactsOwned47, forceKey47, type ForceContacts47, type MovingForce47} from './force-motion47';
import type {TravelCell47} from './army-travel47-graph';
import {cloneMilitaryCandidate47} from './geography-content47';
import type {ForceMotionObserver47} from './force-display-trace47';
import {isOwnedTravelWindow47} from './owned-travel47';

/** Army and Fleet have separate, equally authoritative travel ledgers. Fleet
 * legacy node/route is not rewritten to fake an arbitrary shore-gate origin.
 * Full47 must render/validate/economize from these ledgers before activation. */
export type ForceRun47 = ArmyMotionRun47 & Pick<War46Run, 'diplomaticGeography' | 'maritime'> & {fleetPositions: ArmyPositions47; forceContacts: ForceContacts47};
export function actualForces47(r: ForceRun47) {
  if (r.battles.engagements.length || r.maritime.contacts.length) throw Error('旧陆海交锋尚未明确转换，原世界保留原规则。');
  const spatial = armySpatialFor47(r);
  assertForceGeography47(r.diplomaticGeography, r);
  assertArmyPositions47(r.fleetPositions, spatial.graph, spatial.binding, r.navy.fleets.map(f => f.id));
  if (!r.maritime.hulls || typeof r.maritime.hulls !== 'object' || Array.isArray(r.maritime.hulls) || Object.keys(r.maritime.hulls).length !== r.navy.fleets.length) throw Error('统一舰体账与舰队身份不一致。');
  for (const f of r.navy.fleets) {
    const hull = r.maritime.hulls[f.id];
    if (!Number.isSafeInteger(f.ships) || f.ships <= 0 || f.ships > 5 || !Number.isSafeInteger(f.crew) || f.crew < 0 || f.crew > f.ships * 40 || !Object.hasOwn(r.maritime.hulls, f.id) || !Number.isSafeInteger(hull) || hull < 0 || hull > f.ships * 100 || (hull === 0) !== (f.status === 'lost')) throw Error('统一舰体或船员数据无效。');
    if (r.fleetPositions.records[f.id].nodes.some(id => spatial.graph.cells.get(id)!.surface !== 'sea')) throw Error('舰队航线进入陆地。');
  }
  for (const [id, until] of Object.entries(r.maritime.retreating)) if (!r.navy.fleets.some(f => f.id === id && f.status !== 'lost') || !Number.isSafeInteger(until) || until <= r.clock.tick || until > r.clock.tick + 120) throw Error('统一舰队撤退引用无效。');
  const forces: MovingForce47[] = r.world.armies.filter(a => a.troops > 0 && a.status !== 'destroyed').map(a => ({kind: 'army', id: a.id, nationId: a.nationId, withdrawing: a.status === 'retreating', travel: r.armyPositions.records[a.id]}));
  forces.push(...r.navy.fleets.filter(f => f.status !== 'lost' && r.maritime.hulls[f.id] > 0).map(f => ({kind: 'fleet' as const, id: f.id, nationId: f.nationId, withdrawing: (r.maritime.retreating[f.id] ?? 0) > r.clock.tick, travel: r.fleetPositions.records[f.id]})));
  return {spatial, forces};
}
/** Validate a complete live position/contact view once in one synchronous
 * phase. The view must be discarded after any command or owner callback. */
export function actualContactFrame47(r:ForceRun47){
  return contactFrameFromActual47(r,actualForces47(r));
}
function contactFrameFromActual47(r:ForceRun47,actual:ReturnType<typeof actualForces47>){
  const regions=waterRegions47(r.diplomaticGeography),region=(face:number)=>regions.get(face)!;
  assertContactRecordsOwned47(r.forceContacts,actual.forces,actual.spatial.graph,region);
  const contact=reconcileForceContactsOwned47(actual.forces,actual.spatial.graph,r.forceContacts,(a,b)=>nationsAtWar(r.world,a,b),region);
  return {...actual,contact};
}
/** Coupled Army+Fleet movement/contact phase of the private full-session
 * candidate. Does not run the old v46 Army/Navy movers, old road contacts or
 * damage loops. Caller must bound seconds at day/diplomacy/combat events. */
export function advanceActualForces47<T extends ForceRun47>(input: T, seconds: number, weights: ArmyRouteWeights47, speed: (run: T, force: Readonly<MovingForce47>, cell: Readonly<TravelCell47>) => number, stopAtEvent = false) {
  return publicMotionResult47(advanceCandidateForces47(cloneMilitaryCandidate47(input),seconds,weights,speed,stopAtEvent));
}
/** The military window already owns a complete private transaction. Movement
 * only changes Army records and both travel books; retain a separate before
 * view of those fields for exact port exposure, without copying every family,
 * treasury and historical entry again at every fractional movement event.
 * Only the window owner may subsequently mutate shared unrelated ledgers. */
export function advanceOwnedActualForces47<T extends ForceRun47>(input:T,seconds:number,weights:ArmyRouteWeights47,speed:(run:T,force:Readonly<MovingForce47>,cell:Readonly<TravelCell47>)=>number,stopAtEvent=false,observe?:ForceMotionObserver47){
  // The contact kernel clones each travel record before changing it. Copy the
  // two books/record tables here, retaining the original START view for port
  // exposure, without cloning those same routes twice per movement interval.
  const next={...input,world:{...input.world,armies:structuredClone(input.world.armies)},armyPositions:{...input.armyPositions,records:{...input.armyPositions.records}},fleetPositions:{...input.fleetPositions,records:{...input.fleetPositions.records}}};
  return publicMotionResult47(advanceCandidateForces47(next,seconds,weights,speed,stopAtEvent,observe));
}
/** Fixed speed/trace owners only. START comes from the current military phase;
 * no external callback may mutate it. Keep generic movement deep-copy behavior. */
export function advanceSessionActualForces47<T extends ForceRun47>(input:T,start:ReturnType<typeof actualContactFrame47>,seconds:number,weights:ArmyRouteWeights47,speed:(run:T,force:Readonly<MovingForce47>,cell:Readonly<TravelCell47>)=>number,observe?:ForceMotionObserver47){
  if(!isOwnedTravelWindow47()||start.contact.contacts!==input.forceContacts)throw Error('位置复用仅允许当前私有同步推演。');
  const next={...input,world:{...input.world},armyPositions:{...input.armyPositions,records:{...input.armyPositions.records}},fleetPositions:{...input.fleetPositions,records:{...input.fleetPositions.records}}};
  const out=advanceCandidateForces47(next,seconds,weights,speed,true,observe,start);
  if(!out.endFrame)throw Error('私有移动末尾视图缺失，原进度未提交。');
  return {...out,endFrame:out.endFrame};
}
function publicMotionResult47<T extends ForceRun47>(v:ReturnType<typeof advanceCandidateForces47<T>>){
  return {run:v.run,exposure:v.exposure,boundaryEvents:v.boundaryEvents,held:v.held,elapsed:v.elapsed,unusedSeconds:v.unusedSeconds};
}
function advanceCandidateForces47<T extends ForceRun47>(next:T,seconds:number,weights:ArmyRouteWeights47,speed:(run:T,force:Readonly<MovingForce47>,cell:Readonly<TravelCell47>)=>number,stopAtEvent:boolean,observe?:ForceMotionObserver47,certifiedStart?:ReturnType<typeof actualContactFrame47>){
  for (const book of [next.armyPositions, next.fleetPositions]) if (!Number.isSafeInteger(book.revision) || book.revision < 0 || book.revision >= Number.MAX_SAFE_INTEGER) throw Error('统一部队位置版本不能安全推进。');
  const {spatial, forces} = certifiedStart??actualForces47(next);
  observe?.(forces,spatial.graph,0,certifiedStart?.contact.contacts??next.forceContacts);
  const regions = waterRegions47(next.diplomaticGeography);
  const policy=armyTravelPolicyFactory47(next,weights);
  const policies = new Map(next.world.armies.map(a => [a.id, policy(a, a.status === 'retreating')]));
  const motionRules={
    enemy: (a:string, b:string) => nationsAtWar(next.world, a, b), seaRegion: (face:number) => regions.get(face)!,
    canEnter: (f:Readonly<MovingForce47>, c:Readonly<TravelCell47>) => f.kind === 'fleet' ? c.surface === 'sea' : c.surface === 'sea' ? policies.get(f.id)!.allowSea : policies.get(f.id)!.canEnter(c.provinceId!),
    speed: (f:Readonly<MovingForce47>, c:Readonly<TravelCell47>) => speed(next, f, c),
  };
  const out = certifiedStart?advanceSessionForceContacts47(forces,next.forceContacts,spatial.graph,seconds,motionRules,certifiedStart.contact):advanceForceContacts47(forces,next.forceContacts,spatial.graph,seconds,motionRules,100000,stopAtEvent);
  observe?.(out.forces,spatial.graph,out.elapsed,out.contacts);
  for (const f of out.forces) (f.kind === 'army' ? next.armyPositions : next.fleetPositions).records[f.id] = f.travel;
  next.forceContacts = out.contacts;
  // The contact kernel has already checked every live END travel. Rebuild only
  // the derived rows from its actual positions; never mutate the START rows
  // which port exposure still needs. Public movement retains its full reader.
  const space = certifiedStart?spaceFromMotion47(next,out):readArmySpace47(next.world, {...spatial, positions: next.armyPositions}), access = militaryAccess46(next);
  // All positions are installed before retreat completion or status changes.
  const safelyArrived = new Set([...space.byArmy].filter(([,v]) => v.army.status === 'retreating' && ['arrived', 'halted'].includes(v.travel.status) && v.province && access(next.world, v.army.nationId, v.province.controller) && !(space.land.get(v.province.id) ?? []).some(b => b.army.status !== 'retreating' && nationsAtWar(next.world, v.army.nationId, b.army.nationId))).map(([id]) => id));
  let copied=false;
  for (let i=0;i<next.world.armies.length;i++) {const a=next.world.armies[i];if(!(a.troops>0)||a.status==='destroyed')continue;
    const status=safelyArrived.has(a.id)?'idle':a.status==='retreating'?'retreating':out.held.has(forceKey47({kind:'army',id:a.id}))?'fighting':'idle';
    if(status===a.status)continue;
    if(certifiedStart){if(!copied){next.world.armies=[...next.world.armies];copied=true;}next.world.armies[i]={...a,status};}
    else a.status=status;
  }
  next.armyPositions.revision++; next.fleetPositions.revision++;
  let endFrame:ReturnType<typeof actualContactFrame47>|undefined;
  if(certifiedStart){
    // Preserve Army/then Fleet order, not the kernel's sorted trace order.
    for(const a of next.world.armies){const located=space.byArmy.get(a.id);if(located)located.army=a;}
    const updated=new Map(out.forces.map(f=>[forceKey47(f),f]));
    const endForces=forces.map(f=>{const moved=updated.get(forceKey47(f))!;return moved.kind==='army'&&safelyArrived.has(moved.id)?{...moved,withdrawing:false}:moved;});
    const endActual={spatial:{...spatial,positions:next.armyPositions,space},forces:endForces};
    // Only retreat completion changes contact eligibility during movement.
    // Keep status assignment above BEFORE this new reconciliation, as before.
    endFrame={...endActual,contact:safelyArrived.size?reconcileForceContactsOwned47(endForces,spatial.graph,out.contacts,(a,b)=>nationsAtWar(next.world,a,b),face=>regions.get(face)!):{contacts:out.contacts,held:out.held,positions:out.positions}};
  }
  const endActual=endFrame??actualForces47(next);
  return {run: next, exposure: out.exposure, boundaryEvents: out.events, held:out.held, elapsed:out.elapsed, unusedSeconds:out.unusedSeconds,endActual,endFrame};
}

function spaceFromMotion47(r:ForceRun47,out:ReturnType<typeof advanceForceContacts47>):ArmySpace47{
  const provinces=new Map(r.world.provinces.map(p=>[p.id,p]));
  const space:ArmySpace47={byArmy:new Map(),land:new Map(),sea:new Map()};
  for(const army of r.world.armies){
    if(!(army.troops>0)||army.status==='destroyed')continue;
    const at=out.positions.get(forceKey47({kind:'army',id:army.id}));
    if(!at)throw Error('移动末尾缺少真实军队，原进度未提交。');
    const province=at.onLand?provinces.get(at.cell.provinceId!):null;
    if(at.onLand&&!province)throw Error('移动末尾地区无效，原进度未提交。');
    const located={army,travel:r.armyPositions.records[army.id],point:at.point,province:province??null,seaFace:at.onLand?null:at.cell.face};
    space.byArmy.set(army.id,located);
    if(located.province){const group=space.land.get(located.province.id)??[];group.push(located);space.land.set(located.province.id,group);}
    else{const group=space.sea.get(located.seaFace!)??[];group.push(located);space.sea.set(located.seaFace!,group);}
  }
  return space;
}
