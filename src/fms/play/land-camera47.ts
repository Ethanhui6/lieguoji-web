import type {FmsDocument} from '../model';
import {cameraScaleBounds,fitCamera,type AtlasCamera,type CameraSize} from '../../world/camera';
import {landFaces,polygonArea} from './settlement25-mesh';

/** The first playable view frames the substantial connected land components.
 * Use the renderer's real h20 clipped faces, so a faraway speck does not make
 * the main continent illegible. 全图 still fits the complete world. This only
 * changes the camera; map data, picking, travel and saves remain authoritative. */
export function initialLandCamera47(doc:FmsDocument,viewport:CameraSize):AtlasCamera{
 const faces=landFaces(doc);
 if(!faces.length)return fitCamera(doc,viewport);
 const visited=new Uint8Array(faces.length);
 const components:{area:number;minX:number;minY:number;maxX:number;maxY:number}[]=[];
 for(let start=0;start<faces.length;start++){
  if(visited[start])continue;
  visited[start]=1;
  const queue=[start],component={area:0,minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  for(let head=0;head<queue.length;head++){
   const face=faces[queue[head]];
   component.area+=polygonArea(face.ring);
   for(const point of face.ring){component.minX=Math.min(component.minX,point.x);component.minY=Math.min(component.minY,point.y);component.maxX=Math.max(component.maxX,point.x);component.maxY=Math.max(component.maxY,point.y);}
   for(const neighbor of face.neighbors)if(!visited[neighbor]){visited[neighbor]=1;queue.push(neighbor);}
  }
  components.push(component);
 }
 const totalArea=components.reduce((sum,component)=>sum+component.area,0);
 const largest=components.reduce((best,component,index)=>component.area>components[best].area?index:best,0);
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const [index,component]of components.entries()){
  if(index!==largest&&component.area<totalArea*.05)continue;
  minX=Math.min(minX,component.minX);minY=Math.min(minY,component.minY);maxX=Math.max(maxX,component.maxX);maxY=Math.max(maxY,component.maxY);
 }
 const {fitScale,maxScale}=cameraScaleBounds(doc,viewport);
 // A single tiny island must not jump to the 80x editor limit on entry.
 const width=Math.max(maxX-minX,doc.width/64),height=Math.max(maxY-minY,doc.height/64);
 const desired=Math.min(viewport.width/width,viewport.height/height)*.76;
 const scale=Math.max(fitScale,Math.min(maxScale,fitScale*12,desired));
 return {x:viewport.width/2-(minX+maxX)/2*scale,y:viewport.height/2-(minY+maxY)/2*scale,scale};
}
