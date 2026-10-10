import {describe, expect, it} from 'vitest';
import type {TravelGraph47} from './army-travel47-graph';
import {armyTravelLocation47, beginArmyTravel47,beginArmyTravelToPoint47} from './army-travel47-state';
import {advanceForceContacts47,advanceSessionForceContacts47,reconcileForceContactsOwned47, assertForceContacts47, forceKey47, initialForceContacts47, type MovingForce47, type ForceContacts47} from './force-motion47';
import {withOwnedTravel47} from './owned-travel47';
import {nativeNavalFactor47, nativeNavyHit47} from './native-war/naval-damage47';
import {forceVolley47} from './force-volley47';

// Explicit synthetic adjacent squares, never a saved game or visual sample.
function strip(surfaces: ('land' | 'sea')[] = ['land', 'land', 'land', 'land']): TravelGraph47 {
  return {scale: 1, polygonWork: 0, byProvince: new Map(), cells: new Map(surfaces.map((surface, id) => [id, {
    id, face: id, surface, provinceId: surface === 'land' ? 'p' + id : null,
    center: {x: id * 10 + 5, y: 5}, polygon: [{x: id * 10, y: 0}, {x: id * 10 + 10, y: 0}, {x: id * 10 + 10, y: 10}, {x: id * 10, y: 10}],
    links: [...(id ? [{to: id - 1, gate: {x: id * 10, y: 5}, toGate: 5, distance: 10}] : []), ...(id < surfaces.length - 1 ? [{to: id + 1, gate: {x: id * 10 + 10, y: 5}, toGate: 5, distance: 10}] : [])],
  }]))};
}
function unit(g: TravelGraph47, id: string, nationId: string, nodes: number[], kind: 'army' | 'fleet' = 'army'): MovingForce47 {
  return {id, nationId, kind, withdrawing: false, travel: beginArmyTravel47(id, nodes, g)};
}
const rules = {enemy: (a: string, b: string) => a !== b, canEnter: () => true, speed: () => 1, seaRegion: (face: number) => face};
const place = (f: MovingForce47, g: TravelGraph47) => armyTravelLocation47(f.travel, g);
const byId = (fs: MovingForce47[], id: string) => fs.find(f => f.id === id)!;

