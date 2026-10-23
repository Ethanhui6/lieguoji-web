import {fastChecks47} from './checks47';
import type {World} from '../../sim/types';
import {validateManagement} from '../../compat/v0_4/sim/statecraft';

/** Forward-only world validation adapted from compat/v0_4/sim/core. Geometry,
 * entity references, finite values, caps and management checks stay identical.
 * New creation permits zero armies before real muster; no placeholder force
 * or filtered fake world is passed through the frozen legacy validator.
 * This validates the World payload, not a complete run47/storage envelope. */
// No gameplay end date. Keep enough safe-integer space for the 120-tick day.
const MAX_DAY=Math.floor((Number.MAX_SAFE_INTEGER-1_000_000)/120),MAX_EVENTS=160;
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
export function validateCivilizationWorld47(value: unknown): value is World {if(fastChecks47())return true;
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
  // Capital references survive conquest as historical city identities. The
  // active-capital view separately requires current territorial control.
  for (const nation of value.nations as World['nations']) if (!cities.some(city => city.id === nation.capitalId)) return false;
  for (const army of value.armies) {
    if (!isRecord(army) || !exactKeys(army, ['id', 'name', 'nationId', 'provinceId', 'troops', 'morale', 'supplies', 'status', 'route', 'progress', 'originId']) || !uniqueId(army.id) || !isText(army.name) || !nationIds.has(army.nationId as string) || !provinceIds.has(army.provinceId as string) || !provinceIds.has(army.originId as string) || !integer(army.troops, 0, 10000000) || !finite(army.morale, 0, 100) || !finite(army.supplies, 0, 100) || !['idle', 'marching', 'fighting', 'retreating', 'destroyed'].includes(army.status as string) || !finite(army.progress, 0, 1) || army.progress === 1 || !list(army.route, 0, provinces.length) || !army.route.every(id => provinceIds.has(id as string)) || new Set(army.route).size !== army.route.length || army.route.includes(army.provinceId)) return false;
    let previous = army.provinceId as string;
    for (const target of army.route as string[]) { if (!provinceMap.get(previous)!.neighbors.includes(target)) return false; previous = target; }
    const moving = army.status === 'marching' || army.status === 'retreating';
    // A native47 retreat travels in the authoritative position ledger. World
    // payload validation permits its empty legacy route; the actual runtime
    // owner validates that ledger, never fabricates province hops.
    const actualRetreat=army.status==='retreating'&&army.route.length===0&&army.progress===0;
    if ((!actualRetreat && moving !== (army.route.length > 0)) || (!moving && army.progress !== 0) || (army.status === 'destroyed' ? army.troops !== 0 : army.troops === 0)) return false;
  }
  let previousId = 0;
  let previousDay = 0;
  for (const item of value.events) {
    if (!isRecord(item) || !exactKeys(item, ['id', 'day', 'kind', 'text', 'reason']) || !integer(item.id, previousId + 1, value.nextEventId - 1) || !integer(item.day, previousDay, value.day) || !['order', 'march', 'supply', 'battle', 'occupation', 'retreat', 'system', ...(modern ? ['economy', 'diplomacy'] : [])].includes(item.kind as string) || !isText(item.text, 5000) || !isText(item.reason, 10000)) return false;
    previousId = item.id; previousDay = item.day;
  }
  return !modern || validateManagement(value as World);
}
