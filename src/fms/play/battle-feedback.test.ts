import {describe,it,expect} from 'vitest';
import {BattleFeedback} from './battle-feedback';
import type {BattleState} from './battle';
const state=(pulse:number,loss:number):BattleState=>({version:1,nextId:2,plans:{},engagements:[{id:'e1',a:'p0',b:null,t:0,armies:['a'],started:0,pulse,carry:{a:0},losses:{a:loss}}]});
describe('battle presentation uses real pulses',()=>{
  it('does not fake a hit on load, repeated draw or a pulse without casualties',()=>{const fx=new BattleFeedback();fx.observe(state(12,30),0);expect(fx.active(1,true,false)).toBe(false);fx.observe(state(12,30),2);fx.observe(state(24,30),3);expect(fx.active(4,true,false)).toBe(false);});
  it('shows bounded feedback only for new casualties and respects pause/reduced motion/end',()=>{const fx=new BattleFeedback();fx.observe(state(0,0),0);fx.observe(state(12,4),100);expect(fx.strength('e1',100,true,false)).toBe(1);expect(fx.active(200,true,false)).toBe(true);expect(fx.active(200,false,false)).toBe(false);expect(fx.active(200,true,true)).toBe(false);expect(fx.active(361,true,false)).toBe(false);fx.observe({version:1,nextId:2,plans:{},engagements:[]},150);expect(fx.active(150,true,false)).toBe(false);});
});
