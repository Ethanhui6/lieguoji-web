import type { Army, Point, World } from '../../sim/types';
import { cameraScaleBounds, centerCameraAt, worldToScreen, type AtlasCamera, type CameraSize } from '../../world/camera';

export function armyPosition(world: World, army: Army): Point {
  const origin = world.provinces.find(p => p.id === army.provinceId)!.center;
  const target = world.provinces.find(p => p.id === army.route[0])?.center ?? origin;
  return { x: origin.x + (target.x - origin.x) * army.progress, y: origin.y + (target.y - origin.y) * army.progress };
}
export type ArmyMarker=Point & {ids:string[];near:boolean};
/** CSS-sized markers: nearby friendly troops share a far-view marker. Never
 * merge enemies. Selected troops stay individually visible and selectable. */
export function armyMarkers(world:World,scale:number,camera:AtlasCamera,selected:string|null=null,positions?:ReadonlyMap<string,Point>):ArmyMarker[]{
  const area=world.provinces.reduce((sum,p)=>sum+Math.abs(p.polygon.reduce((s,a,i)=>{const b=p.polygon[(i+1)%p.polygon.length];return s+a.x*b.y-b.x*a.y;},0))/2,0);
  const near=Math.sqrt(area/Math.max(1,world.provinces.length))*camera.scale/scale>=32;
  const groups=new Map<string,{ids:string[];x:number;y:number}>();
  for(const a of world.armies.filter(a=>a.troops>0&&a.status!=='destroyed')){
    const p=positions?.get(a.id)??armyPosition(world,a),x=p.x/scale*camera.scale,y=p.y/scale*camera.scale;
    const end=armyPosition(world,a),moving=a.status==='marching'||a.status==='retreating'||Math.hypot(p.x-end.x,p.y-end.y)>1e-7;
    const key=a.id===selected||moving?`unit:${a.id}`:near?`${a.nationId}/${p.x}/${p.y}`:`${a.nationId}/${Math.floor(x/36)}/${Math.floor(y/36)}`;
    const group=groups.get(key)??{ids:[],x:0,y:0};group.ids.push(a.id);group.x+=x;group.y+=y;groups.set(key,group);
  }
  return [...groups.values()].flatMap<ArmyMarker>(g=>{
    const x=g.x/g.ids.length+camera.x,y=g.y/g.ids.length+camera.y+12;
    if(!near)return [{ids:g.ids,x,y,near}];
    return g.ids.map((id,i)=>({ids:[id],x:x+(i%3-Math.min(2,g.ids.length-1)/2)*14,y:y+Math.floor(i/3)*14,near}));
  });
}
export function armyMarkerPoint(world:World,army:Army,scale:number,camera:AtlasCamera):Point {
  return armyMarkers(world,scale,camera).find(m=>m.ids.includes(army.id))??worldToScreen(camera,armyPosition(world,army));
}
export function armiesAt(world:World,scale:number,camera:AtlasCamera,point:Point,selected:string|null=null):string[]{
  return armyMarkers(world,scale,camera,selected).map(m=>({...m,distance:Math.hypot(m.x-point.x,m.y-point.y)})).filter(m=>m.distance<=22).sort((a,b)=>a.distance-b.distance).flatMap(m=>m.ids);
}
/** Leave the top status, bottom controls and open sheet outside the focal area. */
export function focusAnchor(viewport: CameraSize, panel: boolean): Point {
  const right = viewport.width > 600 && panel ? Math.max(150, viewport.width - 380) : viewport.width - 24;
  const bottom = viewport.height - (viewport.width <= 600 && panel ? Math.min(viewport.height * .43, viewport.height - 300) + 165 : 155);
  return { x: (24 + right) / 2, y: (130 + Math.max(150, bottom)) / 2 };
}
export function focusMapPoint(camera: AtlasCamera, point: Point, world: CameraSize, viewport: CameraSize, panel = true): AtlasCamera {
  const bounds = cameraScaleBounds(world, viewport);
  return centerCameraAt({ ...camera, scale: Math.min(bounds.maxScale, Math.max(camera.scale, bounds.fitScale * 3)) }, point, focusAnchor(viewport, panel));
}
