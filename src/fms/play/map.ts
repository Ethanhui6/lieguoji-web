import { Container, Graphics, Text, Texture, Sprite, Rectangle } from 'pixi.js';
import battleAtlasUrl from './assets/battle-sword.png';
import {BattleAnimationClock} from './battle-animation';
import {OrderMotion,SinkMotion} from './order-motion';
import {fleetPosition} from './navy';
import icons from './military-icons.json';
import { unitProfile, type UnitAssignments, type UnitKey } from './military-profile';
import type { World, Point } from '../../sim/types';
import { armyMarkers,armyPosition } from './navigation';
import { nationColor, politicalStyle, type PoliticalView } from './politics';
import { territoryLabels, type TerritoryLabel } from './territory-labels';
import {currentCapital} from './capital-view';
import {cityLabels,selectedCityLabel,type LabelBox} from './city-labels';
import {capitalNameLabels} from './map-label-layout';
import { drawNavy, type NavalView } from './naval-map';
import type { DisplayFrame } from './motion';
import {engagementPoint,type BattleState} from './battle';
import type {OccupationState} from './occupation';
import {drawAttackArrow} from './attack-map';
import {BattleFeedback} from './battle-feedback';
import {warDetail,warSites,warMarkers,type WarMarker,type WarDetail} from './war-view';

