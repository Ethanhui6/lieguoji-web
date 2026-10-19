import {it,expect} from 'vitest';
import {loadOriginalGrid} from '../../original/original-grid';
import {nativeFilterProvinceCells53} from './province-cells53';
import {nativeProvinceProtruding52} from './province-border52';

it('runs the recovered producer against all 19,928 original sites with explicit synthetic province ownership',async()=>{
 const grid=await loadOriginalGrid('20k');
 // Fixed synthetic stripes, not an original campaign/save or native-equivalence claim.
 const province=grid.points.map(([x])=>x<400?1:x<800?2:x<1200?3:0);
 const height=province.map(p=>p?30:0),feature=province.map(p=>p?1:2);
 const rows=nativeFilterProvinceCells53({province,neighbor:grid.neighbors,height,feature},[true,true,true,true]);
 expect(grid.points.length).toBe(19928);
 expect(rows.reduce((n,r)=>n+(r?.cells.length??0),0)).toBe(province.filter(p=>p>0).length);
 for(let id=1;id<=3;id++){
  const row=rows[id]!;
  // Independent directed-edge oracle, preserves native contact multiplicity.
  const expected=grid.edges.flatMap(({a,b})=>province[a]===id&&province[b]!==id&&province[b]!==0?[b]:province[b]===id&&province[a]!==id&&province[a]!==0?[a]:[]);
  expect([...row.borderNeighborCells].sort((a,b)=>a-b)).toEqual(expected.sort((a,b)=>a-b));
  expect(row.isSeaNeighbor).toBe(false);
 }
 const states=province.map(p=>p===1?1:2);
 expect(nativeProvinceProtruding52(1,rows[1]!.borderNeighborCells,states)).toBe(true);
 states.fill(1);
 expect(nativeProvinceProtruding52(1,rows[1]!.borderNeighborCells,states)).toBe(false);
},30000);
