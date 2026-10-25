import {describe,expect,it} from 'vitest';
import {sheetDetent47} from './sheet-gesture47';
describe('phone sheet detents',()=>{
  it('a short upward swipe expands; a pull down at the top collapses; scrolling content does neither',()=>{
    expect(sheetDetent47(false,-20,0)).toBe(true);
    expect(sheetDetent47(false,-5,0)).toBeNull();
    expect(sheetDetent47(true,60,0)).toBe(false);
    expect(sheetDetent47(true,60,120)).toBeNull();
    expect(sheetDetent47(true,-80,0)).toBeNull();
  });
});
