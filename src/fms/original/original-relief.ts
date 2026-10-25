import {Graphics} from 'pixi.js';
import type {OriginalGrid} from './original-grid';

/** Cartographic relief is display-only and derived from the existing height /
 * biome fields. No random generator or simulation state is consumed. */
export function drawOriginalRelief(g:Graphics,grid:OriginalGrid,heights:ArrayLike<number>,biomes:ArrayLike<number>):{mountains:number;forests:number}{
 g.clear();const occupied=new Set<string>();let mountains=0,forests=0;
 for(let i=0;i<grid.points.length;i++){
  const h=heights[i],forest=h>=22&&h<55&&biomes[i]>=5&&biomes[i]<=9;
  if(h<55&&!forest)continue;
  // Keep ornaments off sea-edge cells and leave breathing room for labels.
  if(grid.neighbors[i].some(n=>heights[n]<20))continue;
  const [x,y]=grid.points[i],key=`${Math.floor(x/23)},${Math.floor(y/23)}`;
  if(occupied.has(key))continue;occupied.add(key);
  if(h>=55){
   const variation=(i*37%101)/100,w=5+(h-55)*.08,top=y-(8+(h-55)*.19)*( .85+variation*.3),peak=x-2+variation*3;
   g.poly([x-w-3,y+4,x-w*.6,y-2,x-w*.35,y-1,peak,top,x+w*.3,y-3,x+w*.55,y-5,x+w+3,y+4]).fill({color:0xddd1b1,alpha:.32});
   g.moveTo(x-w-3,y+4).lineTo(x-w*.6,y-2).lineTo(x-w*.35,y-1).lineTo(peak,top).lineTo(x+w*.3,y-3).lineTo(x+w*.55,y-5).lineTo(x+w+3,y+4).stroke({color:0x514d3c,width:.65,alpha:.62});
   g.poly([peak,top,x+w*.3,y-3,x+w*.55,y-5,x+w+3,y+4,x+1,y+1]).fill({color:0x514d3c,alpha:.23});
   g.moveTo(peak,top).lineTo(x-2,y-1).lineTo(x-4,y+3).stroke({color:0x514d3c,width:.5,alpha:.6});
   for(let k=0;k<4;k++)g.moveTo(x+k*1.6,y-3+k).lineTo(x+k*1.6+2,y+2+k*.5);
   g.stroke({color:0x514d3c,width:.45,alpha:.45});mountains++;
  }else{
   for(const [dx,dy]of [[-3,1],[2,-2],[5,2]]){
    g.moveTo(x+dx,y+dy-5).lineTo(x+dx-2.5,y+dy).lineTo(x+dx-1,y+dy).lineTo(x+dx-3,y+dy+3).lineTo(x+dx+3,y+dy+3).lineTo(x+dx+1,y+dy).lineTo(x+dx+2.5,y+dy).closePath().fill({color:0x405d45,alpha:.4});
    g.moveTo(x+dx,y+dy+2).lineTo(x+dx,y+dy+5).stroke({color:0x354a35,width:.5,alpha:.55});
   }forests++;
  }
 }
 return {mountains,forests};
}
