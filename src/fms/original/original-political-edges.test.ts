import {describe,it,expect} from 'vitest';
import {buildOriginalGrid,decodeOriginalSites} from './original-grid';
import {sites} from './grids/grid-20k';
import {originalPoliticalEdges,originalPoliticalOutlines} from './original-political-edges';

describe('political ink follows the rendered cells',()=>{
 const grid=buildOriginalGrid('20k',decodeOriginalSites(sites));
 const heights=grid.points.map(([,y])=>y<80?0:45);
 const owners=grid.points.map(([x])=>x<600?0:x<1000?1:2);
 it('uses exact shared mesh edges, excluding ocean and same-province interior',()=>{
  const edges=originalPoliticalEdges(grid,heights,owners);
  expect(edges.length).toBeGreaterThan(100);
  for(const edge of edges){
   expect(edge.a).not.toBe(edge.b);
   const source=grid.edges.find(e=>e.segment===edge.segment)!;expect(source).toBeDefined();
   expect(edge.a).toBe(heights[source.a]>=20?owners[source.a]:-1);
   expect(edge.b).toBe(heights[source.b]>=20?owners[source.b]:-1);
   for(const cell of [source.a,source.b]){
    const polygon=Array.from(grid.polygons[cell]);
    for(const [x,y]of [[edge.segment[0],edge.segment[1]],[edge.segment[2],edge.segment[3]]]){
     expect(polygon.some((v,i)=>i%2===0&&v===x&&polygon[i+1]===y)).toBe(true);
    }
   }
  }
 });
 it('updates ownership and view grouping without moving a single boundary point',()=>{
  const edges=originalPoliticalEdges(grid,heights,owners),before=structuredClone(edges);
  const nations=originalPoliticalOutlines(edges,i=>['A','B','C'][i]);
  const alliance=originalPoliticalOutlines(edges,i=>i<2?'AB':'C');
  expect(nations.size).toBe(3);expect(alliance.size).toBe(2);
  expect(alliance.get('AB')!.length).toBeLessThan(nations.get('B')!.length);
  expect(originalPoliticalOutlines(edges,()=> 'unified').size).toBe(0);
  for(const lines of alliance.values())for(const [[ax,ay],[bx,by]]of lines)expect(edges.some(e=>e.a>=0&&e.b>=0&&e.segment[0]===ax&&e.segment[1]===ay&&e.segment[2]===bx&&e.segment[3]===by)).toBe(true);
  expect(edges).toEqual(before);
 });
});
