import type {Point} from '../../sim/types';

/** Original map names (State.UpdateStateName 0x5E0EE0 with LabelUtility, and
 * World.CreateCityLabel 0x6A7100). Units: Unity world units; the web map layer is the
 * original 1600 × 900 grid space, 240 units wide. */
export const MAP_UNIT47=1600/240;

/** LabelUtility.CalculateLabelScale: (clamp(cells, 500, 2400) − 500) / 1900. */
export const labelScale47=(cells:number)=>(Math.min(2400,Math.max(500,cells))-500)/1900;
/** LabelUtility.CalculateFontSize / CalculateLabelSettings for Chinese: font size
 * 25 + 15 × scale at most, 15 at least (TextMeshPro auto-size). */
export const labelFontRange47=(scale:number)=>({max:25+15*Math.min(1,Math.max(0,scale)),min:15});

export type LabelGrid47={cellsX:number;points:readonly (readonly [number,number])[]};
export type StateLabelBox47={key:string;x:number;y:number;width:number;height:number;fontMax:number;fontMin:number;cells:number};
/** One horizontal name per group (state, or the colour view's culture/religion/…):
 * - the name point: the group's cell nearest to the centroid of its cells
 *   (BurgsAndStateGenerator.CalculateStateNameWorldPos);
 * - LabelUtility.GetAvailableLength walks the grid row left and right from that cell while
 *   the cells stay in the group, stopping at the map edge; length = |x_end − x_start|;
 * - the text box is 0.6 × length wide and max(0.2 × length, 1.5) units high, centred
 *   between the two end cells; TextMeshPro auto-sizes the text inside it.
 * A state of one province with fewer than 30 cells keeps its label hidden (z = 10). */
export function stateLabelBoxes47(grid:LabelGrid47,groupOf:(cell:number)=>string|null,hidden?:(key:string,cells:number)=>boolean):StateLabelBox47[]{
  const groups=new Map<string,number[]>();
  for(let i=0;i<grid.points.length;i++){const k=groupOf(i);if(k===null)continue;const list=groups.get(k);if(list)list.push(i);else groups.set(k,[i]);}
  const out:StateLabelBox47[]=[];
  for(const [key,cells] of groups){
    if(hidden?.(key,cells.length))continue;
    let cx=0,cy=0;for(const c of cells){cx+=grid.points[c][0];cy+=grid.points[c][1];}cx/=cells.length;cy/=cells.length;
    let pole=cells[0],best=Infinity;for(const c of cells){const d=(grid.points[c][0]-cx)**2+(grid.points[c][1]-cy)**2;if(d<best){best=d;pole=c;}}
    let start=pole,end=pole;
    while(start%grid.cellsX>0&&groupOf(start-1)===key)start--;
    while((end+1)%grid.cellsX>0&&end+1<grid.points.length&&groupOf(end+1)===key)end++;
    const length=Math.abs(grid.points[end][0]-grid.points[start][0])/MAP_UNIT47,width=length*.6,height=Math.max(width/3,1.5);
    const {max,min}=labelFontRange47(labelScale47(cells.length));
    out.push({key,x:(grid.points[start][0]+grid.points[end][0])/2,y:(grid.points[start][1]+grid.points[end][1])/2,width,height,fontMax:max,fontMin:min,cells:cells.length});
  }
  return out;
}
/** TextMeshPro auto-size: the largest size in [min, max] at which the text fits the box
 * (`em` = measured width / height of the text per font-size unit), never below min.
 * TextMeshPro 3D text is 10 font-size units per world unit. */
export function autoFontSize47(box:{width:number;height:number;fontMax:number;fontMin:number},em:{width:number;height:number}){
  const fit=Math.min(box.width*10/Math.max(1e-6,em.width),box.height*10/Math.max(1e-6,em.height));
  return Math.max(box.fontMin,Math.min(box.fontMax,fit));
}
/** World.CreateCityLabel: TextMeshPro size 64, bold, centred, local scale BurgLabelScale 0.13
 * × BurgCityLabelScale 1 × GetCityScale (1.5 for a state capital, else 1), placed
 * BurgLabelOffset 0.7 × the same city scale above the city (below when the city touches the
 * top border). Returned in map-layer units: the em height and the label centre. */
export function cityLabel47(city:Point,capital:boolean,mapTop=0){
  const s=capital?1.5:1,em=64*.13*s/10*MAP_UNIT47,offset=.7*s*MAP_UNIT47,below=city.y-offset-em/2<mapTop;
  return {em,x:city.x,y:below?city.y+offset:city.y-offset};
}
