import type {LossSink} from './war27-losses';
import {war26Distances,reconcileWar26,type War26Context} from './war26-state';
/** v19 allows historical capitals to change sovereignty. Every capital still
 * references a real city; display/active core use actual territorial control. */
import type {TerrainContext} from './restoration19-state';
import type { Army, GameEvent, Order, OrderPreview, Province, StateAction, StateActionPreview, StateVersion, Terrain, World } from '../../compat/v0_4/sim/types';
import { advanceEconomy as dailyEconomy, applyManagementAction, buildNationReports as dailyReports, nationsAtWar, previewManagementAction, setDecision, transferEconomy, validateManagement } from '../../compat/v0_4/sim/statecraft';
import {advanceEconomy as realtimeEconomy,buildNationReports as realtimeReports,applyManagementAction as tacticalManagement,makeDiplomaticDecisions as webDiplomacy} from './tactics-statecraft';
import {createFiscalFood} from './fiscal15-food';
import { policyOptions } from '../../compat/v0_4/sim/statecraft';
import { isUnitKey, unitProfile, type UnitAssignments } from './military-profile';
import {combatPotential} from './fiscal15-rules';
/** FMS-only rule fork of frozen 0.4 core. All effects use one explicit unit
 * assignment; legacy runs never enter this factory. Original speed/power data
 * applied to the existing web daily model, not claimed as native combat parity. */
