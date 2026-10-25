import type {Army, Point} from '../../sim/types';
import type {War46Run} from './war46-model';
import type {ArmyPositions47} from './army-presence47';
import {readArmySpace47, type ArmySpace47, type LocatedArmy47} from './army-space47';
import {armySpatialFor47} from './army-geography47';
import {armyTravelPathPoints47, createArmyTravelSearch47, travelGraphSealed47, type TravelCell47, type TravelGraph47, type TravelPolicy47} from './army-travel47-graph';
import {advanceArmyTravel47, armyTravelLocation47, beginArmyTravel47, haltArmyTravel47, redirectArmyTravel47} from './army-travel47-state';
import {originalPaths47} from './civilization47-original-army';
import {militaryAccess46} from './war46-access';
import {nationsAtWar} from './realtime-statecraft';
import type {ForceContacts47} from './force-motion47';

export type ArmyMotionRun47 = Pick<War46Run, 'id' | 'terrain' | 'world' | 'clock' | 'battles' | 'voyages' | 'navy' | 'transports' | 'reorganization' | 'alliances' | 'vassals'> & {armyPositions: ArmyPositions47;forceContacts?:ForceContacts47};
export type ArmyTarget47 = {kind: 'province'; id: string} | {kind: 'cell'; id: number};
export type ArmyCommand47 = {type: 'army-move'; armyId: string; target: ArmyTarget47; kind: 'march' | 'retreat'} | {type: 'army-halt'; armyId: string};
export type ArmyStamp47 = {runId: string; day: number; nextEventId: number; tick: number; positionsRevision: number; binding: string};
/** Server-side path weights. Empty route faces do not claim every sea cell is
 * a recovered native oceanRouteCellSet. Never accept these sets from the UI. */
export type ArmyRouteWeights47 = Pick<TravelPolicy47, 'preferPorts' | 'portSeaFaces' | 'oceanRouteFaces'>;
export type ArmyPreview47 = {valid: boolean; reason: string; basedOn: ArmyStamp47; points: Point[]; cells: number[]; distance: number; hasSea: boolean; warnings: string[]};
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const integer = (v: number) => Number.isSafeInteger(v) && v >= 0;
export const armyStamp47 = (r: ArmyMotionRun47): ArmyStamp47 => ({runId: r.id, day: r.world.day, nextEventId: r.world.nextEventId, tick: r.clock.tick, positionsRevision: r.armyPositions.revision, binding: r.armyPositions.binding});

function assertWritable(r: ArmyMotionRun47) {
  if (!r.id || !integer(r.world.day) || !integer(r.world.nextEventId) || !integer(r.clock.tick) || !integer(r.armyPositions.revision) || r.armyPositions.revision >= Number.MAX_SAFE_INTEGER) throw Error('军队位置版本无法继续推进，已保留原世界。');
}
function assertExpected(r: ArmyMotionRun47, expected: ArmyStamp47) {
  const current = armyStamp47(r), keys = Object.keys(current) as (keyof ArmyStamp47)[];
  if (!exact(expected, keys) || keys.some(k => expected[k] !== current[k])) throw Error('军令预览已经过期，请重新预览并确认。');
}
function actionSchema(action: ArmyCommand47) {
  if (!exact(action, action?.type === 'army-halt' ? ['type', 'armyId'] : ['type', 'armyId', 'target', 'kind']) || typeof action.armyId !== 'string' || !action.armyId) throw Error('军令格式无效。');
  if (action.type === 'army-halt') return;
  if (action.type !== 'army-move' || !['march', 'retreat'].includes(action.kind) || !exact(action.target, ['kind', 'id']) || (action.target.kind === 'province' ? typeof action.target.id !== 'string' || !action.target.id : action.target.kind !== 'cell' || !integer(action.target.id))) throw Error('行军目标无效。');
}
export function armyTravelPolicy47(r: ArmyMotionRun47, a: Army, weights: ArmyRouteWeights47, retreat: boolean): TravelPolicy47 {
  return armyTravelPolicyFactory47(r,weights)(a,retreat);
}
/** One immutable movement phase only. The closure captures this world; discard
 * it after any ownership/diplomacy change instead of retaining old access. */
