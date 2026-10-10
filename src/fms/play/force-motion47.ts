import type {Point} from '../../sim/types';
import {cloneForceTravelRecords47,isOwnedTravelWindow47} from './owned-travel47';
import type {TravelCell47, TravelGraph47} from './army-travel47-graph';
import {armyTravelLocation47, armyTravelSegment47, assertArmyTravel47, type ArmyTravel47} from './army-travel47-state';

export type ForceRef47 = {kind: 'army' | 'fleet'; id: string};
export type MovingForce47 = ForceRef47 & {nationId: string; withdrawing: boolean; travel: ArmyTravel47};
export type ForceContact47 = {a: string; b: string; cellA: number; cellB: number; pointA: Point; pointB: Point; area: string};
export type ForceContacts47 = {version: 1; pairs: ForceContact47[]};
export const forceKey47 = (f: ForceRef47) => JSON.stringify([f.kind, f.id]);
export const initialForceContacts47 = (): ForceContacts47 => ({version: 1, pairs: []});
/** All queries are pure and stable throughout one motion phase. In particular,
 * diplomacy and sea membership cannot depend on the number of lookups. */
type Rules = {
  enemy: (a: string, b: string) => boolean;
  canEnter: (force: Readonly<MovingForce47>, cell: Readonly<TravelCell47>) => boolean;
  speed: (force: Readonly<MovingForce47>, cell: Readonly<TravelCell47>) => number;
  /** Verified persisted water-province membership. Never screen proximity. */
  seaRegion: (face: number) => number;
};
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const pairKey = (a: string, b: string) => JSON.stringify([a, b].sort());
const areaOf = (cell: TravelCell47, rules: Pick<Rules, 'seaRegion'>) => {
  if (cell.surface === 'land') return 'land/' + cell.provinceId;
  const id = rules.seaRegion(cell.face);
  if (!Number.isSafeInteger(id) || id < 0) throw Error('海军接触缺少真实海域归属。');
  return 'sea/' + id;
};
function segment(f: MovingForce47, graph: TravelGraph47) {
  const value=armyTravelSegment47(f.travel,graph);if(!value)return null;
  // The local endpoint is not an admission gate; kind guards below prevent
  // it from participating in gate requests or boundary contact exceptions.
  return value.kind==='local'?{kind:'local' as const,from:value.cell,to:value.cell,gate:value.endPoint,toGate:value.distance,end:value.distance}:{kind:'gate' as const,from:value.a,to:value.b,gate:value.gate,toGate:value.toGate,end:value.distance};
}
/** A V2 endpoint can coincide with its final shared gate. Normalizing arrival
 * must not erase that geometric boundary for a simultaneous encounter in the
 * region it just left. Recover only this exact persisted final gate. */
function boundarySegment(f:MovingForce47,graph:TravelGraph47){
  const edge=segment(f,graph);if(edge?.kind==='gate')return f.travel.offset===edge.toGate?edge:null;
  const s=f.travel;if(s.version!==2||s.nodes.length<2||s.leg!==s.nodes.length-1)return null;
  const previous=segment({...f,travel:{...s,leg:s.leg-1}},graph);
  return previous?.kind==='gate'&&same(s.destination,previous.gate)?previous:null;
}
function positions(forces: MovingForce47[], graph: TravelGraph47) {
  return new Map(forces.map(f => [forceKey47(f), {...armyTravelLocation47(f.travel, graph), force: f}]));
}
type Positions = ReturnType<typeof positions>;
function pair(a: string, b: string, p: Positions, area: string): ForceContact47 {
  if (b < a) [a, b] = [b, a]; const x = p.get(a)!, y = p.get(b)!;
  return {a, b, cellA: x.cell.id, cellB: y.cell.id, pointA: {...x.point}, pointB: {...y.point}, area};
}
/** These are geometry/contact records, not Army/Fleet health or fake cargo.
 * At load, exact positions must match. A command may clear obsolete contacts
 * explicitly; it must not repair a corrupt saved contact by moving a unit. */
export function assertForceContacts47(value: ForceContacts47, forces: MovingForce47[], graph: TravelGraph47, seaRegion: Rules['seaRegion']) {
  for(const f of forces){assertArmyTravel47(f.travel,graph);if(f.kind==='fleet'&&f.travel.nodes.some(id=>graph.cells.get(id)!.surface!=='sea'))throw Error('舰队航线进入陆地。');}
  assertContactRecordsOwned47(value,forces,graph,seaRegion);
}
/** Only the actualContactFrame47 composition may call this immediately after
 * actualForces47 has validated both complete travel ledgers and fleet surfaces.
 * No caller-supplied validation switch and no reusable/cross-tick witness. */
