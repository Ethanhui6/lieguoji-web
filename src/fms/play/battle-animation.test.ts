import {describe,it,expect} from 'vitest';
import {BattleAnimationClock} from './battle-animation';
describe('authored battle clip presentation',()=>{
  it('uses the actual 12 Hz loop and does not reset an existing battle on redraw',()=>{
    const c=new BattleAnimationClock();c.sync(['land/a','sea/b']);c.step(0,true,false);
    expect(c.step(80,true,false)).toBe(false);expect(c.step(84,true,false)).toBe(true);expect(c.frame('land/a')).toBe(1);
    c.sync(['land/a','sea/b']);expect(c.frame('land/a')).toBe(1);
    for(let n=184;n<=3284;n+=100)c.step(n,true,false);expect(c.frame('sea/b')).toBe(39);
    c.step(3384,true,false);expect(c.frame('land/a')).toBe(0);
  });
  it('freezes pause, avoids a resume catch-up and respects reduced motion',()=>{
    const c=new BattleAnimationClock();c.sync(['land/a']);c.step(0,true,false);c.step(100,true,false);expect(c.frame('land/a')).toBe(1);
    c.step(5000,false,false);c.step(9000,false,false);expect(c.frame('land/a')).toBe(1);
    c.step(9010,true,false);expect(c.frame('land/a')).toBe(1);
    c.step(9020,true,true);expect(c.frame('land/a')).toBe(0);c.step(15000,true,true);expect(c.frame('land/a')).toBe(0);
    c.step(15010,true,false);expect(c.frame('land/a')).toBe(1);
  });
  it('removes resolved contacts and starts new real contacts at the first frame',()=>{
    const c=new BattleAnimationClock();c.sync(['a']);c.step(0,true,false);c.step(100,true,false);c.sync([]);expect(c.step(150,true,false)).toBe(false);
    c.sync(['b']);expect(c.frame('b')).toBe(0);expect(c.frame('a')).toBe(0);c.step(10000,true,false);expect(c.frame('b')).toBe(1);
  });
});