export class PlayMap {
  readonly layer = new Container();
  private textures=new Map<UnitKey,Texture>();
  private disposed=false;
  private feedback=new BattleFeedback();
  private battleClock=new BattleAnimationClock();
  private orderMotion=new OrderMotion();
  private sinkMotion=new SinkMotion();
  private presentationRun='';
  private arrowWidgets:{id:string;graphic:Graphics;points:Point[];pixel:number;color:string|number}[]=[];
  private sinkingLayer?:Graphics;
  private battleAtlas?:Texture;
  private battleTextures:Texture[]=[];
  private battleSprites:{id:string;sprite:Sprite;fleets?:readonly [string,string]}[]=[];
  private impacts:{id:string;graphic:Graphics}[]=[];
  private reorganizationWidgets:{id:string;bar:Graphics;pixel:number;r:number;full:number;text?:Text}[]=[];
  updateReorganization(world:World){for(const v of this.reorganizationWidgets){const a=world.armies.find(a=>a.id===v.id);if(!a)continue;v.bar.clear().rect(-v.r*v.pixel,-(v.r+5)*v.pixel,2*v.r*v.pixel,2*v.pixel).fill(0x26332d).rect(-v.r*v.pixel,-(v.r+5)*v.pixel,2*v.r*v.pixel*Math.min(1,a.troops/v.full),2*v.pixel).fill(0xf0ce7b);if(v.text)v.text.text=`重编 ${a.troops}`;}}
  private unitGroups:{ids:string[];container:Container;offset:Point;display:'dot'|'detail'}[]=[];
  private labelLayout:{detail:WarDetail;countries:LabelBox[];capitals:LabelBox[];towns:{id:string;x:number;y:number}[]}={detail:'overview',countries:[],capitals:[],towns:[]};
  labelDiagnostics(){return this.labelLayout;}
  private shipLayer?:ReturnType<typeof drawNavy>;
  private projection={scale:1,zoom:1,x:0,y:0,width:1280,height:720};
  private capitals:{nationId:string;cityId:string;name:string;point:Point}[]=[];
  private cities:{id:string;provinceId:string;name:string;x:number;y:number;capital:boolean;label:boolean}[]=[];
  cityPositions(){return this.cities;}
  private cityCallout?:LabelBox&{id:string;provinceId:string;name:string};
  private uiObstacles:LabelBox[]=[];
  setUIObstacles(boxes:LabelBox[]){this.uiObstacles=boxes;}
  selectedCityPosition(){return this.cityCallout;}
  pickSelectedCity(point:Point){const c=this.cityCallout;return c&&Math.abs(c.x-point.x)<=c.width/2&&Math.abs(c.y-point.y)<=c.height/2?c.provinceId:null;}
  private wars:WarMarker[]=[];
  warPositions(){return this.wars;}
  pickWar(point:Point){return this.wars.map(w=>({...w,distance:Math.hypot(w.x-point.x,w.y-point.y)})).filter(w=>w.distance<=20).sort((a,b)=>a.distance-b.distance)[0];}
  private battles:{id:string;x:number;y:number;armies:string[];losses:Record<string,number>}[]=[];
  private battleWidgets:{ids:string[];bar:Graphics;r:number;pixel:number;text?:Text}[]=[];
  private siegeWidgets:{id:string;bar:Graphics;text:Text;x:number;y:number;pixel:number;percent:number}[]=[];
  siegePositions(){const p=this.projection;return this.siegeWidgets.map(w=>({id:w.id,percent:w.percent,x:w.x*p.zoom+p.x,y:w.y*p.zoom+p.y}));}
  updateOccupation(state:OccupationState){for(const w of this.siegeWidgets){const s=state.sieges.find(s=>s.provinceId===w.id);if(!s)continue;w.percent=(1-s.resistance/s.maximum)*100;w.bar.clear().roundRect(-22*w.pixel,0,44*w.pixel,5*w.pixel,2*w.pixel).fill(0x293931).rect(-22*w.pixel,0,44*w.pixel*w.percent/100,5*w.pixel).fill(0xf4c16a);w.text.text='围攻 '+w.percent.toFixed(0)+'%';}}
  battlePositions(){return this.battles;}
  updateBattles(world:World,state:BattleState){
    this.feedback.observe(state,performance.now());
    const armies=new Map(world.armies.map(a=>[a.id,a]));
    for(const widget of this.battleWidgets){const e=state.engagements.find(e=>e.armies.includes(widget.ids[0]));if(!e)continue;const strength=widget.ids.reduce((s,id)=>s+(armies.get(id)?.troops??0),0),loss=widget.ids.reduce((s,id)=>s+(e.losses[id]??0),0),{bar,r,pixel}=widget;bar.clear().rect(-(r+1)*pixel,(r+3)*pixel,(r+1)*2*pixel,2*pixel).fill(0x26332d).rect(-(r+1)*pixel,(r+3)*pixel,(r+1)*2*pixel*strength/Math.max(1,strength+loss),2*pixel).fill(0xd5dfa1);if(widget.text)widget.text.text=String(strength);}
    for(const b of this.battles){const e=state.engagements.find(e=>e.id===b.id);if(e)b.losses=e.losses;}
  }
  capitalPositions(){return this.capitals;}
  animateBattles(now:number,running:boolean,reduced:boolean){const changed=this.battleClock.step(now,running,reduced);for(const {id,sprite} of this.battleSprites)sprite.texture=this.battleTextures[this.battleClock.frame(id)];for(const hit of this.impacts){const t=this.feedback.strength(hit.id,now,running,reduced);hit.graphic.alpha=t;hit.graphic.scale.set(1+(1-t)*.65);}const arrows=this.orderMotion.step(now,running,reduced);if(arrows)for(const a of this.arrowWidgets){a.graphic.clear();drawAttackArrow(a.graphic,a.points,a.pixel,a.color,false,this.orderMotion.growth(a.id));}const sinking=this.sinkMotion.step(now,reduced);if(sinking)this.drawSinking();return changed&&this.battleSprites.length>0||this.feedback.active(now,running,reduced)||arrows&&this.arrowWidgets.length>0||sinking;}
  private drawSinking(){const g=this.sinkingLayer;if(!g)return;g.clear();const p=this.projection;for(const f of this.sinkMotion.frames()){const x=f.point.x/p.scale,y=f.point.y/p.scale+f.drop/p.zoom;if(x*p.zoom+p.x<-30||y*p.zoom+p.y<-30||x*p.zoom+p.x>p.width+30||y*p.zoom+p.y>p.height+30)continue;const r=f.radius*f.scale/p.zoom,point=(a:number,b:number)=>[x+(a*Math.cos(f.rotation)-b*Math.sin(f.rotation))*r,y+(a*Math.sin(f.rotation)+b*Math.cos(f.rotation))*r];g.poly([...point(-1,0),...point(1,0),...point(.5,.5),...point(-.5,.5)]).fill({color:f.color,alpha:f.alpha}).stroke({color:0xe2f0e8,width:1/p.zoom,alpha:f.alpha});const a=point(0,0),b=point(0,-1),c=point(.7,-.35),d=point(0,-.35);g.moveTo(a[0],a[1]).lineTo(b[0],b[1]).lineTo(c[0],c[1]).lineTo(d[0],d[1]).stroke({color:0xf4f2d9,width:1/p.zoom,alpha:f.alpha});}}
  orderAnimations(){return this.arrowWidgets.map(a=>({id:a.id,growth:this.orderMotion.growth(a.id)}));}
  sinkDiagnostics(){return this.sinkMotion.diagnostics();}
  sinkAnimations(){return this.sinkMotion.frames().map(f=>({id:f.id,scale:f.scale,alpha:f.alpha,rotation:f.rotation}));}
  battleAnimations(){return this.battleSprites.map(({id,sprite})=>({id,frame:Math.round(sprite.texture.frame.x/258)+Math.round(sprite.texture.frame.y/194)*5,x:sprite.x*this.projection.zoom+this.projection.x,y:sprite.y*this.projection.zoom+this.projection.y,width:sprite.width*this.projection.zoom}));}
  unitPositions(){const p=this.projection;return [...this.unitGroups.map(g=>({id:g.ids[0],ids:g.ids,kind:'army',display:g.display,x:g.container.x*p.zoom+p.x,y:g.container.y*p.zoom+p.y})),...(this.shipLayer?.positions()??[]).map(s=>({id:s.id,ids:[s.id],kind:'fleet',x:s.x*p.zoom+p.x,y:s.y*p.zoom+p.y}))];}
  pickUnits(point:Point){return this.unitPositions().map(p=>({...p,distance:Math.hypot(p.x-point.x,p.y-point.y)})).filter(p=>p.distance<=(p.kind==='army'?22:18)).sort((a,b)=>a.distance-b.distance);}
  updateUnits(frame:DisplayFrame){
    const p=this.projection;
    for(const g of this.unitGroups){const points=g.ids.flatMap(id=>frame.armies.has(id)?[frame.armies.get(id)!]:[]);if(!points.length)continue;g.container.position.set(points.reduce((s,v)=>s+v.x,0)/points.length/p.scale+g.offset.x,points.reduce((s,v)=>s+v.y,0)/points.length/p.scale+g.offset.y);const x=g.container.x*p.zoom+p.x,y=g.container.y*p.zoom+p.y;g.container.visible=x>=-30&&y>=-30&&x<=p.width+30&&y<=p.height+30;}
    this.shipLayer?.update(frame.fleets);
    this.sinkMotion.move(frame.fleets);
    for(const effect of this.battleSprites){if(!effect.fleets)continue;const a=frame.fleets.get(effect.fleets[0]),b=frame.fleets.get(effect.fleets[1]);if(a&&b)effect.sprite.position.set((a.x+b.x)/2/p.scale,(a.y+b.y)/2/p.scale);}
  }
  constructor(refresh=()=>{}){for(const [key,url] of Object.entries(icons)){const img=new Image();img.onload=()=>{if(this.disposed)return;this.textures.set(key as UnitKey,Texture.from(img));refresh();};img.src=url;}const img=new Image();img.onload=()=>{if(this.disposed)return;this.battleAtlas=Texture.from(img);this.battleTextures=Array.from({length:40},(_,i)=>new Texture({source:this.battleAtlas!.source,frame:new Rectangle(i%5*258,Math.floor(i/5)*194,258,194)}));refresh();};img.src=battleAtlasUrl;}
  dispose(){this.disposed=true;for(const texture of this.textures.values())texture.destroy(true);this.textures.clear();for(const texture of this.battleTextures)texture.destroy(false);this.battleTextures=[];this.battleAtlas?.destroy(true);}

