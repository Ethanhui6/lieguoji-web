import {Container,Graphics,Rectangle,Sprite,Texture} from 'pixi.js';
import atlasUrl from './assets/battle-sword.png';
import {BattleAnimationClock} from './battle-animation';
import type {CombatMarker47} from './combat-map47';

/** The already reviewed original BattleSword atlas, on accepted 47 contacts.
 * Authored 40 frames / 12 Hz. It presents combat; it never produces damage. */
export class CombatOverlay47 {
 readonly layer=new Container();
 private bars=new Graphics();private sprites=new Map<string,Sprite>();
 private clock=new BattleAnimationClock();private atlas?:Texture;private frames:Texture[]=[];private disposed=false;
 constructor(refresh:()=>void){
  this.layer.addChild(this.bars);this.layer.enableRenderGroup();
  const image=new Image();image.onload=()=>{if(this.disposed)return;this.atlas=Texture.from(image);this.frames=Array.from({length:40},(_,i)=>new Texture({source:this.atlas!.source,frame:new Rectangle(i%5*258,Math.floor(i/5)*194,258,194)}));refresh();};image.src=atlasUrl;
 }
 animate(now:number,running:boolean,reduced:boolean){return this.clock.step(now,running,reduced)&&this.sprites.size>0;}
 draw(markers:readonly CombatMarker47[],allIds:readonly string[],mapScale:number,cameraScale:number,now:number,running:boolean,reduced:boolean){
  this.clock.sync(allIds);this.clock.step(now,running,reduced);this.bars.clear();
  const visible=new Set(markers.filter(m=>m.kind==='contact').map(m=>m.id));
  for(const [id,sprite]of this.sprites)if(!visible.has(id)){sprite.destroy();this.sprites.delete(id);}
  for(const marker of markers){const x=marker.point.x/mapScale,y=marker.point.y/mapScale;
   if(marker.kind==='siege'){
    this.bars.roundRect(x-9/cameraScale,y+9/cameraScale,18/cameraScale,3/cameraScale,1/cameraScale).fill({color:0x493f31,alpha:.8});
    this.bars.rect(x-9/cameraScale,y+9/cameraScale,18*(marker.progress??0)/cameraScale,3/cameraScale).fill(0xd9ac56);continue;
   }
   if(!this.frames.length)continue;let sprite=this.sprites.get(marker.id);
   if(!sprite){sprite=new Sprite(this.frames[0]);sprite.anchor.set(.5);this.layer.addChild(sprite);this.sprites.set(marker.id,sprite);}
   sprite.texture=this.frames[this.clock.frame(marker.id)];sprite.position.set(x,y);sprite.width=26/cameraScale;sprite.height=26*194/258/cameraScale;
  }
 }
 diagnostics(){return [...this.sprites].map(([id,sprite])=>({id,frame:this.clock.frame(id),x:sprite.x,y:sprite.y,width:sprite.width}));}
 dispose(){this.disposed=true;this.layer.destroy({children:true});for(const frame of this.frames)frame.destroy(false);this.atlas?.destroy(true);}
}
