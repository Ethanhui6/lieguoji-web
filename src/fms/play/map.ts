import { Container, Graphics, Text, Texture, Sprite } from 'pixi.js';
import icons from './military-icons.json';
import { unitProfile, type UnitAssignments, type UnitKey } from './military-profile';
import type { World, Point } from '../../sim/types';
import { armyMarkers,armyPosition } from './navigation';
import { nationColor, politicalStyle, type PoliticalView } from './politics';
import { territoryLabels, type TerritoryLabel } from './territory-labels';
import { drawNavy, type NavalView } from './naval-map';
import type { DisplayFrame } from './motion';
import {engagementPoint,type BattleState} from './battle';
import {drawAttackArrow} from './attack-map';

export class PlayMap {
  readonly layer = new Container();
  private textures=new Map<UnitKey,Texture>();
  private disposed=false;
  private unitGroups:{ids:string[];container:Container;offset:Point}[]=[];
  private shipLayer?:ReturnType<typeof drawNavy>;
  private projection={scale:1,zoom:1,x:0,y:0,width:1280,height:720};
  private capitals:{nationId:string;cityId:string;name:string;point:Point}[]=[];
  private battles:{id:string;x:number;y:number;armies:string[];losses:Record<string,number>}[]=[];
  private battleWidgets:{ids:string[];bar:Graphics;r:number;pixel:number;text?:Text}[]=[];
  battlePositions(){return this.battles;}
  updateBattles(world:World,state:BattleState){
    const armies=new Map(world.armies.map(a=>[a.id,a]));
    for(const widget of this.battleWidgets){const e=state.engagements.find(e=>e.armies.includes(widget.ids[0]));if(!e)continue;const strength=widget.ids.reduce((s,id)=>s+(armies.get(id)?.troops??0),0),loss=widget.ids.reduce((s,id)=>s+(e.losses[id]??0),0),{bar,r,pixel}=widget;bar.clear().rect(-11*pixel,(r+3)*pixel,22*pixel,3*pixel).fill(0x26332d).rect(-11*pixel,(r+3)*pixel,22*pixel*strength/Math.max(1,strength+loss),3*pixel).fill(0xd5dfa1);if(widget.text)widget.text.text=String(strength);}
    for(const b of this.battles){const e=state.engagements.find(e=>e.id===b.id);if(e)b.losses=e.losses;}
  }
  capitalPositions(){return this.capitals;}
  unitPositions(){const p=this.projection;return [...this.unitGroups.map(g=>({id:g.ids[0],ids:g.ids,kind:'army',x:g.container.x*p.zoom+p.x,y:g.container.y*p.zoom+p.y})),...(this.shipLayer?.positions()??[]).map(s=>({id:s.id,ids:[s.id],kind:'fleet',x:s.x*p.zoom+p.x,y:s.y*p.zoom+p.y}))];}
  pickUnits(point:Point){return this.unitPositions().map(p=>({...p,distance:Math.hypot(p.x-point.x,p.y-point.y)})).filter(p=>p.distance<=(p.kind==='army'?22:18)).sort((a,b)=>a.distance-b.distance);}
  updateUnits(frame:DisplayFrame){
    const p=this.projection;
    for(const g of this.unitGroups){const points=g.ids.flatMap(id=>frame.armies.has(id)?[frame.armies.get(id)!]:[]);if(!points.length)continue;g.container.position.set(points.reduce((s,v)=>s+v.x,0)/points.length/p.scale+g.offset.x,points.reduce((s,v)=>s+v.y,0)/points.length/p.scale+g.offset.y);const x=g.container.x*p.zoom+p.x,y=g.container.y*p.zoom+p.y;g.container.visible=x>=-30&&y>=-30&&x<=p.width+30&&y<=p.height+30;}
    this.shipLayer?.update(frame.fleets);
  }
  constructor(refresh=()=>{}){for(const [key,url] of Object.entries(icons)){const img=new Image();img.onload=()=>{if(this.disposed)return;this.textures.set(key as UnitKey,Texture.from(img));refresh();};img.src=url;}}
  dispose(){this.disposed=true;for(const texture of this.textures.values())texture.destroy(true);this.textures.clear();}