  private politicalGraphic=new Graphics();
  private politicalGeometry?:object;
  private politicalKey='';
  private politicalBuilds=0;
  politicalDiagnostics(){return {builds:this.politicalBuilds};}
  private territoryKey='';
  private territories:TerritoryLabel[]=[];
  labelPositions(){return this.territories.map(({nationId,componentId,provinceIds,point,angle,length,height})=>({nationId,componentId,provinceIds,...point,angle,length,height}));}
  draw(world: World, scale: number, zoom: number, selected: string | null, armyId: string | null, mode:PoliticalView='political',units?:UnitAssignments,view?:{camera:{x:number;y:number};viewport:{width:number;height:number}},naval?:NavalView,frame?:DisplayFrame,combat?:{state:BattleState;preview:string[];occupation?:OccupationState},selectedWars:readonly string[]=[],runId=world.custom?.id??'',geometry?:object,reorganizing:Record<string,number>={}): void {
    if(this.presentationRun!==runId){this.presentationRun=runId;this.orderMotion=new OrderMotion();this.sinkMotion=new SinkMotion();this.battleClock=new BattleAnimationClock();this.feedback=new BattleFeedback();}
    for (const child of this.layer.removeChildren()) if(child!==this.politicalGraphic)child.destroy({ children: true });
    this.unitGroups=[];this.reorganizationWidgets=[];this.battleWidgets=[];this.siegeWidgets=[];this.impacts=[];this.battleSprites=[];this.arrowWidgets=[];this.shipLayer=undefined;this.projection={scale,zoom,x:view?.camera.x??0,y:view?.camera.y??0,width:view?.viewport.width??1280,height:view?.viewport.height??720};
    const detail=warDetail(world,scale,zoom),sites=warSites(world,combat?.state,combat?.occupation,naval);
    this.wars=warMarkers(world,sites,naval,scale,{x:this.projection.x,y:this.projection.y,scale:zoom},{width:this.projection.width,height:this.projection.height},selectedWars);
    this.capitals=world.nations.flatMap(n=>{const c=currentCapital(world,n.id);return c?[{nationId:n.id,cityId:c.id,name:c.name,point:c.position}]:[];});
    const g = this.politicalGraphic, marks = new Graphics(); this.layer.addChild(g, marks);
    const nations = new Map(world.nations.map(n => [n.id, n])), provinces = new Map(world.provinces.map(p => [p.id, p]));
    const pixel = 1 / zoom, style=politicalStyle(mode);
    const territoryKey=`${world.custom?.id}/${world.provinces.map(p=>`${p.id}:${p.controller}`).join('|')}`;
    if(territoryKey!==this.territoryKey){this.territoryKey=territoryKey;this.territories=territoryLabels(world);}
    // Preserve the tessellated political surface while only units/events change.
    // Complete Worker replies replace geometry; ownership, color, selection,
    // zoom and mode independently invalidate the cached display.
    const politicalKey=JSON.stringify([runId,scale,zoom,mode,selected,world.provinces.map(p=>[p.id,p.controller]),world.nations.map(n=>[n.id,nationColor(n)])]);
    if(!geometry||geometry!==this.politicalGeometry||politicalKey!==this.politicalKey){
    g.clear();this.politicalGeometry=geometry;this.politicalKey=politicalKey;this.politicalBuilds++;
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
    }
    const label = (text: string, x: number, y: number, size: number, color = '#f9f1d4',parent=this.layer) => {
      const t = new Text({ text, style: { fontFamily: 'Georgia, serif', fontSize: size, fill: color, fontWeight: 'bold', stroke: { color: '#263d40', width: 3 } } });
      t.anchor.set(.5, 1); t.scale.set(pixel); t.position.set(x, y); parent.addChild(t);return t;
    };
    if(combat?.occupation){for(const siege of combat.occupation.sieges){if(detail!=='local'&&!selectedWars.includes(`siege:${siege.provinceId}`))continue;const p=provinces.get(siege.provinceId)!;
      // A progress marker is not a fictitious cell-level ownership front.
      marks.poly(p.polygon.flatMap(v=>[v.x/scale,v.y/scale])).stroke({color:0xe2b568,width:1.7*pixel,alpha:.85});
      const group=new Container(),x=p.center.x/scale,y=p.center.y/scale+28*pixel;group.position.set(x,y);this.layer.addChild(group);
      const bar=new Graphics();group.addChild(bar);const text=label('',0,0,10,'#ffdf9c',group);text.position.y=-2*pixel;
      this.siegeWidgets.push({id:p.id,bar,text,x,y,pixel,percent:0});
    }this.updateOccupation(combat.occupation);}
    const capitalIcons=this.capitals.map(c=>({cityId:c.cityId,x:c.point.x/scale*zoom+this.projection.x,y:c.point.y/scale*zoom+this.projection.y,width:22,height:22})),countryBoxes:LabelBox[]=[];
    const countryLabels=this.territories.map(territory=>{
      const n=nations.get(territory.nationId)!,point=territory.point,factor=zoom/scale;
      const t=new Text({text:n.name,style:{fontFamily:'Georgia, "Microsoft YaHei", serif',fontSize:26,fill:'#263a30',fontWeight:'500',stroke:{color:'#fffae5',width:1.6},letterSpacing:2.4}});
      // Fit the measured glyphs in the world-space band, then cap readability.
      // Tiny enclaves keep their name at their true anchor; zoom reveals it.
      const textScale=Math.max(0,Math.min(1,territory.length*factor/Math.max(1,t.width),territory.height*factor/Math.max(1,t.height))),size=26*textScale;
      const width=t.width*textScale,height=t.height*textScale,c=Math.abs(Math.cos(territory.angle)),s=Math.abs(Math.sin(territory.angle));
      const box={x:point.x*factor+this.projection.x,y:point.y*factor+this.projection.y,width:width*c+height*s,height:width*s+height*c};countryBoxes.push(box);
      t.anchor.set(.5);t.scale.set(pixel*textScale);t.rotation=territory.angle;t.position.set(point.x/scale,point.y/scale);t.alpha=mode==='political'?.94:.7;this.layer.addChild(t);
      return {point,size,width:box.width};
    });
    this.cities=[];
    for (const city of world.cities) {
      const capital = this.capitals.some(c=>c.cityId===city.id), x = city.position.x / scale, y = city.position.y / scale;
      this.cities.push({id:city.id,provinceId:city.provinceId,name:city.name,x:x*zoom+this.projection.x,y:y*zoom+this.projection.y,capital,label:false});
      if(!capital)marks.circle(x, y, (detail==='overview'?1:1.6) * pixel).fill(0xf0e5cc).stroke({width:.65*pixel,color:0x38453e});
    }
    const capitalFont=detail==='overview'?13:15;
    const capitalText=capitalNameLabels(this.cities.filter(c=>c.capital&&c.provinceId!==selected).map(c=>({...c,selected:false})),capitalFont,[...countryBoxes,...capitalIcons],this.projection,false);
    const cityObstacles=[
      ...countryBoxes,...capitalIcons,...capitalText
    ];
    const cityText=cityLabels(this.cities.filter(c=>!c.capital&&c.provinceId!==selected).map(c=>({...c,selected:false})),cityObstacles,this.projection,detail==='overview');
    this.labelLayout={detail,countries:countryBoxes,capitals:capitalText.map(({x,y,width,height})=>({x,y,width,height})),towns:cityText.map(c=>({id:c.id,x:c.labelX,y:c.labelY}))};
    for(const c of cityText){label(c.name,(c.labelX-this.projection.x)/zoom,(c.labelY-this.projection.y)/zoom,9);this.cities.find(v=>v.id===c.id)!.label=true;}
    // Near view resolves actual local names. A countryside province is not
    // presented as an invented city merely to fill the map with settlements.
    const cityProvinces=new Set(world.cities.map(c=>c.provinceId));
    for(const p of world.provinces){
      if(detail!=='local'&&p.id!==selected)continue;
      if(cityProvinces.has(p.id))continue;
      const area=Math.abs(p.polygon.reduce((sum,a,i)=>{const b=p.polygon[(i+1)%p.polygon.length];return sum+a.x*b.y-b.x*a.y;},0))/2;
      if(area*(zoom/scale)**2<2400&&p.id!==selected)continue;
      const x=p.center.x/scale,y=p.center.y/scale;
      if(this.wars.some(w=>Math.hypot(w.x-(x*zoom+this.projection.x),w.y-(y*zoom+this.projection.y))<30))continue;
      if(countryLabels.some(c=>Math.abs(c.point.x-p.center.x)/scale*zoom<(c.width+p.name.length*10)/2&&Math.abs(c.point.y-p.center.y)/scale*zoom<c.size+14))continue;
      label(p.name,x,y-5*pixel,10,'#e2e9cb');
    }
    const byArmy=new Map(world.armies.map(a=>[a.id,a]));
    this.battles=(combat?.state.engagements??[]).map(e=>{const p=engagementPoint(world,e);return {id:e.id,x:p.x/scale*zoom+this.projection.x,y:p.y/scale*zoom+this.projection.y,armies:e.armies,losses:e.losses};});
    const directions=new Graphics();this.layer.addChild(directions);
    this.orderMotion.sync(world.armies.filter(a=>a.status!=='destroyed'&&(a.route.length||combat?.state.plans[a.id])).map(a=>({id:a.id,route:combat?.state.plans[a.id]?.path??[a.provinceId,...a.route]})));
    const perTarget=new Map<string,number>();let arrows=0;
    for(const a of world.armies){
      const plan=combat?.state.plans[a.id],preview=a.id===armyId&&combat?.preview.length?combat.preview:undefined;
      const route=preview?preview.slice(1):plan?plan.path.slice(plan.path.indexOf(a.provinceId)+1):a.route;
      if(!route.length||a.status==='destroyed')continue;
      const points=[frame?.armies.get(a.id)??armyPosition(world,a),...route.map(id=>provinces.get(id)!.center)].map(p=>({x:p.x/scale,y:p.y/scale}));
      const active=a.id===armyId,key=`${a.nationId}/${route.at(-1)}`,foreign=provinces.get(route.at(-1)!)!.controller!==a.nationId;
      if(active){directions.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))directions.lineTo(p.x,p.y);directions.stroke({color:preview?0xffffff:0xffecc0,width:1.5*pixel,alpha:.8});for(const id of plan?.targets??[]){const p=provinces.get(id)!.center;directions.circle(p.x/scale,p.y/scale,3*pixel).stroke({color:0xfff2c9,width:pixel});}}
      if(combat&&(active||(detail!=='overview'&&foreign&&a.status==='marching'&&(perTarget.get(key)??0)<2&&arrows<(detail==='regional'?6:14)))){const color=preview?0xfff0b0:nationColor(nations.get(a.nationId)!);if(preview)drawAttackArrow(directions,points,pixel,color,true);else{const graphic=new Graphics();this.layer.addChild(graphic);this.arrowWidgets.push({id:a.id,graphic,points,pixel,color});drawAttackArrow(graphic,points,pixel,color,false,this.orderMotion.growth(a.id));}perTarget.set(key,(perTarget.get(key)??0)+1);arrows++;}
    }
    for (const marker of armyMarkers(world,scale,{x:0,y:0,scale:zoom},armyId,frame?.armies)) {
      const army=byArmy.get(marker.ids[0])!,active=marker.ids.includes(armyId??'');
      const battle=combat?.state.engagements.find(e=>e.armies.includes(army.id));
      const force=marker.ids.reduce((sum,id)=>sum+(byArmy.get(id)?.troops??0),0);
      if(detail==='overview'&&!active){
        // Far-view aggregation must not turn many small formations into a
        // large numbered flag. Keep every group pickable as a moving point.
        const container=new Container(),dot=new Graphics(),points=marker.ids.map(id=>frame?.armies.get(id)??armyPosition(world,byArmy.get(id)!)),point={x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length};
        dot.circle(0,0,1.65*pixel).fill(nationColor(nations.get(army.nationId)!)).stroke({color:0xeee8c8,width:.55*pixel});
        container.addChild(dot);container.position.set(point.x/scale,point.y/scale);this.layer.addChild(container);
        this.unitGroups.push({ids:marker.ids,container,offset:{x:0,y:0},display:'dot'});continue;
      }
      if(battle){const sides=[...new Set(battle.armies.map(id=>byArmy.get(id)!.nationId))].sort(),side=sides.indexOf(army.nationId),angle=Math.PI+side*2*Math.PI/sides.length;marker.x+=Math.cos(angle)*17;marker.y+=Math.sin(angle)*17-8;}
      const container=new Container(),marks=new Graphics();container.addChild(marks);this.layer.addChild(container);container.position.set(marker.x/zoom,marker.y/zoom);
      const points=marker.ids.map(id=>frame?.armies.get(id)??armyPosition(world,byArmy.get(id)!));
      this.unitGroups.push({ids:marker.ids,container,display:'detail',offset:{x:marker.x/zoom-points.reduce((s,p)=>s+p.x,0)/points.length/scale,y:marker.y/zoom-points.reduce((s,p)=>s+p.y,0)/points.length/scale}});
      // Marker size reflects real soldiers in this unit/group, not an invented hierarchy.
      // The independent 22px picking radius still makes small units easy to select.
      const x=0,y=0,r=(force>=12000?8:force>=5000?6.5:5)+(active?2:marker.near?0:-1.5);
      const unit=units?unitProfile(units[army.id]):undefined,texture=unit&&this.textures.get(unit.key);
      if(active)marks.circle(x,y,(r+3)*pixel).fill({color:0x263931,alpha:.35}).stroke({color:0xffe6a6,width:1.5*pixel});
      marks.roundRect(-r*pixel,(r-1)*pixel,2*r*pixel,3*pixel,pixel).fill(nationColor(nations.get(army.nationId)!)).stroke({color:0x263931,width:.65*pixel});
      if(marker.ids.length>1)label(String(marker.ids.length),x,y+5*pixel,9,'#f9f1d4',container);
      else if((marker.near||active)&&texture){const sprite=new Sprite(texture);sprite.anchor.set(.5);sprite.width=(r*2-3)*pixel;sprite.height=(r*2-3)*pixel;sprite.position.set(x,y);container.addChild(sprite);}
      else marks.moveTo(x-2*pixel,y+3*pixel).lineTo(x-2*pixel,y-3*pixel).lineTo(x+3*pixel,y-1*pixel).stroke({color:0xfff3d4,width:pixel});
      const strengthText=active?label(String(army.troops),x,y+24*pixel,10,'#f9f1d4',container):undefined;
      if(reorganizing[army.id]&&(active||marker.near)&&marker.ids.length===1){const bar=new Graphics();container.addChild(bar);this.reorganizationWidgets.push({id:army.id,bar,pixel,r,full:reorganizing[army.id],text:strengthText});}
      if(battle){const bar=new Graphics();container.addChild(bar);this.battleWidgets.push({ids:marker.ids,bar,r,pixel,text:strengthText});}
      if((army.status==='marching'||army.status==='retreating')&&army.route.length){const from=provinces.get(army.provinceId)!.center,to=provinces.get(army.route[0])!.center,arrow=new Graphics();arrow.poly([(r+2)*pixel,-2*pixel,(r+6)*pixel,0,(r+2)*pixel,2*pixel]).fill(army.status==='retreating'?0xfacba0:0xfff8d6);arrow.rotation=Math.atan2(to.y-from.y,to.x-from.x);container.addChild(arrow);}
    }
    for(const e of combat?.state.engagements??[]){if(detail==='overview')continue;const p=engagementPoint(world,e),x=p.x/scale,y=p.y/scale,mark=new Graphics();this.layer.addChild(mark);mark.circle(x,y,5*pixel).fill({color:0x392c28,alpha:.8});mark.moveTo(x-3*pixel,y-3*pixel).lineTo(x+3*pixel,y+3*pixel).moveTo(x+3*pixel,y-3*pixel).lineTo(x-3*pixel,y+3*pixel).stroke({color:0xffe4b4,width:1.5*pixel});const impact=new Graphics();impact.position.set(x,y);impact.circle(0,0,7*pixel).stroke({color:0xffd69a,width:1.5*pixel});for(let i=0;i<6;i++){const a=i*Math.PI/3;impact.moveTo(Math.cos(a)*9*pixel,Math.sin(a)*9*pixel).lineTo(Math.cos(a)*13*pixel,Math.sin(a)*13*pixel).stroke({color:0xffe6b9,width:pixel});}impact.alpha=0;this.layer.addChild(impact);this.impacts.push({id:e.id,graphic:impact});}
    if(combat)this.updateBattles(world,combat.state);this.updateReorganization(world);
    if(naval){this.sinkMotion.sync(naval.navy.fleets.filter(f=>f.status!=='lost').map(f=>({id:f.id,point:frame?.fleets.get(f.id)??fleetPosition(naval.graph,f),color:nationColor(nations.get(f.nationId)!),radius:6})),naval.navy.fleets.filter(f=>f.status==='lost').map(f=>({id:f.id,point:fleetPosition(naval.graph,f),color:nationColor(nations.get(f.nationId)!),radius:6})));this.shipLayer=drawNavy(this.layer,world,scale,zoom,naval,frame?.fleets,detail==='overview');}this.sinkingLayer=new Graphics();this.layer.addChild(this.sinkingLayer);this.drawSinking();
    // The original BattleFxSystem uses the same battleSwordPrefab for land and sea.
    // Only authoritative live contacts create effects; frame changes never deal damage.
    const effects:{id:string;point:Point;fleets?:readonly [string,string]}[]=(combat?.state.engagements??[]).filter(e=>detail==='local'||selectedWars.includes(`field:${e.id}`)||e.armies.includes(armyId??'')).map(e=>({id:`land:${e.id}`,point:engagementPoint(world,e)}));
    for(const contact of naval?.maritime?.contacts??[]){const a=naval!.navy.fleets.find(f=>f.id===contact.a),b=naval!.navy.fleets.find(f=>f.id===contact.b);if(!a||!b)continue;const id=`sea:${[a.id,b.id].sort().join('/')}`;if(detail!=='local'&&!selectedWars.includes(id)&&naval?.selected!==a.id&&naval?.selected!==b.id)continue;const p=frame?.fleets.get(a.id)??fleetPosition(naval!.graph,a),q=frame?.fleets.get(b.id)??fleetPosition(naval!.graph,b);effects.push({id,point:{x:(p.x+q.x)/2,y:(p.y+q.y)/2},fleets:[a.id,b.id]});}
    this.battleClock.sync([...(combat?.state.engagements??[]).map(e=>`land:${e.id}`),...(naval?.maritime?.contacts??[]).map(c=>`sea:${[c.a,c.b].sort().join('/')}`)]);
    for(const effect of effects){const x=effect.point.x/scale,y=effect.point.y/scale,sx=x*zoom+this.projection.x,sy=y*zoom+this.projection.y;if(!this.battleTextures.length||this.battleSprites.length>=32||sx<-40||sy<-40||sx>this.projection.width+40||sy>this.projection.height+40)continue;const sprite=new Sprite(this.battleTextures[this.battleClock.frame(effect.id)]);sprite.anchor.set(.5);sprite.position.set(x,y);sprite.width=(zoom>1.2?42:zoom>.6?32:22)*pixel;sprite.height=sprite.width*194/258;this.layer.addChild(sprite);this.battleSprites.push({id:effect.id,sprite,fleets:effect.fleets});}
    for(const war of this.wars){const x=(war.x-this.projection.x)/zoom,y=(war.y-this.projection.y)/zoom,r=(detail==='local'?5:9)*pixel,mark=new Graphics();this.layer.addChild(mark);mark.circle(x,y,r).fill({color:0x49362a,alpha:.92}).stroke({color:war.selected?0xffefb9:0xd6b67a,width:(war.selected?2:1)*pixel});mark.moveTo(x-3*pixel,y-3*pixel).lineTo(x+3*pixel,y+3*pixel).moveTo(x+3*pixel,y-3*pixel).lineTo(x-3*pixel,y+3*pixel).stroke({color:0xffe9bd,width:1.3*pixel});if(detail!=='local')label(war.troops?`${(war.troops/1000).toFixed(1)}千`:`${war.ships}艘`,x,y+26*pixel,10);}
    // Original package's CityCapitalFinal: dark outer disc / white ring / dark
    // center. Keep capitals above terrain/country labels and ordinary cities.
    const capitalLayer=new Container();this.layer.addChild(capitalLayer);
    for(const capital of this.capitals){const x=capital.point.x/scale,y=capital.point.y/scale,icon=new Graphics();capitalLayer.addChild(icon);
      icon.circle(x,y,9*pixel).fill(0xf8f5e9).circle(x,y,8*pixel).fill(0x182623).circle(x,y,5.45*pixel).fill(0xfffced).circle(x,y,2.65*pixel).fill(0x182623);
    }
    for(const c of capitalText){const city=this.cities.find(v=>v.id===c.id)!;city.label=true;const x=(c.x-this.projection.x)/zoom,y=(c.y-this.projection.y)/zoom;
      const line=new Graphics();line.moveTo((city.x-this.projection.x)/zoom,(city.y-this.projection.y)/zoom).lineTo(x,y).stroke({color:0xeee8cd,width:.8*pixel,alpha:.6});capitalLayer.addChild(line);
      const name=new Text({text:c.name,style:{fontFamily:'Georgia, "Microsoft YaHei", serif',fontSize:capitalFont,fontWeight:'bold',fill:'#182623',stroke:{color:'#fff9e6',width:3}}});name.anchor.set(.5);name.scale.set(pixel);name.position.set(x,y);capitalLayer.addChild(name);
    }
    if(frame)this.updateUnits(frame);
    // Draw the one actively inspected small city above moving units and effects.
    // Its screen-space callout never moves the saved city or its hit location.
    this.cityCallout=undefined;
    const activeCity=this.cities.find(c=>c.provinceId===selected);
    if(activeCity){
      // The callout already leaves a gap around its own point. Reserving its
      // capital's padded icon box again rejected every nearby position.
      const selectedLabel=selectedCityLabel({...activeCity,selected:true},[...cityObstacles.filter(b=>!('cityId'in b&&b.cityId===activeCity.id)),...cityText.map(c=>({x:c.labelX,y:c.labelY-5,width:c.name.length*10+4,height:12})),...this.unitPositions().map(u=>{const dot='display'in u&&u.display==='dot';return{x:u.x,y:u.y+(dot?0:5),width:dot?6:32,height:dot?6:46};})],this.projection,this.uiObstacles);
      if(selectedLabel?.callout){
        const box=selectedLabel.callout,px=this.projection.x,py=this.projection.y,x=(box.x-px)/zoom,y=(box.y-py)/zoom,cx=(activeCity.x-px)/zoom,cy=(activeCity.y-py)/zoom;
        const endX=(Math.max(box.x-box.width/2,Math.min(box.x+box.width/2,activeCity.x))-px)/zoom,endY=(Math.max(box.y-box.height/2,Math.min(box.y+box.height/2,activeCity.y))-py)/zoom;
        const callout=new Graphics();this.layer.addChild(callout);
        callout.moveTo(cx,cy).lineTo(endX,endY).stroke({color:0xffedb6,width:2*pixel}).circle(cx,cy,4*pixel).stroke({color:0xffedb6,width:2*pixel});
        callout.roundRect(x-box.width/2*pixel,y-box.height/2*pixel,box.width*pixel,box.height*pixel,4*pixel).fill(0xeeeada).stroke({color:0x5f7051,width:pixel});
        const text=new Text({text:selectedLabel.lines!.join('\n'),style:{fontFamily:'Georgia, "Microsoft YaHei", serif',fontSize:12,lineHeight:16,fontWeight:'bold',fill:0x263a30,align:'center'}});text.anchor.set(.5);text.scale.set(pixel);text.position.set(x,y);this.layer.addChild(text);
        activeCity.label=true;this.cityCallout={...box,id:activeCity.id,provinceId:activeCity.provinceId,name:activeCity.name};
      }
    }
  }
}
