/** Recovered CountBorderContactCells RVA 0x689CC0. Walks borderNeighborCells,
 * skips out-of-range indices, and counts CellData.State matches. Duplicates
 * stay. This is not a neighbor-province tally or a clipped march-face length. */
export function nativeCountBorderContactCells(borderNeighborCells:readonly number[],cellStates:ArrayLike<number>,attacker:number):number{
 let count=0;
 for(const cell of borderNeighborCells){
  if(!Number.isInteger(cell)||cell<0||cell>=cellStates.length)continue;
  if(cellStates[cell]===attacker)count++;
 }
 return count;
}
