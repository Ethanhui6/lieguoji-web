import {describe,expect,it} from 'vitest';
import {FALL_MS,FallMotion} from './order-motion';

const pose=(id:string)=>({id,x:10,y:20,texture:'Infantry',tint:0xff0000,size:8});
describe('army fall animation (web addition)',()=>{
  it('an army that leaves the map topples and fades for 900 ms, then is gone',()=>{
    const m=new FallMotion();m.sync([pose('a'),pose('b')],0);
    expect(m.frames(0)).toEqual([]);
    m.sync([pose('b')],100);
    const [start]=m.frames(100);expect(start.id).toBe('a');expect(start.alpha).toBe(1);expect(start.rotation).toBe(0);
    const [mid]=m.frames(100+FALL_MS*.7);expect(mid.rotation).toBeGreaterThan(1);expect(mid.alpha).toBeLessThan(1);expect(mid.alpha).toBeGreaterThan(0);
    expect(m.step(100+FALL_MS*.7,false)).toBe(true);
    m.step(100+FALL_MS,false);expect(m.frames(100+FALL_MS)).toEqual([]);
  });
  it('reduced motion drops the ghost at once; living armies never fall',()=>{
    const m=new FallMotion();m.sync([pose('a')],0);m.sync([pose('a')],50);expect(m.frames(50)).toEqual([]);
    m.sync([],60);m.step(61,true);expect(m.frames(61)).toEqual([]);
  });
});
