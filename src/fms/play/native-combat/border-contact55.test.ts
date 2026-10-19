import {describe,it,expect} from 'vitest';
import {nativeCountBorderContactCells} from './border-contact55';
describe('native CountBorderContactCells',()=>{
 it('counts duplicate border cells for the attacker and skips out of range',()=>{
  expect(nativeCountBorderContactCells([2,2,3],[1,1,2,1,0],2)).toBe(2);
  expect([...new Set([2,2,3])].filter(c=>[1,1,2,1,0][c]===2)).toHaveLength(1);
  expect(nativeCountBorderContactCells([0,9,-1,1.5],[5],5)).toBe(1);
 });
 it('does not treat a missing cell as a contact',()=>{
  expect(nativeCountBorderContactCells([4],[1,1,2,1,0],0)).toBe(1);
  expect(nativeCountBorderContactCells([],[],1)).toBe(0);
 });
});
