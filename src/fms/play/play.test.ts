import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { FmsDocument } from '../model';
import { createFmsRun, polygonArea, provinceAt } from './world';
import { advanceWorld, previewOrder, validateWorld } from '../../sim/core';
import { PlaySession } from './session';
import { loadRun, RUN_DATABASE, saveRun } from './storage';

function grid(height: (x: number, y: number) => number = () => 45): FmsDocument {
  const points: [number, number][] = [], triangles: number[] = [], n = 25;
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) points.push([x * 10, y * 10]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const a = y * (n + 1) + x, b = a + 1, c = a + n + 1, d = c + 1; triangles.push(a,b,c,b,d,c); }
  const neighbors = points.map(() => new Set<number>());
  for (let i = 0; i < triangles.length; i += 3) { const [a,b,c] = triangles.slice(i,i+3); neighbors[a].add(b).add(c); neighbors[b].add(a).add(c); neighbors[c].add(a).add(b); }
  return { format: 'lieguoji-fms-world', version: 1, worldId: '00000000-0000-4000-8000-000000000001', revision: 0, width: 250, height: 250, points, triangles: new Uint32Array(triangles), neighbors: neighbors.map(n => [...n]), elevations: Int32Array.from(points, ([x,y]) => height(x,y)) };
}
async function editSlot(factory: IDBFactory, key: string, change: (raw: Record<string, unknown>) => void) {
  await new Promise<void>((resolve,reject) => { const req = factory.open(RUN_DATABASE, 1); req.onsuccess = () => { const db = req.result, tx = db.transaction('saves','readwrite'), store = tx.objectStore('saves'), read = store.get(key); read.onsuccess = () => { const raw = read.result; change(raw); store.put(raw,key); }; tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
}

describe('FMS playable world uses actual land and existing simulation rules', () => {
  it('partitions every land face without area inflation and keeps source immutable', () => {
    const source = grid(), before = structuredClone(source), run = createFmsRun(source, 4);
    expect(validateWorld(run.world)).toBe(true); expect(source).toEqual(before); expect(run.terrain).not.toBe(source);
    expect(run.world.provinces.reduce((s,p) => s + polygonArea(p.polygon), 0)).toBeCloseTo(1_000_000, 5);
    expect(run.world.nations).toHaveLength(4);
    for (const p of run.world.provinces) { expect(p.polygon.length).toBeLessThanOrEqual(200); expect(provinceAt(run.world,p.center)).toBe(p.id); for (const id of p.neighbors) expect(run.world.provinces.find(q => q.id === id)!.neighbors).toContain(p.id); }
  });
  it('h20 interpolation determines coastline, including the exact clipped area', () => {
    const doc = grid(x => x <= 120 ? 45 : 0), run = createFmsRun(doc, 2);
    const coastline = 120 + 10 * 25 / 45;
    expect(run.world.provinces.reduce((s,p) => s + polygonArea(p.polygon),0)).toBeCloseTo(coastline * 250 * 16, 5);
    expect(provinceAt(run.world,{x:800,y:500})).toBeNull();
  });
  it('preserves an inner sea and disconnected islands without sea routes', () => {
    const run = createFmsRun(grid((x,y) => (x >= 100 && x <= 140) || (x >= 30 && x <= 60 && y >= 80 && y <= 130) ? 0 : 45),4,'war');
    expect(provinceAt(run.world,{x:480,y:400})).toBeNull(); expect(provinceAt(run.world,{x:180,y:420})).toBeNull();
    for (const p of run.world.provinces) for (const id of p.neighbors) { const other = run.world.provinces.find(q => q.id === id)!; expect((p.center.x < 400) === (other.center.x < 400)).toBe(true); }
    const army = run.world.armies[0], source = run.world.provinces.find(p => p.id === army.provinceId)!, target = run.world.provinces.find(p => (p.center.x < 400) !== (source.center.x < 400))!;
    expect(previewOrder(run.world,{armyId:army.id,targetId:target.id,kind:'march'}).valid).toBe(false);
  });
  it('war produces real marching, combat, control changes and reasons', () => {
    const run = createFmsRun(grid(),4,'war'), initial = structuredClone(run.world);
    const advanced = advanceWorld(run.world,90);
    expect(validateWorld(advanced)).toBe(true); expect(run.world).toEqual(initial);
    expect(advanced.provinces.some((p,i) => p.controller !== initial.provinces[i].controller)).toBe(true);
    expect(advanced.events.some(e => ['battle','occupation'].includes(e.kind) && !!e.reason)).toBe(true);
    expect(advanced.statecraft?.provinces.some((p,i) => p.grain !== initial.statecraft!.provinces[i].grain)).toBe(true);
  });
  it('rejects stale confirmed commands and leaves the previous Worker state intact', () => {
    const session = new PlaySession(), initial = session.execute({type:'create',terrain:grid(),count:4,relations:'peace'}).world;
    session.execute({type:'step',days:1});
    expect(() => session.execute({type:'action',action:{type:'declare-war',nationId:'n-0',targetNationId:'n-1'},expected:{day:0,nextEventId:initial.nextEventId}})).toThrow('重新预览');
    const next = session.execute({type:'step',days:1}); expect(next.world.day).toBe(2);
  });
  it('rejects blank ocean rather than substituting a canned map', () => { expect(() => createFmsRun(grid(() => 0))).toThrow('陆地'); });
  it('stops a 7-day speed batch on its first battle day, without changing the daily rules', () => {
    const run=createFmsRun(grid(),4,'war'), session=new PlaySession();
    let before=run.world, expected=before;
    // Find a genuine generated-world battle, not a fake event or mocked core.
    for(let i=0;i<100;i++){expected=advanceWorld(before,1);if(expected.events.some(e=>e.id>=before.nextEventId&&e.kind==='battle'))break;before=expected;}
    expect(expected.events.some(e=>e.id>=before.nextEventId&&e.kind==='battle')).toBe(true);
    session.execute({type:'load',run:{...run,world:before}});
    const stopped=session.execute({type:'step',days:7,pauseOnBattle:true});
    expect(stopped.world).toEqual(expected);expect(stopped.halted?.kind).toBe('battle');
    session.execute({type:'load',run:{...run,world:before}});
    expect(session.execute({type:'step',days:7}).world).toEqual(advanceWorld(before,7));
  });
  it('ignores retained old battles and rejects invalid pause flags before advancing', () => {
    const run=createFmsRun(grid(),4,'peace'),session=new PlaySession();
    run.world.events.push({id:run.world.nextEventId++,day:0,kind:'battle',text:'旧战报',reason:'仅用于验证旧记录不会暂停'});
    session.execute({type:'load',run});
    expect(()=>session.execute({type:'step',days:7,pauseOnBattle:'yes' as unknown as boolean})).toThrow('选项无效');
    const result=session.execute({type:'step',days:7,pauseOnBattle:true});
    expect(result.world).toEqual(advanceWorld(run.world,7));expect(result.halted).toBeUndefined();
  });
});
describe('isolated whole-world saves', () => {
  it('roundtrips terrain plus simulation; detects multi-tab CAS conflict', async () => {
    const factory = new IDBFactory(), run = createFmsRun(grid(),4,'war');
    expect(await loadRun(factory)).toBeNull(); expect(await saveRun(run,null,factory)).toBe(1);
    expect((await loadRun(factory))?.run).toEqual(run);
    const a = {...run,world:advanceWorld(run.world,2)}, b = {...run,world:advanceWorld(run.world,3)};
    const results = await Promise.allSettled([saveRun(a,1,factory),saveRun(b,1,factory)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await loadRun(factory))?.revision).toBe(2);
    await expect(saveRun(run,null,factory)).rejects.toThrow('另一窗口');
  });
  it('recovers backup and preserves that chosen valid previous across repeated saves', async () => {
    const factory = new IDBFactory(), run = createFmsRun(grid(),4);
    await saveRun(run,null,factory); await saveRun({...run,world:advanceWorld(run.world,1)},1,factory);
    await editSlot(factory,'current',raw => { raw.checksum = 'damaged'; });
    const recovered = (await loadRun(factory))!; expect(recovered.recovered).toBe(true); expect(recovered.revision).toBe(2); expect(recovered.run.world.day).toBe(0);
    await saveRun(recovered.run,2,factory); await saveRun({...run,world:advanceWorld(run.world,3)},3,factory);
    expect((await loadRun(factory))!.run.world.day).toBe(3);
    await editSlot(factory,'current',raw => { raw.checksum = 'damaged'; });
    expect((await loadRun(factory))!.run.world.day).toBe(0);
  });
  for (const slot of ['current','backup']) for (const field of ['version','terrain','schema','rules','management','engine']) it(`locks ${slot} ${field} future data before backup fallback or write`, async () => {
    const factory = new IDBFactory(), run = createFmsRun(grid(),4);
    await saveRun(run,null,factory); await saveRun(run,1,factory);
    await editSlot(factory,slot,raw => {
      const r = raw.run as { version:number; engine:string; terrain:{version:number}; world:{schemaVersion:number;rulesVersion:string;statecraft:{version:number}} };
      if (field === 'version') raw.version = 2; if (field === 'terrain') r.terrain.version = 3; if (field === 'schema') r.world.schemaVersion = 3;
      if (field === 'rules') r.world.rulesVersion = 'future'; if (field === 'management') r.world.statecraft.version = 2; if (field === 'engine') r.engine = 'future';
    });
    await expect(loadRun(factory)).rejects.toThrow('锁定'); await expect(saveRun(run,2,factory)).rejects.toThrow('锁定');
  });
});