export function armyTravelPolicyFactory47(r:ArmyMotionRun47,weights:ArmyRouteWeights47){
  const access = militaryAccess46(r), provinces = new Map(r.world.provinces.map(p => [p.id, p])), original = originalPaths47(r);
  return (a:Army,retreat:boolean):TravelPolicy47=>{
  // Pathfinding.ArmyPathfinding.FindProvincePath (isCheckPassable): the start province's state
  // is always passable, so an army left in a former enemy's land after peace can walk home.
  const here = original ? provinces.get(a.provinceId)?.controller : undefined;
  return {...weights, allowLand: true, allowSea: !r.reorganization.active[a.id], canEnter: id => {
    const p = provinces.get(id); return !!p && (access(r.world, a.nationId, p.controller) || p.controller === here || !retreat && nationsAtWar(r.world, a.nationId, p.controller));
  }};
  };
}
const engaged = (r: ArmyMotionRun47, a: Army) => a.status === 'fighting' || r.battles.engagements.some(e => e.armies.includes(a.id)) || !!r.forceContacts?.pairs.some(p=>[p.a,p.b].includes(JSON.stringify(['army',a.id])));
/** Web retreat contract: stopping at sea is not reaching safety. An actual
 * accessible land province without an active enemy ends retreat on arrival,
 * halt, or a new order. All three paths use the same condition. */
function safeRetreatEnd(r: ArmyMotionRun47, here: LocatedArmy47, space: ArmySpace47) {
  return !!here.province && !engaged(r, here.army) && militaryAccess46(r)(r.world, here.army.nationId, here.province.controller) &&
    !(space.land.get(here.province.id) ?? []).some(v => v.army.status !== 'retreating' && nationsAtWar(r.world, here.army.nationId, v.army.nationId));
}
/** Private owned-phase optimization; never accepted in a Worker command.
 * A preview and its immediately issued order can share a search. It cannot be
 * reused after another order, tick, position revision or run replacement. */
export function createArmyCommandSearch47(r:ArmyMotionRun47,weights:ArmyRouteWeights47,armyId:string){
 // One position view per search: its stamp check below proves the same positions.
 const expected=armyStamp47(r),spatial=armySpatialFor47(r),g=spatial.graph,a=r.world.armies.find(a=>a.id===armyId);
 if(!a)throw Error('寻路军队不存在。');
 const start=armyTravelLocation47(r.armyPositions.records[armyId],g).cell.id;
 const searches=new Map<boolean,ReturnType<typeof createArmyTravelSearch47>>();
 return Object.assign((run:ArmyMotionRun47,id:string,target:number,retreat:boolean)=>{
  if(run!==r||id!==armyId)throw Error('寻路阶段已经更换。');assertExpected(run,expected);
  if(!searches.has(retreat))searches.set(retreat,createArmyTravelSearch47(g,start,armyTravelPolicy47(r,a,weights,retreat)));
  return searches.get(retreat)!(target);
 },{
  /** One position view per search: the same run and stamp mean the same
   * positions, so every candidate preview of this army can share it. */
  view(run:ArmyMotionRun47){
   if(run!==r)throw Error('寻路阶段已经更换。');assertExpected(run,expected);
   return {spatial,space:spatial.space};
  },
 });
}
type ArmyCommandSearch47=ReturnType<typeof createArmyCommandSearch47>;
function resolve(r: ArmyMotionRun47, action: ArmyCommand47, weights: ArmyRouteWeights47,search?:ArmyCommandSearch47) {
  assertWritable(r); actionSchema(action);
  const shared = search?.view(r), spatial = shared?.spatial ?? armySpatialFor47(r), space = shared?.space ?? readArmySpace47(r.world, spatial), here = space.byArmy.get(action.armyId);
  if (!here) throw Error('这支军队不存在或已失去战斗力。');
  const a = here.army;
  if (r.world.scenario !== 'custom-world') throw Error('统一海陆军令仅用于独立自建世界，测试战役仍保留原规则。');
  if (engaged(r, a)) throw Error('交锋中请先脱离交锋，不能用停止或改令取消战斗。');
  const enemiesHere = here.province && (space.land.get(here.province.id) ?? []).some(v => v.army.status !== 'retreating' && nationsAtWar(r.world, a.nationId, v.army.nationId));
  const hostileLand = here.province && nationsAtWar(r.world, a.nationId, here.province.controller);
  if ((hostileLand || enemiesHere) && (action.type === 'army-halt' || action.kind !== 'retreat')) throw Error('当前地区尚未安全，只能撤退或等待交锋与占领完成。');
  if (a.status === 'retreating' && action.type === 'army-move' && action.kind !== 'retreat' && !safeRetreatEnd(r, here, space)) throw Error('撤退途中不能改为进攻，请先抵达安全地区。');
  if (action.type === 'army-halt') {
    if (here.travel.status === 'arrived' || here.travel.status === 'halted') throw Error('军队已经停止移动。');
    return {spatial, a, travel: haltArmyTravel47(here.travel, spatial.graph), points: [here.point], targetName: '当前位置'};
  }
  let target: number | undefined;
  let targetName: string;
  if (action.target.kind === 'cell') {
    target = spatial.graph.cells.has(action.target.id) ? action.target.id : undefined;
    const cell = target === undefined ? undefined : spatial.graph.cells.get(target);
    targetName = cell?.provinceId ? r.world.provinces.find(p => p.id === cell.provinceId)!.name : '所选海域';
  } else {
    const id = action.target.id, p = r.world.provinces.find(p => p.id === id);
    const point = r.world.cities.find(c => c.provinceId === id)?.position ?? p?.center;
    target = point && provinceTargetCell47(spatial.graph, id, point);
    targetName = p?.name ?? '未知地区';
  }
  if (target === undefined) throw Error('目标不在当前地图的实际海陆网格中。');
  if (target === here.travel.nodes.at(-1) && here.travel.status === 'moving') throw Error('军队正在前往这个目标。');
  const path=search?.(r,a.id,target,action.kind==='retreat');
  const travel = search?(path?beginArmyTravel47(a.id,path.nodes,spatial.graph,here.point):null):redirectArmyTravel47(here.travel, spatial.graph, target, armyTravelPolicy47(r, a, weights, action.kind === 'retreat'));
  if (!travel) throw Error(r.reorganization.active[a.id] ? '重编期间保留陆上行军，暂不能进入海域。' : '没有符合当前外交通行限制的海陆路线。');
  // A one-cell redirect explicitly stops at the exact point; do not draw a
  // fake trip back to the cell center when the movement primitive stays put.
  const points = armyTravelPathPoints47(spatial.graph, travel.nodes); points[0] = {...here.point};
  return {spatial, a, travel, points, targetName};
}

