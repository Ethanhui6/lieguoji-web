import {it,expect} from 'vitest';
import {nativeIdlePortWeights,nativeChooseIdlePort,nativeIdleDelay} from './naval-deployment';
it('uses max resident/assigned (not sum), normal cap2/war cap3, and crowded-only fallback',()=>{
 const p=[{id:'a',present:2,assigned:1},{id:'b',present:1,assigned:1}];expect(nativeIdlePortWeights(p,false,null,null,null).map(p=>p.id)).toEqual(['b']);expect(nativeIdlePortWeights(p,true,null,null,null).map(p=>p.id)).toEqual(['a','b']);
 const q=nativeIdlePortWeights([{id:'a',present:100,assigned:0},{id:'b',present:1,assigned:4}],false,null,null,null);expect(q.map(p=>p.count)).toEqual([100,4]);expect(q[0].weight).toBe(Math.fround(.05));expect(q.every(p=>p.crowded)).toBe(true);
});
it('recovers preference, current-port and home multipliers with float32 arithmetic',()=>{for(const war of [false,true]){const [p]=nativeIdlePortWeights([{id:'a',present:0,assigned:0}],war,'a','a','a');expect(p.weight).toBe(Math.fround(Math.fround(Math.fround(1.35)*Math.fround(1.2))*Math.fround(war?.95:1.15)));}});
it('weighted selection honors cumulative equality and native empty/zero fallbacks',()=>{const p=[{weight:1},{weight:3}];expect(nativeChooseIdlePort(p,()=>.25)).toBe(p[0]);expect(nativeChooseIdlePort(p,()=>.26)).toBe(p[1]);expect(nativeChooseIdlePort([],()=>0)).toBeNull();expect(nativeChooseIdlePort([{weight:0},{weight:0}],()=>.9)).toEqual({weight:0});});
it('preserves original idle cooldown ranges without claiming the web clock equals unscaled time',()=>{expect(nativeIdleDelay(false,()=>0)).toBe(18);expect(nativeIdleDelay(false,()=>1)).toBe(32);expect(nativeIdleDelay(true,()=>0)).toBe(12);expect(nativeIdleDelay(true,()=>1)).toBe(20);});
