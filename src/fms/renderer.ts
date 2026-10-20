import { Application, Container, Geometry, GlProgram, Graphics, Mesh, Shader, UniformGroup, type BufferImageSource } from 'pixi.js';
// Pixi's no-eval polyfill preserves the existing strict production CSP.
import 'pixi.js/unsafe-eval';
import type { AtlasCamera, CameraPoint } from '../world/camera';
import type { FmsDocument } from './model';
import { deriveFmsDrainage, type FmsDrainage } from './hydrology';
import { deriveFmsShade } from './shading';
import { clipFmsRiverSegments } from './river-geometry';
import { createFmsOceanSource, FmsOceanFields, FMS_OCEAN_CONTRACT, FMS_OCEAN_DEEP, FMS_OCEAN_SHALLOW } from './ocean-surface';
import { FMS_COLOR_GLSL, FMS_HEIGHT_PALETTE_CONTRACT, srgbToLinear, type FmsTerrainDisplay } from './height-palette';
import type { FmsBiomeSurface } from './biome-surface';
import { FmsBiomeDisplay, type FmsBiomeDisplayState } from './biome-display';
import { originalGridFor } from './original/original-document';
import { OriginalEditorLayer } from './original/original-editor-layer';
import { ORIGINAL_PRESETS } from './original/original-style';
import type { OriginalGrid } from './original/original-grid';

export type FmsOceanAppearance = 'source' | 'paper';

// Display palettes only. `source` is the recovered level0 ocean color and
// existing Pixi clear color; `paper` is a WEB visual adaptation to the user's
// parchment reference, not a recovered original material or copied texture.
export const FMS_OCEAN_APPEARANCES = {
  source: { shallow: FMS_OCEAN_SHALLOW, deep: FMS_OCEAN_DEEP, background: '#1487ff' },
  paper: { shallow: [234 / 255, 214 / 255, 173 / 255], deep: [225 / 255, 200 / 255, 152 / 255], background: '#e1c898' },
} as const;

function oceanLinearColors(appearance: FmsOceanAppearance): { shallow: Float32Array; deep: Float32Array } {
  const palette = FMS_OCEAN_APPEARANCES[appearance];
  return { shallow: Float32Array.from(palette.shallow, srgbToLinear), deep: Float32Array.from(palette.deep, srgbToLinear) };
}

// This direct source mesh is a web rendering adapter. Interpolated elevation is
// authoritative; the derived ocean texture changes only color, never coastline.
const vertex = `#version 300 es
precision highp float;
in vec2 aPosition;
in float aHeight;
in float aShade;
in float aLakeDepth;
in vec3 aBiomeColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out float vHeight;
out float vShade;
out float vLakeDepth;
out vec3 vBiomeColor;
out vec2 vMapPosition;
void main(){vMapPosition=aPosition;vHeight=aHeight;vShade=aShade;vLakeDepth=aLakeDepth;vBiomeColor=aBiomeColor;vec3 p=uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0);gl_Position=vec4(p.xy,0.0,1.0);}`;
const fragment = `#version 300 es
precision highp float;
in float vHeight;
in float vShade;
in float vLakeDepth;
in vec3 vBiomeColor;
in vec2 vMapPosition;
uniform sampler2D uOceanDistance;
uniform vec2 uMapSize;
uniform float uHeightView;
uniform float uBiomeView;
uniform vec3 uOceanShallow;
uniform vec3 uOceanDeep;
out vec4 finalColor;
${FMS_COLOR_GLSL}
void main(){
 float h=vHeight;
 vec3 deep=vec3(.235,.365,.425), shallow=vec3(.47,.62,.64);
 // Shader191: smoothstep(0,EdgeIntensity,max(-SDF.r,0)). The web texture
 // stores unsigned exterior distance / EdgeIntensity, capped at 1.
 float t=clamp(dot(texture(uOceanDistance,vMapPosition/uMapSize).rg,vec2(256.0/257.0,1.0/257.0)),0.0,1.0);
 vec3 sea=fmsToDisplay(mix(uOceanShallow,uOceanDeep,t*t*(3.0-2.0*t)));
 vec3 low=vec3(.75,.76,.57), hills=vec3(.48,.57,.37), mountain=vec3(.62,.60,.46);
 vec3 land=mix(low,hills,smoothstep(24.0,55.0,h));
 land=mix(land,mountain,smoothstep(54.0,78.0,h));
 land=mix(land,vec3(.88,.88,.80),smoothstep(78.0,96.0,h));
 land*=vShade;
 if(uHeightView>.5)land=fmsHeightColor(h);
 // The biome palette must retain relief from this same stored height field.
 // Replacing the palette without its shade erased actual mountain slopes.
 if(uBiomeView>.5)land=fmsToDisplay(vBiomeColor)*vShade;
 // Filled depressions are derived from the same elevation graph, never painted decor.
 float lake=smoothstep(.2,.8,vLakeDepth)*smoothstep(20.0,21.5,h);
 land=mix(land,mix(shallow,deep,smoothstep(0.0,16.0,vLakeDepth)),lake);
 float edge=max(fwidth(h),.12);
 vec3 color=mix(sea,land,smoothstep(20.0-edge,20.0+edge,h));
 color=mix(color,vec3(.85,.84,.68),.55*(1.0-smoothstep(edge,edge+1.1,abs(h-20.0))));
 finalColor=vec4(color,1.0);
}`;