const targetCells=new WeakMap<TravelGraph47,Map<string,number|undefined>>();
/** The province cell nearest its city (or center), ties by lower id. Cities and
 * sealed graphs never move, so the choice is cached per sealed graph. */
function provinceTargetCell47(g:TravelGraph47,id:string,point:Point):number|undefined{
  const key=id+'\u0000'+point.x+','+point.y,cache=travelGraphSealed47(g)?targetCells.get(g)??targetCells.set(g,new Map()).get(g)!:undefined;
  if(cache?.has(key))return cache.get(key);
  const target=[...(g.byProvince.get(id)??[])].sort((x,y)=>{const a=g.cells.get(x)!.center,b=g.cells.get(y)!.center;return Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y)||x-y;})[0];
  cache?.set(key,target);return target;
}
export function previewArmyCommand47(r: ArmyMotionRun47, action: ArmyCommand47, weights: ArmyRouteWeights47,search?:ArmyCommandSearch47): ArmyPreview47 {
  const basedOn = armyStamp47(r);
  try {
    const value = resolve(r, action, weights,search), cells = action.type === 'army-halt' ? [armyTravelLocation47(value.travel, value.spatial.graph).cell.id] : value.travel.nodes.slice(value.travel.leg), hasSea = cells.some(id => value.spatial.graph.cells.get(id)!.surface === 'sea');
    return {valid: true, reason: action.type === 'army-halt' ? '在当前位置停止行军，保留这支军队和随身物资。' : `从当前位置前往${value.targetName}；途中遇敌、失去通行权或断粮会改变进程。`, basedOn, points: value.points, cells, distance: value.points.reduce((sum, p, i) => i ? sum + Math.hypot(p.x - value.points[i - 1].x, p.y - value.points[i - 1].y) : sum, 0), hasSea, warnings: hasSea ? ['海上消耗随身口粮，不能从上次靠岸的城市补给。'] : []};
  } catch (error) {
    return {valid: false, reason: error instanceof Error ? error.message : '军令无法执行。', basedOn, points: [], cells: [], distance: 0, hasSea: false, warnings: []};
  }
}
function candidate<T extends ArmyMotionRun47>(r: T): T {
  // A full session continues clock/diplomacy/economy on this returned run.
  // Clone every mutable addendum, including fields unknown to this slice.
  // Validated terrain is immutable and shared with the editor only by value.
  const {terrain, ...mutable} = r;
  return {...structuredClone(mutable), terrain} as T;
}
function playerTakeover(r: ArmyMotionRun47, armyId: string) {
  const s = r.voyages;
  if (!integer(s.revision) || s.revision >= Number.MAX_SAFE_INTEGER || r.clock.tick > Number.MAX_SAFE_INTEGER - 120) throw Error('远征状态无法安全更新，已保留原世界。');
  if (!s.manualArmies.includes(armyId)) s.manualArmies.push(armyId);
  for (const [nationId, mission] of Object.entries(s.missions)) if (mission.armyId === armyId) {
    delete s.missions[nationId]; s.nextCheck[nationId] = r.clock.tick + 120;
    s.decisions[nationId] = {atTick: r.clock.tick, text: '玩家已接管该远征，自动调度不覆盖手动军令。'};
    if (['assembling', 'returning'].includes(mission.phase) && !s.manualFleets.includes(mission.fleetId) && !r.transports.cargo.some(c => c.fleetId === mission.fleetId)) {
      const fleet = r.navy.fleets.find(f => f.id === mission.fleetId); if (fleet && fleet.status !== 'lost') fleet.patrol = true;
    }
  }
  s.revision++;
}
/** One accepted command consumes one position revision, even a same-cell
 * redirect. UI draft cancellation never calls this function. No input path,
 * preview points or graph is trusted; confirmation resolves from current data. */
