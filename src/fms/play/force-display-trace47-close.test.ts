import {describe,expect,it} from 'vitest';
import {ForceDisplayTraceCollector47} from './force-display-trace47';

describe('display trace endpoints',()=>{
  it('a force that changed place without moving ends at the accepted frame instead of failing',()=>{
    const t=new ForceDisplayTraceCollector47('w',0,0);
    t.record('army','a',0,{x:1,y:1});t.record('army','a',60,{x:2,y:1});
    t.close(120,{armies:new Map([['a',{x:9,y:9}]]),fleets:new Map()});
    expect(t.finish(1,120)!.armies.a.at(-1)).toEqual({tick:120,x:9,y:9});
  });
  it('a same-tick endpoint is replaced, a matching one kept',()=>{
    const t=new ForceDisplayTraceCollector47('w',0,0);
    t.record('army','a',0,{x:1,y:1});t.record('army','a',120,{x:2,y:1});t.record('army','b',120,{x:5,y:5});
    t.close(120,{armies:new Map([['a',{x:3,y:3}],['b',{x:5,y:5}]]),fleets:new Map()});
    const v=t.finish(1,120)!;expect(v.armies.a.at(-1)).toEqual({tick:120,x:3,y:3});expect(v.armies.b).toEqual([{tick:120,x:5,y:5}]);
  });
});
