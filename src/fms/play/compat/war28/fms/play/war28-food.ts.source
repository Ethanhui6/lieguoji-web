import type { Army, EconomyLedger, GameEvent, NationReport, PolicyPriority, Province, StateAction, StateActionPreview, StateVersion, World } from '../../compat/v0_4/sim/types';
import type {FiscalState} from './fiscal15-state';
export function createFiscalFood(finance:FiscalState,declared?:(world:World,attacker:string,defender:string)=>void){


/** v9-only food adapter: troop labels use the source's tenfold display scale.
 * Civilian population and grain remain in the existing internal economy units.
 * This is not a recovery of the original game's complete economy. */
const rationStrength = (army: Army) => army.troops / 10;

const policyOptions: { value: PolicyPriority; label: string; description: string }[] = [
  { value: 'civilian', label: '民生优先', description: '先供居民，驻军只能领取超过三日民粮储备的余粮。' },
  { value: 'balanced', label: '均衡调配', description: '先供居民并保留一日民粮；观察至少 14 天后，储粮充足且军力占明显优势时可自主宣战。' },
  { value: 'military', label: '军事优先', description: '先补驻军再供居民；可能加重饥荒，并在实力与储粮允许时自主宣战。' },
];

const MAX_GRAIN = 1_000_000_000_000;
const MAX_DAY = 1_000_000_000;
const live = (army: Army) => army.status !== 'destroyed' && army.troops > 0;
const capacity = (province: Province) => finance.provinces[province.id].maxPopulation;
const production = (province: Province, population: number, contested = false) => Math.floor(Math.min(population, capacity(province)) * (province.terrain === 'plain' ? 1.12 : province.terrain === 'forest' ? 1.04 : 0.82) * (contested ? 0.5 : 1));
const armyConsumption = (army: Army) => army.status === 'fighting' ? 8 : army.status === 'retreating' ? 5 : army.status === 'marching' ? 6 : 4;
type EmitEvent = (world: World, kind: GameEvent['kind'], text: string, reason: string) => void;

function relationFor(world: World, a: string, b: string) { return world.statecraft?.relations.find(relation => relation.a === (a < b ? a : b) && relation.b === (a < b ? b : a)); }
function nationsAtWar(world: World, a: string, b: string): boolean { return a !== b && (world.schemaVersion === 1 || relationFor(world, a, b)?.status === 'war'); }
function contested(world: World, province: Province): boolean { return world.armies.some(army => live(army) && army.progress === 0 && army.status !== 'retreating' && army.provinceId === province.id && nationsAtWar(world, army.nationId, province.controller)); }
function border(world: World, a: string, b: string): boolean {
  const controllers = new Map(world.provinces.map(province => [province.id, province.controller]));
  return world.provinces.some(province => province.controller === a && province.neighbors.some(id => controllers.get(id) === b));
}

/** The caller validates the old snapshot. Never mutates it or silently upgrades storage. */
function initializeManagement(world: World, relations: 'peace' | 'war', emit: EmitEvent): World {
  if (world.scenario !== 'custom-world') throw new Error('正式测试战役继续使用原规则；只有自建世界可创建国家治理推演副本。');
  if (relations !== 'peace' && relations !== 'war') throw new Error('初始外交关系无效。');
  const next = structuredClone(world);
  if (next.statecraft) return next;
  next.schemaVersion = 2; next.rulesVersion = '0.2.0';
  const nationIds = next.nations.map(nation => nation.id).sort();
  next.statecraft = {
    version: 1,
    provinces: next.provinces.map(province => { const population = Math.max(100, Math.floor(capacity(province) * 0.7)); return { provinceId: province.id, population, grain: population * 20 }; }),
    nations: next.nations.map(nation => ({ nationId: nation.id, priority: 'balanced', lastLedger: null, lastDecision: null })),
    relations: nationIds.flatMap((a, index) => nationIds.slice(index + 1).map(b => ({ a, b, status: relations, sinceDay: next.day, truceUntilDay: 0 }))),
  };
  emit(next, 'system', '国家治理规则已初始化', `这是独立沙盒推演，初始关系为${relations === 'peace' ? '和平' : '战争'}；人口与粮食是按面积和地形生成的模拟参数，不代表正式设定。地方粮库不跨海瞬移，国家数据按实控汇总。`);
  return next;
}

function buildNationReports(world: World): NationReport[] {
  if (!world.statecraft) return [];
  const economies = new Map(world.statecraft.provinces.map(province => [province.provinceId, province]));
  return world.nations.map(nation => {
    const policy = world.statecraft!.nations.find(item => item.nationId === nation.id)!;
    const provinces = world.provinces.filter(province => province.controller === nation.id);
    const armies = world.armies.filter(army => live(army) && army.nationId === nation.id);
    const population = provinces.reduce((sum, province) => sum + economies.get(province.id)!.population, 0);
    const productionPerDay = provinces.reduce((sum, province) => sum + production(province, economies.get(province.id)!.population, contested(world, province)), 0);
    const militaryNeedPerDay = armies.reduce((sum, army) => sum + Math.ceil(armyConsumption(army) * rationStrength(army) / 6), 0);
    return { nationId: nation.id, population, grain: provinces.reduce((sum, province) => sum + economies.get(province.id)!.grain, 0), productionPerDay, civilianNeedPerDay: population, militaryNeedPerDay, balancePerDay: productionPerDay - population - militaryNeedPerDay, territoryCount: provinces.length, armyCount: armies.length, warCount: world.statecraft!.relations.filter(relation => (relation.a === nation.id || relation.b === nation.id) && relation.status === 'war').length, priority: policy.priority, lastLedger: policy.lastLedger ? { ...policy.lastLedger } : null, lastDecision: policy.lastDecision ? { ...policy.lastDecision } : null };
  });
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const text = (value: unknown, limit: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit && [...value].every(character => { const code = character.charCodeAt(0); return code >= 32 || code === 9 || code === 10 || code === 13; });

function previewManagementAction(world: World, action: StateAction): StateActionPreview {
  const basedOn = { day: world.day, nextEventId: world.nextEventId };
  const invalid = (reason: string): StateActionPreview => ({ valid: false, reason, changes: [], warnings: [], basedOn });
  if (!world.statecraft) return invalid('旧规则存档未启用国家治理；请先创建独立推演副本。');
  if (!record(action) || !world.nations.some(nation => nation.id === action.nationId)) return invalid('国家行动格式或国家不存在。');
  const nation = world.nations.find(item => item.id === action.nationId)!;
  if (action.type === 'policy') {
    if (!keys(action, ['type', 'nationId', 'priority']) || !policyOptions.some(option => option.value === action.priority)) return invalid('粮食政策无效。');
    if (world.statecraft.nations.find(item => item.nationId === nation.id)!.priority === action.priority) return invalid('该国已经执行此政策。');
    const option = policyOptions.find(item => item.value === action.priority)!;
    return { valid: true, reason: `将${nation.name}的地方粮库分配改为${option.label}。`, changes: [option.description, '下一日结算生效，不会凭空增加粮食或人口。'], warnings: action.priority === 'military' ? ['军事优先可能使居民缺粮；满足实力、储粮与接壤条件时，该国会自主宣战。'] : [], basedOn };
  }
  if ((action.type !== 'declare-war' && action.type !== 'make-peace') || !keys(action, ['type', 'nationId', 'targetNationId'])) return invalid('外交行动格式无效。');
  const target = world.nations.find(item => item.id === action.targetNationId);
  if (!target || target.id === nation.id) return invalid('外交对象必须是另一个存在的国家。');
  const relation = relationFor(world, nation.id, target.id)!;
  if (action.type === 'declare-war') {
    if (relation.status === 'war') return invalid('两国已处于战争状态。');
    if (world.day < relation.truceUntilDay) return invalid(`停战保护至第 ${relation.truceUntilDay} 天，当前不能宣战。`);
    if (!border(world, nation.id, target.id)) return invalid('当前只支持实际控制领土陆地接壤的国家宣战；尚无海军或远洋战争。');
    return { valid: true, reason: `${nation.name}将向${target.name}宣战。`, changes: ['双边关系改为战争，军队仍须真实行军和交战才能占领。'], warnings: ['战争会阻断和平通行并消耗真实地方储粮；不存在预定胜利。'], basedOn };
  }
  if (relation.status === 'peace') return invalid('两国已经和平。');
  return { valid: true, reason: `沙盒双边干预：让${nation.name}与${target.name}同时停战。`, changes: ['双方立即停止交战、追击和占领；设置 10 天停战保护。', '在途部队先完成已开始的当前路段，再沿真实邻接返回己方领土；无安全退路时原地等待。'], warnings: ['这是玩家对双方同时生效的沙盒干预，不是已经实现的外交谈判或单方和平提案。'], basedOn };
}

function setDecision(world: World, nationId: string, action: string, reason: string) {
  const policy = world.statecraft?.nations.find(item => item.nationId === nationId);
  if (policy) policy.lastDecision = { day: world.day, action, reason };
}

function enact(world: World, action: StateAction, emit: EmitEvent, reason: string) {
  const nation = world.nations.find(item => item.id === action.nationId)!;
  if (action.type === 'policy') {
    world.statecraft!.nations.find(item => item.nationId === nation.id)!.priority = action.priority;
    emit(world, 'economy', `${nation.name}调整粮食政策`, reason); setDecision(world, nation.id, '调整政策', reason); return;
  }
  const target = world.nations.find(item => item.id === action.targetNationId)!;
  const relation = relationFor(world, nation.id, target.id)!;
  relation.status = action.type === 'declare-war' ? 'war' : 'peace'; relation.sinceDay = world.day;
  relation.truceUntilDay = action.type === 'make-peace' ? Math.min(MAX_DAY, world.day + 10) : 0;
  if(action.type==='declare-war')declared?.(world,nation.id,target.id);
  if (action.type === 'make-peace') {
    const provinces = new Map(world.provinces.map(province => [province.id, province]));
    for (const army of world.armies) {
      if (!live(army) || (army.nationId !== nation.id && army.nationId !== target.id)) continue;
      // Preserve a started segment and its progress; later ticks finish it and
      // physically evacuate. Clearing progress here would visibly teleport.
      const host = provinces.get(army.provinceId)!.controller;
      const visitingNeutral = host !== army.nationId && !nationsAtWar(world, army.nationId, host);
      if (army.route.length && (visitingNeutral || army.route.some(id => { const controller = provinces.get(id)!.controller; return controller !== army.nationId && !nationsAtWar(world, army.nationId, controller); }))) {
        if (army.progress > 0) army.route = army.route.slice(0, 1);
        else { army.route = []; army.progress = 0; army.status = 'idle'; }
      }
      // Road contacts retain their current position until the engagement layer
      // releases the actual participants, including third-party wars.
      if (army.status === 'fighting' && army.progress === 0 && !world.armies.some(other => live(other) && other.status !== 'retreating' && other.progress===0 && other.provinceId === army.provinceId && nationsAtWar(world, army.nationId, other.nationId))) army.status = 'idle';
    }
  }
  emit(world, 'diplomacy', `${nation.name}与${target.name}${relation.status === 'war' ? '进入战争' : '停止战争'}`, reason);
  setDecision(world, nation.id, relation.status === 'war' ? '宣战' : '停战', reason);
  setDecision(world, target.id, relation.status === 'war' ? '应战' : '停战', reason);
}

function applyManagementAction(world: World, action: StateAction, expected: StateVersion, emit: EmitEvent): World {
  if (!record(expected) || !keys(expected, ['day', 'nextEventId']) || expected.day !== world.day || expected.nextEventId !== world.nextEventId) throw new Error('预览已经过期，世界状态发生变化；请重新预览并确认。');
  const preview = previewManagementAction(world, action);
  if (!preview.valid) throw new Error(preview.reason);
  const next = structuredClone(world); enact(next, action, emit, [preview.reason, ...preview.changes, ...preview.warnings].join('')); return next;
}

/** Finite local stores: each grain unit is one person-day of food. */
function advanceEconomy(world: World, emit: EmitEvent) {
  const management = world.statecraft!;
  const policies = new Map(management.nations.map(policy => [policy.nationId, policy]));
  const provinces = new Map(world.provinces.map(province => [province.id, province]));
  const armiesByProvince = new Map<string, Army[]>();
  for (const army of world.armies) if (live(army)) {
    army.supplies = Math.max(0, army.supplies - armyConsumption(army));
    const armies = armiesByProvince.get(army.provinceId) ?? []; armies.push(army); armiesByProvince.set(army.provinceId, armies);
  }
  for (const policy of management.nations) policy.lastLedger = { day: world.day, openingGrain: 0, production: 0, civilianConsumed: 0, militaryConsumed: 0, territoryTransfer: 0, closingGrain: 0, starvationDeaths: 0 };
  for (const economy of management.provinces) {
    const province = provinces.get(economy.provinceId)!;
    const policy = policies.get(province.controller)!, ledger = policy.lastLedger!;
    const population = economy.population;
    ledger.openingGrain += economy.grain;
    const produced = Math.min(MAX_GRAIN - economy.grain, production(province, population, contested(world, province)));
    economy.grain += produced; ledger.production += produced;
    const refill = (reserve: number) => {
      if (contested(world, province)) return;
      for (const army of (armiesByProvince.get(province.id) ?? []).filter(army => army.status === 'idle' && army.nationId === province.controller).sort((a, b) => a.id.localeCompare(b.id))) {
        const points = Math.max(0, Math.floor(Math.min(province.supply, 100 - army.supplies, Math.max(0, economy.grain - reserve) * 6 / rationStrength(army))));
        const consumed = Math.ceil(points * rationStrength(army) / 6);
        economy.grain -= consumed; ledger.militaryConsumed += consumed; army.supplies += points;
      }
    };
    if (policy.priority === 'military') refill(0);
    const consumed = Math.min(economy.grain, population); economy.grain -= consumed; ledger.civilianConsumed += consumed;
    const shortage = population - consumed;
    const deaths = shortage > 0 ? Math.min(population, Math.ceil(shortage * 0.002)) : 0;
    economy.population -= deaths; ledger.starvationDeaths += deaths;
    if (!shortage && population < capacity(province)) economy.population = Math.min(capacity(province), population + Math.floor(population * 0.0001));
    if (policy.priority !== 'military') refill(population * (policy.priority === 'civilian' ? 3 : 1));
    ledger.closingGrain += economy.grain;
  }
  for (const policy of management.nations) {
    const ledger = policy.lastLedger!, nation = world.nations.find(item => item.id === policy.nationId)!;
    if (ledger.starvationDeaths || world.day % 7 === 0) emit(world, 'economy', `${nation.name}日粮结算${ledger.starvationDeaths ? `：饥荒死亡 ${ledger.starvationDeaths}` : ''}`, `期初 ${ledger.openingGrain} + 生产 ${ledger.production} − 民用 ${ledger.civilianConsumed} − 军用 ${ledger.militaryConsumed} = 期末 ${ledger.closingGrain} 人日粮。粮食只由所在辖区提供，饥荒按未供给人口的 0.2% 逐日减员。`);
  }
}

function transferEconomy(world: World, provinceId: string, from: string, to: string) {
  if (!world.statecraft) return;
  const grain = world.statecraft.provinces.find(province => province.provinceId === provinceId)!.grain;
  for (const [nationId, sign] of [[from, -1], [to, 1]] as const) {
    const ledger = world.statecraft.nations.find(policy => policy.nationId === nationId)!.lastLedger;
    if (ledger?.day === world.day) { ledger.territoryTransfer += sign * grain; ledger.closingGrain += sign * grain; }
  }
}

/** Policy-aware, deterministic diplomacy; no random wars and no fixed winner. */
function makeDiplomaticDecisions(world: World, emit: EmitEvent) {
  if (!world.statecraft || world.day % 7 !== 0) return;
  const reports = new Map(buildNationReports(world).map(report => [report.nationId, report]));
  const strength = (id: string) => world.armies.filter(army => live(army) && army.nationId === id).reduce((sum, army) => sum + army.troops * (0.35 + army.morale * 0.0065) * (army.supplies > 35 ? 1 : 0.5), 0);
  for (const policy of world.statecraft.nations) {
    const report = reports.get(policy.nationId)!;
    if (policy.priority === 'civilian' || world.statecraft.relations.some(relation => relation.status === 'war' && (relation.a === policy.nationId || relation.b === policy.nationId)) || !report.territoryCount) continue;
    const reserveDays = policy.priority === 'military' ? 12 : 18;
    const advantage = policy.priority === 'military' ? 1.5 : 1.9;
    const observation = policy.priority === 'military' ? 7 : 14;
    const need = report.civilianNeedPerDay + report.militaryNeedPerDay;
    if (report.grain < need * reserveDays) { setDecision(world, policy.nationId, '维持和平', `储粮 ${report.grain} 不足预计每日需求 ${need} 的 ${reserveDays} 天，暂不宣战。`); continue; }
    const candidates = world.nations.filter(nation => nation.id !== policy.nationId && world.day - relationFor(world, policy.nationId, nation.id)!.sinceDay >= observation && previewManagementAction(world, { type: 'declare-war', nationId: policy.nationId, targetNationId: nation.id }).valid && strength(policy.nationId) > strength(nation.id) * advantage).sort((a, b) => strength(a.id) - strength(b.id) || a.id.localeCompare(b.id));
    if (candidates.length) enact(world, { type: 'declare-war', nationId: policy.nationId, targetNationId: candidates[0].id }, emit, `自主宣战：${policy.priority === 'military' ? '军事优先' : '均衡政策'}已观察至少 ${observation} 天，储粮可覆盖至少 ${reserveDays} 天预计民军需求，对陆地接壤国的有效军力超过 ${advantage} 倍，且停战保护已结束。胜负仍由真实行军、地形、粮食与战斗决定。`);
    else setDecision(world, policy.nationId, '维持和平', `没有同时满足陆地接壤、观察 ${observation} 天、停战期结束与有效军力超过 ${advantage} 倍的对象。`);
  }
}

/** Strict schema2 addendum. Base world references are validated by core first. */
function validateManagement(world: World): boolean {
  const state: unknown = world.statecraft;
  if (!record(state) || !keys(state, ['version', 'provinces', 'nations', 'relations']) || state.version !== 1 || !Array.isArray(state.provinces) || state.provinces.length !== world.provinces.length || !Array.isArray(state.nations) || state.nations.length !== world.nations.length || !Array.isArray(state.relations) || state.relations.length !== world.nations.length * (world.nations.length - 1) / 2) return false;
  const provinceIds = new Set(world.provinces.map(province => province.id)), nationIds = new Set(world.nations.map(nation => nation.id)), seen = new Set<string>();
  for (const value of state.provinces) {
    if (!record(value) || !keys(value, ['provinceId', 'population', 'grain']) || typeof value.provinceId !== 'string' || !provinceIds.has(value.provinceId) || seen.has(value.provinceId) || !integer(value.population, 0, 1_000_000_000) || !integer(value.grain, 0, MAX_GRAIN)) return false;
    seen.add(value.provinceId);
  }
  seen.clear();
  for (const value of state.nations) {
    if (!record(value) || !keys(value, ['nationId', 'priority', 'lastLedger', 'lastDecision']) || typeof value.nationId !== 'string' || !nationIds.has(value.nationId) || seen.has(value.nationId) || !policyOptions.some(option => option.value === value.priority)) return false;
    seen.add(value.nationId);
    if (value.lastLedger !== null) {
      const ledger = value.lastLedger;
      if (!record(ledger) || !keys(ledger, ['day', 'openingGrain', 'production', 'civilianConsumed', 'militaryConsumed', 'territoryTransfer', 'closingGrain', 'starvationDeaths']) || !integer(ledger.day, 0, world.day) || !['openingGrain', 'production', 'civilianConsumed', 'militaryConsumed', 'closingGrain', 'starvationDeaths'].every(key => integer(ledger[key], 0, 1_000_000_000_000_000)) || !integer(ledger.territoryTransfer, -1_000_000_000_000_000, 1_000_000_000_000_000)) return false;
      const typed = ledger as EconomyLedger;
      if (typed.openingGrain + typed.production - typed.civilianConsumed - typed.militaryConsumed + typed.territoryTransfer !== typed.closingGrain) return false;
    }
    if (value.lastDecision !== null && (!record(value.lastDecision) || !keys(value.lastDecision, ['day', 'action', 'reason']) || !integer(value.lastDecision.day, 0, world.day) || !text(value.lastDecision.action, 120) || !text(value.lastDecision.reason, 10000))) return false;
  }
  seen.clear();
  for (const value of state.relations) {
    if (!record(value) || !keys(value, ['a', 'b', 'status', 'sinceDay', 'truceUntilDay']) || typeof value.a !== 'string' || typeof value.b !== 'string' || !nationIds.has(value.a) || !nationIds.has(value.b) || value.a >= value.b || seen.has(`${value.a}/${value.b}`) || (value.status !== 'peace' && value.status !== 'war') || !integer(value.sinceDay, 0, world.day) || !integer(value.truceUntilDay, 0, MAX_DAY) || (value.status === 'war' && value.truceUntilDay !== 0) || (value.status === 'peace' && value.truceUntilDay !== 0 && value.truceUntilDay !== Math.min(MAX_DAY, (value.sinceDay as number) + 10))) return false;
    seen.add(`${value.a}/${value.b}`);
  }
  return true;
}

return {advanceEconomy,buildNationReports,applyManagementAction,makeDiplomaticDecisions,initializeManagement,transferEconomy,validateManagement};
}