describe('47 synchronous Army and Fleet contact motion', () => {
  it.each(['interior','zero-speed','stopped','rounded-local','gate','center','withdrawal','neutral-held','blocked'] as const)('prepared private START preserves complete public motion and input: %s',scenario=>{
    const sea=scenario==='neutral-held'||scenario==='withdrawal',g=strip(sea?['sea','sea','sea']:undefined);
    let fs=[unit(g,'z','a',[0,1,2]),unit(g,'a','b',[sea?2:3])],seconds=1;
    let activeRules={...rules};
    if(scenario==='zero-speed')activeRules={...rules,speed:()=>0};
    if(scenario==='stopped')fs=[unit(g,'z','a',[0]),{...unit(g,'a','b',[1,2]),travel:{...beginArmyTravel47('a',[1,2],g),status:'halted'}}];
    if(scenario==='rounded-local'){
      const f=unit(g,'z','a',[0]);f.travel=beginArmyTravelToPoint47(f.id,[0],g,{x:1,y:1},{x:2,y:1});f.travel.offset=1-2**-53;fs=[f];seconds=3*2**-55;
    }
    if(scenario==='gate'){fs=[unit(g,'z','a',[0,1]),unit(g,'a','b',[1,0])];seconds=5;}
    if(scenario==='center'){fs=[unit(g,'z','a',[0,1,2])];fs[0].travel.crossed=true;fs[0].travel.offset=9;}
    if(sea){fs=[unit(g,'z','a',[0,1]),unit(g,'a','b',[2,1],'fleet'),unit(g,'neutral','n',[1])];activeRules={...rules,seaRegion:()=>81,enemy:(a,b)=>a!==b&&a!=='n'&&b!=='n'};if(scenario==='withdrawal')fs[0].withdrawing=true;}
    if(scenario==='blocked'){fs=[unit(g,'z','a',[0,1])];fs[0].travel.status='blocked';activeRules={...rules,canEnter:()=>false};}
    const before=structuredClone(fs),start=reconcileForceContactsOwned47(fs,g,initialForceContacts47(),activeRules.enemy,activeRules.seaRegion),startBefore=structuredClone(start);
    assertForceContacts47(start.contacts,fs,g,activeRules.seaRegion);
    const ordinary=advanceForceContacts47(fs,start.contacts,g,seconds,activeRules,100000,true);
    const owned=withOwnedTravel47(()=>advanceSessionForceContacts47(fs,start.contacts,g,seconds,activeRules,start));
    expect(owned).toEqual(ordinary);expect(fs).toEqual(before);expect(start).toEqual(startBefore);
    expect(Object.keys(owned.exposure)).toEqual(Object.keys(ordinary.exposure));expect([...owned.held]).toEqual([...ordinary.held]);
    expect([...owned.positions.keys()]).toEqual(owned.forces.map(forceKey47));
    for(const f of owned.forces)expect(owned.positions.get(forceKey47(f))!.force).toBe(f);
  });
  it('requires the installed private START and keeps public zero-time contacts observable',()=>{
    const g=strip(),fs=[unit(g,'a','a',[0]),unit(g,'b','b',[0])],book=initialForceContacts47(),start=reconcileForceContactsOwned47(fs,g,book,rules.enemy,rules.seaRegion);
    expect(()=>advanceSessionForceContacts47(fs,start.contacts,g,1,rules,start)).toThrow();
    expect(()=>withOwnedTravel47(()=>advanceSessionForceContacts47(fs,book,g,1,rules,start))).toThrow();
    const publicResult=advanceForceContacts47(fs,book,g,1,rules,100000,true);expect(publicResult.elapsed).toBe(0);expect(publicResult.events).toBe(0);
  });
  it('retains all earlier boundary events when the final step stays inside a cell',()=>{
    const g=strip(),f=unit(g,'a','a',[0,1,2]),out=advanceForceContacts47([f],initialForceContacts47(),g,12,rules);
    expect(out.events).toBe(3);expect(out.elapsed).toBe(12);expect(out.unusedSeconds).toBe(0);expect(out.exposure).toEqual({});expect(out.forces[0].travel).toMatchObject({leg:1,offset:2,crossed:false,status:'moving'});
  });
  it('yields an initial contact at zero elapsed and every real gate/center before consuming remaining time',()=>{
    const g=strip(),fs=[unit(g,'a','a',[0,1,2]),unit(g,'b','b',[1])];
    const boundary=advanceForceContacts47(fs,initialForceContacts47(),g,40,rules,100,true);
    expect(boundary.elapsed).toBe(5);expect(boundary.unusedSeconds).toBe(35);expect(boundary.contacts.pairs).toHaveLength(1);
    const same=[unit(g,'a','a',[0]),unit(g,'b','b',[0])],initial=advanceForceContacts47(same,initialForceContacts47(),g,10,rules,100,true);
    expect(initial.elapsed).toBe(0);expect(initial.unusedSeconds).toBe(10);
    const held=advanceForceContacts47(initial.forces,initial.contacts,g,10,rules,100,true);expect(held.elapsed).toBe(10);
    const free=advanceForceContacts47([fs[0]],initialForceContacts47(),g,40,rules,100,true);
    expect(free.elapsed).toBe(5);const center=advanceForceContacts47(free.forces,free.contacts,g,35,rules,100,true);expect(center.elapsed).toBe(5);expect(center.forces[0].travel.leg).toBe(1);
  });
  it.each(['arrived', 'halted', 'blocked'] as const)('stops a long march at a %s intermediate defender rather than crossing it', status => {
    const g = strip(), a = unit(g, 'a', 'a', [0, 1, 2, 3]), b = unit(g, 'b', 'b', status === 'arrived' ? [1] : [1, 2]); b.travel.status = status;
    const stopDefender = {...rules, canEnter: (f: Readonly<MovingForce47>) => f.id !== 'b'};
    const result = advanceForceContacts47([a, b], initialForceContacts47(), g, 40, stopDefender);
    expect(place(byId(result.forces, 'a'), g).point).toEqual({x: 10, y: 5});
    expect(place(byId(result.forces, 'a'), g).cell.id).toBe(1);
    expect(result.contacts.pairs).toHaveLength(1); expect(result.exposure[forceKey47(a)]).toBe(35);
    const again = advanceForceContacts47(JSON.parse(JSON.stringify(result.forces)), JSON.parse(JSON.stringify(result.contacts)), g, 5, stopDefender);
    expect(again.forces).toEqual(result.forces); expect(again.contacts).toEqual(result.contacts);
  });
  it.each([['land', 'land'], ['land', 'sea'], ['sea', 'sea']] as const)('catches an exactly simultaneous %s/%s gate exchange without moving either side into the other', (left, right) => {
    const g = strip([left, right]), fs = [unit(g, 'z', 'a', [0, 1]), unit(g, 'a', 'b', [1, 0])];
    const result = advanceForceContacts47(fs, initialForceContacts47(), g, 20, rules);
    expect(result.forces.map(f => place(f, g).point)).toEqual([{x: 10, y: 5}, {x: 10, y: 5}]);
    expect(place(byId(result.forces, 'z'), g).cell.id).toBe(0); expect(place(byId(result.forces, 'a'), g).cell.id).toBe(1);
    expect(result.forces.every(f => !f.travel.crossed)).toBe(true); expect(result.contacts.pairs[0].area).toBe('gate/0/1');
    const reversed = advanceForceContacts47([...fs].reverse(), initialForceContacts47(), g, 20, rules);
    expect(reversed.forces).toEqual(result.forces); expect(reversed.contacts).toEqual(result.contacts);
  });
  it('handles simultaneous entry/departure at different gates and retains that actual boundary encounter', () => {
    const g = strip(), fs = [unit(g, 'a', 'a', [0, 1]), unit(g, 'b', 'b', [1, 2])];
    const result = advanceForceContacts47(fs, initialForceContacts47(), g, 30, rules);
    expect(place(byId(result.forces, 'a'), g).point.x).toBe(10); expect(place(byId(result.forces, 'b'), g).point.x).toBe(20);
    expect(result.contacts.pairs[0].area).toBe('land/p1');
    const again = advanceForceContacts47(result.forces, result.contacts, g, 30, rules);
    expect(again.forces).toEqual(result.forces);
  });
  it('preserves canonical fractional gate points from unequal origins and through JSON recovery', () => {
    const g=strip(['land','land']), gate={x:1.2,y:4.7};
    for(const [id,x,left,right] of [[0,100.3,1.2,200],[1,-11.7,-100,1.2]]) {
      const c=g.cells.get(id)!;c.center={x,y:4.7};c.polygon=[{x:left,y:0},{x:right,y:0},{x:right,y:10},{x:left,y:10}];
      c.links=[{to:1-id,gate:{...gate},toGate:Math.abs(x-gate.x),distance:112}];
    }
    expect(100.3+(gate.x-100.3)).not.toBe(gate.x);
    const fs=[unit(g,'a','a',[0,1]),unit(g,'b','b',[1,0])], timed={...rules,speed:(_: Readonly<MovingForce47>,c: Readonly<import('./army-travel47-graph').TravelCell47>)=>Math.abs(c.center.x-gate.x)};
    const hit=advanceForceContacts47(fs,initialForceContacts47(),g,3,timed);
    expect(hit.forces.map(f=>place(f,g).point)).toEqual([gate,gate]);
    const again=advanceForceContacts47(JSON.parse(JSON.stringify(hit.forces)),JSON.parse(JSON.stringify(hit.contacts)),g,1,timed);
    expect(again.contacts).toEqual(hit.contacts);
  });
  it('uses the same time axis for sea Army/Fleet, with distinct typed IDs and no cargo conversion', () => {
    const g = strip(['sea', 'sea']), fs = [unit(g, 'same', 'a', [0, 1]), unit(g, 'same', 'b', [1, 0], 'fleet')];
    const result = advanceForceContacts47(fs, initialForceContacts47(), g, 20, rules);
    expect(result.forces).toHaveLength(2); expect(result.held.size).toBe(2); expect(result.contacts.pairs[0].a).not.toBe(result.contacts.pairs[0].b);
    expect(result.forces.every(f => place(f, g).point.x === 10)).toBe(true);
  });
  it('groups real sea province members without damaging or inventing enemies for a neutral observer', () => {
    const g = strip(['sea', 'sea', 'sea']), fs = [unit(g, 'a', 'a', [0, 1]), unit(g, 'b', 'b', [2, 1], 'fleet'), unit(g, 'c', 'c', [1, 2])];
    const sea = {...rules, seaRegion: () => 81, enemy: (a: string, b: string) => a !== b && a !== 'c' && b !== 'c'};
    const r = advanceForceContacts47(fs, initialForceContacts47(), g, 5, sea);
    expect(r.contacts.pairs).toHaveLength(1); expect(r.contacts.pairs[0].area).toBe('sea/81'); expect(r.held.size).toBe(3);
    expect(r.exposure[forceKey47(fs[2])]).toBe(5); expect(r.forces).toEqual([...fs].sort((a, b) => forceKey47(a).localeCompare(forceKey47(b))));
  });
  it('matches large versus small steps at first contact and releases positions unchanged on peace', () => {
    const g = strip(), fs = [unit(g, 'a', 'a', [0, 1, 2, 3]), unit(g, 'b', 'b', [2])];
    const large = advanceForceContacts47(fs, initialForceContacts47(), g, 50, rules);
    let small = {forces: fs, contacts: initialForceContacts47()};
    for (let i = 0; i < 100; i++) small = advanceForceContacts47(small.forces, small.contacts, g, .5, rules);
    expect(small.forces).toEqual(large.forces); expect(small.contacts).toEqual(large.contacts);
    const peace = advanceForceContacts47(large.forces, large.contacts, g, 50, {...rules, enemy: () => false});
    expect(peace.contacts.pairs).toHaveLength(0); expect(byId(peace.forces, 'a').travel.status).toBe('arrived');
  });
  it('preserves zero-offset entered shore state across JSON and later access revocation', () => {
    const g = strip(['land', 'sea']), a = unit(g, 'a', 'a', [0, 1]); a.travel.origin = {x: 10, y: 5};
    const stopped = advanceForceContacts47([a], initialForceContacts47(), g, 1, {...rules, canEnter: () => false});
    expect(stopped.forces[0].travel.crossed).toBe(false); expect(stopped.forces[0].travel.status).toBe('blocked');
    const entered = advanceForceContacts47(stopped.forces, stopped.contacts, g, 1, {...rules, speed: () => 0});
    expect(entered.forces[0].travel.crossed).toBe(true); expect(entered.forces[0].travel.offset).toBe(0);
    const restored = JSON.parse(JSON.stringify(entered));
    const revoked = advanceForceContacts47(restored.forces, restored.contacts, g, 1, {...rules, speed: () => 0, canEnter: () => false});
    expect(place(revoked.forces[0], g).cell.id).toBe(1); expect(revoked.forces[0].travel.crossed).toBe(true);
  });
  it('allows explicit withdrawal without making a sea target invulnerable while it remains in the sea province', () => {
    const g = strip(['sea', 'sea', 'sea']), a = unit(g, 'a', 'a', [0, 1, 2]), b = unit(g, 'b', 'b', [0], 'fleet'); a.withdrawing = true;
    const r = advanceForceContacts47([a, b], initialForceContacts47(), g, 3, {...rules, seaRegion: () => 1});
    expect(place(byId(r.forces, 'a'), g).point.x).toBe(8); expect(r.contacts.pairs).toHaveLength(1); expect(r.held.has(forceKey47(a))).toBe(false);
  });
  it('does not retain exposure after a withdrawing force crosses out of the contested sea province', () => {
    const g=strip(['sea','sea','sea']), fs=[unit(g,'a','a',[0,1]),unit(g,'b','b',[1,2])];fs[1].withdrawing=true;
    const left=advanceForceContacts47(fs,initialForceContacts47(),g,10,rules);
    expect(left.contacts.pairs).toHaveLength(0);expect(left.exposure[forceKey47(fs[0])]??0).toBe(0);
    expect(place(byId(left.forces,'a'),g).point.x).toBe(15);expect(place(byId(left.forces,'b'),g).point.x).toBe(25);
    const sameSea=advanceForceContacts47(fs,initialForceContacts47(),g,10,{...rules,seaRegion:()=>1});
    expect(sameSea.exposure[forceKey47(fs[0])]).toBe(10);expect(sameSea.contacts.pairs).toHaveLength(1);
  });
  it('discards the whole candidate after a later speed failure or event budget exhaustion', () => {
    const g = strip(), fs = [unit(g, 'a', 'same', [0, 1, 2, 3]), unit(g, 'b', 'same', [3, 2, 1, 0])], before = structuredClone(fs);
    let calls = 0;
    expect(() => advanceForceContacts47(fs, initialForceContacts47(), g, 50, {...rules, speed: () => {if (++calls > 3) throw Error('synthetic failure'); return 1;}})).toThrow(/synthetic/);
    expect(fs).toEqual(before);
    expect(() => advanceForceContacts47(fs, initialForceContacts47(), g, 50, rules, 1)).toThrow(/预算/); expect(fs).toEqual(before);
  });
  it('rejects forged contact coordinates, future fields, duplicate typed identities and fleets on land', () => {
    const g = strip(), fs = [unit(g, 'a', 'a', [0, 1]), unit(g, 'b', 'b', [1, 0])], r = advanceForceContacts47(fs, initialForceContacts47(), g, 5, rules);
    const bad = structuredClone(r.contacts); bad.pairs[0].pointA.x++;
    expect(() => assertForceContacts47(bad, r.forces, g, rules.seaRegion)).toThrow(/位置/);
    expect(() => assertForceContacts47({...r.contacts, extra: 1} as ForceContacts47, r.forces, g, rules.seaRegion)).toThrow();
    expect(() => advanceForceContacts47([fs[0], fs[0]], initialForceContacts47(), g, 1, rules)).toThrow(/身份/);
    expect(() => advanceForceContacts47([unit(g, 'f', 'a', [0], 'fleet')], initialForceContacts47(), g, 1, rules)).toThrow(/陆地/);
  });
  it('rejects invented long-range contact even when each saved point matches its real unit', () => {
    const g=strip(), fs=[unit(g,'a','a',[0]),unit(g,'b','b',[3])];
    for(const area of ['gate/0/3','land/p0','sea/0','invented']) {
      const book: ForceContacts47={version:1,pairs:[{a:forceKey47(fs[0]),b:forceKey47(fs[1]),cellA:0,cellB:3,pointA:place(fs[0],g).point,pointB:place(fs[1],g).point,area}]};
      expect(()=>assertForceContacts47(book,fs,g,rules.seaRegion)).toThrow();
    }
  });
});

