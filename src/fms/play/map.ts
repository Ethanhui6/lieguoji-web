import { Container, Graphics, Text, Texture, Sprite, Rectangle, type TextStyleOptions } from 'pixi.js';
import battleAtlasUrl from './assets/battle-sword.png';
import {BattleAnimationClock} from './battle-animation';
import {FallMotion,OrderMotion,SinkMotion,type FallenPose} from './order-motion';
import {fleetPosition} from './navy';
import icons from './military-icons.json';
import { unitProfile, type UnitAssignments, type UnitKey } from './military-profile';
import type { World, Point } from '../../sim/types';
import { armyPosition } from './navigation';
import { wanderPoint } from './army-wander47';
import { nationColor, politicalStyle, type PoliticalView } from './politics';
import { territoryLabels, type TerritoryLabel } from './territory-labels';
import type { ViewGroups47 } from './culture47-views';
import {autoFontSize47,cityLabel47,MAP_UNIT47,stateLabelBoxes47,type LabelGrid47,type StateLabelBox47} from './original-labels47';
import {MAP_FONT47,mapFontEpoch47,mapFontSettled47} from './map-font47';
import {currentCapital} from './capital-view';
import {selectedCityLabel,type LabelBox} from './city-labels';
import { drawNavy, type NavalView } from './naval-map';
import type { DisplayFrame } from './motion';
import {engagementPoint,type BattleState} from './battle';
import type {OccupationState} from './occupation';
import {drawAttackArrow} from './attack-map';
import {BattleFeedback} from './battle-feedback';
import {warDetail,warSites,warMarkers,type WarMarker,type WarDetail} from './war-view';
import {armyStrength47} from './army-strength47';
import {fmsStateLineColor,fmsStateOutlines,FMS_STATE_LINE_WIDTH} from '../state-line';
import {originalPoliticalOutlines,type OriginalPoliticalEdge} from '../original/original-political-edges';
import type {TacticsState} from './tactics-model';

/** One prefab local unit in map units: World.CreateCity sets localScale =
 * _burgCityLabelScale (1) x cityCircleScale (.23) x GetCityScale(type), where
 * Capital/HolyCity are 1.5 and Port/Fortress/City 1; 0.15 world per map unit. */
const ORIGINAL_CITY_UNIT=Math.fround(.23)/(240/1600);
const ORIGINAL_CAPITAL_UNIT=ORIGINAL_CITY_UNIT*1.5;
/** PortFinal/Harbor (child scale 2): black disc .4, shaft (0,-.36)-(0,-1.24)
 * and an arc r .69 at (0,-.683) from -2.5307 to -.6109 rad, both .3 thick,
 * white disc .15 on top. Unity y-up is flipped to map y-down. Its two small
 * Triangle flukes are not drawn: their rotation was not recovered. */
function originalPortIcon(g:Graphics,x:number,y:number){
  const k=ORIGINAL_CITY_UNIT*2,w=.3*k;
  g.circle(x,y,.4*k).fill(0x000000);
  g.moveTo(x,y+.36*k).lineTo(x,y+1.24*k).stroke({width:w,color:0x000000});
  const cy=y+.683*k,r=.69*k;g.moveTo(x+Math.cos(-2.5307)*r,cy-Math.sin(-2.5307)*r);
  for(let i=1;i<=24;i++){const a=-2.5307+(-.6109+2.5307)*i/24;g.lineTo(x+Math.cos(a)*r,cy-Math.sin(a)*r);}
  g.stroke({width:w,color:0x000000});
  g.circle(x,y,.15*k).fill(0xffffff);
}

