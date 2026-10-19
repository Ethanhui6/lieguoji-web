import type {FmsDocument} from '../model';
import type {Point} from '../../sim/types';
import {originalCellProvinces} from '../original/original-politics';

type Terrain=Pick<FmsDocument,'points'|'triangles'|'elevations'|'neighbors'|'width'|'height'>;
type ProvinceShape={polygon:readonly Point[]};
/** 网页适配：CellData.Province 没有随当前世界保存。多边形三角投票只给格子
 * 归属，边境数量仍按格子邻接计数，不用裁剪后的行军三角面。 */
const PROVINCE_ADAPTATION='web-triangle-vote' as const;
/** 网页适配：原作 Feature 编号不在当前存档里。未提供时按同水面（海拔>=20 与
 * <20）的格子邻接做洪水填充，编号从 1 起。这不是 Unity Feature 编号，也不是
 * 行军三角面的连通分量。 */
const FEATURE_ADAPTATION='web-surface-flood' as const;

export interface CellDataProjection55{
 province:Int32Array;
 neighbor:readonly (readonly number[])[];
 height:ArrayLike<number>;
 feature:Int32Array;
 owners:Int32Array;
 adaptation:{province:typeof PROVINCE_ADAPTATION;feature:'provided'|typeof FEATURE_ADAPTATION};
}

/** Same-surface flood on the cell neighbor graph. Land is elevation >= 20. */
export function cellSurfaceFeature55(neighbor:readonly (readonly number[])[],height:ArrayLike<number>):Int32Array{
 if(neighbor.length!==height.length)throw Error('原生地表特征长度不一致。');
 const feature=new Int32Array(height.length);let id=1;
 for(let start=0;start<height.length;start++){
  if(feature[start])continue;
  const wet=height[start]<20;const queue=[start];feature[start]=id;
  for(let q=0;q<queue.length;q++)for(const next of neighbor[queue[q]]){
   if(!Number.isInteger(next)||next<0||next>=height.length)throw Error('原生邻接格索引无效。');
   if(feature[next]||(height[next]<20)!==wet)continue;
   feature[next]=id;queue.push(next);
  }
  id++;if(id>0x7fffffff)throw Error('原生地表特征编号溢出。');
 }
 return feature;
}

/** Four CellData fields FilterProvinceCells reads. A provided Feature array is
 * copied; the caller's array is left unchanged. */
export function projectCellData55(terrain:Terrain,provinces:readonly ProvinceShape[],scale:number,feature?:ArrayLike<number>):CellDataProjection55{
 const owners=originalCellProvinces(terrain,provinces,scale),province=new Int32Array(owners.length);
 for(let i=0;i<owners.length;i++)province[i]=owners[i]+1;
 let copied:Int32Array,kind:CellDataProjection55['adaptation']['feature'];
 if(feature){
  if(feature.length!==owners.length)throw Error('原生地表特征长度不一致。');
  copied=Int32Array.from(feature);kind='provided';
 }else{copied=cellSurfaceFeature55(terrain.neighbors,terrain.elevations);kind=FEATURE_ADAPTATION;}
 return {province,neighbor:terrain.neighbors,height:terrain.elevations,feature:copied,owners,adaptation:{province:PROVINCE_ADAPTATION,feature:kind}};
}