export class FmsRenderer {
  private app = new Application();
  private scene = new Container();
  private overlay = new Graphics();
  private rivers = new Graphics();
  private riverMesh?:Mesh<Geometry,Shader>;
  private protection = new Graphics();
  private surfaces = new WeakMap<Int32Array, { points:FmsDocument['points']; neighbors:FmsDocument['neighbors']; triangles:FmsDocument['triangles']; width:number; height:number; drainage: FmsDrainage; shade: Float32Array; relief: number }>();
  private oceanFields = new FmsOceanFields();
  private biomeFields = new FmsBiomeDisplay(state=>this.applyBiomeDisplay(state));
  private currentDocument?: FmsDocument;
  private oceanSource?: BufferImageSource;
  private oceanUniforms?: UniformGroup;
  private meshDocument?: Pick<FmsDocument,'points'|'triangles'|'width'|'height'>;
  private geometry?: Geometry;
  private shader?: Shader;
  private destroyed = false;
  private initialized = false;
  private mesh?: Mesh<Geometry, Shader>;
  private contextLost = false;
  private terrainDisplay: FmsTerrainDisplay = 'height';
  private oceanAppearanceState: FmsOceanAppearance = 'source';
  private worldId?: string;
  private bound?: Graphics;
  /** Documents on an original BasicMap grid are drawn the original way. */
  private original?: { points: FmsDocument['points']; grid: OriginalGrid | null; layer?: OriginalEditorLayer };
  constructor(private onDisplayState:(state:FmsBiomeDisplayState)=>void=()=>{},private onDisplayError:(error:unknown)=>void=error=>{throw error;}){}
  get canvas(): HTMLCanvasElement { return this.app.canvas; }
  get oceanAppearance(): FmsOceanAppearance { return this.oceanAppearanceState; }
  /** A caller-owned gameplay overlay shares this exact terrain/camera. */
  attachGameplayLayer(layer: Container): void { this.scene.addChild(layer); this.draw(); }
  refresh(): void { this.draw(); }
  async init(host: HTMLElement): Promise<void> {
    await this.app.init({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight), resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, antialias: true, autoStart: false, background: FMS_OCEAN_APPEARANCES[this.oceanAppearanceState].background, preference: 'webgl' });
    this.initialized = true;
    if (this.destroyed) { this.app.destroy(true, { children: true }); return; }
    // A caller may switch palettes while the asynchronous Pixi init is pending.
    this.app.renderer.background.color = FMS_OCEAN_APPEARANCES[this.oceanAppearanceState].background;
    this.canvas.setAttribute('aria-label','创世地图画布'); this.canvas.setAttribute('data-testid','fms-canvas'); this.canvas.tabIndex = 0;
    this.canvas.dataset.oceanAppearance = this.oceanAppearanceState;
    host.appendChild(this.canvas); this.app.stage.addChild(this.scene);
    this.canvas.addEventListener('webglcontextlost', () => { this.contextLost = true; this.biomeFields.close(); });
  }
  /** Change only ocean colors and clear color; geometry, coast-distance texture, picking and saved data stay intact.
   * Safe before init or after context loss: the requested appearance is retained without touching an unavailable GPU. */
  setOceanAppearance(appearance: FmsOceanAppearance): void {
    if (this.destroyed) return;
    this.oceanAppearanceState = appearance;
    if (this.initialized) this.canvas.dataset.oceanAppearance = appearance;
    if (!this.initialized || this.contextLost) return;
    this.app.renderer.background.color = FMS_OCEAN_APPEARANCES[appearance].background;
    if (this.oceanUniforms) {
      const colors = oceanLinearColors(appearance);
      this.oceanUniforms.uniforms.uOceanShallow = colors.shallow;
      this.oceanUniforms.uniforms.uOceanDeep = colors.deep;
      this.oceanUniforms.update();
    }
    if (this.original?.grid) this.applyOriginal(this.original.grid);
    this.draw();
  }
  setDocument(doc: FmsDocument, drainage?: FmsDrainage): void {
    if (this.destroyed || this.contextLost) return;
    let surface=this.surfaces.get(doc.elevations);
    if(!surface||surface.points!==doc.points||surface.neighbors!==doc.neighbors||surface.triangles!==doc.triangles||surface.width!==doc.width||surface.height!==doc.height){
      const shade=deriveFmsShade(doc);let low=100,high=0;
      for(let cell=0;cell<doc.points.length;cell++){
        const h=doc.elevations[cell];
        if(h<20)continue;low=Math.min(low,h);high=Math.max(high,h);
      }
      surface={points:doc.points,neighbors:doc.neighbors,triangles:doc.triangles,width:doc.width,height:doc.height,drainage:drainage??deriveFmsDrainage(doc),shade,relief:Math.max(0,high-low)};
      this.surfaces.set(doc.elevations,surface);
    }
    const ocean = this.oceanFields.get(doc);
    // Always display the actual new geometry immediately. Cold optional climate
    // follows asynchronously; never hold an old candidate mesh on screen.
    if (this.worldId !== doc.worldId || this.meshDocument?.points!==doc.points || this.meshDocument?.triangles!==doc.triangles
      || this.meshDocument?.width!==doc.width || this.meshDocument?.height!==doc.height) {
      this.clearMesh();
      const positions = new Float32Array(doc.points.length * 2);
      doc.points.forEach((p, i) => { positions[i * 2] = p[0]; positions[i * 2 + 1] = p[1]; });
      this.geometry = new Geometry({ attributes: { aPosition: { buffer: positions, format: 'float32x2' }, aHeight: { buffer: Float32Array.from(doc.elevations), format: 'float32' }, aShade: { buffer: surface.shade, format: 'float32' }, aLakeDepth: { buffer: surface.drainage.lakeDepth, format: 'float32' }, aBiomeColor:{buffer:new Float32Array(doc.points.length*3),format:'float32x3'} }, indexBuffer: doc.triangles.slice() });
      this.geometry.autoGarbageCollect = false;
      this.oceanSource = createFmsOceanSource(ocean);
      const oceanColors = oceanLinearColors(this.oceanAppearanceState);
      this.oceanUniforms = new UniformGroup({ uMapSize: { value: new Float32Array([doc.width,doc.height]), type: 'vec2<f32>' }, uHeightView:{value:1,type:'f32'},uBiomeView:{value:0,type:'f32'},
        uOceanShallow:{value:oceanColors.shallow,type:'vec3<f32>'},uOceanDeep:{value:oceanColors.deep,type:'vec3<f32>'} });
      this.shader = new Shader({ glProgram: new GlProgram({ vertex, fragment, name: 'fms-source-height-ocean-v3' }), resources: { oceanUniforms:this.oceanUniforms,uOceanDistance:this.oceanSource } });
      this.shader.addResource('globalUniforms',100,0); this.shader.addResource('localUniforms',101,0);
      this.mesh = new Mesh({ geometry: this.geometry, shader: this.shader });
      this.bound = new Graphics().rect(0,0,doc.width,doc.height).stroke({ width: 1, color: 0xb0c1be, alpha: .25 });
      this.scene.addChild(this.mesh, this.rivers, this.protection, this.bound, this.overlay); this.worldId = doc.worldId;this.meshDocument=doc;
    } else if (this.geometry) {
      if(this.oceanSource && this.oceanSource.resource!==ocean.pixels){ this.oceanSource.resource=ocean.pixels;this.oceanSource.update(); }
      const buffer = this.geometry.getBuffer('aHeight'); buffer.data = Float32Array.from(doc.elevations); buffer.update();
      const shades=this.geometry.getBuffer('aShade');shades.data=surface.shade;shades.update();
      const lake=this.geometry.getBuffer('aLakeDepth');lake.data=surface.drainage.lakeDepth;lake.update();
    }
    this.currentDocument=doc;
    this.canvas.dataset.minHeight=String(Math.min(...doc.elevations));
    this.canvas.dataset.pointCount=String(doc.points.length);this.canvas.dataset.triangleCount=String(doc.triangles.length/3);
    this.canvas.dataset.maxHeight=String(Math.max(...doc.elevations));
    this.canvas.dataset.heightPalette=FMS_HEIGHT_PALETTE_CONTRACT;
    this.canvas.dataset.lakeCells=String(surface.drainage.stats.filledLandCells);
    this.canvas.dataset.drainageAlgorithm=surface.drainage.stats.algorithm;
    this.canvas.dataset.landArea=String(surface.drainage.stats.landArea);
    this.canvas.dataset.catchmentArea=String(surface.drainage.stats.minCatchment);
    this.canvas.dataset.totalDischarge=String(surface.drainage.stats.seaDischarge+surface.drainage.stats.endorheicDischarge);
    const oceanMetrics=this.oceanFields.metrics();
    this.canvas.dataset.oceanAlgorithm=FMS_OCEAN_CONTRACT;
    this.canvas.dataset.oceanSegments=String(ocean.segmentCount);
    this.canvas.dataset.oceanContourSegments=String(ocean.contourSegments??ocean.segmentCount);
    this.canvas.dataset.oceanTexture=`${ocean.width}x${ocean.height}`;
    this.canvas.dataset.oceanBytes=String(ocean.pixels.byteLength);
    this.canvas.dataset.oceanCacheBytes=String(oceanMetrics.bytes);
    this.canvas.dataset.oceanBuilds=String(oceanMetrics.builds);
    this.canvas.dataset.oceanBuildMs=String(oceanMetrics.lastBuildMs);
    this.canvas.dataset.oceanMaxSampleError=String(ocean.maxSampleError);
    this.protection.clear();
    let lockedTriangles=0;
    const edges=new Map<string,{a:number;b:number;count:number}>(),covered=new Uint8Array(doc.points.length);
    if(doc.terrainLocks){
      for(let offset=0;offset<doc.triangles.length;offset+=3){
        const ids=[doc.triangles[offset],doc.triangles[offset+1],doc.triangles[offset+2]];
        if(!ids.every(id=>doc.terrainLocks![id]))continue;
        lockedTriangles++;this.protection.poly(ids.flatMap(id=>doc.points[id])).fill({color:0xe8c57b,alpha:.14});
        for(let i=0;i<3;i++){covered[ids[i]]=1;const a=Math.min(ids[i],ids[(i+1)%3]),b=Math.max(ids[i],ids[(i+1)%3]),key=`${a}:${b}`,edge=edges.get(key);if(edge)edge.count++;else edges.set(key,{a,b,count:1});}
      }
      for(const {a,b,count}of edges.values())if(count===1)this.protection.moveTo(...doc.points[a]).lineTo(...doc.points[b]).stroke({width:2.4,color:0xf3d293,alpha:.95});
      doc.terrainLocks.forEach((locked,id)=>{if(locked&&!covered[id])this.protection.circle(...doc.points[id],2.4).fill({color:0xf3d293,alpha:.95});});
    }
    this.canvas.dataset.lockedCells=String(doc.terrainLocks?.reduce((sum,value)=>sum+value,0)??0);
    this.canvas.dataset.lockedTriangles=String(lockedTriangles);
    this.biomeFields.select(doc,this.terrainDisplay);
    this.selectOriginal(doc);
    this.draw();
  }
  private selectOriginal(doc: FmsDocument): void {
    if (doc.width !== 1600 || doc.height !== 900) { this.applyOriginal(null); this.original = undefined; return; }
    if (this.original?.points === doc.points) { this.applyOriginal(this.original.grid); return; }
    this.applyOriginal(null);
    const entry: NonNullable<typeof this.original> = { points: doc.points, grid: null };this.original = entry;
    void originalGridFor(doc).then(grid => { if (this.original !== entry || this.destroyed || this.contextLost) return; entry.grid = grid; this.applyOriginal(grid); this.draw(); }, error => this.onDisplayError(error));
  }
  private rainfallPreview = 80;
  /** Editor-only climate experiment; never changes saved maps or simulation rules. */
  setRainfallPreview(value: number): boolean {
    if (this.destroyed || this.contextLost || !Number.isFinite(value) || value < 1 || value > 200 || !this.original?.grid) return false;
    this.rainfallPreview = value;
    this.applyOriginal(this.original.grid);
    this.draw();
    return true;
  }
  private applyOriginal(grid: OriginalGrid | null): void {
    const doc = this.currentDocument, entry = this.original;
    // A late grid lookup must never be applied to a different document.
    if (!grid || !doc || !entry || entry.points !== doc.points || grid.points.length !== doc.points.length) {
      if (entry?.layer) { entry.layer.destroy(); entry.layer = undefined; }
      if (this.mesh) this.mesh.visible = true; this.rivers.visible = true; if (this.riverMesh) this.riverMesh.visible = true;
      if (this.initialized) delete this.canvas.dataset.editorRenderer;
      return;
    }
    if (!entry.layer) { entry.layer = new OriginalEditorLayer(() => this.draw()); this.scene.addChildAt(entry.layer.container, 0); }
    if (this.mesh) this.mesh.visible = false; this.rivers.visible = false; if (this.riverMesh) this.riverMesh.visible = false;
    const stats = entry.layer.update(grid, doc, ORIGINAL_PRESETS[this.oceanAppearanceState === 'paper' ? 7 : 0], this.terrainDisplay === 'height' ? 'height-palette' : this.terrainDisplay === 'biome' ? 'biome' : 'height-background', this.rainfallPreview);
    if (stats && this.initialized) { this.canvas.dataset.editorRenderer = 'original'; this.canvas.dataset.originalEditor = JSON.stringify({ ...stats, grid: grid.id }); }
  }
  /** Display only: keep candidate geometry, camera, history and caches intact. */
  setTerrainDisplay(display: FmsTerrainDisplay): void {
    if(this.destroyed||this.contextLost)return;
    this.terrainDisplay=display;
    if(this.currentDocument)this.biomeFields.select(this.currentDocument,display);
  }
  private applyBiomeDisplay(state:FmsBiomeDisplayState):void {
    if(this.destroyed||this.contextLost)return;
    try {
      const {display,surface}=state;this.terrainDisplay=state.requested;
      if(surface&&this.geometry){const colors=this.geometry.getBuffer('aBiomeColor');colors.data=surface.colors;colors.update();}
      if(this.oceanUniforms){this.oceanUniforms.uniforms.uHeightView=display==='height'?1:0;this.oceanUniforms.uniforms.uBiomeView=display==='biome'?1:0;this.oceanUniforms.update();}
      if(this.initialized){this.canvas.dataset.terrainDisplay=display;this.canvas.dataset.terrainRequested=state.requested;this.canvas.dataset.biomePending=String(state.pending);this.canvas.dataset.biomeExecution='worker';}
      this.updateBiomeMetrics(surface);
      if(this.currentDocument)this.drawRivers(this.currentDocument,surface);
      if(this.original?.grid)this.applyOriginal(this.original.grid);
      this.draw();this.onDisplayState(state);
    }catch(error){this.onDisplayError(error);}
  }
  private drawRivers(doc:FmsDocument,biome?:FmsBiomeSurface):void {
    const surface=this.surfaces.get(doc.elevations);if(!surface)return;
    const segments=biome?biome.rivers.segments:surface.relief>=6?surface.drainage.riverSegments:[];
    const lines=clipFmsRiverSegments(doc,segments);this.rivers.clear();
    this.clearRiverMesh();
    if(biome?.rivers.shape.positions.length){
      const geometry=new Geometry({attributes:{aPosition:{buffer:biome.rivers.shape.positions,format:'float32x2'}}});
      const shader=new Shader({glProgram:GlProgram.from({vertex:`#version 300 es
precision highp float;
in vec2 aPosition;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main(){vec3 p=uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0);gl_Position=vec4(p.xy,0.,1.);}`,
        fragment:`#version 300 es
precision highp float;
out vec4 finalColor;
void main(){finalColor=vec4(.322,.498,.533,1.);}`})});
      this.riverMesh=new Mesh({geometry,shader});
      this.scene.addChildAt(this.riverMesh,this.scene.getChildIndex(this.rivers));
    }
    if(!biome)for(const {from,a,b,mouth}of lines){
      const amount=surface.drainage.accumulation[from]/surface.drainage.stats.minCatchment;
      // Width is the existing bounded web stroke, driven by the active model.
      const width=Math.min(5,1.8+Math.log2(Math.max(1,amount))*.55);
      this.rivers.moveTo(...a).lineTo(...b).stroke({width,color:0x527f88,alpha:.9,cap:mouth?'butt':'round'});
    }
    this.canvas.dataset.riverAlgorithm=biome?biome.rivers.stats.algorithm:surface.drainage.stats.algorithm;
    this.canvas.dataset.riverSegments=String(lines.length);
    this.canvas.dataset.riverGraphSegments=String(segments.length);
    this.canvas.dataset.riverMouths=String(lines.filter(line=>line.mouth).length);
    this.canvas.dataset.riverShape=biome?JSON.stringify(biome.rivers.shape.stats):'';
  }
  private updateBiomeMetrics(surface?:FmsBiomeSurface):void {
    if(!this.initialized)return;
    const metrics=this.biomeFields.metrics();
    this.canvas.dataset.biomeBuilds=String(metrics.builds);
    this.canvas.dataset.biomeBuildMs=String(metrics.elapsedMs);
    this.canvas.dataset.biomeCacheBytes=String(metrics.bytes);
    this.canvas.dataset.biomeStats=surface?JSON.stringify(surface.stats):'';
  }
  setCamera(camera: AtlasCamera): void {
    this.scene.position.set(camera.x,camera.y); this.scene.scale.set(camera.scale); this.draw();
  }
  resize(width: number, height: number): void { if (!this.destroyed) { this.app.renderer.resize(width,height); this.draw(); } }
  showStroke(points: readonly CameraPoint[], tool: string, radius: number): void {
    this.overlay.clear();
    if (points.length) {
      const first=points[0], last=points[points.length-1], scale=this.scene.scale.x;
      if (tool!=='outline') {
        if(points.length===1) this.overlay.circle(first.x,first.y,radius).fill({ color:0xf2e8c1,alpha:.3 });
        else { this.overlay.moveTo(first.x,first.y); for(const point of points.slice(1)) this.overlay.lineTo(point.x,point.y); this.overlay.stroke({width:radius*2,color:0xf2e8c1,alpha:.25,cap:'round',join:'round'}); }
        this.overlay.circle(last.x,last.y,radius).stroke({width:1.2/scale,color:0xf8f0d2,alpha:.9});
      } else {
        this.overlay.moveTo(first.x,first.y); for(const point of points.slice(1)) this.overlay.lineTo(point.x,point.y);
        this.overlay.stroke({width:1.7/scale,color:0xf3e5b5}); this.overlay.circle(first.x,first.y,4/scale).fill(0xf3e5b5);
      }
    }
    this.draw();
  }
  private draw(): void { if(this.initialized&&!this.destroyed&&!this.contextLost) this.app.render(); }
  private clearMesh(): void {
    this.clearRiverMesh();
    this.mesh?.destroy(); this.bound?.destroy(); this.geometry?.destroy(true); this.shader?.destroy(true);
    this.oceanSource?.destroy();this.oceanUniforms?.removeAllListeners();this.oceanSource=undefined;this.oceanUniforms=undefined;
    this.mesh=undefined; this.geometry=undefined; this.shader=undefined; this.worldId=undefined; this.bound=undefined;this.meshDocument=undefined;
  }
  private clearRiverMesh():void {
    if(!this.riverMesh)return;
    const {geometry,shader}=this.riverMesh;this.riverMesh.destroy();geometry.destroy(true);shader?.destroy(true);this.riverMesh=undefined;
  }
  destroy(): void { if(this.destroyed)return; this.destroyed=true;this.oceanFields.clear();this.biomeFields.close();this.original?.layer?.destroy();this.original=undefined;this.currentDocument=undefined; if(!this.initialized)return; this.clearMesh(); this.app.destroy(true,{children:true}); }
}
