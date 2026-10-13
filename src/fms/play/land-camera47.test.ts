import {describe,it,expect} from 'vitest';
import {fitCamera,worldToScreen,cameraWorldBounds} from '../../world/camera';
import {grid} from './fixture.test-support';
import {initialLandCamera47} from './land-camera47';

describe('first playable land camera',()=>{
 it('frames a small real continent on portrait without changing data or losing its coastline',()=>{
  const doc=grid((x,y)=>x>=100&&x<=170&&y>=100&&y<=180?45:0),before=structuredClone(doc),viewport={width:393,height:800};
  const camera=initialLandCamera47(doc,viewport),whole=fitCamera(doc,viewport);
  expect(camera.scale).toBeGreaterThan(whole.scale*2);
  const land=doc.points.filter((_,i)=>doc.elevations[i]>=20).map(([x,y])=>worldToScreen(camera,{x,y}));
  expect(Math.min(...land.map(p=>p.x))).toBeGreaterThan(0);expect(Math.max(...land.map(p=>p.x))).toBeLessThan(viewport.width);
  expect(Math.min(...land.map(p=>p.y))).toBeGreaterThan(0);expect(Math.max(...land.map(p=>p.y))).toBeLessThan(viewport.height);
  expect(Math.max(...land.map(p=>p.x))-Math.min(...land.map(p=>p.x))).toBeGreaterThan(viewport.width*.45);
  expect(doc).toEqual(before);
 });
 it('falls back to the exact whole-ocean view and caps a one-cell island',()=>{
  const sea=grid(()=>0),viewport={width:393,height:800};expect(initialLandCamera47(sea,viewport)).toEqual(fitCamera(sea,viewport));
  sea.elevations[150]=45;const camera=initialLandCamera47(sea,viewport),whole=fitCamera(sea,viewport);
  expect(camera.scale).toBeLessThanOrEqual(whole.scale*12);expect(cameraWorldBounds(camera,viewport).maxX).toBeGreaterThan(cameraWorldBounds(camera,viewport).minX);
 });
 it('does not pull the opening camera away from a mainland for a distant microisland',()=>{
  const mainland=(x:number,y:number)=>x>=90&&x<=150&&y>=70&&y<=190?45:0;
  const viewport={width:393,height:800},base=grid(mainland);
  const islands=grid((x,y)=>mainland(x,y)||x===240&&y===240?45:0),before=structuredClone(islands);
  const camera=initialLandCamera47(islands,viewport);
  expect(camera).toEqual(initialLandCamera47(base,viewport));
  expect(camera.scale).toBeGreaterThan(fitCamera(islands,viewport).scale*2);
  expect(worldToScreen(camera,{x:240,y:240}).x).toBeGreaterThan(viewport.width);
  expect(islands).toEqual(before);
 });
 it('includes both substantial disconnected continents and remains deterministic',()=>{
  const left=(x:number,y:number)=>x>=20&&x<=80&&y>=60&&y<=180;
  const right=(x:number,y:number)=>x>=170&&x<=230&&y>=60&&y<=180;
  const viewport={width:393,height:800},doc=grid((x,y)=>left(x,y)||right(x,y)?45:0);
  const camera=initialLandCamera47(doc,viewport),bounds=cameraWorldBounds(camera,viewport);
  expect(bounds.minX).toBeLessThan(20);expect(bounds.maxX).toBeGreaterThan(230);
  expect(camera.scale).toBeLessThan(initialLandCamera47(grid((x,y)=>left(x,y)?45:0),viewport).scale);
  expect(initialLandCamera47(doc,viewport)).toEqual(camera);
 });
});
