import type {OriginalGrid} from './original-grid';
import type {FmsCoastSegment} from '../ocean-coast';

export interface OriginalPoliticalEdge {a:number;b:number;segment:FmsCoastSegment}
/** Use the same cell ownership and Voronoi edges as fill and picking.
 * Province simulation polygons are not the rendered political surface. */
export function originalPoliticalEdges(grid:OriginalGrid,heights:ArrayLike<number>,owners:ArrayLike<number>):OriginalPoliticalEdge[]{
 return grid.edges.flatMap(({a,b,segment})=>{
  const pa=heights[a]>=20?owners[a]:-1,pb=heights[b]>=20?owners[b]:-1;
  return pa===pb||pa<0&&pb<0?[]:[{a:pa,b:pb,segment}];
 });
}
/** No spline: smoothing only the outline would move it off the flat cell fill. */
export function originalPoliticalOutlines(edges:readonly OriginalPoliticalEdge[],group:(province:number)=>string|null):Map<string,[number,number][][]>{
 const lines=new Map<string,[number,number][][]>();
 for(const {a,b,segment:[ax,ay,bx,by]} of edges){
  if(a<0||b<0)continue; // Coastline has its own ink layer.
  const ga=group(a),gb=group(b);if(ga===gb)continue;
  for(const key of [ga,gb])if(key!==null){
   const list=lines.get(key)??[];list.push([[ax,ay],[bx,by]]);lines.set(key,list);
  }
 }
 return lines;
}