export function createMilitaryCore(assignments:UnitAssignments, realtime=false,tactical=false,terrain?:TerrainContext,monthly?: (w:World)=>void,strategic?:War26Context,losses?:LossSink) {
const food=terrain?createFiscalFood(terrain.finance):null,advanceEconomy=food?.advanceEconomy??(realtime?realtimeEconomy:dailyEconomy),buildNationReports=food?.buildNationReports??(realtime?realtimeReports:dailyReports),makeDiplomaticDecisions=food?.makeDiplomaticDecisions??webDiplomacy;
const units=Object.freeze({...assignments});
const isAtWar = nationsAtWar;

function previewStateAction(world: World, action: StateAction): StateActionPreview {
  const basedOn = { day: world.day, nextEventId: world.nextEventId };
  if (!validateWorld(world)) return { valid: false, reason: '世界状态校验失败。', changes: [], warnings: [], basedOn };
  return previewManagementAction(world, action);
}
function applyStateAction(world: World, action: StateAction, expected: StateVersion): World {
  if (!validateWorld(world)) throw new Error('世界状态校验失败。');
  return (tactical?tacticalManagement:applyManagementAction)(world, action, expected, event);
}
function nationReports(world: World) { return buildNationReports(world); }

const MAX_EVENTS = 160;
const PLAYER_NATION = 'lie';
const MAX_DAY = 1_000_000_000;
const terrainDays: Record<Terrain, number> = { plain: 2, forest: 3, mountain: 4 };
const terrainDefense: Record<Terrain, number> = { plain: 1, forest: 1.15, mountain: 1.3 };
const terrainNames: Record<Terrain, string> = { plain: '平原', forest: '森林', mountain: '山地' };

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
type WorldIndex = { provinces: Map<string, Province>; forts: Map<string, number>; order: Map<string, number> };
const indexes = new WeakMap<World, WorldIndex>();
function indexWorld(world: World) {
  const forts = new Map<string, number>();
  for (const city of world.cities) forts.set(city.provinceId, Math.max(forts.get(city.provinceId) ?? 0, city.fort));
  const index = { provinces: new Map(world.provinces.map(province => [province.id, province])), forts, order: new Map(world.provinces.map((province, order) => [province.id, order])) };
  indexes.set(world, index); return index;
}
const provinceById = (world: World, id: string) => (indexes.get(world) ?? indexWorld(world)).provinces.get(id)!;
const alive = (army: Army) => army.status !== 'destroyed' && army.troops > 0;
const canHoldGround = (army: Army) => alive(army) && army.status !== 'retreating' && (!realtime || army.progress===0);
const isFriendly = (world: World, army: Army, provinceId: string) => provinceById(world, provinceId).controller === army.nationId;

function canCommandArmy(world: World, army: Army): boolean {
  return alive(army) && (world.scenario === 'custom-world' ? world.nations.some(nation => nation.id === army.nationId) : army.nationId === PLAYER_NATION);
}

function event(world: World, kind: GameEvent['kind'], text: string, reason: string) {
  const clippedText = text.length > 5000 ? `${text.slice(0, 4960)}…（其余损耗见军队状态）` : text;
  const clippedReason = reason.length > 10000 ? `${reason.slice(0, 9980)}…` : reason;
  world.events.push({ id: world.nextEventId++, day: world.day, kind, text: clippedText, reason: clippedReason });
  if (world.events.length > MAX_EVENTS) world.events.splice(0, world.events.length - MAX_EVENTS);
}

function legDays(target: Province, retreat = false, army?: Army): number {
  return Math.max(1, (terrainDays[target.terrain] - (retreat ? 1 : 0)) / (army ? unitProfile(units[army.id]).speed : 1));
}

type RouteNode = { id: string; cost: number; order: number };
class RouteQueue {
  private values: RouteNode[] = [];
  private before(a: RouteNode, b: RouteNode) { return a.cost < b.cost || (a.cost === b.cost && a.order < b.order); }
  push(node: RouteNode) {
    this.values.push(node); let index = this.values.length - 1;
    while (index > 0) { const parent = (index - 1) >> 1; if (!this.before(node, this.values[parent])) break; this.values[index] = this.values[parent]; index = parent; }
    this.values[index] = node;
  }
  pop(): RouteNode | undefined {
    const first = this.values[0], last = this.values.pop(); if (!last || !this.values.length) return first;
    let index = 0;
    while (index * 2 + 1 < this.values.length) { let child = index * 2 + 1; if (child + 1 < this.values.length && this.before(this.values[child + 1], this.values[child])) child++; if (!this.before(this.values[child], last)) break; this.values[index] = this.values[child]; index = child; }
    this.values[index] = last; return first;
  }
}

/** Heap Dijkstra. A null target finds the nearest safe province in ONE search. */
function findRoute(world: World, army: Army, targetId: string | null, retreat: boolean): string[] {
  const index = indexes.get(world) ?? indexWorld(world);
  const hostile = new Set(world.armies.filter(other => canHoldGround(other) && isAtWar(world, other.nationId, army.nationId)).map(other => other.provinceId));
  const originController = provinceById(world, army.provinceId).controller;
  const evacuation = world.statecraft && originController !== army.nationId && !isAtWar(world, army.nationId, originController) ? originController : null;
  const distances = new Map<string, number>([[army.provinceId, 0]]);
  const previous = new Map<string, string>();
  const queue = new RouteQueue(); queue.push({ id: army.provinceId, cost: 0, order: index.order.get(army.provinceId)! });
  for (let node = queue.pop(); node; node = queue.pop()) {
    const current = node.id, cheapest = node.cost;
    if (cheapest !== distances.get(current)) continue;
    if (current === targetId || (targetId === null && current !== army.provinceId && provinceById(world, current).controller === army.nationId && !hostile.has(current))) {
      const route = [current];
      while (previous.has(route[0])) route.unshift(previous.get(route[0])!);
      return route;
    }
    const province = provinceById(world, current);
    // An encounter interrupts a march. A preview must not promise a route
    // through an occupied enemy army to a destination behind it.
    if (current !== army.provinceId && hostile.has(current)) continue;
    for (const neighborId of province.neighbors) {
      const neighbor = provinceById(world, neighborId);
      if (retreat && ((neighbor.controller !== army.nationId && neighbor.controller !== evacuation) || hostile.has(neighborId))) continue;
      if (!retreat && neighbor.controller !== army.nationId && !isAtWar(world, army.nationId, neighbor.controller)) continue;
      const candidate = cheapest + legDays(neighbor, retreat, army);
      if (candidate < (distances.get(neighborId) ?? Infinity)) { distances.set(neighborId, candidate); previous.set(neighborId, current); queue.push({ id: neighborId, cost: candidate, order: index.order.get(neighborId)! }); }
    }
  }
  return [];
}

const invalid = (reason: string): OrderPreview => ({ valid: false, reason, route: [], days: 0, supplyCost: 0, warnings: [] });

function previewOrder(world: World, order: Order): OrderPreview {
  if (!validateWorld(world)) return invalid('世界状态校验失败，请恢复有效存档。');
  indexWorld(world);
  if (!isRecord(order) || !exactKeys(order, ['armyId', 'targetId', 'kind']) || !isId(order.armyId) || !isId(order.targetId) || (order.kind !== 'march' && order.kind !== 'retreat')) return invalid('命令格式无效。');
  const army = world.armies.find(item => item.id === order.armyId);
  const target = world.provinces.find(item => item.id === order.targetId);
  if (!army || !alive(army)) return invalid('这支军队不存在或已失去战斗力。');
  if (!canCommandArmy(world, army)) return invalid('测试大陆只能向烈军下达命令；自建世界可以控制各国军队。');
  if (!target) return invalid('目标辖区不存在。');
  if(tactical&&army.status==='fighting')return invalid('交锋中请使用“脱离交锋”，不能覆盖正在执行的战斗状态。');
  if(tactical&&order.kind!=='retreat'&&army.progress===0&&isAtWar(world,army.nationId,provinceById(world,army.provinceId).controller))return invalid('尚未攻下当前辖区，请完成围攻或下达撤退命令。');
  if(realtime&&army.progress===0&&order.kind!=='retreat'&&world.armies.some(a=>canHoldGround(a)&&a.provinceId===army.provinceId&&isAtWar(world,a.nationId,army.nationId)))return invalid('所在路口已有敌军，只能下达撤退命令。');
  if(realtime&&army.route.length){
    if((order.kind==='retreat')!==(army.status==='retreating'))return invalid('途中改令保留当前行军状态；切换行军或撤退请先抵达下一路口。');
    if(order.kind==='retreat'&&target.controller!==army.nationId)return invalid('撤退目标必须由本国实际控制。');
    const anchor=army.route[0],temporary=structuredClone(world),copy=temporary.armies.find(a=>a.id===army.id)!;
    if(anchor!==order.targetId&&world.armies.some(a=>canHoldGround(a)&&a.provinceId===anchor&&isAtWar(world,a.nationId,army.nationId)))return invalid('下一路口有敌军阻断；抵达后需先处理交战，不能预览穿过守军。');
    copy.provinceId=anchor;copy.progress=0;copy.route=[];copy.status='idle';
    const p=anchor===order.targetId?{valid:true,reason:'抵达当前路段终点后驻守。',route:[anchor],days:0,supplyCost:0,warnings:[]}:previewOrder(temporary,order);
    if(!p.valid)return p;
    // A returning route may contain the original endpoint, which the schema
    // excludes. Keep that explicitly unsupported rather than teleporting.
    if(p.route.includes(army.provinceId))return invalid('这条命令需要沿当前路段折返；请先抵达下一路口再选择该目标。');
    const days=Math.ceil((1-army.progress)*legDays(provinceById(world,anchor),army.status==='retreating',army)+p.days-1e-9);
    return {...p,route:[army.provinceId,...p.route],days,supplyCost:days*(order.kind==='retreat'?5:6),reason:`保留当前路段与位置，抵达${provinceById(world,anchor).name}后转向新目标；约 ${days} 日。`,warnings:[...p.warnings,'途中改令不瞬移、不原地折返；当前路段仍按原来的行军状态走完。']};
  }
  if (target.id === army.provinceId) return invalid('军队已经位于此辖区。');
  if (army.status === 'marching' || army.status === 'retreating') return invalid('军队正在执行行军，请抵达当前目标后再下令。');
  if (army.status === 'fighting' && order.kind !== 'retreat') return invalid('交战期间只能下达撤退命令。');
  const retreat = order.kind === 'retreat';
  if (retreat && target.controller !== army.nationId) return invalid('撤退目标必须由本国实际控制。');
  if (!retreat && target.controller !== army.nationId && !isAtWar(world, army.nationId, target.controller)) return invalid('目标属于和平国家；必须先宣战，不能和平入侵或占领。');
  const route = findRoute(world, army, target.id, retreat);
  if (!route.length) return invalid(retreat ? '没有安全的己方撤退路线。' : '目标不可达，或途中有敌军阻断；请先处理沿途守军。');
  const legs = route.slice(1).map(id => provinceById(world, id));
  const days = Math.ceil(legs.reduce((sum, province) => sum + legDays(province, retreat, army), 0) - 1e-9);
  const supplyCost = days * (retreat ? 5 : 6);
  const warnings: string[] = [];
  const defenders = world.armies.filter(other => canHoldGround(other) && other.provinceId === target.id && isAtWar(world, other.nationId, army.nationId));
  if (defenders.length) warnings.push(`目标有 ${defenders.reduce((sum, defender) => sum + defender.troops, 0)} 名守军，抵达后按兵力、士气、补给、地形和城防${tactical?'持续':'逐日'}交战；到达时间不含战斗。`);
  if (legs.some(province => province.controller !== army.nationId)) warnings.push('进入敌境将失去本国驻扎补给；占领仅改变实控，不改变法理归属。');
  if (supplyCost >= army.supplies) warnings.push('现有军粮不足以完成预计行程；断粮会降低速度、士气并造成减员。');
  if (army.supplies === 0) warnings.push('当前已经断粮，实际行程将长于基础预计时间。');
  if (retreat && army.status === 'fighting') warnings.push(realtime?'实际离开交战路口时承受一次 2.5% 追击损失；日内移动不重复扣除。':'脱离接触前每日会受到追击损失；进入己方控制区后才可补给休整。');
  const terrain = [...new Set(legs.map(province => terrainNames[province.terrain]))].join('、');
  return { valid: true, reason: `经 ${legs.length} 个辖区（${terrain}），基础行程 ${days} 天；每日耗粮 ${retreat ? 5 : 6}。`, route, days, supplyCost, warnings };
}

function issueOrder(world: World, order: Order): World {
  const preview = previewOrder(world, order);
  if (!preview.valid) throw new Error(preview.reason);
  const next = structuredClone(world);
  const army = next.armies.find(item => item.id === order.armyId)!;
  const oldProgress=army.progress,oldStatus=army.status,wasMoving=realtime&&army.route.length>0;
  army.originId = army.provinceId;
  army.route = preview.route.slice(1);
  army.progress = wasMoving?oldProgress:0;
  army.status = wasMoving?oldStatus:order.kind === 'retreat' ? 'retreating' : 'marching';
  event(next, order.kind === 'retreat' ? 'retreat' : 'order', `${army.name}${order.kind === 'retreat' ? '撤向' : '向'}${provinceById(next, order.targetId).name}进发`, `${preview.reason}${preview.warnings.join('')}`);
  return next;
}

function destroyArmy(world: World, army: Army, reason: string) {
  army.status = 'destroyed'; army.troops = 0; army.morale = 0; army.supplies = 0; army.route = []; army.progress = 0;
  event(world, 'battle', `${army.name}失去作战能力`, reason);
}

function replenishOrConsume(world: World, army: Army) {
  const province = provinceById(world, army.provinceId);
  const contested = world.armies.some(other => canHoldGround(other) && isAtWar(world, other.nationId, army.nationId) && other.provinceId === army.provinceId);
  if (!world.statecraft && army.status === 'idle' && province.controller === army.nationId && !contested) {
    const before = army.supplies;
    army.supplies = clamp(army.supplies + province.supply, 0, 100);
    army.morale = clamp(army.morale + 3, 0, 100);
    if (before < 35 && army.supplies >= 35) event(world, 'supply', `${army.name}获得驻地补给`, `${province.name}由本国控制，每日恢复 ${province.supply} 点军粮。`);
    return;
  }
  const consumption = army.status === 'fighting' ? 8 : army.status === 'retreating' ? 5 : army.status === 'marching' ? 6 : 4;
  // Schema2 already paid daily consumption and finite local resupply in its
  // economy ledger. Legacy saves retain the original logistics unchanged.
  if (!world.statecraft) army.supplies = Math.max(0, army.supplies - consumption);
  else if (army.status === 'idle' && province.controller === army.nationId && !contested && army.supplies > 0) army.morale = clamp(army.morale + 3, 0, 100);
  if (army.supplies === 0) {
    const loss = Math.min(army.troops, Math.max(1, Math.ceil(army.troops * 0.018)));
    army.troops -= loss; losses?.(army.nationId,'starvation',loss); army.morale = Math.max(0, army.morale - 6);
    event(world, 'supply', `${army.name}断粮减员 ${loss}`, `每日耗粮 ${consumption}，军粮已耗尽；兵力损失 1.8%，士气下降 6，行军速度降至 55%。`);
    if (!army.troops) destroyArmy(world, army, '断粮耗尽最后的兵力。');
  }
}

function moveArmy(world: World, army: Army, budget = 1, allowPursuit = true) {
  if ((army.status !== 'marching' && army.status !== 'retreating') || !army.route.length) return;
  const retreating = army.status === 'retreating';
  const nextProvince = provinceById(world, army.route[0]);
  const controller = provinceById(world, army.provinceId).controller;
  const evacuating = world.statecraft && controller !== army.nationId && !isAtWar(world, army.nationId, controller) && nextProvince.controller === controller;
  if (retreating && nextProvince.controller !== army.nationId && !evacuating && !(world.statecraft && army.progress > 0)) {
    army.route = []; army.progress = 0; army.status = 'idle';
    event(world, 'retreat', `${army.name}撤退路线中断`, `${nextProvince.name}已失去己方控制，重新选择撤退目标。`);
    return;
  }
  if (!retreating && army.progress === 0 && nextProvince.controller !== army.nationId && !isAtWar(world, army.nationId, nextProvince.controller)) {
    army.route = []; army.status = 'idle';
    event(world, 'diplomacy', `${army.name}停止前往和平领土`, '关系或实控已改变，尚未开始的路段取消；不会越境占领。'); return;
  }
  if ((realtime ? budget>0&&army.progress===0 : allowPursuit) && retreating && world.armies.some(other => canHoldGround(other) && isAtWar(world, other.nationId, army.nationId) && other.provinceId === army.provinceId)) {
    const loss = Math.min(army.troops, Math.max(1, Math.ceil(army.troops * 0.025)));
    army.troops -= loss; losses?.(army.nationId,'pursuit',loss,world.armies.filter(other=>canHoldGround(other)&&isAtWar(world,other.nationId,army.nationId)&&other.provinceId===army.provinceId).map(a=>a.nationId));
    event(world, 'retreat', `${army.name}脱离接触，追击损失 ${loss}`, realtime?'实际离开交战路口时承受一次现有兵力 2.5% 的追击损失，日内移动不重复扣除。':'在交战辖区撤离期间，每日承受现有兵力 2.5% 的追击损失。');
    if (army.troops === 0) { destroyArmy(world, army, '撤退中失去最后的兵力。'); return; }
  }
  const rate = (army.supplies > 0 ? 1 : 0.55) / legDays(nextProvince, retreating, army);
  const unused = Math.max(0, budget - (1 - army.progress) / rate);
  army.progress += budget * rate;
  if (army.progress < 1 - 1e-9) return;
  const previousId = army.provinceId;
  army.provinceId = army.route.shift()!; army.progress = 0;
  if (isFriendly(world, army, previousId)) army.originId = previousId;
  event(world, retreating ? 'retreat' : 'march', `${army.name}抵达${nextProvince.name}`, `${terrainNames[nextProvince.terrain]}基础行程 ${Number(legDays(nextProvince, retreating, army).toFixed(2))} 天；现有兵力 ${army.troops}、军粮 ${army.supplies}。`);
  const enemies = world.armies.some(other => canHoldGround(other) && other.provinceId === army.provinceId && isAtWar(world, other.nationId, army.nationId));
  if (enemies) {
    army.route = []; army.status = 'fighting';
    if(realtime){
      const present=world.armies.filter(a=>canHoldGround(a)&&a.provinceId===army.provinceId);
      for(const a of present)if(present.some(other=>isAtWar(world,a.nationId,other.nationId))){a.status='fighting';a.route=[];a.progress=0;}
    }
    event(world, 'battle', `${army.name}遭遇敌军`, tactical?'抵达敌军路口停止，双方按0.1日持续结算；已确认的进攻计划在交锋结束后续行。':'抵达敌军所在辖区，后续行军中止；战斗采用同日结算，双方同时承受损失。');
  } else if(tactical&&!retreating&&isAtWar(world,army.nationId,nextProvince.controller)) {
    army.route=[];army.status='idle';
  } else if (!army.route.length) army.status = 'idle';
  if(realtime)resolveControl(world);
  if (unused > 1e-9 && army.route.length && army.status !== 'fighting') moveArmy(world, army, unused, false);
}

function combatPower(world: World, army: Army): number {
  const province = provinceById(world, army.provinceId);
  if(tactical)return combatPotential(world,army,units,province,army.progress===0,terrain);
  const fort = (indexes.get(world) ?? indexWorld(world)).forts.get(province.id) ?? 0;
  const defense = province.controller === army.nationId ? terrainDefense[province.terrain] * (1 + fort * 0.12) : 1;
  const unit=unitProfile(units[army.id]);
  const mountain=province.terrain==='mountain'?(province.controller===army.nationId?unit.mountainDefense:unit.mountainAttack):1;
  return unit.power * mountain * army.troops * (0.35 + army.morale * 0.0065) * (army.supplies > 0 ? 1 : 0.5) * defense;
}

function forceRetreat(world: World, army: Army) {
  const route = findRoute(world, army, null, true);
  if (!route.length) { losses?.(army.nationId,'rout',army.troops); destroyArmy(world, army, '兵力或士气已低于继续交战阈值，且没有通向己方控制区的安全退路。国家与法理领土仍保留。'); return; }
  army.route = route.slice(1); army.progress = 0; army.status = 'retreating';
  event(world, 'retreat', `${army.name}被迫撤退`, `剩余兵力 ${army.troops}、士气 ${army.morale}；兵力 ≤ 120 或士气 ≤ 20 时无法维持战线，撤向${provinceById(world, army.route.at(-1)!).name}。`);
}

function resolveBattles(world: World) {
  for (const province of world.provinces) {
    const present = world.armies.filter(army => canHoldGround(army) && army.provinceId === province.id);
    const participants = present.filter(army => present.some(other => isAtWar(world, army.nationId, other.nationId)));
    for (const army of present) if (!participants.includes(army) && army.status === 'fighting') army.status = 'idle';
    if (new Set(participants.map(army => army.nationId)).size < 2) {
      for (const army of participants) if (army.status === 'fighting') army.status = 'idle';
      continue;
    }
    const powers = participants.map(army => ({ army, power: combatPower(world, army) }));
    // Snapshot every attack before applying losses: iteration order cannot let
    // one side strike first or erase the other side's simultaneous response.
    const casualties = powers.map(({ army }) => {
      const friendlyCount = participants.filter(other => other.nationId === army.nationId).length;
      const enemyPower = powers.filter(other => isAtWar(world, other.army.nationId, army.nationId)).reduce((sum, other) => sum + other.power, 0);
      return { army, loss: Math.min(army.troops, Math.max(1, Math.round(enemyPower * 0.085 / friendlyCount))) };
    });
    for (const { army, loss } of casualties) {
      const before = army.troops;
      army.status = 'fighting'; army.route = []; army.progress = 0;
      army.troops -= loss;
      army.morale = Math.max(0, army.morale - Math.max(2, Math.ceil(loss / before * 45)));
    }
    event(world, 'battle', `${province.name}交战：${casualties.map(({ army, loss }) => `${army.name} −${loss}`).join('；')}`, `损耗为敌方有效军力 × 8.5%，由己方同区部队均摊并同时结算。有效军力 = 兵力 × (0.35 + 士气 × 0.0065) × 补给系数 × 兵种基础战力 × 兵种山地攻防系数；守方另获${terrainNames[province.terrain]}与城防加成，断粮系数为 0.5。`);
    for (const { army } of casualties) {
      if (army.troops === 0) destroyArmy(world, army, '同日战斗损失耗尽兵力。');
      else if (army.troops <= 120 || army.morale <= 20) forceRetreat(world, army);
    }
  }
}

function resolveControl(world: World) {
  // Current tactical rules transfer one province only after occupation.ts
  // exhausts its resistance. Archived battle1 retains the old instant capture.
  if(tactical)return;
  for (const province of world.provinces) {
    const present = world.armies.filter(army => canHoldGround(army) && army.provinceId === province.id);
    const nations = new Set(present.filter(army => !world.statecraft || isAtWar(world, army.nationId, province.controller)).map(army => army.nationId));
    if (nations.size !== 1) continue;
    const nationId = [...nations][0];
    if (present.some(army => isAtWar(world, nationId, army.nationId))) continue;
    for (const army of present) if (army.status === 'fighting') army.status = 'idle';
    if (province.controller === nationId) continue;
    const oldNation = world.nations.find(nation => nation.id === province.controller)!;
    const newNation = world.nations.find(nation => nation.id === nationId)!;
    transferEconomy(world, province.id, province.controller, nationId);
    province.controller = nationId;
    const capturedCapital = world.cities.some(city => city.id === oldNation.capitalId && city.provinceId === province.id);
    event(world, 'occupation', `${newNation.name}控制${province.name}`, `该辖区已无保持战线的敌军；实控由${oldNation.name}转移，法理归属仍为${world.nations.find(nation => nation.id === province.legalOwner)!.name}。${capturedCapital ? `${oldNation.name}首都失守，但国家、政权、皇室与其他部队继续存在。` : ''}`);
  }
}

/** Stop neutral trespass by walking home; never teleport a ceasefire army. */
function evacuatePeacefulVisitors(world: World) {
  if (!world.statecraft) return;
  for (const army of world.armies) {
    if (!alive(army) || army.status !== 'idle') continue;
    if(tactical&&isAtWar(world,army.nationId,provinceById(world,army.provinceId).controller))continue;
    const controller = provinceById(world, army.provinceId).controller;
    if (controller === army.nationId || isAtWar(world, army.nationId, controller)) continue;
    const route = findRoute(world, army, null, true);
    if (!route.length) { setDecision(world, army.nationId, '等待撤离', `${army.name}位于和平国领土，暂时没有通向己方领土的安全陆路；原地等待，不占领、不借道第三国。`); continue; }
    army.route = route.slice(1); army.progress = 0; army.status = 'retreating';
    event(world, 'retreat', `${army.name}按停战规则撤离`, '沿所在和平国与己方领土的真实相邻道路撤回本国，逐日消耗军粮；和平双方不会互相追击或占领。');
  }
}

/** Basic causal military autonomy. Accepted player routes are never replaced. */
function makeAutonomousDecisions(world: World) {
  if (world.scenario !== 'custom-world') return;
  if(strategic)reconcileWar26(world,strategic.state,strategic.graph,world.day*120,strategic.strength);
  const reports = new Map(buildNationReports(world).map(report => [report.nationId, report]));
  const frontierDistances = new Map<string, Map<string, number>>();
  const distancesFor = (nationId: string) => {
    const cached = frontierDistances.get(nationId); if (cached) return cached;
    if(strategic){const found=war26Distances(world,strategic.state,nationId);frontierDistances.set(nationId,found);return found;}
    const distances = new Map<string, number>(), queue: Province[] = [];
    for (const province of world.provinces) if (province.controller === nationId && province.neighbors.some(id => provinceById(world, id).controller !== nationId)) { distances.set(province.id, 0); queue.push(province); }
    for (let i = 0; i < queue.length; i++) for (const id of queue[i].neighbors) if (provinceById(world, id).controller === nationId && !distances.has(id)) { distances.set(id, distances.get(queue[i].id)! + 1); queue.push(provinceById(world, id)); }
    frontierDistances.set(nationId, distances); return distances;
  };
  for (const army of world.armies) {
    // Never replace a player's accepted route, an ongoing battle or a retreat.
    if (!alive(army) || army.status !== 'idle') continue;
    if(strategic&&(strategic.voyages.manualArmies.includes(army.id)||strategic.reservedArmyIds.has(army.id)))continue;
    if(tactical&&isAtWar(world,army.nationId,provinceById(world,army.provinceId).controller))continue;
    const stagger = [...army.id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
    if ((world.day + stagger) % 3 !== 0) continue;
    if (world.statecraft && provinceById(world, army.provinceId).controller !== army.nationId && !isAtWar(world, army.nationId, provinceById(world, army.provinceId).controller)) continue;
    const report = reports.get(army.nationId);
    if (report && report.grain < report.civilianNeedPerDay + report.militaryNeedPerDay) {
      setDecision(world, army.nationId, '缺粮休整', `储粮 ${report.grain} 不足预计一日民军需求 ${report.civilianNeedPerDay + report.militaryNeedPerDay}，停止新的进攻调动，优先驻地供给。`); continue;
    }
    if (army.supplies < 35 || army.morale < 50 || army.troops <= 180) {
      setDecision(world, army.nationId, '部队休整', `现有军粮 ${army.supplies}、士气 ${army.morale}、兵力 ${army.troops}；出发要求军粮 ≥ 35、士气 ≥ 50、兵力 > 180。`);
      if ((world.day + stagger) % 9 === 0) event(world, 'supply', `${army.name}自主休整`, `现有军粮 ${army.supplies}、士气 ${army.morale}、兵力 ${army.troops}；出发要求军粮 ≥ 35、士气 ≥ 50、兵力 > 180，优先恢复作战能力。`);
      continue;
    }
    const province = provinceById(world, army.provinceId);
    const neighbors = province.neighbors.map(id => provinceById(world, id));
    // An invaded home province remains ours until occupation completes. It must
    // still be an enemy target for rescue; accepted marching orders stay intact.
    const rescue = neighbors.filter(p=>p.controller===army.nationId).map(target=>({target,
      enemies:world.armies.filter(a=>canHoldGround(a)&&a.provinceId===target.id&&isAtWar(world,a.nationId,army.nationId)),
      friends:world.armies.filter(a=>canHoldGround(a)&&a.provinceId===target.id&&a.nationId===army.nationId)
    })).filter(r=>r.enemies.length&&combatPotential(world,army,units,r.target,true,terrain)+r.friends.reduce((v,a)=>v+combatPower(world,a),0)>=r.enemies.reduce((v,a)=>v+combatPower(world,a),0)*.8&&Math.ceil(legDays(r.target,false,army))*6+12<=army.supplies)
      .sort((a,b)=>b.enemies.length-a.enemies.length||a.target.id.localeCompare(b.target.id))[0];
    if(rescue){army.originId=army.provinceId;army.route=[rescue.target.id];army.progress=0;army.status='marching';
      setDecision(world,army.nationId,'驰援迎敌','本国相邻地区出现真实敌军，沿道路赶赴战场；不改变已有军令。');
      event(world,'order',army.name+'驰援'+rescue.target.name,'与驻守部队共同迎击入侵者；实际抵达或沿路接敌后才造成伤害。');continue;}
    const advanceDistances=distancesFor(army.nationId),advanceHere=advanceDistances.get(province.id)??Infinity;
    const attacks = neighbors.filter(target => isAtWar(world, target.controller, army.nationId)&&(!strategic||(advanceDistances.get(target.id)??Infinity)<advanceHere)).map(target => {
      const defenders = world.armies.filter(other => canHoldGround(other) && other.provinceId === target.id && isAtWar(world, other.nationId, army.nationId));
      const defensePower = defenders.reduce((sum, defender) => sum + combatPower(world, defender), 0);
      return { target, defensePower, attackPower:combatPotential(world,army,units,target,true,terrain), cost: Math.ceil(legDays(target, false, army)) * 6 };
    }).filter(candidate => candidate.cost + 12 <= army.supplies && candidate.attackPower >= candidate.defensePower * 1.15).sort((a, b) => a.defensePower - b.defensePower || a.cost - b.cost || a.target.id.localeCompare(b.target.id));
    let target = attacks[0]?.target;
    let reason: string;
    if (target) {
      reason = `自主判断：军粮 ${army.supplies} 可覆盖 ${attacks[0].cost} 点行军消耗并保留 12 点余粮；攻击评估 ${Math.round(attacks[0].attackPower)}，守方评估 ${Math.round(attacks[0].defensePower)}，达到 1.15 倍进攻门槛。评估包含军团实际输出、剩余耐久、精锐抗伤和地形；交锋按各军独立计时。`;
    } else {
      const distances = distancesFor(army.nationId), here = distances.get(province.id) ?? Infinity;
      target = neighbors.filter(neighbor => neighbor.controller === army.nationId && (distances.get(neighbor.id) ?? Infinity) < here && Math.ceil(legDays(neighbor, false, army)) * 6 + 12 <= army.supplies && !world.armies.some(other => canHoldGround(other) && isAtWar(world, other.nationId, army.nationId) && other.provinceId === neighbor.id)).sort((a, b) => (distances.get(a.id)! - distances.get(b.id)!) || legDays(a, false, army) - legDays(b, false, army) || a.id.localeCompare(b.id))[0];
      reason = '自主调动：沿真实陆路接近本次战争的固定目标；不向和平国边界分散，不穿海，军粮不足时在控制区休整。';
    }
    if (!target) {
      setDecision(world, army.nationId, '维持防御', '保持边境防御；和平国家不可进攻，战争目标也须满足地形、守军和行军余粮门槛。');
      if (neighbors.some(neighbor => neighbor.controller !== army.nationId) && (world.day + stagger) % 9 === 0) event(world, 'system', `${army.name}维持防御`, '相邻目标的守军实力、地形城防或行程余粮不满足进攻门槛，留在驻地防御并恢复补给。');
      continue;
    }
    army.originId = army.provinceId; army.route = [target.id]; army.progress = 0; army.status = 'marching';
    setDecision(world, army.nationId, isAtWar(world, target.controller, army.nationId) ? '进攻调动' : '边境防御调动', reason);
    event(world, 'order', `${army.name}自主向${target.name}行军`, reason);
  }
}

/** Pure, deterministic daily simulation. No rendering, storage or worker API. */
function advanceWorld(world: World, days: number): World {
  if (!validateWorld(world)) throw new Error('世界状态校验失败。');
  if (!Number.isInteger(days) || days < 0 || days > 365 || world.day + days > MAX_DAY) throw new Error('推进天数必须是 0—365 的整数，且不能超出世界日期范围。');
  const next = structuredClone(world);
  indexWorld(next);
  for (let day = 0; day < days; day++) {
    next.day++;
    makeDiplomaticDecisions(next, event);
    evacuatePeacefulVisitors(next);
    makeAutonomousDecisions(next);
    if (next.statecraft) advanceEconomy(next, event);
    for (const army of next.armies) if (alive(army)) replenishOrConsume(next, army);
    for (const army of next.armies) if (alive(army)) moveArmy(next, army);
    resolveBattles(next);
    resolveControl(next);
  }
  return next;
}

/** New realtime rule only: authoritative partial movement, no daily ledger,
 * losses or recruitment. Contact and ownership occur at actual province nodes. */
function advanceMovement(world:World,fraction:number):World {
  if(!realtime||!Number.isFinite(fraction)||fraction<=0||fraction>1)throw Error('日内移动步长无效。');
  // Province geometry and adjacency are immutable while simulation is active.
  // Clone all mutable state, but do not copy thousands of shoreline vertices
  // 120 times per day. Controllers get separate province records.
  const next=structuredClone({...world,provinces:[]}) as World;
  next.provinces=world.provinces.map(p=>({...p}));indexWorld(next);
  // Declaration can put previously peaceful armies in contact at one node.
  // Resolve this before iteration so array order cannot let a defender escape.
  const present=next.armies.filter(canHoldGround);
  for(const a of present)if(a.status!=='fighting'&&present.some(b=>b.provinceId===a.provinceId&&isAtWar(next,a.nationId,b.nationId))){a.status='fighting';a.route=[];event(next,'battle',`${a.name}遭遇敌军`,'同一路口的敌对部队停止行军；各军按自己的攻击间隔持续交锋。');}
  for(const army of next.armies)if(alive(army))moveArmy(next,army,fraction,false);
  return next;
}
function settleDay(world:World):World {
  if(!realtime||world.day>=MAX_DAY)throw Error('不能继续日结。');
  const next=structuredClone(world);indexWorld(next);next.day++;
  if(next.statecraft)advanceEconomy(next,event);
  for(const army of next.armies)if(alive(army))replenishOrConsume(next,army);
  if(!tactical)resolveBattles(next);resolveControl(next);
  monthly?.(next);
  makeDiplomaticDecisions(next,event);evacuatePeacefulVisitors(next);makeAutonomousDecisions(next);
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function finite(value: unknown, minimum: number, maximum: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum; }
function integer(value: unknown, minimum: number, maximum: number): value is number { return finite(value, minimum, maximum) && Number.isInteger(value); }
function isId(value: unknown): value is string { return typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value); }
function isText(value: unknown, maximum = 120): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum && [...value].every(character => {
    const code = character.charCodeAt(0);
    return code >= 32 || code === 9 || code === 10 || code === 13;
  });
}
function point(value: unknown): boolean { return isRecord(value) && exactKeys(value, ['x', 'y']) && finite(value.x, 0, 10000) && finite(value.y, 0, 10000); }
function list(value: unknown, minimum: number, maximum: number): value is unknown[] { return Array.isArray(value) && value.length >= minimum && value.length <= maximum && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean); }

