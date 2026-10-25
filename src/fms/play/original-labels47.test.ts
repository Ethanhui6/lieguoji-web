import {describe,expect,it} from 'vitest';
import {autoFontSize47,cityLabel47,labelFontRange47,labelScale47,MAP_UNIT47,stateLabelBoxes47} from './original-labels47';

/** A 10 × 4 grid with one map unit… one Unity unit (6.67 map units) between columns. */
const grid={cellsX:10,points:Array.from({length:40},(_,i)=>[(i%10)*MAP_UNIT47,Math.floor(i/10)*MAP_UNIT47] as const)};

describe('original map names',()=>{
  it('label scale and Chinese font range follow LabelUtility',()=>{
    expect([100,500,1450,2400,9000].map(labelScale47)).toEqual([0,0,.5,1,1]);
    expect(labelFontRange47(0)).toEqual({max:25,min:15});expect(labelFontRange47(1)).toEqual({max:40,min:15});
  });
  it('a state name sits on the grid row through the cell nearest its centroid, 0.6 × the run wide',()=>{
    // State A: columns 1–8 of rows 1–2; the centroid row walk spans 7 columns = 7 units.
    const owner=(c:number)=>{const x=c%10,y=Math.floor(c/10);return x>=1&&x<=8&&y>=1&&y<=2?'A':null;};
    const [box]=stateLabelBoxes47(grid,owner);
    expect(box.key).toBe('A');expect(box.cells).toBe(16);
    expect(box.width).toBeCloseTo(7*.6);expect(box.height).toBeCloseTo(Math.max(7*.6/3,1.5));
    expect(box.x).toBeCloseTo(4.5*MAP_UNIT47);expect([MAP_UNIT47,2*MAP_UNIT47]).toContain(box.y);
  });
  it('hidden states get no box; the walk stops at the map edge',()=>{
    expect(stateLabelBoxes47(grid,()=> 'B',()=>true)).toEqual([]);
    const [box]=stateLabelBoxes47(grid,()=> 'B');expect(box.width).toBeCloseTo(9*.6);
  });
  it('TextMeshPro auto-size keeps the size inside [min, max]',()=>{
    const box={width:6,height:2,fontMax:30,fontMin:15};
    expect(autoFontSize47(box,{width:4,height:1.2})).toBeCloseTo(15);  // 6×10/4 = 15
    expect(autoFontSize47({...box,width:60,height:20},{width:4,height:1.2})).toBe(30);
    expect(autoFontSize47({...box,width:1,height:1},{width:4,height:1.2})).toBe(15);
  });
  it('city names: 0.832 units (×1.5 for capitals) high, 0.7 units above the city, below at the top border',()=>{
    const town=cityLabel47({x:100,y:100},false),capital=cityLabel47({x:100,y:100},true);
    expect(town.em).toBeCloseTo(.832*MAP_UNIT47);expect(town.y).toBeCloseTo(100-.7*MAP_UNIT47);
    expect(capital.em).toBeCloseTo(.832*1.5*MAP_UNIT47);expect(capital.y).toBeCloseTo(100-1.05*MAP_UNIT47);
    expect(cityLabel47({x:100,y:2},false).y).toBeGreaterThan(2);
  });
});
