import { Application, Container, Geometry, GlProgram, Graphics, Mesh, Shader } from 'pixi.js';
// Pixi's no-eval polyfill preserves the existing strict production CSP.
import 'pixi.js/unsafe-eval';
import type { AtlasCamera, CameraPoint } from '../world/camera';
import type { FmsDocument } from './model';

// This direct source mesh is a web rendering adapter. Interpolated elevation is
// authoritative; no texture tiles, invented rivers, or generated decoration.
const vertex = `#version 300 es
precision highp float;
in vec2 aPosition;
in float aHeight;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out float vHeight;
void main(){vHeight=aHeight;vec3 p=uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0);gl_Position=vec4(p.xy,0.0,1.0);}`;
const fragment = `#version 300 es
precision highp float;
in float vHeight;
out vec4 finalColor;
void main(){
 float h=vHeight;
 vec3 deep=vec3(.235,.365,.425), shallow=vec3(.47,.62,.64);
 vec3 sea=mix(deep,shallow,smoothstep(0.0,20.0,h));
 vec3 low=vec3(.78,.77,.61), high=vec3(.52,.57,.43);
 vec3 land=mix(low,high,smoothstep(30.0,100.0,h));
 float edge=max(fwidth(h),.12);
 vec3 color=mix(sea,land,smoothstep(20.0-edge,20.0+edge,h));
 color=mix(color,vec3(.85,.84,.68),.55*(1.0-smoothstep(edge,edge+1.1,abs(h-20.0))));
 finalColor=vec4(color,1.0);
}`;

export class FmsRenderer {
  private app = new Application();
  private scene = new Container();
  private overlay = new Graphics();
  private geometry?: Geometry;
  private shader?: Shader;
  private destroyed = false;
  private initialized = false;
  private mesh?: Mesh<Geometry, Shader>;
  private contextLost = false;
  private worldId?: string;
  private bound?: Graphics;
  get canvas(): HTMLCanvasElement { return this.app.canvas; }
  async init(host: HTMLElement): Promise<void> {
    await this.app.init({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight), resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, antialias: true, autoStart: false, background: '#3c5d6c', preference: 'webgl' });
    this.initialized = true;
    if (this.destroyed) { this.app.destroy(true, { children: true }); return; }
    this.canvas.setAttribute('aria-label','创世地图画布'); this.canvas.setAttribute('data-testid','fms-canvas'); this.canvas.tabIndex = 0;
    host.appendChild(this.canvas); this.app.stage.addChild(this.scene);
    this.canvas.addEventListener('webglcontextlost', () => { this.contextLost = true; });
  }
  setDocument(doc: FmsDocument): void {
    if (this.destroyed) return;
    if (this.worldId !== doc.worldId) {
      this.clearMesh();
      const positions = new Float32Array(doc.points.length * 2);
      doc.points.forEach((p, i) => { positions[i * 2] = p[0]; positions[i * 2 + 1] = p[1]; });
      this.geometry = new Geometry({ attributes: { aPosition: { buffer: positions, format: 'float32x2' }, aHeight: { buffer: Float32Array.from(doc.elevations), format: 'float32' } }, indexBuffer: doc.triangles.slice() });
      this.geometry.autoGarbageCollect = false;
      this.shader = new Shader({ glProgram: new GlProgram({ vertex, fragment, name: 'fms-direct-source-height-v1' }), resources: {} });
      this.shader.addResource('globalUniforms',100,0); this.shader.addResource('localUniforms',101,0);
      this.mesh = new Mesh({ geometry: this.geometry, shader: this.shader });
      this.bound = new Graphics().rect(0,0,doc.width,doc.height).stroke({ width: 1, color: 0xb0c1be, alpha: .25 });
      this.scene.addChild(this.mesh, this.bound, this.overlay); this.worldId = doc.worldId;
    } else if (this.geometry) {
      const buffer = this.geometry.getBuffer('aHeight'); buffer.data = Float32Array.from(doc.elevations); buffer.update();
    }
    this.draw();
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
    this.mesh?.destroy(); this.bound?.destroy(); this.geometry?.destroy(true); this.shader?.destroy(true);
    this.mesh=undefined; this.geometry=undefined; this.shader=undefined; this.worldId=undefined; this.bound=undefined;
  }
  destroy(): void { if(this.destroyed)return; this.destroyed=true; if(!this.initialized)return; this.clearMesh(); this.app.destroy(true,{children:true}); }
}
