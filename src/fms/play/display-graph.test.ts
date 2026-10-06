import {afterEach,describe,expect,it,vi} from 'vitest';
import {displayGraphFor} from './display-graph';
import * as naval from './naval-rules';
import {createFmsRun} from './world';
import {withNavy,withRealtime} from './runtime';
import {grid} from './fixture.test-support';

const make=()=>withNavy(createFmsRun(grid((x,y)=>x>=30&&x<=210&&y>=30&&y<=200?45:0),4,'peace'));
afterEach(()=>vi.restoreAllMocks());
describe('immutable main-thread sea geometry',()=>{
  it('reuses real geometry across tick snapshots and ownership/name changes',()=>{
    const run=make(),spy=vi.spyOn(naval,'graphFor'),first=displayGraphFor(run);
    const world=structuredClone(run.world);world.day++;world.provinces[0].controller=world.nations[1].id;world.provinces[0].name='改名';
    expect(displayGraphFor({...run,world})).toBe(first);expect(displayGraphFor(run)).toBe(first);
    expect(first.ports.length).toBeGreaterThan(0);expect(spy).toHaveBeenCalledTimes(1);
  });
  it('revalidates structured-cloned load geometry even for the same run ID',()=>{
    const run=make(),first=displayGraphFor(run),loaded=structuredClone(run);loaded.terrain.elevations.fill(45);
    const next=displayGraphFor(loaded);expect(next).not.toBe(first);expect(next.nodes.size).toBe(0);
  });
  it('does not share across run IDs or the frozen naval/realtime algorithm boundary',()=>{
    const run=make(),spy=vi.spyOn(naval,'graphFor');displayGraphFor(run);displayGraphFor({...run,id:run.id+'-copy'});
    const realtime=withRealtime(run);displayGraphFor({...realtime,id:run.id,terrain:run.terrain});
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