export class PlayMap {
  readonly layer = new Container();
  private retainedLabels=new Map<string,Text>();
  private usedLabels=new Set<string>();
  private labelCreations=0;
  /** Country and city names live in one layer that is never cleared: Pixi v8 rebuilds a
   * text's texture whenever the text is re-attached, so detaching ~130 names on every redraw
   * re-uploaded all of them each simulation reply (most of the frame budget on phones). */
  private labelLayer=(()=>{const c=new Container();c.sortableChildren=true;return c;})();
  private keepLabel(t:Text,z:number){t.zIndex=z;if(t.parent!==this.labelLayer)this.labelLayer.addChild(t);t.visible=true;}
  textDiagnostics(){return {created:this.labelCreations,retained:this.retainedLabels.size};}
  private retainedText(key:string,text:string,style:TextStyleOptions,resolution=2){
    this.usedLabels.add(key);let label=this.retainedLabels.get(key);
    if(!label){label=new Text({text,style,resolution});this.retainedLabels.set(key,label);this.labelCreations++;}
    else if(label.text!==text)label.text=text;
    // Layout measures unscaled glyphs. A previous camera pose must not feed
    // back into the next territory fit or make its letters shrink repeatedly.
    label.scale.set(1);label.rotation=0;label.alpha=1;label.visible=true;return label;
  }
  private textures=new Map<UnitKey,Texture>();
  private disposed=false;
  private feedback=new BattleFeedback();
  private battleClock=new BattleAnimationClock();
  private orderMotion=new OrderMotion();
  private sinkMotion=new SinkMotion();
  private fallMotion=new FallMotion();
  private fallLayer?:Container;
  private presentationRun='';
  private arrowWidgets:{id:string;graphic:Graphics;points:Point[];pixel:number;color:string|number;actual?:boolean}[]=[];
  private sinkingLayer?:Graphics;
  private battleAtlas?:Texture;
  private battleTextures:Texture[]=[];
  private battleSprites:{id:string;sprite:Sprite;fleets?:readonly [string,string]}[]=[];
  private impacts:{id:string;graphic:Graphics}[]=[];
  private reorganizationWidgets:{id:string;bar:Graphics;pixel:number;r:number;full:number;text?:Text}[]=[];
  updateReorganization(world:World){for(const v of this.reorganizationWidgets){const a=world.armies.find(a=>a.id===v.id);if(!a)continue;v.bar.clear().rect(-v.r*v.pixel,-(v.r+5)*v.pixel,2*v.r*v.pixel,2*v.pixel).fill(0x26332d).rect(-v.r*v.pixel,-(v.r+5)*v.pixel,2*v.r*v.pixel*Math.min(1,a.troops/v.full),2*v.pixel).fill(0xf0ce7b);if(v.text)v.text.text=`重编 ${a.troops}`;}}
  private unitGroups:{ids:string[];container:Container;offset:Point;display:'dot'|'detail';strength?:ReturnType<typeof armyStrength47>}[]=[];
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
  updateOccupation(state:OccupationState){for(const w of this.siegeWidgets){const s=state.sieges.find(s=>s.provinceId===w.id);if(!s)continue;w.percent=(1-s.resistance/s.maximum)*100;w.bar.clear().roundRect(-22*w.pixel,0,44*w.pixel,5*w.pixel,2*w.pixel).fill(0x293931).rect(-22*w.pixel,0,44*w.pixel*w.percent/100,5*w.pixel).fill(0xf4c16a);const t='围攻 '+w.percent.toFixed(0)+'%';if(w.text.text!==t)w.text.text=t;}}
  battlePositions(){return this.battles;}
  updateBattles(world:World,state:BattleState){
    this.feedback.observe(state,performance.now());
    const armies=new Map(world.armies.map(a=>[a.id,a]));
    for(const widget of this.battleWidgets){const e=state.engagements.find(e=>e.armies.includes(widget.ids[0]));if(!e)continue;const strength=widget.ids.reduce((s,id)=>s+(armies.get(id)?.troops??0),0),loss=widget.ids.reduce((s,id)=>s+(e.losses[id]??0),0),{bar,r,pixel}=widget;bar.clear().rect(-(r+1)*pixel,(r+3)*pixel,(r+1)*2*pixel,2*pixel).fill(0x26332d).rect(-(r+1)*pixel,(r+3)*pixel,(r+1)*2*pixel*strength/Math.max(1,strength+loss),2*pixel).fill(0xd5dfa1);if(widget.text)widget.text.text=String(strength);}
    for(const b of this.battles){const e=state.engagements.find(e=>e.id===b.id);if(e)b.losses=e.losses;}
  }
  capitalPositions(){return this.capitals;}
  animateBattles(now:number,running:boolean,reduced:boolean){const changed=this.battleClock.step(now,running,reduced);for(const {id,sprite} of this.battleSprites)sprite.texture=this.battleTextures[this.battleClock.frame(id)];for(const hit of this.impacts){const t=this.feedback.strength(hit.id,now,running,reduced);hit.graphic.alpha=t;hit.graphic.scale.set(1+(1-t)*.65);}const arrows=this.orderMotion.step(now,running,reduced);if(arrows)for(const a of this.arrowWidgets){a.graphic.clear();drawAttackArrow(a.graphic,a.points,a.pixel,a.color,false,a.actual?1:this.orderMotion.growth(a.id));}const sinking=this.sinkMotion.step(now,reduced);if(sinking)this.drawSinking();return changed&&this.battleSprites.length>0||this.feedback.active(now,running,reduced)||arrows&&this.arrowWidgets.length>0||sinking;}
  /** Fleet sinking and army falling ghosts; true while one is still animating. */
  animateGhosts(now:number,reduced:boolean){const sinking=this.sinkMotion.step(now,reduced);if(sinking)this.drawSinking();const falling=this.fallMotion.step(now,reduced);if(falling)this.drawFalling(now);return sinking||falling;}
  private drawFalling(now:number){const layer=this.fallLayer;if(!layer||layer.destroyed)return;for(const c of layer.removeChildren())c.destroy();
    for(const f of this.fallMotion.frames(now)){const texture=this.textures.get(f.texture as Parameters<typeof this.textures.get>[0]);
      const dust=new Graphics();dust.ellipse(f.x,f.y+f.size*.32,f.size*(.35+.55*f.dust),f.size*(.12+.16*f.dust)).fill({color:0x5a4a34,alpha:.28*(1-f.dust)});layer.addChild(dust);
      if(!texture)continue;const s=new Sprite(texture);s.anchor.set(.5,.9);s.position.set(f.x,f.y+f.size*.4+f.drop);s.width=s.height=f.size*f.scale;s.rotation=f.rotation;s.alpha=f.alpha;s.tint=f.tint;layer.addChild(s);}
  }
  private drawSinking(){const g=this.sinkingLayer;if(!g)return;g.clear();const p=this.projection;for(const f of this.sinkMotion.frames()){const x=f.point.x/p.scale,y=f.point.y/p.scale+f.drop/p.zoom;if(x*p.zoom+p.x<-30||y*p.zoom+p.y<-30||x*p.zoom+p.x>p.width+30||y*p.zoom+p.y>p.height+30)continue;const r=f.radius*f.scale/p.zoom,point=(a:number,b:number)=>[x+(a*Math.cos(f.rotation)-b*Math.sin(f.rotation))*r,y+(a*Math.sin(f.rotation)+b*Math.cos(f.rotation))*r];g.poly([...point(-1,0),...point(1,0),...point(.5,.5),...point(-.5,.5)]).fill({color:f.color,alpha:f.alpha}).stroke({color:0xe2f0e8,width:1/p.zoom,alpha:f.alpha});const a=point(0,0),b=point(0,-1),c=point(.7,-.35),d=point(0,-.35);g.moveTo(a[0],a[1]).lineTo(b[0],b[1]).lineTo(c[0],c[1]).lineTo(d[0],d[1]).stroke({color:0xf4f2d9,width:1/p.zoom,alpha:f.alpha});}}
  orderAnimations(){return this.arrowWidgets.map(a=>({id:a.id,growth:a.actual?1:this.orderMotion.growth(a.id)}));}
  drawActualAttackArrows(routes:{id:string;points:Point[];color:string;key:string}[],scale:number,zoom:number){
    const perTarget=new Map<string,number>(),pixel=1/zoom;

    for(const r of routes){
      if(this.arrowWidgets.length>=12||(perTarget.get(r.key)??0)>=2)continue;
      const points=r.points.map(p=>({x:p.x/scale,y:p.y/scale}));
      if(points.length<2||Math.hypot(points.at(-1)!.x-points[0].x,points.at(-1)!.y-points[0].y)<12*pixel)continue;
      const graphic=new Graphics();this.layer.addChild(graphic);
      this.arrowWidgets.push({id:r.id,graphic,points,pixel,color:r.color,actual:true});
      drawAttackArrow(graphic,points,pixel,r.color,false,1);
      perTarget.set(r.key,(perTarget.get(r.key)??0)+1);
    }
  }
  sinkDiagnostics(){return this.sinkMotion.diagnostics();}
  sinkAnimations(){return this.sinkMotion.frames().map(f=>({id:f.id,scale:f.scale,alpha:f.alpha,rotation:f.rotation}));}
  battleAnimations(){return this.battleSprites.map(({id,sprite})=>({id,frame:Math.round(sprite.texture.frame.x/258)+Math.round(sprite.texture.frame.y/194)*5,x:sprite.x*this.projection.zoom+this.projection.x,y:sprite.y*this.projection.zoom+this.projection.y,width:sprite.width*this.projection.zoom}));}
  unitPositions(){const p=this.projection;return [...this.unitGroups.map(g=>({id:g.ids[0],ids:g.ids,kind:'army',display:g.display,strength:g.strength,x:g.container.x*p.zoom+p.x,y:g.container.y*p.zoom+p.y})),...(this.shipLayer?.positions()??[]).map(s=>({id:s.id,ids:[s.id],kind:'fleet',x:s.x*p.zoom+p.x,y:s.y*p.zoom+p.y}))];}
  /** Icon centers after collision layout, in the same world coordinates as
   * the contact overlay. Use these after updateUnits, including camera changes. */
  displayForcePoints(frame?:DisplayFrame){const p=this.projection,points=new Map<string,Point>();if(frame){for(const [id,point]of frame.armies)points.set(JSON.stringify(['army',id]),point);for(const [id,point]of frame.fleets)points.set(JSON.stringify(['fleet',id]),point);}for(const g of this.unitGroups)for(const id of g.ids)points.set(JSON.stringify(['army',id]),{x:g.container.x*p.scale,y:g.container.y*p.scale});for(const s of this.shipLayer?.positions()??[])points.set(JSON.stringify(['fleet',s.id]),{x:s.x*p.scale,y:s.y*p.scale});return points;}
  pickUnits(point:Point){return this.unitPositions().map(p=>({...p,distance:Math.hypot(p.x-point.x,p.y-point.y)})).filter(p=>p.distance<=(p.kind==='army'?22:18)).sort((a,b)=>a.distance-b.distance);}
  updatePortControl(controls:NavalView['portControl']){this.shipLayer?.updatePorts(controls);}
  updateUnits(frame:DisplayFrame){
    const p=this.projection;
    for(const a of this.arrowWidgets){const at=frame.armies.get(a.id);if(!at)continue;a.points[0]={x:at.x/p.scale,y:at.y/p.scale};a.graphic.clear();drawAttackArrow(a.graphic,a.points,a.pixel,a.color,false,a.actual?1:this.orderMotion.growth(a.id));}
    for(const g of this.unitGroups){const points=g.ids.flatMap(id=>frame.armies.has(id)?[frame.armies.get(id)!]:[]);if(!points.length)continue;g.container.position.set(points.reduce((s,v)=>s+v.x,0)/points.length/p.scale+g.offset.x,points.reduce((s,v)=>s+v.y,0)/points.length/p.scale+g.offset.y);const x=g.container.x*p.zoom+p.x,y=g.container.y*p.zoom+p.y;g.container.visible=x>=-30&&y>=-30&&x<=p.width+30&&y<=p.height+30;}
    this.shipLayer?.update(frame.fleets);
    this.sinkMotion.move(frame.fleets);
    for(const effect of this.battleSprites){if(!effect.fleets)continue;const a=frame.fleets.get(effect.fleets[0]),b=frame.fleets.get(effect.fleets[1]);if(a&&b)effect.sprite.position.set((a.x+b.x)/2/p.scale,(a.y+b.y)/2/p.scale);}
  }
  constructor(refresh=()=>{},legacyBattleEffects=true){for(const [key,url] of Object.entries(icons)){const img=new Image();img.onload=()=>{if(this.disposed)return;this.textures.set(key as UnitKey,Texture.from(img));refresh();};img.src=url;}if(!legacyBattleEffects)return;const img=new Image();img.onload=()=>{if(this.disposed)return;this.battleAtlas=Texture.from(img);this.battleTextures=Array.from({length:40},(_,i)=>new Texture({source:this.battleAtlas!.source,frame:new Rectangle(i%5*258,Math.floor(i/5)*194,258,194)}));refresh();};img.src=battleAtlasUrl;}
  dispose(){this.disposed=true;this.coastGraphic.destroy();for(const text of this.retainedLabels.values()){text.removeFromParent();text.destroy();}this.retainedLabels.clear();for(const texture of this.textures.values())texture.destroy(true);this.textures.clear();for(const texture of this.battleTextures)texture.destroy(false);this.battleTextures=[];this.battleAtlas?.destroy(true);}