export function assertContactRecordsOwned47(value:ForceContacts47,forces:MovingForce47[],graph:TravelGraph47,seaRegion:Rules['seaRegion']){
  const keys = new Set<string>();
  for (const f of forces) {
    if (!['army', 'fleet'].includes(f.kind) || !f.id || !f.nationId || typeof f.withdrawing !== 'boolean' || f.travel.armyId !== f.id || keys.has(forceKey47(f))) throw Error('统一部队身份无效。');
    keys.add(forceKey47(f));
  }
  if (!value || Object.keys(value).sort().join('/') !== 'pairs/version' || value.version !== 1 || !Array.isArray(value.pairs) || value.pairs.length > forces.length * Math.max(0, forces.length - 1) / 2) throw Error('统一交锋记录无效。');
  if(!value.pairs.length)return;
  const p = positions(forces, graph), seen = new Set<string>();
  for (const c of value.pairs) {
    const a = p.get(c.a), b = p.get(c.b), key = pairKey(c.a, c.b);
    if (!c || Object.keys(c).sort().join('/') !== 'a/area/b/cellA/cellB/pointA/pointB' || !a || !b || !(c.a < c.b) || seen.has(key) || typeof c.area !== 'string' || !c.area || c.cellA !== a.cell.id || c.cellB !== b.cell.id || !c.pointA || !c.pointB || Object.keys(c.pointA).sort().join('/') !== 'x/y' || Object.keys(c.pointB).sort().join('/') !== 'x/y' || !same(c.pointA, a.point) || !same(c.pointB, b.point)) throw Error('交锋位置与真实部队不一致。');
    const area = (cell: TravelCell47) => areaOf(cell, {seaRegion});
    const atBoundary = (v: NonNullable<typeof a>) => {
      if (area(v.cell) === c.area) return true;
      const edge = boundarySegment(v.force, graph);
      return !!edge && same(v.point, edge.gate) && [edge.from, edge.to].some(cell => area(cell) === c.area);
    };
    if (c.area.startsWith('gate/')) {
      const x = segment(a.force, graph), y = segment(b.force, graph);
      if (x?.kind!=='gate' || y?.kind!=='gate' || a.force.travel.crossed || b.force.travel.crossed || a.force.travel.offset !== x.toGate || b.force.travel.offset !== y.toGate || x.from.id !== y.to.id || x.to.id !== y.from.id || !same(a.point, x.gate) || !same(b.point, x.gate) || c.area !== 'gate/' + [x.from.id, x.to.id].sort((a,b)=>a-b).join('/')) throw Error('边界交锋缺少共同真实边界。');
    } else if (!(c.area.startsWith('land/') || c.area.startsWith('sea/')) || !atBoundary(a) || !atBoundary(b) || area(a.cell) !== c.area && area(b.cell) !== c.area) throw Error('交锋不属于两支部队的实际地区或入出边界。');
    seen.add(key);
  }
}
function contacts(forces: MovingForce47[], graph: TravelGraph47, old: ForceContacts47, rules: Rules, ready?:Positions) {
  const p = ready??positions(forces, graph), pairs = new Map<string, ForceContact47>(), groups = new Map<string, string[]>();
  const eligible = (a: MovingForce47, b: MovingForce47, area: string) => rules.enemy(a.nationId, b.nationId) && (area.startsWith('sea/') || !a.withdrawing && !b.withdrawing);
  for (const c of old.pairs) {
    const a = p.get(c.a), b = p.get(c.b);
    const departed = a && b && c.area.startsWith('sea/') && (a.force.withdrawing || b.force.withdrawing) && areaOf(a.cell, rules) !== areaOf(b.cell, rules);
    if (a && b && !departed && same(a.point, c.pointA) && same(b.point, c.pointB) && a.cell.id === c.cellA && b.cell.id === c.cellB && eligible(a.force, b.force, c.area)) pairs.set(pairKey(c.a, c.b), c);
  }
  for (const [key, value] of p) {const area = areaOf(value.cell, rules), group = groups.get(area) ?? []; group.push(key); groups.set(area, group);}
  const held = new Set<string>();
  for (const [area, group] of groups) {
    let war = false;
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = group[i], b = group[j];
      if (!eligible(p.get(a)!.force, p.get(b)!.force, area)) continue;
      war = true; pairs.set(pairKey(a, b), pair(a, b, p, area));
    }
    // Native sea-province trigger is global, including neutral observers.
    // Withdrawing is an explicit web escape mode; it remains a damage target.
    if (war && area.startsWith('sea/')) for (const id of group) if (!p.get(id)!.force.withdrawing) held.add(id);
  }
  for (const c of pairs.values()) for (const id of [c.a, c.b]) if (!p.get(id)!.force.withdrawing) held.add(id);
  return {contacts: {version: 1 as const, pairs: [...pairs.values()].sort((a, b) => pairKey(a.a, a.b).localeCompare(pairKey(b.a, b.b)))}, held, positions: p};
}
/** Only after an owned transaction has validated the old contacts. Deaths,
 * withdrawals and peace may remove entries; never use this to repair a save. */