export function applyArmyCommand47<T extends ArmyMotionRun47>(r: T, action: ArmyCommand47, expected: ArmyStamp47, weights: ArmyRouteWeights47): T {
  assertExpected(r, expected);
  const next = candidate(r);issueArmyOrderOwned47(next,action,weights,'player');return next;
}
/** Private transaction owner only. Player commands and AI use identical actual
 * geography/permission/retreat checks; only player commands claim manual control.
 * Never expose this mutating entry directly to Worker messages or UI actions. */
export function issueArmyOrderOwned47(next:ArmyMotionRun47,action:ArmyCommand47,weights:ArmyRouteWeights47,source:'player'|'autonomous',search?:ArmyCommandSearch47):void {
  if(source!=='player'&&source!=='autonomous')throw Error('军令来源无效。');
  if(source==='autonomous'&&next.voyages.manualArmies.includes(action.armyId))throw Error('玩家接管的军队不能被自动军令覆盖。');
  const value=resolve(next,action,weights,search);
  if (next.world.nextEventId >= Number.MAX_SAFE_INTEGER) throw Error('事件编号已达安全上限，已保留原世界。');
  next.armyPositions.records[action.armyId] = value.travel;
  // Legacy fields remain valid historical references, never fake sea routes.
  value.a.route = []; value.a.progress = 0;
  const retreat = action.type === 'army-halt' ? value.a.status === 'retreating' : action.kind === 'retreat';
  const space = readArmySpace47(next.world, {...value.spatial, positions: next.armyPositions});
  value.a.status = retreat && (!['arrived', 'halted'].includes(value.travel.status) || !safeRetreatEnd(next, space.byArmy.get(action.armyId)!, space)) ? 'retreating' : 'idle';
  delete next.battles.plans[action.armyId];if(source==='player')playerTakeover(next, action.armyId);
  next.world.events.push({id: next.world.nextEventId++, day: next.world.day, kind: 'order', text: `${value.a.name}${action.type === 'army-halt' ? '停止行军' : '前往' + value.targetName}`, reason: '军令从实际海陆位置生效；连续经过相邻地块，停止或改令不回跳旧城市。'});
  next.world.events = next.world.events.slice(-160); next.armyPositions.revision++;
  armySpatialFor47(next);
}

export type ArmySpeed47 = (run: ArmyMotionRun47, army: Readonly<Army>, cell: Readonly<TravelCell47>) => number;
/** Movement phase of a future full tick, not a complete simulation tick. The
 * caller advances the clock and performs contact/damage/economy in the same
 * candidate. A failure on any army discards this entire returned candidate. */
export function advanceArmyMovement47<T extends ArmyMotionRun47>(r: T, seconds: number, speed: ArmySpeed47, weights: ArmyRouteWeights47): T {
  assertWritable(r); if (!Number.isFinite(seconds) || seconds <= 0) throw Error('行军推进时间无效。');
  const next = candidate(r), spatial = armySpatialFor47(next);
  for (const a of [...next.world.armies].sort((a, b) => a.id.localeCompare(b.id))) {
    if (a.troops <= 0 || a.status === 'destroyed' || engaged(next, a)) continue;
    const input = next.armyPositions.records[a.id], p = armyTravelPolicy47(next, a, weights, a.status === 'retreating');
    if (input.status === 'halted' || input.status === 'arrived') continue;
    const result = advanceArmyTravel47(input, spatial.graph, seconds, c => speed(next, a, c), c => c.surface === 'sea' ? p.allowSea : p.allowLand && p.canEnter(c.provinceId!));
    next.armyPositions.records[a.id] = result.travel;
    if (result.travel.status === 'arrived') {
      const space = readArmySpace47(next.world, spatial);
      if (a.status !== 'retreating' || safeRetreatEnd(next, space.byArmy.get(a.id)!, space)) a.status = 'idle';
    }
    // No write to provinceId/originId or legacy routes here. New actual-space
    // consumers and rendering must read the ledger for land and sea alike.
    armyTravelLocation47(result.travel, spatial.graph);
  }
  next.armyPositions.revision++; armySpatialFor47(next); return next;
}
