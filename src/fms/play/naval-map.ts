import type {MaritimeState} from './maritime';
import { Container, Graphics, Text } from 'pixi.js';
import type { World, Point } from '../../sim/types';
import { fleetPosition, type Navy } from './navy';
import { seaRoutePoints, type SeaGraph } from './sea-path';
import { nationColor } from './politics';
export interface NavalView { navy:Navy; graph:SeaGraph; selected:string|null; nationId:string; preview:number[]; maritime?:MaritimeState }
export function fleetAt(navy:Navy,graph:SeaGraph,scale:number,camera:{x:number;y:number;scale:number},point:Point){return navy.fleets.filter(f=>f.status!=='lost').map(f=>{const p=fleetPosition(graph,f);return {id:f.id,d:Math.hypot(p.x/scale*camera.scale+camera.x-point.x,p.y/scale*camera.scale+camera.y-point.y)};}).filter(f=>f.d<18).sort((a,b)=>a.d-b.d)[0]?.id;}
export function drawNavy(layer:Container,world:World,scale:number,zoom:number,view:NavalView,positions?:ReadonlyMap<string,Point>,overview=false){
  const {navy,graph,selected,nationId,preview}=view,g=new Graphics(),pixel=1/zoom;layer.addChild(g);
  const ships=new Map<string,Container>();
  const path=(ids:number[],color:number)=>{const points=seaRoutePoints(graph,ids);points.forEach((p,i)=>{if(i)g.lineTo(p.x/scale,p.y/scale);else g.moveTo(p.x/scale,p.y/scale);});if(points.length>1)g.stroke({color,width:1.5*pixel,alpha:.85});};
  const active=navy.fleets.find(f=>f.id===selected&&f.status!=='lost');if(active?.route.length)path([active.node,...active.route],0xd2eff2);if(preview.length)path(preview,0xffe191);
  for(const port of graph.ports){if(port.id!==active?.dockId&&port.id!==active?.targetId&&!(zoom>1.2&&world.cities.some(c=>c.provinceId===port.provinceId)&&world.provinces.some(p=>p.id===port.provinceId&&p.controller===nationId)))continue;const x=port.shore.x/scale,y=port.shore.y/scale;g.circle(x,y,2*pixel).fill(0xd7eee7).stroke({color:0x274d56,width:pixel});}
  for(const f of navy.fleets){if(f.status==='lost'||overview&&f.id!==selected&&f.ships<5)continue;const p=positions?.get(f.id)??fleetPosition(graph,f),x=0,y=0,r=(f.id===selected?9:6)*pixel,nation=world.nations.find(n=>n.id===f.nationId)!;
    const ship=new Container(),icon=new Graphics();ship.position.set(p.x/scale,p.y/scale);ship.addChild(icon);layer.addChild(ship);ships.set(f.id,ship);
    icon.poly([x-r,y,x+r,y,x+r*.5,y+r*.5,x-r*.5,y+r*.5]).fill(nationColor(nation)).stroke({color:f.id===selected?0xffe5a1:0xe2f0e8,width:pixel});icon.moveTo(x,y).lineTo(x,y-r).lineTo(x+r*.7,y-r*.35).lineTo(x,y-r*.35).stroke({color:0xf4f2d9,width:pixel});
    const hull=view.maritime?.hulls[f.id],fighting=view.maritime?.contacts.some(c=>c.a===f.id||c.b===f.id);
    if(fighting)icon.circle(0,-r*.2,r+3*pixel).stroke({color:0xf2aa6b,width:pixel,alpha:.85});
    if(hull!==undefined&&(hull<f.ships*100||f.id===selected)){icon.rect(-r,-r-5*pixel,2*r,2*pixel).fill(0x233b45);icon.rect(-r,-r-5*pixel,2*r*hull/(f.ships*100),2*pixel).fill(hull<f.ships*30?0xe6866b:0xaad5b1);}
    if(f.id===selected){const t=new Text({text:`${f.ships}艘`,style:{fontSize:11,fill:'#f7edd4',stroke:{color:'#284654',width:3}}});t.anchor.set(.5,0);t.scale.set(pixel);t.position.set(x,y+r);ship.addChild(t);}
  }
  return {update:(points:ReadonlyMap<string,Point>)=>{for(const [id,ship] of ships){const p=points.get(id);if(p)ship.position.set(p.x/scale,p.y/scale);}},positions:()=>[...ships].map(([id,s])=>({id,x:s.x,y:s.y}))};
}