export function reconcileForceContactsOwned47(forces: MovingForce47[], graph: TravelGraph47, old: ForceContacts47, enemy: Rules['enemy'], seaRegion: Rules['seaRegion']) {
  return contacts(forces, graph, old, {enemy, seaRegion, canEnter: () => false, speed: () => 0});
}
const contactIdentity = (book: ForceContacts47) => JSON.stringify(book.pairs.map(c => [c.a,c.b,c.area]).sort());
/** Shared event cursor for BOTH Army and Fleet paths. No force gets a whole
 * frame before another. The owner bounds seconds by its next diplomacy/day/
 * damage event, then executes those events before the next call. Speeds and
 * access callbacks must be pure. This is a motion/contact phase, not a clock.
 * Water partitions and clipped triangles are explicit web geometry adapters. */
export function advanceForceContacts47(input: readonly MovingForce47[], previous: ForceContacts47, graph: TravelGraph47, seconds: number, rules: Rules, maxEvents = 100000, stopAtEvent = false) {
  return advanceForceContactsCore47(input,previous,graph,seconds,rules,maxEvents,stopAtEvent);
}
/** Fixed Session movement owner only, immediately after its START frame was
 * reconciled and installed in the run. No external observers/commands may run
 * between that frame and this call. Keep the START rows untouched for ports.
 * This is not a load/save validator or a reusable cross-phase certificate. */