  private politicalGraphic=new Graphics();
  // Recovered StateLineRenderer coastline: ink over the political fill, under
  // marks, labels and forces. Display only; it never decides picking or land.
  private coastGraphic=new Graphics();
  private coastPoints=0;
  setCoastline(lines:readonly (readonly (readonly [number,number])[])[],width:number,color:number){
    const g=this.coastGraphic.clear();this.coastPoints=0;
    for(const line of lines){if(line.length<2)continue;g.moveTo(line[0][0],line[0][1]);for(let i=1;i<line.length;i++)g.lineTo(line[i][0],line[i][1]);this.coastPoints+=line.length;}
    if(this.coastPoints)g.stroke({width,color,join:'round',cap:'round'});
  }
  // Recovered StateLineRenderer state outlines, opt-in for the culture world.
  private originalStateLines=false;
  private stateOutlineKey='';
  private stateOutlines=new Map<string,[number,number][][]>();
  // Original Shapes city prefabs (sharedassets0 CityMain/CityCapitalFinal):
  // filled Discs at prefab scale 0.23 world units, 0.15 world units per map unit.
  private originalIcons=false;
  useOriginalIcons(enabled:boolean){this.originalIcons=enabled;}
  private originalPorts=new Set<string>();
  setOriginalPorts(ids:ReadonlySet<string>){this.originalPorts=new Set(ids);}
  private iconCounts={cities:0,ports:0,capitals:0,portCities:0};
  iconDiagnostics(){return {original:this.originalIcons,...this.iconCounts};}
  useOriginalStateLines(enabled:boolean){this.originalStateLines=enabled;this.politicalKey='';}
  // The original colors states per Voronoi cell in the terrain renderer; the
  // province polygons then only carry outlines, borders and selection.
  private cellPolitics=false;
  private cellEdges:readonly OriginalPoliticalEdge[]|null=null;
  private labelGrid:{grid:LabelGrid47;owners:ArrayLike<number>}|null=null;private stateBoxes:{key:string;boxes:StateLabelBox47[]}|null=null;
  /** Original grid and cell → province index, for the original state-name placement. */
  setLabelGrid(grid:LabelGrid47,owners:ArrayLike<number>){this.labelGrid={grid,owners};this.stateBoxes=null;this.politicalKey='';}
  /** 即时战略模式: armies in the player's selection box get the selection ring. */
  private rtsSelected:ReadonlySet<string>=new Set();
  setRtsSelection(ids:ReadonlySet<string>){this.rtsSelected=ids;}
  private relations:ReadonlyMap<string,number>=new Map();private relationsKey='';
  /** Original StateRelationsHighlighter: state lines of the selected state's relations, nation id → colour. */
  setRelationHighlight(relations:ReadonlyMap<string,number>){this.relations=relations;this.relationsKey=[...relations].map(([k,v])=>k+':'+v).join(',');}
  setCellEdges(edges:readonly OriginalPoliticalEdge[]){this.cellEdges=edges;this.stateOutlineKey='';this.politicalKey='';}
  useCellPolitics(enabled:boolean){this.cellPolitics=enabled;this.politicalKey='';}
  // Original ViewManager color views: per-province fill override (null keeps the state color).
  private provinceFill:((index:number)=>number|null)|null=null;private provinceFillKey='';
  setProvinceFill(fill:((index:number)=>number|null)|null,key:string){this.provinceFill=fill;this.provinceFillKey=key;}
  stateLineDiagnostics(){let lines=0,points=0;for(const set of this.stateOutlines.values()){lines+=set.length;for(const line of set)points+=line.length;}return {enabled:this.originalStateLines,nations:this.stateOutlines.size,lines,points,geometry:this.cellEdges?'rendered-voronoi-edges':'province-polygons',provinceEdges:this.cellEdges?.length??0};}
  coastlineDiagnostics(){return {points:this.coastPoints,attached:this.coastGraphic.parent===this.layer};}
  private politicalGeometry?:object;
  private politicalKey='';
  private politicalBuilds=0;
  politicalDiagnostics(){return {builds:this.politicalBuilds};}
  private territoryKey='';
  private territories:TerritoryLabel[]=[];
  labelPositions(){return this.territories.map(({nationId,componentId,provinceIds,point,angle,length,height})=>({nationId,componentId,provinceIds,...point,angle,length,height}));}
  draw(world: World, scale: number, zoom: number, selected: string | null, armyId: string | null, mode:PoliticalView='political',units?:UnitAssignments,view?:{camera:{x:number;y:number};viewport:{width:number;height:number}},naval?:NavalView,frame?:DisplayFrame&{independentArmies?:ReadonlySet<string>},combat?:{state:BattleState;preview:string[];occupation?:OccupationState},selectedWars:readonly string[]=[],runId=world.custom?.id??'',geometry?:object,_reorganizing:Record<string,number>={},formationForces?:TacticsState['forces'],viewGroups?:ViewGroups47|null): void {
    if(this.presentationRun!==runId){this.presentationRun=runId;this.orderMotion=new OrderMotion();this.sinkMotion=new SinkMotion();this.fallMotion=new FallMotion();this.battleClock=new BattleAnimationClock();this.feedback=new BattleFeedback();}
    // Keep text objects and their glyph textures across simulation replies.
    // Detach before destroying old containers, including the capital layer.
    for(const text of this.retainedLabels.values()){if(text.parent===this.labelLayer)text.visible=false;else text.removeFromParent();}this.usedLabels.clear();
    for (const child of [...this.layer.children]) if(child!==this.labelLayer){this.layer.removeChild(child);if(child!==this.politicalGraphic&&child!==this.coastGraphic)child.destroy({ children: true });}
    this.unitGroups=[];this.reorganizationWidgets=[];this.battleWidgets=[];this.siegeWidgets=[];this.impacts=[];this.battleSprites=[];this.arrowWidgets=[];this.shipLayer=undefined;this.projection={scale,zoom,x:view?.camera.x??0,y:view?.camera.y??0,width:view?.viewport.width??1280,height:view?.viewport.height??720};
    const detail=warDetail(world,scale,zoom),sites=warSites(world,combat?.state,combat?.occupation,naval);
    this.wars=warMarkers(world,sites,naval,scale,{x:this.projection.x,y:this.projection.y,scale:zoom},{width:this.projection.width,height:this.projection.height},selectedWars);
    this.capitals=world.nations.flatMap(n=>{const c=currentCapital(world,n.id);return c?[{nationId:n.id,cityId:c.id,name:c.name,point:c.position}]:[];});
    const g = this.politicalGraphic, marks = new Graphics(); this.layer.addChild(g, this.coastGraphic, marks);
    const nations = new Map(world.nations.map(n => [n.id, n])), provinces = new Map(world.provinces.map(p => [p.id, p]));
    const pixel = 1 / zoom, style=politicalStyle(mode);
    // Original colour views regroup labels and borders (ViewManager.Update*LabelsAndBorderVisibility).
    const provinceIndex=new Map(world.provinces.map((p,i)=>[p.id,i])),groupOf=viewGroups?(p:{id:string})=>viewGroups.key(provinceIndex.get(p.id)!):null;
    const territoryKey=`${world.custom?.id}/${world.provinces.map(p=>`${p.id}:${p.controller}:${groupOf?groupOf(p):''}`).join('|')}`;
    if(territoryKey!==this.territoryKey){this.territoryKey=territoryKey;this.territories=territoryLabels(world,groupOf??undefined);}
    // Preserve the tessellated political surface while only units/events change.
    // Complete Worker replies replace geometry; ownership, color, selection,
    // zoom and mode independently invalidate the cached display.
    const politicalKey=JSON.stringify([runId,scale,zoom,mode,selected,this.relationsKey,this.provinceFillKey,territoryKey,world.provinces.map(p=>[p.id,p.controller]),world.nations.map(n=>[n.id,nationColor(n)])]);
    if(!geometry||geometry!==this.politicalGeometry||politicalKey!==this.politicalKey){
    g.clear();this.politicalGeometry=geometry;this.politicalKey=politicalKey;this.politicalBuilds++;
    const originalLines=this.originalStateLines&&(mode==='political'||this.cellPolitics);
    const borders = new Map<string, { a: { x:number;y:number }; b: {x:number;y:number}; owner:string; shared:boolean; foreign:boolean }>();
    for (const [index,p] of world.provinces.entries()) {
      if(this.cellPolitics){/* Cell province boundaries are drawn below from the fill topology. */}
      else {g.poly(p.polygon.flatMap(v => [v.x / scale, v.y / scale])).fill({ color: this.provinceFill?.(index) ?? nationColor(nations.get(p.controller)!), alpha: style.fill });
      if(zoom>.6)g.stroke({ color: 0x303e37, alpha: style.province, width: .55 * pixel });}
      if (p.id === selected&&!originalLines&&!this.cellEdges) g.poly(p.polygon.flatMap(v => [v.x / scale, v.y / scale])).stroke({ color: 0xffe7a7, width: 2.5 * pixel });
      const owner=groupOf?groupOf(p)??'':p.controller;for(let i=0;i<p.polygon.length;i++) {const a=p.polygon[i],b=p.polygon[(i+1)%p.polygon.length],ka=`${a.x},${a.y}`,kb=`${b.x},${b.y}`,key=ka<kb?`${ka}/${kb}`:`${kb}/${ka}`,old=borders.get(key);if(old){old.shared=true;old.foreign=old.owner!==owner;}else borders.set(key,{a,b,owner,shared:false,foreign:false});}
    }
    if(this.cellEdges&&zoom>.6){
      for(const {a,b,segment:[ax,ay,bx,by]} of this.cellEdges)if(a>=0&&b>=0)g.moveTo(ax,ay).lineTo(bx,by);
      g.stroke({color:0x303e37,alpha:style.province,width:.55*pixel});
    }
    if(originalLines){
      const outlineKey=territoryKey+'/'+scale;
      if(outlineKey!==this.stateOutlineKey){this.stateOutlineKey=outlineKey;this.stateOutlines=this.cellEdges?originalPoliticalOutlines(this.cellEdges,i=>{const p=world.provinces[i];return p?(groupOf?groupOf(p):p.controller):null;}):fmsStateOutlines(groupOf?world.provinces.flatMap(p=>{const k=groupOf(p);return k===null?[]:[{...p,controller:k}];}):world.provinces,scale);}
      for(const [owner,lines]of this.stateOutlines){
        let drawn=false;
        for(const line of lines){if(line.length<2)continue;g.moveTo(line[0][0],line[0][1]);for(let i=1;i<line.length;i++)g.lineTo(line[i][0],line[i][1]);drawn=true;}
        if(drawn)g.stroke({color:fmsStateLineColor(viewGroups?'#'+viewGroups.color(owner).toString(16).padStart(6,'0'):nationColor(nations.get(owner)!)),width:FMS_STATE_LINE_WIDTH,join:'round',cap:'round'});
      }
      const chosen=selected?provinces.get(selected):undefined;
      if(chosen&&!this.cellEdges)g.poly(chosen.polygon.flatMap(v=>[v.x/scale,v.y/scale])).stroke({color:0xffe7a7,width:2.5*pixel});
    }
    else for(const edge of borders.values())if(edge.foreign){
      g.moveTo(edge.a.x/scale,edge.a.y/scale).lineTo(edge.b.x/scale,edge.b.y/scale).stroke({color:0xfff5db,width:(style.border+1.5)*pixel,alpha:.8});
      g.moveTo(edge.a.x/scale,edge.a.y/scale).lineTo(edge.b.x/scale,edge.b.y/scale).stroke({color:0x35453a,width:style.border*pixel,alpha:.9});
    }
    // Whole state outline (land borders and coast) of each highlighted relation, drawn over the
    // ordinary state lines; the selected state itself last so it stays on top.
    if(this.cellEdges&&this.relations.size&&!groupOf){
      const owner=(i:number)=>i>=0?world.provinces[i]?.controller??null:null;
      for(const [nationId,color]of [...this.relations].sort((x,y)=>x[1]===0xfff1b8?1:y[1]===0xfff1b8?-1:0)){
        let drawn=false;
        for(const {a,b,segment:[ax,ay,bx,by]}of this.cellEdges){const oa=owner(a),ob=owner(b);if((oa===nationId)!==(ob===nationId)){g.moveTo(ax,ay).lineTo(bx,by);drawn=true;}}
        if(drawn)g.stroke({color,width:Math.max(FMS_STATE_LINE_WIDTH*1.3,2.4*pixel),alpha:.95,join:'round',cap:'round'});
      }
    }
    if(selected&&this.cellEdges){const index=provinceIndex.get(selected);for(const {a,b,segment:[ax,ay,bx,by]}of this.cellEdges)if(a===index||b===index)g.moveTo(ax,ay).lineTo(bx,by);g.stroke({color:0xffe7a7,width:2.5*pixel});}
    }
    const label = (text: string, x: number, y: number, size: number, color = '#f9f1d4',parent=this.layer,key?:string) => {
      const style:TextStyleOptions={fontFamily:'Georgia, serif',fontSize:size,fill:color,fontWeight:'bold',stroke:{color:'#263d40',width:3}};
      const t=key?this.retainedText(key,text,style):new Text({text,style});
      t.anchor.set(.5, 1); t.scale.set(pixel); t.position.set(x, y); parent.addChild(t);return t;
    };
    // Place names belong to the map's paper/ink hierarchy, independently of
    // high-contrast troop counts and battle feedback. Keep terrain readable.
    const placeStyle=(size:number,capital=false):TextStyleOptions=>({
      fontFamily:MAP_FONT47,fontSize:size,
      fontWeight:capital?'600':'400',
      fill:'#302b23',
      stroke:{color:'#f7ebd1',width:capital?1.4:1},
    });
    const placeName=(text:string,x:number,y:number,size:number,key:string)=>{
      const t=this.retainedText(`place:${mode}:${key}`,text,placeStyle(size));
      t.anchor.set(.5,1);t.scale.set(pixel);t.position.set(x,y);this.layer.addChild(t);return t;
    };
    if(combat?.occupation){for(const siege of combat.occupation.sieges){if(detail!=='local'&&!selectedWars.includes(`siege:${siege.provinceId}`))continue;const p=provinces.get(siege.provinceId)!;
      // A progress marker is not a fictitious cell-level ownership front.
      marks.poly(p.polygon.flatMap(v=>[v.x/scale,v.y/scale])).stroke({color:0xe2b568,width:1.7*pixel,alpha:.85});
      const group=new Container(),x=p.center.x/scale,y=p.center.y/scale+28*pixel;group.position.set(x,y);this.layer.addChild(group);
      const bar=new Graphics();group.addChild(bar);const text=label('',0,0,10,'#ffdf9c',group,`siege:${p.id}`);text.position.y=-2*pixel;
      this.siegeWidgets.push({id:p.id,bar,text,x,y,pixel,percent:0});
    }this.updateOccupation(combat.occupation);}
    const capitalIcons=this.capitals.map(c=>({cityId:c.cityId,x:c.point.x/scale*zoom+this.projection.x,y:c.point.y/scale*zoom+this.projection.y,width:22,height:22})),countryBoxes:LabelBox[]=[];
    // Original state names (State.UpdateStateName): one horizontal TW-Kai name per group,
    // black face with an 80 % outline in the group colour (LabelUtility.UpdateLabelMaterial),
    // auto-sized in its box; sized in world units, so it scales with the map.
    if(this.labelLayer.parent===this.layer)this.layer.setChildIndex(this.labelLayer,this.layer.children.length-1);else this.layer.addChild(this.labelLayer);
    const mapFontEpoch=mapFontEpoch47();
    const groupKeyOf=(p:{id:string;controller:string})=>groupOf?groupOf(p):p.controller;
    let boxes:StateLabelBox47[];
    if(this.labelGrid){
      const owners=this.labelGrid.owners,cellKey=(c:number)=>{const i=owners[c];const p=i>=0?world.provinces[i]:undefined;return p?groupKeyOf(p):null;};
      const singles=new Map<string,number>();if(!groupOf)for(const p of world.provinces)singles.set(p.controller,(singles.get(p.controller)??0)+1);
      if(this.stateBoxes?.key!==territoryKey)this.stateBoxes={key:territoryKey,boxes:stateLabelBoxes47(this.labelGrid.grid,cellKey,(key,cells)=>!groupOf&&singles.get(key)===1&&cells<30)};
      boxes=this.stateBoxes.boxes;
    }else{
      const largest=new Map<string,TerritoryLabel>();for(const t of this.territories){const old=largest.get(t.nationId);if(!old||t.area>old.area)largest.set(t.nationId,t);}
      boxes=[...largest.values()].map(t=>({key:t.nationId,x:t.point.x/scale,y:t.point.y/scale,width:t.length/scale/MAP_UNIT47,height:Math.max(t.height/scale/MAP_UNIT47,1.5),fontMax:40,fontMin:15,cells:0}));
    }
    // Names wait for the map font (mapFontReady47) so they are rasterized once.
    const namesReady=mapFontSettled47();
    const countryLabels=(namesReady?boxes:[]).flatMap(box=>{
      const name=viewGroups?viewGroups.name(box.key):nations.get(box.key)?.name;if(!name)return [];
      const tint=viewGroups?viewGroups.color(box.key):Number.parseInt(nationColor(nations.get(box.key)!).slice(1),16);
      const t=this.retainedText(`country:${mapFontEpoch}:${box.key}:${tint}`,name,{fontFamily:MAP_FONT47,fontSize:64,fontWeight:'bold',fill:0x000000,stroke:{color:tint,width:13,alpha:.8,join:'round'}},1.5);
      const size=autoFontSize47(box,{width:Math.max(1,t.width-13)/64,height:Math.max(1,t.height-13)/64}),em=size/10*MAP_UNIT47,k=em/64;
      t.anchor.set(.5);t.rotation=0;t.scale.set(k);t.position.set(box.x,box.y);t.alpha=1;this.keepLabel(t,0);
      const width=t.width,height=t.height,screen={x:box.x*zoom+this.projection.x,y:box.y*zoom+this.projection.y,width:width*zoom,height:height*zoom};countryBoxes.push(screen);
      return [{point:{x:box.x*scale,y:box.y*scale},size:em*zoom,width:screen.width}];
    });
    this.cities=[];
    // Province.GetProvinceCityType: Port cities follow the original rule (original-ports.ts).
    const portCities=this.originalPorts;
    this.iconCounts={cities:0,ports:0,capitals:this.capitals.length,portCities:portCities.size};
    for (const city of world.cities) {
      const capital = this.capitals.some(c=>c.cityId===city.id), x = city.position.x / scale, y = city.position.y / scale;
      this.cities.push({id:city.id,provinceId:city.provinceId,name:city.name,x:x*zoom+this.projection.x,y:y*zoom+this.projection.y,capital,label:false});
      if(capital){/* capitals are drawn in their own layer below */}
      else if(this.originalIcons&&portCities.has(city.id)){originalPortIcon(marks,x,y);this.iconCounts.ports++;}
      else if(this.originalIcons){marks.circle(x,y,ORIGINAL_CITY_UNIT).fill(0x000000).circle(x,y,.56*ORIGINAL_CITY_UNIT).fill(0xffffff);this.iconCounts.cities++;}
      else marks.circle(x, y, (detail==='overview'?1:1.6) * pixel).fill(0xf0e5cc).stroke({width:.65*pixel,color:0x38453e});
    }
    // Original city names (World.CreateCityLabel): bold TW-Kai, centred a fixed offset above
    // the city (below at the top border), state capitals 1.5×; world-sized. Names smaller than
    // 9 screen pixels are skipped (they would be unreadable specks).
    const cityStyle:TextStyleOptions={fontFamily:MAP_FONT47,fontSize:64,fontWeight:'bold',fill:mode==='political'?0x111111:0xf6efd9,stroke:{color:mode==='political'?0xf3e7ca:0x2b3a31,width:6,alpha:.7,join:'round'}};
    const capitalText:(LabelBox&{id:string})[]=[];
    const cityObstacles=[...countryBoxes,...capitalIcons];
    const cityText:{id:string;name:string;labelX:number;labelY:number;box:LabelBox}[]=[];
    for(const c of namesReady?this.cities:[]){
      const at={x:(c.x-this.projection.x)/zoom,y:(c.y-this.projection.y)/zoom},l=cityLabel47(at,c.capital);
      if(l.em*zoom<9)continue;
      const t=this.retainedText(`city:${mapFontEpoch}:${mode}:${c.id}`,c.name,cityStyle,1);t.anchor.set(.5);t.scale.set(l.em/64);t.position.set(l.x,l.y);
      const box={x:l.x*zoom+this.projection.x,y:l.y*zoom+this.projection.y,width:t.width*zoom,height:t.height*zoom};
      cityText.push({id:c.id,name:c.name,labelX:box.x,labelY:box.y,box});if(c.capital)capitalText.push({...box,id:c.id});
      // A selected city shows its callout instead; its name keeps its place in the layout.
      if(c.provinceId===selected)continue;
      this.keepLabel(t,1);c.label=true;
    }
    this.labelLayout={detail,countries:countryBoxes,capitals:capitalText.map(({x,y,width,height})=>({x,y,width,height})),towns:cityText.map(c=>({id:c.id,x:c.labelX,y:c.labelY}))};
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
      placeName(p.name,x,y-5*pixel,10,`province:${p.id}`);
    }
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
    // Original Army sprite icons (Army.ApplyDisplayedSpriteIcon / ApplySpriteRendererTransform):
    // every army is one unit icon tinted with its state colour, a 2.56-unit sprite at local scale
    // 0.84 under the army scale ArmyIconScale 0.35 (World.ctor), elite ×1.5 (GetArmyLabelScale);
    // no strength bars or group badges. Idle armies wander inside their province
    // (RandomMoveInProvince); the web spreads stationary armies to fixed points of the province.
    const iconSize=2.56*.84*.35*(1600/240),moving=(a:World['armies'][number],at:Point)=>{const end=armyPosition(world,a);return !!frame?.independentArmies?.has(a.id)||a.status==='marching'||a.status==='retreating'||Math.hypot(at.x-end.x,at.y-end.y)>1e-7;};
    const citySpots=new Map<string,Point[]>();for(const c of world.cities){const list=citySpots.get(c.provinceId)??[];list.push(c.position);citySpots.set(c.provinceId,list);}
    const fallen:FallenPose[]=[];
    for(const army of world.armies){
      if(army.troops<=0||army.status==='destroyed')continue;
      const at=frame?.armies.get(army.id)??armyPosition(world,army),active=army.id===armyId||this.rtsSelected.has(army.id),home=provinces.get(army.provinceId);
      const spot=!moving(army,at)&&home?wanderPoint(home.polygon,army.id,citySpots.get(home.id)):at;
      const container=new Container();this.layer.addChild(container);container.position.set(spot.x/scale,spot.y/scale);
      this.unitGroups.push({ids:[army.id],container,display:'detail',offset:{x:(spot.x-at.x)/scale,y:(spot.y-at.y)/scale}});
      const unit=units?unitProfile(units[army.id]):undefined,texture=this.textures.get(unit?.key??'Cavalry'),size=Math.max(iconSize*(unit?.key==='Elite'?1.5:1),7*pixel);
      if(active){const ring=new Graphics();ring.circle(0,0,size*.75).fill({color:0x263931,alpha:.25}).stroke({color:0xffe6a6,width:1.5*pixel});container.addChild(ring);}
      if(texture){const sprite=new Sprite(texture);sprite.anchor.set(.5);sprite.width=size;sprite.height=size;sprite.tint=nationColor(nations.get(army.nationId)!);container.addChild(sprite);fallen.push({id:army.id,x:spot.x/scale,y:spot.y/scale,texture:unit?.key??'Cavalry',tint:sprite.tint as number,size});}
      else{const dot=new Graphics();dot.circle(0,0,size*.3).fill(nationColor(nations.get(army.nationId)!));container.addChild(dot);}
    }
    this.fallMotion.sync(fallen);this.fallLayer=new Container();this.layer.addChild(this.fallLayer);this.drawFalling(performance.now());
    for(const e of combat?.state.engagements??[]){if(detail==='overview')continue;const p=engagementPoint(world,e),x=p.x/scale,y=p.y/scale,mark=new Graphics();this.layer.addChild(mark);mark.circle(x,y,5*pixel).fill({color:0x392c28,alpha:.8});mark.moveTo(x-3*pixel,y-3*pixel).lineTo(x+3*pixel,y+3*pixel).moveTo(x+3*pixel,y-3*pixel).lineTo(x-3*pixel,y+3*pixel).stroke({color:0xffe4b4,width:1.5*pixel});const impact=new Graphics();impact.position.set(x,y);impact.circle(0,0,7*pixel).stroke({color:0xffd69a,width:1.5*pixel});for(let i=0;i<6;i++){const a=i*Math.PI/3;impact.moveTo(Math.cos(a)*9*pixel,Math.sin(a)*9*pixel).lineTo(Math.cos(a)*13*pixel,Math.sin(a)*13*pixel).stroke({color:0xffe6b9,width:pixel});}impact.alpha=0;this.layer.addChild(impact);this.impacts.push({id:e.id,graphic:impact});}
    if(combat)this.updateBattles(world,combat.state);this.updateReorganization(world);
    if(naval){this.sinkMotion.sync(naval.navy.fleets.filter(f=>f.status!=='lost').map(f=>({id:f.id,point:frame?.fleets.get(f.id)??fleetPosition(naval.graph,f),color:nationColor(nations.get(f.nationId)!),radius:6})),naval.navy.fleets.filter(f=>f.status==='lost').map(f=>({id:f.id,point:fleetPosition(naval.graph,f),color:nationColor(nations.get(f.nationId)!),radius:6})));this.shipLayer=drawNavy(this.layer,world,scale,zoom,naval,frame?.fleets,detail==='overview');}this.sinkingLayer=new Graphics();this.layer.addChild(this.sinkingLayer);this.drawSinking();
    // The original BattleFxSystem uses the same battleSwordPrefab for land and sea.
    // Only authoritative live contacts create effects; frame changes never deal damage.
    const effects:{id:string;point:Point;fleets?:readonly [string,string]}[]=(combat?.state.engagements??[]).filter(e=>detail==='local'||selectedWars.includes(`field:${e.id}`)||e.armies.includes(armyId??'')).map(e=>({id:`land:${e.id}`,point:engagementPoint(world,e)}));
    for(const contact of naval?.maritime?.contacts??[]){const a=naval!.navy.fleets.find(f=>f.id===contact.a),b=naval!.navy.fleets.find(f=>f.id===contact.b);if(!a||!b)continue;const id=`sea:${[a.id,b.id].sort().join('/')}`;if(detail!=='local'&&!selectedWars.includes(id)&&naval?.selected!==a.id&&naval?.selected!==b.id)continue;const p=frame?.fleets.get(a.id)??fleetPosition(naval!.graph,a),q=frame?.fleets.get(b.id)??fleetPosition(naval!.graph,b);effects.push({id,point:{x:(p.x+q.x)/2,y:(p.y+q.y)/2},fleets:[a.id,b.id]});}
    this.battleClock.sync([...(combat?.state.engagements??[]).map(e=>`land:${e.id}`),...(naval?.maritime?.contacts??[]).map(c=>`sea:${[c.a,c.b].sort().join('/')}`)]);
    for(const effect of effects){const x=effect.point.x/scale,y=effect.point.y/scale,sx=x*zoom+this.projection.x,sy=y*zoom+this.projection.y;if(!this.battleTextures.length||this.battleSprites.length>=32||sx<-40||sy<-40||sx>this.projection.width+40||sy>this.projection.height+40)continue;const sprite=new Sprite(this.battleTextures[this.battleClock.frame(effect.id)]);sprite.anchor.set(.5);sprite.position.set(x,y);sprite.width=(zoom>1.2?42:zoom>.6?32:22)*pixel;sprite.height=sprite.width*194/258;this.layer.addChild(sprite);this.battleSprites.push({id:effect.id,sprite,fleets:effect.fleets});}
    for(const war of this.wars){const x=(war.x-this.projection.x)/zoom,y=(war.y-this.projection.y)/zoom,r=(detail==='local'?5:9)*pixel,mark=new Graphics();this.layer.addChild(mark);mark.circle(x,y,r).fill({color:0x49362a,alpha:.92}).stroke({color:war.selected?0xffefb9:0xd6b67a,width:(war.selected?2:1)*pixel});mark.moveTo(x-3*pixel,y-3*pixel).lineTo(x+3*pixel,y+3*pixel).moveTo(x+3*pixel,y-3*pixel).lineTo(x-3*pixel,y+3*pixel).stroke({color:0xffe9bd,width:1.3*pixel});if(detail!=='local')label(war.troops?`${(war.troops/1000).toFixed(1)}千`:`${war.ships}艘`,x,y+26*pixel,10,undefined,undefined,`war:${war.ids[0]??war.x}`);}
    // Original package's CityCapitalFinal: dark outer disc / white ring / dark
    // center. Keep capitals above terrain/country labels and ordinary cities.
    const capitalLayer=new Container();this.layer.addChild(capitalLayer);
    for(const capital of this.capitals){const x=capital.point.x/scale,y=capital.point.y/scale,icon=new Graphics();capitalLayer.addChild(icon);
      if(this.originalIcons)icon.circle(x,y,1.3*ORIGINAL_CAPITAL_UNIT).fill(0x000000).circle(x,y,.885*ORIGINAL_CAPITAL_UNIT).fill(0xffffff).circle(x,y,.43*ORIGINAL_CAPITAL_UNIT).fill(0x000000);
      else icon.circle(x,y,9*pixel).fill(0xf8f5e9).circle(x,y,8*pixel).fill(0x182623).circle(x,y,5.45*pixel).fill(0xfffced).circle(x,y,2.65*pixel).fill(0x182623);
    }
    if(frame)this.updateUnits(frame);
    // Draw the one actively inspected small city above moving units and effects.
    // Its screen-space callout never moves the saved city or its hit location.
    this.cityCallout=undefined;
    const activeCity=this.cities.find(c=>c.provinceId===selected);
    if(activeCity){
      // The callout already leaves a gap around its own point. Reserving its
      // capital's padded icon box again rejected every nearby position.
      const selectedLabel=selectedCityLabel({...activeCity,selected:true},[...cityObstacles.filter(b=>!('cityId'in b&&b.cityId===activeCity.id)&&!('id'in b&&b.id===activeCity.id)),...cityText.filter(c=>c.id!==activeCity.id).map(c=>c.box!),...this.unitPositions().map(u=>{const dot='display'in u&&u.display==='dot';return{x:u.x,y:u.y+(dot?0:5),width:dot?6:32,height:dot?6:46};})],this.projection,this.uiObstacles);
      if(selectedLabel?.callout){
        const box=selectedLabel.callout,px=this.projection.x,py=this.projection.y,x=(box.x-px)/zoom,y=(box.y-py)/zoom,cx=(activeCity.x-px)/zoom,cy=(activeCity.y-py)/zoom;
        const endX=(Math.max(box.x-box.width/2,Math.min(box.x+box.width/2,activeCity.x))-px)/zoom,endY=(Math.max(box.y-box.height/2,Math.min(box.y+box.height/2,activeCity.y))-py)/zoom;
        const callout=new Graphics();this.layer.addChild(callout);
        callout.moveTo(cx,cy).lineTo(endX,endY).stroke({color:0xffedb6,width:2*pixel}).circle(cx,cy,4*pixel).stroke({color:0xffedb6,width:2*pixel});
        callout.roundRect(x-box.width/2*pixel,y-box.height/2*pixel,box.width*pixel,box.height*pixel,4*pixel).fill(0xeeeada).stroke({color:0x5f7051,width:pixel});
        const text=this.retainedText(`selected:${activeCity.id}`,selectedLabel.lines!.join('\n'),{fontFamily:'Georgia, "Microsoft YaHei", serif',fontSize:12,lineHeight:16,fontWeight:'bold',fill:0x263a30,align:'center'});text.anchor.set(.5);text.scale.set(pixel);text.position.set(x,y);this.layer.addChild(text);
        activeCity.label=true;this.cityCallout={...box,id:activeCity.id,provinceId:activeCity.provinceId,name:activeCity.name};
      }
    }
    for(const [key,text]of this.retainedLabels)if(!this.usedLabels.has(key)){text.destroy();this.retainedLabels.delete(key);}
  }
}
