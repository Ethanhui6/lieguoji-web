import type {FmsDocument} from '../model';
import {FMS_SEA_LEVEL} from '../model';
import {cameraScaleBounds,fitCamera,type AtlasCamera,type CameraSize} from '../../world/camera';

/** The first playable view frames actual land vertices, leaving the full-ocean
 * fit available to the existing 全图 control. This changes only the camera:
 * map coordinates, picking, travel, ownership and saves remain authoritative. */
export function initialLandCamera47(doc:FmsDocument,viewport:CameraSize):AtlasCamera{
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,count=0;
 for(let i=0;i<doc.points.length;i++)if(doc.elevations[i]>=FMS_SEA_LEVEL){const [x,y]=doc.points[i];minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);count++;}
 if(!count)return fitCamera(doc,viewport);
 const {fitScale,maxScale}=cameraScaleBounds(doc,viewport);
 // A single tiny island must not jump to the 80x editor limit on entry.
 const width=Math.max(maxX-minX,doc.width/64),height=Math.max(maxY-minY,doc.height/64);
 const desired=Math.min(viewport.width/width,viewport.height/height)*.76;
 const scale=Math.max(fitScale,Math.min(maxScale,fitScale*12,desired));
 return {x:viewport.width/2-(minX+maxX)/2*scale,y:viewport.height/2-(minY+maxY)/2*scale,scale};
}
