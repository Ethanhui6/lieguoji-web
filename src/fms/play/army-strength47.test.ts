import {describe,it,expect} from 'vitest';
import {armyStrength47} from './army-strength47';
describe('registered army strength',()=>{
 it('keeps losses and recovery against the same full formation through JSON restoration',()=>{
  const armies=[{id:'regular',troops:800}],forces={regular:{homeId:'p',kind:'regular' as const,fullStrength:1000}};
  expect(armyStrength47(armies,forces)).toEqual({current:800,maximum:1000,fraction:.8});
  armies[0].troops=200;const restored=JSON.parse(JSON.stringify({armies,forces}));expect(armyStrength47(restored.armies,restored.forces).fraction).toBe(.2);
  armies[0].troops=600;expect(armyStrength47(armies,forces).fraction).toBe(.6);armies[0].troops=0;expect(armyStrength47(armies,forces).fraction).toBe(0);
 });
 it('weights aggregated formations by their own maximum and bounds display overshoot',()=>{
  const forces={a:{homeId:'p',kind:'emergency' as const,fullStrength:100},b:{homeId:'p',kind:'manual' as const,fullStrength:900}};
  expect(armyStrength47([{id:'a',troops:50},{id:'b',troops:450}],forces)).toEqual({current:500,maximum:1000,fraction:.5});
  expect(armyStrength47([{id:'a',troops:200}],forces).fraction).toBe(1);
 });
});