describe('recovered Navy damage and typed volley', () => {
  it('uses native destiny/Maritime/living leader factors with the threshold and clamp', () => {
    expect(nativeNavalFactor47({destiny: 30, maritime: false, livingLeaderModifier: null})).toBe(1);
    expect(nativeNavalFactor47({destiny: 30, maritime: true, livingLeaderModifier: 1})).toBe(3);
    expect(nativeNavalFactor47({destiny: 3000, maritime: false, livingLeaderModifier: .001})).toBe(10);
    expect(nativeNavalFactor47({destiny: 30, maritime: false, livingLeaderModifier: -9})).toBe(Math.fround(.1));
    expect(() => nativeNavalFactor47({destiny: NaN, maritime: false, livingLeaderModifier: null})).toThrow();
    expect(nativeNavyHit47(1, 2, 'army')).toBe(160); expect(nativeNavyHit47(1, 2, 'fleet')).toBe(20);
  });
  function volleyFixture() {
    const g = strip(['sea']), fs = [unit(g, 'n', 'a', [0], 'fleet'), unit(g, 'army', 'b', [0]), unit(g, 'elite', 'b', [0]), unit(g, 'enemy-n', 'b', [0], 'fleet'), unit(g, 'neutral', 'c', [0])];
    const enemy = (a: string, b: string) => a !== b && a !== 'c' && b !== 'c';
    const state = advanceForceContacts47(fs, initialForceContacts47(), g, 1, {...rules, enemy});
    const inputs = {enemy, onLand: () => false, army: () => ({efficiency: 1, damageToArmy: 40, multiplier: 1}), elite: (f: MovingForce47) => f.id === 'elite', navy: () => ({destiny: 30, maritime: false, livingLeaderModifier: null})};
    return {fs, state, inputs};
  }
  it('gives Navy separate Army and Fleet budgets, no elite discount, no neutral injury', () => {
    const {fs, state, inputs} = volleyFixture(), out = forceVolley47(fs, state.contacts, new Set([forceKey47(fs[0])]), inputs);
    expect(out).toHaveLength(3); expect(out.filter(v => v.victim.includes('army') || v.victim.includes('elite')).map(v => v.nativeDamage)).toEqual([160, 160]);
    expect(out.find(v => v.victim === forceKey47(fs[3]))!.nativeDamage).toBe(40); expect(out.some(v => v.victim.includes('neutral'))).toBe(false);
  });
  it('does not invent Army fire against Navy and rechecks peace before allocating damage', () => {
    const {fs, state, inputs} = volleyFixture();
    expect(forceVolley47(fs, state.contacts, new Set([forceKey47(fs[1])]), inputs)).toHaveLength(0);
    expect(forceVolley47(fs, state.contacts, new Set([forceKey47(fs[0])]), {...inputs, enemy: () => false})).toHaveLength(0);
  });
  it('filters actual land Army out of Navy damage count and ignores duplicate pair entries', () => {
    const {fs, state, inputs} = volleyFixture(), contacts = {...state.contacts, pairs: [...state.contacts.pairs, ...state.contacts.pairs]};
    const out = forceVolley47(fs, contacts, new Set([forceKey47(fs[0])]), {...inputs, onLand: f => f.id === 'elite'});
    expect(out).toHaveLength(2); expect(out.find(v => v.victim === forceKey47(fs[1]))!.nativeDamage).toBe(320);
  });
  it('retains Army elite factors, per-attacker target counts and simultaneous pre-damage snapshots', () => {
    const g = strip(['land']), fs = [unit(g, 'a', 'a', [0]), unit(g, 'b', 'b', [0]), unit(g, 'elite', 'b', [0])], state = advanceForceContacts47(fs, initialForceContacts47(), g, 1, rules), before = structuredClone(fs);
    const out = forceVolley47(fs, state.contacts, new Set(fs.map(forceKey47)), {enemy: rules.enemy, onLand: () => true, army: () => ({efficiency: 1, damageToArmy: 40, multiplier: 1}), elite: f => f.id === 'elite', navy: () => {throw Error('No naval attacker');}});
    expect(out.filter(v => v.attacker === forceKey47(fs[0])).map(v => v.nativeDamage)).toEqual([20, 2]);
    expect(out.filter(v => v.victim === forceKey47(fs[0])).map(v => v.nativeDamage)).toEqual([40, 40]); expect(fs).toEqual(before);
  });
});