/** Treat imported IndexedDB / JSON content as untrusted, including nested data. */
function validateWorld(value: unknown): value is World {
  if (!isRecord(value) || !exactKeys(value, ['schemaVersion', 'rulesVersion', 'scenario', 'mode', 'day', 'nations', 'provinces', 'cities', 'armies', 'events', 'nextEventId', ...(value.scenario === 'custom-world' ? ['custom'] : []), ...(value.schemaVersion === 2 ? ['statecraft'] : [])])) return false;
  const legacy = value.schemaVersion === 1 && value.rulesVersion === '0.1.0';
  const modern = value.schemaVersion === 2 && value.rulesVersion === '0.2.0' && value.scenario === 'custom-world';
  if ((!legacy && !modern) || (value.scenario !== 'test-continent' && value.scenario !== 'custom-world') || value.mode !== 'sandbox' || !integer(value.day, 0, MAX_DAY) || !integer(value.nextEventId, 1, Number.MAX_SAFE_INTEGER - 100000)) return false;
  if (value.scenario === 'custom-world') {
    const custom = value.custom;
    if (!isRecord(custom) || !exactKeys(custom, ['id', 'name', 'seed', 'rivers']) || !isId(custom.id) || !isText(custom.name) || !isText(custom.seed, 200) || !list(custom.rivers, 0, 128)) return false;
    let count = 0;
    for (const river of custom.rivers) { if (!list(river, 2, 1000) || !river.every(point)) return false; count += river.length; }
    if (count > 5000) return false;
  }
  if (!list(value.nations, 1, 50) || !list(value.provinces, 1, 1000) || !list(value.cities, 1, 1000) || !list(value.armies, 0, 500) || !list(value.events, 0, MAX_EVENTS)) return false;
  const ids = new Set<string>();
  const uniqueId = (id: unknown): id is string => { if (!isId(id) || ids.has(id)) return false; ids.add(id); return true; };
  for (const nation of value.nations) {
    if (!isRecord(nation) || !exactKeys(nation, ['id', 'name', 'color', 'capitalId', 'regimeId', 'dynastyId']) || !uniqueId(nation.id) || !isText(nation.name) || typeof nation.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(nation.color) || !isId(nation.capitalId) || !uniqueId(nation.regimeId) || !uniqueId(nation.dynastyId)) return false;
  }
  const nationIds = new Set((value.nations as World['nations']).map(nation => nation.id));
  for (const province of value.provinces) {
    if (!isRecord(province) || !exactKeys(province, ['id', 'name', 'polygon', 'center', 'label', 'terrain', 'legalOwner', 'controller', 'neighbors', 'supply']) || !uniqueId(province.id) || !isText(province.name) || !point(province.center) || !point(province.label) || !['plain', 'forest', 'mountain'].includes(province.terrain as string) || !nationIds.has(province.legalOwner as string) || !nationIds.has(province.controller as string) || !finite(province.supply, 0, 100) || !list(province.polygon, 3, 200) || !province.polygon.every(point) || !list(province.neighbors, 0, 1000) || !province.neighbors.every(isId) || new Set(province.neighbors).size !== province.neighbors.length || province.neighbors.includes(province.id)) return false;
    const vertices = province.polygon as { x: number; y: number }[];
    if (new Set(vertices.map(vertex => `${vertex.x},${vertex.y}`)).size !== vertices.length) return false;
    if (Math.abs(vertices.reduce((area, vertex, index) => { const following = vertices[(index + 1) % vertices.length]; return area + vertex.x * following.y - following.x * vertex.y; }, 0)) < 0.01) return false;
  }
  const provinces = value.provinces as World['provinces'];
  const provinceMap = new Map(provinces.map(province => [province.id, province]));
  const provinceIds = new Set(provinces.map(province => province.id));
  for (const province of provinces) if (!province.neighbors.every(id => provinceMap.get(id)?.neighbors.includes(province.id))) return false;
  for (const city of value.cities) {
    if (!isRecord(city) || !exactKeys(city, ['id', 'name', 'provinceId', 'position', 'label', 'fort']) || !uniqueId(city.id) || !isText(city.name) || !provinceIds.has(city.provinceId as string) || !point(city.position) || !point(city.label) || !integer(city.fort, 0, 10)) return false;
  }
  const cities = value.cities as World['cities'];
  for (const nation of value.nations as World['nations']) if (!cities.some(city => city.id === nation.capitalId)) return false;
  for (const army of value.armies) {
    if (!isRecord(army) || !exactKeys(army, ['id', 'name', 'nationId', 'provinceId', 'troops', 'morale', 'supplies', 'status', 'route', 'progress', 'originId']) || !uniqueId(army.id) || !isText(army.name) || !nationIds.has(army.nationId as string) || !provinceIds.has(army.provinceId as string) || !provinceIds.has(army.originId as string) || !integer(army.troops, 0, 10000000) || !finite(army.morale, 0, 100) || !finite(army.supplies, 0, 100) || !['idle', 'marching', 'fighting', 'retreating', 'destroyed'].includes(army.status as string) || !finite(army.progress, 0, 1) || army.progress === 1 || !list(army.route, 0, provinces.length) || !army.route.every(id => provinceIds.has(id as string)) || new Set(army.route).size !== army.route.length || army.route.includes(army.provinceId)) return false;
    let previous = army.provinceId as string;
    for (const target of army.route as string[]) { if (!provinceMap.get(previous)!.neighbors.includes(target)) return false; previous = target; }
    const moving = army.status === 'marching' || army.status === 'retreating';
    const fightingOnEdge=tactical&&army.status==='fighting'&&army.route.length>0&&Number(army.progress)>0;
    if ((!fightingOnEdge&&(moving !== (army.route.length > 0) || (!moving && army.progress !== 0))) || (army.status === 'destroyed' ? army.troops !== 0 : army.troops === 0)) return false;
  }
  let previousId = 0;
  let previousDay = 0;
  for (const item of value.events) {
    if (!isRecord(item) || !exactKeys(item, ['id', 'day', 'kind', 'text', 'reason']) || !integer(item.id, previousId + 1, value.nextEventId - 1) || !integer(item.day, previousDay, value.day) || !['order', 'march', 'supply', 'battle', 'occupation', 'retreat', 'system', ...(modern ? ['economy', 'diplomacy'] : [])].includes(item.kind as string) || !isText(item.text, 5000) || !isText(item.reason, 10000)) return false;
    previousId = item.id; previousDay = item.day;
  }
  return (!modern || validateManagement(value as World)) && Object.keys(units).length === value.armies.length && (value.armies as Army[]).every(a=>Object.hasOwn(units,a.id)&&isUnitKey(units[a.id]));
}

return {validateWorld,advanceWorld,advanceMovement,settleDay,previewOrder,issueOrder,previewStateAction,applyStateAction,nationReports,isAtWar,policyOptions,forceRetreat,destroyArmy,resolveControl};
}
