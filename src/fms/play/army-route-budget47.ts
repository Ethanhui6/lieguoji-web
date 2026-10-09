import type {ArmyPreview47} from './army-commands47';
import type {TravelGraph47,TravelCell47} from './army-travel47-graph';

/** New previews alternate exact origin, gates and centers. Integrate speed
 * on each entered cell; a sea/mountain route cannot use only its start speed. */
export function armyPreviewTicks47(preview:Pick<ArmyPreview47,'valid'|'points'|'cells'>,graph:TravelGraph47,speed:(cell:Readonly<TravelCell47>)=>number):number{
 if(!preview.valid)return Infinity;
 if(!preview.cells.length||preview.points.length!==preview.cells.length*2-1)throw Error('行军预览分段无效。');
 let ticks=0;
 for(let i=1;i<preview.points.length;i++){
  const cell=graph.cells.get(preview.cells[Math.floor(i/2)]);if(!cell)throw Error('行军预览地块缺失。');
  const a=preview.points[i-1],b=preview.points[i],distance=Math.hypot(b.x-a.x,b.y-a.y),value=speed(cell);
  if(!Number.isFinite(distance)||!Number.isFinite(value)||value<0)throw Error('行军距离或速度无效。');
  if(distance===0)continue;if(value===0)return Infinity;ticks+=distance/value;
 }
 return ticks;
}