  private territoryKey='';
  private territories:TerritoryLabel[]=[];
  labelPositions(){return this.territories.map(({nationId,point})=>({nationId,...point}));}
  draw(world: World, scale: number, zoom: number, selected: string | null, armyId: string | null, mode:PoliticalView='political',units?:UnitAssignments,view?:{camera:{x:number;y:number};viewport:{width:number;height:number}},naval?:NavalView,frame?:DisplayFrame,combat?:{state:BattleState;preview:string[]}): void {
    for (const child of this.layer.removeChildren()) child.destroy({ children: true });
    this.unitGroups=[];this.battleWidgets=[];this.shipLayer=undefined;this.projection={scale,zoom,x:view?.camera.x??0,y:view?.camera.y??0,width:view?.viewport.width??1280,height:view?.viewport.height??720};
    this.capitals=world.nations.flatMap(n=>{const c=world.cities.find(c=>c.id===n.capitalId);return c?[{nationId:n.id,cityId:c.id,name:c.name,point:c.position}]:[];});
    const g = new Graphics(), marks = new Graphics(); this.layer.addChild(g, marks);
    const nations = new Map(world.nations.map(n => [n.id, n])), provinces = new Map(world.provinces.map(p => [p.id, p]));
    const pixel = 1 / zoom, style=politicalStyle(mode);
    const territoryKey=`${world.custom?.id}/${world.provinces.map(p=>`${p.id}:${p.controller}`).join('|')}`;
    if(territoryKey!==this.territoryKey){this.territoryKey=territoryKey;this.territories=territoryLabels(world);}
    const borders = new Map<string, { a: { x:number;y:number }; b: {x:number;y:number}; owner:string; shared:boolean; foreign:boolean }>();
    for (const p of world.provinces) {
      g.poly(p.polygon.flatMap(v => [v.x / scale, v.y / scale])).fill({ color: nationColor(nations.get(p.controller)!), alpha: style.fill });
      if(zoom>.6)g.stroke({ color: 0x303e37, alpha: style.province, width: .55 * pixel });
      if (p.id === selected) g.poly(p.polygon.flatMap(v => [v.x / scale, v.y / scale])).stroke({ color: 0xffe7a7, width: 2.5 * pixel });
      for(let i=0;i<p.polygon.length;i++) {const a=p.polygon[i],b=p.polygon[(i+1)%p.polygon.length],ka=`${a.x},${a.y}`,kb=`${b.x},${b.y}`,key=ka<kb?`${ka}/${kb}`:`${kb}/${ka}`,old=borders.get(key);if(old){old.shared=true;old.foreign=old.owner!==p.controller;}else borders.set(key,{a,b,owner:p.controller,shared:false,foreign:false});}
    }
    for(const edge of borders.values())if(edge.foreign){
      g.moveTo(edge.a.x/scale,edge.a.y/scale).lineTo(edge.b.x/scale,edge.b.y/scale).stroke({color:0xfff5db,width:(style.border+1.5)*pixel,alpha:.8});
      g.moveTo(edge.a.x/scale,edge.a.y/scale).lineTo(edge.b.x/scale,edge.b.y/scale).stroke({color:0x35453a,width:style.border*pixel,alpha:.9});
    }
    const label = (text: string, x: number, y: number, size: number, color = '#f9f1d4',parent=this.layer) => {
      const t = new Text({ text, style: { fontFamily: 'Georgia, serif', fontSize: size, fill: color, fontWeight: 'bold', stroke: { color: '#263d40', width: 3 } } });
      t.anchor.set(.5, 1); t.scale.set(pixel); t.position.set(x, y); parent.addChild(t);return t;
    };
    const countryLabels=this.territories.map(territory=>{
      const n=nations.get(territory.nationId)!,size=Math.max(13,Math.min(27,territory.clearance/scale*zoom*.65));
      const t=new Text({text:n.name,style:{fontFamily:'Georgia, "Microsoft YaHei", serif',fontSize:size,fill:'#263a30',fontWeight:'bold',stroke:{color:'#fffae5',width:2},letterSpacing:2}});
      t.anchor.set(.5);t.scale.set(pixel);t.position.set(territory.point.x/scale,territory.point.y/scale);t.alpha=mode==='political'?.94:.7;this.layer.addChild(t);
      return {point:territory.point,size,width:n.name.length*(size+2)};
    });
    for (const city of world.cities) {
      const capital = world.nations.find(n => n.capitalId === city.id), x = city.position.x / scale, y = city.position.y / scale;
      if(!capital)marks.circle(x, y, 2.5 * pixel).fill(0xf0e5cc).stroke({width:1*pixel,color:0x38453e});
      if(capital||zoom>.6){
        const near=countryLabels.find(c=>Math.abs(c.point.x-city.position.x)/scale*zoom<(c.width+city.name.length*12)/2&&Math.abs(c.point.y-city.position.y)/scale*zoom<c.size+20);
        const offset=near?Math.max(8,(city.position.y-near.point.y)/scale*zoom+near.size/2+8):7;
        if(!capital)label(city.name,x,y-offset*pixel,11);
      }
    }
    // Near view resolves actual local names. A countryside province is not
    // presented as an invented city merely to fill the map with settlements.
    const cityProvinces=new Set(world.cities.map(c=>c.provinceId));
    for(const p of world.provinces){
      if(cityProvinces.has(p.id))continue;
      const area=Math.abs(p.polygon.reduce((sum,a,i)=>{const b=p.polygon[(i+1)%p.polygon.length];return sum+a.x*b.y-b.x*a.y;},0))/2;
      if(area*(zoom/scale)**2<2400&&p.id!==selected)continue;
      const x=p.center.x/scale,y=p.center.y/scale;
      if(countryLabels.some(c=>Math.abs(c.point.x-p.center.x)/scale*zoom<(c.width+p.name.length*10)/2&&Math.abs(c.point.y-p.center.y)/scale*zoom<c.size+14))continue;
      label(p.name,x,y-5*pixel,10,'#e2e9cb');
    }
    const byArmy=new Map(world.armies.map(a=>[a.id,a]));
    this.battles=(combat?.state.engagements??[]).map(e=>{const p=engagementPoint(world,e);return {id:e.id,x:p.x/scale*zoom+this.projection.x,y:p.y/scale*zoom+this.projection.y,armies:e.armies,losses:e.losses};});
    const directions=new Graphics();this.layer.addChild(directions);
    const perTarget=new Map<string,number>();let arrows=0;
    for(const a of world.armies){
      const plan=combat?.state.plans[a.id],preview=a.id===armyId&&combat?.preview.length?combat.preview:undefined;
      const route=preview?preview.slice(1):plan?plan.path.slice(plan.path.indexOf(a.provinceId)+1):a.route;
      if(!route.length||a.status==='destroyed')continue;
      const points=[frame?.armies.get(a.id)??armyPosition(world,a),...route.map(id=>provinces.get(id)!.center)].map(p=>({x:p.x/scale,y:p.y/scale}));
      const active=a.id===armyId,key=`${a.nationId}/${route.at(-1)}`,foreign=provinces.get(route.at(-1)!)!.controller!==a.nationId;
      if(active){directions.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))directions.lineTo(p.x,p.y);directions.stroke({color:preview?0xffffff:0xffecc0,width:1.5*pixel,alpha:.8});for(const id of plan?.targets??[]){const p=provinces.get(id)!.center;directions.circle(p.x/scale,p.y/scale,3*pixel).stroke({color:0xfff2c9,width:pixel});}}
      if(combat&&(active||(foreign&&a.status==='marching'&&(perTarget.get(key)??0)<2&&arrows<14))){drawAttackArrow(directions,points,pixel,preview?0xfff0b0:nationColor(nations.get(a.nationId)!),!!preview);perTarget.set(key,(perTarget.get(key)??0)+1);arrows++;}
    }
    for (const marker of armyMarkers(world,scale,{x:0,y:0,scale:zoom},armyId,frame?.armies)) {
      const army=byArmy.get(marker.ids[0])!,active=marker.ids.includes(armyId??'');
      const battle=combat?.state.engagements.find(e=>e.armies.includes(army.id));
      if(battle){const sides=[...new Set(battle.armies.map(id=>byArmy.get(id)!.nationId))].sort(),side=sides.indexOf(army.nationId),angle=Math.PI+side*2*Math.PI/sides.length;marker.x+=Math.cos(angle)*24;marker.y+=Math.sin(angle)*24-12;}
      const container=new Container(),marks=new Graphics();container.addChild(marks);this.layer.addChild(container);container.position.set(marker.x/zoom,marker.y/zoom);
      const points=marker.ids.map(id=>frame?.armies.get(id)??armyPosition(world,byArmy.get(id)!));
      this.unitGroups.push({ids:marker.ids,container,offset:{x:marker.x/zoom-points.reduce((s,p)=>s+p.x,0)/points.length/scale,y:marker.y/zoom-points.reduce((s,p)=>s+p.y,0)/points.length/scale}});
      const x=0,y=0,r=active?12:marker.near?9:6;
      const unit=units?unitProfile(units[army.id]):undefined,texture=unit&&this.textures.get(unit.key);
      marks.roundRect(x-r*pixel,y-r*pixel,r*2*pixel,r*2*pixel,3*pixel).fill({color:nationColor(nations.get(army.nationId)!),alpha:.94}).stroke({color:active?0xffefbc:0x33493e,width:(active?2:1)*pixel});
      if(marker.ids.length>1)label(String(marker.ids.length),x,y+5*pixel,9,'#f9f1d4',container);
      else if((marker.near||active)&&texture){const sprite=new Sprite(texture);sprite.anchor.set(.5);sprite.width=(r*2-3)*pixel;sprite.height=(r*2-3)*pixel;sprite.position.set(x,y);container.addChild(sprite);}
      else marks.moveTo(x-2*pixel,y+3*pixel).lineTo(x-2*pixel,y-3*pixel).lineTo(x+3*pixel,y-1*pixel).stroke({color:0xfff3d4,width:pixel});
      const strengthText=active?label(String(army.troops),x,y+26*pixel,11,'#f9f1d4',container):undefined;
      if(battle){const bar=new Graphics();container.addChild(bar);const text=strengthText??(marker.near?label('',0,-(r+3)*pixel,9,'#fff3d4',container):undefined);this.battleWidgets.push({ids:marker.ids,bar,r,pixel,text});}
      if(army.status==='marching'||army.status==='retreating')marks.poly([x+(r+1)*pixel,y-3*pixel,x+(r+5)*pixel,y,x+(r+1)*pixel,y+3*pixel]).fill(army.status==='retreating'?0xfacba0:0xfff8d6);
    }
    for(const e of combat?.state.engagements??[]){const p=engagementPoint(world,e),x=p.x/scale,y=p.y/scale,mark=new Graphics();this.layer.addChild(mark);mark.circle(x,y,8*pixel).fill({color:0x392c28,alpha:.85}).stroke({color:0xeedab9,width:pixel});mark.moveTo(x-4*pixel,y-4*pixel).lineTo(x+4*pixel,y+4*pixel).moveTo(x+4*pixel,y-4*pixel).lineTo(x-4*pixel,y+4*pixel).stroke({color:0xffe4b4,width:2*pixel});}
    if(combat)this.updateBattles(world,combat.state);
    if(naval)this.shipLayer=drawNavy(this.layer,world,scale,zoom,naval,frame?.fleets);
    // Original package's CityCapitalFinal: dark outer disc / white ring / dark
    // center. Keep capitals above terrain/country labels and ordinary cities.
    const capitalLayer=new Container();this.layer.addChild(capitalLayer);
    for(const capital of this.capitals){const x=capital.point.x/scale,y=capital.point.y/scale,icon=new Graphics();capitalLayer.addChild(icon);
      icon.circle(x,y,9*pixel).fill(0xf8f5e9).circle(x,y,8*pixel).fill(0x182623).circle(x,y,5.45*pixel).fill(0xfffced).circle(x,y,2.65*pixel).fill(0x182623);
      const name=new Text({text:capital.name,style:{fontFamily:'Georgia, "Microsoft YaHei", serif',fontSize:15,fontWeight:'bold',fill:'#182623',stroke:{color:'#fff9e6',width:4}}});name.anchor.set(.5,1);name.scale.set(pixel);name.position.set(x,y-12*pixel);capitalLayer.addChild(name);
    }
    if(frame)this.updateUnits(frame);
  }
}
