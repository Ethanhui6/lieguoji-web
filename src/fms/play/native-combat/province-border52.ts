/** Recovered Province.IsProtruding RVA 0x458930. Input is specifically
 * borderNeighborCells, NOT visual border cells or neighboring provinces.
 * No diplomacy/ocean filtering or deduplication occurs in the native loop.
 * Kept isolated until the producer of that native list is established. */
export function nativeProvinceProtruding52(state:number,borderNeighborCells:readonly number[],cellStates:ArrayLike<number>):boolean{
 let foreign=Math.fround(0);
 for(const cell of borderNeighborCells){
  if(!Number.isInteger(cell)||cell<0||cell>=cellStates.length)throw Error('突出部边界格索引无效。');
  if(cellStates[cell]!==state)foreign=Math.fround(foreign+1);
 }
 return Math.fround(foreign/Math.fround(borderNeighborCells.length))>.5;
}

/** Province.RecalculateNeighborProvince RVA 0x45AC20. Only this function's
 * observed effects: collect distinct foreign province IDs and clear the
 * protrusion input. Do not invent a fill operation absent from its body. */
export function nativeProvinceNeighbors52(province:number,cells:readonly number[],neighborsOf:(cell:number)=>readonly number[],cellProvinces:ArrayLike<number>):{neighbors:number[];borderNeighborCells:number[]}{
 const neighbors=new Set<number>();
 for(const cell of cells)for(const next of neighborsOf(cell)){
  if(!Number.isInteger(next)||next<0||next>=cellProvinces.length)throw Error('邻省地图格索引无效。');
  const other=cellProvinces[next];if(other!==province)neighbors.add(other);
 }
 return {neighbors:[...neighbors],borderNeighborCells:[]};
}
