import {describe,it,expect} from 'vitest';
import {OrderMotion,SinkMotion} from './order-motion';

const lost=(id:string,x=1,y=2)=>({id,point:{x,y},color:'#aaa',radius:6});

describe('original order and sink presentation timing',()=>{
  it('opens saved routes fully; new orders grow linearly from ten percent',()=>{
    const c=new OrderMotion();c.sync([{id:'saved',route:['a','b']}]);expect(c.growth('saved')).toBe(1);
    c.sync([{id:'saved',route:['a','b']},{id:'new',route:['c','d']}]);expect(c.growth('new')).toBe(.1);
    c.step(0,true,false);for(let t=100;t<=800;t+=100)c.step(t,true,false);expect(c.growth('new')).toBeCloseTo(.9);
    c.step(900,true,false);expect(c.growth('new')).toBeCloseTo(1);
  });
  it('preserves suffix consumption and zoom redraw, but resets changed commands',()=>{
    const c=new OrderMotion();c.sync([]);c.sync([{id:'a',route:['a','b','c']}]);c.step(0,true,false);c.step(100,true,false);
    c.sync([{id:'a',route:['b','c']}]);expect(c.growth('a')).toBeCloseTo(.2);c.sync([{id:'a',route:['b','c']}]);expect(c.growth('a')).toBeCloseTo(.2);
    c.sync([{id:'a',route:['d','c']}]);expect(c.growth('a')).toBe(.1);c.sync([]);expect(c.growth('a')).toBe(1);
  });
  it('freezes with game pause, avoids hidden-tab catch-up, and completes in reduced motion',()=>{
    const c=new OrderMotion();c.sync([]);c.sync([{id:'a',route:['b']}]);c.step(0,true,false);c.step(100,true,false);c.step(10000,false,false);expect(c.growth('a')).toBeCloseTo(.2);
    c.step(10010,true,false);expect(c.growth('a')).toBeCloseTo(.21);c.step(20000,true,false);expect(c.growth('a')).toBeCloseTo(.31);
    c.step(20010,false,true);expect(c.growth('a')).toBe(1);
  });
  it('does not replay ships already lost at load or removed for another reason',()=>{
    const c=new SinkMotion();c.sync([],[lost('old')]);expect(c.frames()).toEqual([]);c.sync([{id:'a',point:{x:1,y:2},color:'#aaa',radius:6}],[]);c.sync([],[]);expect(c.frames()).toEqual([]);
  });
  it('sinks exactly once over .8 seconds independent of game pause',()=>{
    const c=new SinkMotion();c.sync([{id:'a',point:{x:1,y:2},color:'#aaa',radius:6}],[]);c.step(0,false);c.sync([],[lost('a')],0);expect(c.frames()[0].alpha).toBe(.95);
    c.step(400,false);const f=c.frames()[0];expect(f.scale).toBeCloseTo(.64);expect(f.rotation).toBeCloseTo(7*Math.PI/180);expect(f.alpha).toBeCloseTo(.475);expect(f.point).toEqual({x:1,y:2});
    c.sync([],[lost('a')],0);c.step(800,false);expect(c.frames()).toEqual([]);c.sync([],[lost('a')],0);expect(c.frames()).toEqual([]);
  });
  it('does not charge a newly sunk ship for the preceding long frame',()=>{const c=new SinkMotion();c.sync([lost('a')],[],0);c.step(1000,false);c.sync([],[lost('a')],1900);c.step(1950,false);expect(c.frames()).toHaveLength(1);expect(c.frames()[0].alpha).toBeGreaterThan(.9);c.step(2699,false);expect(c.frames()).toHaveLength(1);c.step(2700,false);expect(c.frames()).toEqual([]);});
  it('uses the authoritative lost position after a batched day advance',()=>{const c=new SinkMotion();c.sync([lost('a',1,2)],[]);c.sync([],[lost('a',80,90)]);expect(c.frames()[0].point).toEqual({x:80,y:90});});
  it('finishes immediately with reduced motion',()=>{
    const c=new SinkMotion();c.sync([{id:'a',point:{x:1,y:2},color:0xffffff,radius:6}],[]);c.sync([],[lost('a')],0);expect(c.step(0,true)).toBe(true);expect(c.frames()).toEqual([]);
  });
});
