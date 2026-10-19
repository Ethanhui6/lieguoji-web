/** Recovered BurgsAndStateGenerator.FilterProvinceCells (0x489FE0) and
 * its per-province callback (0x727900). Arrays are original CellData fields,
 * not WEB triangular travel faces. Returned arrays are fresh derived data. */
export interface NativeProvinceCells53 {
 cells:number[];
 neighbors:number[];
 borderNeighborCells:number[];
 isSeaNeighbor:boolean;
 isAllCellsConnected:boolean;
}
export interface NativeCellInput53 {
 province:readonly number[];
 neighbor:readonly (readonly number[])[];
 height:readonly number[];
 feature:readonly number[];
}
export function nativeFilterProvinceCells53(input:NativeCellInput53,slots:readonly boolean[]):(NativeProvinceCells53|null)[]{
 const size=input.province.length;
 if(input.neighbor.length!==size||input.height.length!==size||input.feature.length!==size)throw Error('原生省份格字段长度不一致。');
 const result=slots.map(p=>p?{cells:[],neighbors:[],borderNeighborCells:[],isSeaNeighbor:false,isAllCellsConnected:false} as NativeProvinceCells53:null);
 for(let cell=0;cell<size;cell++){
  const id=input.province[cell];if(!Number.isInteger(id))throw Error('原生省份编号无效。');
  if(id>0&&id<result.length)result[id]?.cells.push(cell);
 }
 for(let id=0;id<result.length;id++){
  const row=result[id];if(!row||!row.cells.length)continue;
  const neighbors=new Set<number>(),feature=input.feature[row.cells[0]];
  row.isAllCellsConnected=true;
  for(const cell of row.cells){
   if(input.feature[cell]!==feature)row.isAllCellsConnected=false;
   for(const next of input.neighbor[cell]){
    if(!Number.isInteger(next)||next<0||next>=size)throw Error('原生邻接格索引无效。');
    const other=input.province[next];if(other===id||other===0)continue;
    row.borderNeighborCells.push(next);
    if(input.height[next]<20)row.isSeaNeighbor=true;
    neighbors.add(other);
   }
  }
  row.neighbors=[...neighbors];
 }
 return result;
}