export function advanceSessionForceContacts47(input:readonly MovingForce47[],previous:ForceContacts47,graph:TravelGraph47,seconds:number,rules:Rules,start:ReturnType<typeof reconcileForceContactsOwned47>){
  if(!isOwnedTravelWindow47()||start.contacts!==previous)throw Error('行军起始接触必须来自当前私有阶段。');
  // Nonempty contacts retain the original sorted-force reconstruction: its
  // held/exposure insertion order and boundary-pair isolation are observable.
  const empty=!start.contacts.pairs.length&&!start.held.size&&!input.some(f=>f.withdrawing);
  return advanceForceContactsCore47(input,previous,graph,seconds,rules,100000,true,empty?start:undefined);
}
function advanceForceContactsCore47(input: readonly MovingForce47[], previous: ForceContacts47, graph: TravelGraph47, seconds: number, rules: Rules, maxEvents:number, stopAtEvent:boolean,ready?:ReturnType<typeof reconcileForceContactsOwned47>) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isSafeInteger(maxEvents) || maxEvents < 1) throw Error('统一行军时间或事件预算无效。');
  const forces = cloneForceTravelRecords47(input).sort((a, b) => forceKey47(a).localeCompare(forceKey47(b)));
  if(!ready)assertForceContacts47(previous, forces, graph, rules.seaRegion);
  let book = ready?.contacts??structuredClone(previous), remaining = seconds, events = 0;
  const exposure: Record<string, number> = {};
  const initial = ready??contacts(forces, graph, book, rules);
  // The military clock must see a contact beginning at time zero before it
  // chooses an attack deadline. Ordinary movement callers still consume dt.
  if (!ready&&stopAtEvent && contactIdentity(initial.contacts) !== contactIdentity(book)) return {...initial, forces, exposure, events, elapsed:0, unusedSeconds:seconds};
  let current=initial;
  while (remaining > 0) {
    if (++events > maxEvents) throw Error('统一行军事件超出预算，原世界未提交。');
    book = current.contacts;
    const movers = forces.flatMap(f => {
      if (current.held.has(forceKey47(f)) || ['arrived', 'halted'].includes(f.travel.status)) return [];
      const s = f.travel, edge = segment(f, graph)!;
      if (edge.kind==='gate' && !s.crossed && (s.offset === 0 || s.offset === edge.toGate) && !rules.canEnter(f, edge.to)) {s.status = 'blocked'; return [];}
      s.status = 'moving'; const end = edge.kind==='local'||s.crossed ? edge.end : edge.toGate, left = end - s.offset;
      const speed = left === 0 ? 0 : rules.speed(f, s.crossed ? edge.to : edge.from);
      if (!Number.isFinite(speed) || speed < 0) throw Error('统一行军速度无效，原世界未提交。');
      return [{f, edge, speed, end, time: left === 0 ? 0 : speed > 0 ? left / speed : Infinity}];
    });
    const dt = Math.min(remaining, ...movers.map(m => m.time));
    if (dt > 0) {
      const participating = new Set([...current.held, ...book.pairs.flatMap(p => [p.a, p.b])]);
      for (const key of participating) exposure[key] = (exposure[key] ?? 0) + dt;
      for (const m of movers) m.f.travel.offset = m.time <= dt ? m.end : m.edge.kind==='local'?Math.min(m.end,m.f.travel.offset+dt*m.speed):m.f.travel.offset + dt * m.speed;
      remaining = Math.max(0, remaining - dt);
    }
    // Center normalization is not a second move; gate admission stays pending.
    const reached=(m:typeof movers[number])=>m.time<=dt||m.edge.kind==='local'&&m.f.travel.offset===m.end;
    // No endpoint was reached and no force changed its cell: the just-computed
    // empty region groups cannot gain an enemy pair merely by moving inside
    // those same cells. Keep every integration/speed step and END validation.
    // Test the actual updated offsets, including local float rounding, instead
    // of predicting arrival with a second (potentially different) expression.
    let interiorEnd:Positions|undefined;
    if(remaining===0&&!book.pairs.length&&!current.held.size&&!forces.some(f=>f.withdrawing)&&!movers.some(reached)){
      interiorEnd=positions(forces,graph);
      if([...interiorEnd].every(([key,p])=>p.cell.id===current.positions.get(key)?.cell.id)){
        current={contacts:initialForceContacts47(),held:new Set(),positions:interiorEnd};
        break;
      }
    }
    for (const m of movers) if (reached(m)) {
      const s=m.f.travel;if(m.edge.kind==='local'){s.offset=m.edge.end;s.status='arrived';}
      else if(s.crossed){s.leg++; s.offset = 0; s.crossed = false;if (s.leg === s.nodes.length - 1) s.status = 'arrived';}
    }
    const requests = movers.filter(m => m.edge.kind==='gate' && m.time <= dt && m.f.travel.status!=='arrived' && !m.f.travel.crossed && m.f.travel.nodes[m.f.travel.leg] === m.edge.from.id && m.f.travel.offset === m.edge.toGate);
    const before = requests.length?positions(forces, graph):new Map();
    const admitted = requests.filter(m => {if (rules.canEnter(m.f, m.edge.to)) return true; m.f.travel.status = 'blocked'; return false;});
    const stopped = new Set<string>(), meetings: {a: string; b: string; area: string}[] = [];
    // Simultaneous gate exchange is a real contact, never an ID-ordered swap.
    for (let i = 0; i < admitted.length; i++) for (let j = i + 1; j < admitted.length; j++) {
      const a = admitted[i], b = admitted[j];
      if (a.edge.from.id === b.edge.to.id && a.edge.to.id === b.edge.from.id && !a.f.withdrawing && !b.f.withdrawing && rules.enemy(a.f.nationId, b.f.nationId)) {
        const x = forceKey47(a.f), y = forceKey47(b.f); stopped.add(x); stopped.add(y);
        meetings.push({a: x, b: y, area: 'gate/' + [a.edge.from.id, a.edge.to.id].sort((x, y) => x - y).join('/')});
      }
    }
    // An occupant departing through a different gate at the exact entry time
    // cannot disappear before the incoming force observes it. Store this
    // boundary encounter at both real points; no synthetic province snapping.
    for (const m of admitted) if (!stopped.has(forceKey47(m.f))) {
      const area = areaOf(m.edge.to, rules);
      for (const [key, value] of before) if (key !== forceKey47(m.f) && areaOf(value.cell, rules) === area && rules.enemy(m.f.nationId, value.force.nationId) && (area.startsWith('sea/') || !m.f.withdrawing && !value.force.withdrawing)) meetings.push({a: forceKey47(m.f), b: key, area});
    }
    for (const m of admitted) if (!stopped.has(forceKey47(m.f))) {
      const s=m.f.travel;s.crossed=true;
      // A precise destination may be the gate itself. Finish at this same
      // event even if no frame time remains; do not retain invalid full offset.
      if(s.offset===m.edge.end){s.leg++;s.offset=0;s.crossed=false;if(s.leg===s.nodes.length-1)s.status='arrived';}
    }
    const after = interiorEnd??positions(forces, graph), merged = new Map(book.pairs.map(c => [pairKey(c.a, c.b), c]));
    for (const m of meetings) merged.set(pairKey(m.a, m.b), pair(m.a, m.b, after, m.area));
    current = contacts(forces, graph, {version: 1, pairs: [...merged.values()]}, rules,after);
    // Yield AFTER simultaneous admission. This also exposes empty-land entry
    // to occupation and changing terrain speed before any further movement.
    if (stopAtEvent && movers.some(reached)) break;
    if (dt === 0 && !admitted.length && !movers.some(m => m.time <= dt)) throw Error('统一行军未消费事件，原世界未提交。');
  }
  const result = current;
  assertForceContacts47(result.contacts, forces, graph, rules.seaRegion);
  return {forces, contacts: result.contacts, held: result.held, positions:result.positions, exposure, events, elapsed:seconds-remaining, unusedSeconds:remaining};
}
