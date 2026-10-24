import {Container,Graphics,Sprite,Texture} from 'pixi.js';
import {PEACE_BIRD47,WAR_CLAIM_ICON47} from './war-effect-icons47';

type Point={x:number;y:number};
/** Original war presentation, all in map space:
 * - PlayerController.DrawAttackArrowAnim + UpdateArrowAnim: a red arrow from the
 *   attacker's pole to the defender's pole, its pattern flowing 5 units/s, removed after 2 s.
 * - WarClaimAnimationManager / WarClaimMarker: the claimed provinces of the war goals get
 *   the war-claim-target icon tinted with the claimant colour, one every 0.05 s (at most 30
 *   at once): 0.22 s entry from 60° and 3.2 units, 0.18 s impact (squash 0.88, shake 0.06),
 *   3 s hold with a 5 % pulse at 4 rad/s, 0.6 s fade.
 * - WarManager.PlayPeaceAnimationFor / PeaceAnimation: at war end a PeaceBird rises 2 units
 *   above every participant's pole (0.5 s, smoothstep), stays 0.5 s and fades in 0.6 s.
 * Unity world units are mapped to screen pixels at a fixed ratio so the effect keeps its
 * original proportions at every zoom. */
const UNIT_PX=10,ICON_PX=22,BIRD_PX=30,MAX_MARKERS=30;
const smooth=(t:number)=>t*t*(3-2*t);
type Arrow={from:Point;to:Point;start:number;graphic:Graphics};
type Marker={at:Point;color:number;start:number;sprite:Sprite;seed:number};
type Bird={at:Point;start:number;sprite:Sprite};
export class WarEffects47{
  readonly layer=new Container();
  private arrows:Arrow[]=[];private markers:Marker[]=[];private birds:Bird[]=[];
  private claimTexture=Texture.EMPTY;private birdTexture=Texture.EMPTY;private disposed=false;
  constructor(){
    this.layer.eventMode='none';
    const load=(url:string,set:(t:Texture)=>void)=>{const img=new Image();img.onload=()=>{if(!this.disposed)set(Texture.from(img));};img.src=url;};
    load(WAR_CLAIM_ICON47,t=>{this.claimTexture=t;for(const m of this.markers)m.sprite.texture=t;});
    load(PEACE_BIRD47,t=>{this.birdTexture=t;for(const b of this.birds)b.sprite.texture=t;});
  }
  get active(){return this.arrows.length+this.markers.length+this.birds.length>0;}
  declare(from:Point,to:Point,now:number){const graphic=new Graphics();this.layer.addChild(graphic);this.arrows.push({from,to,start:now,graphic});}
  claims(points:readonly Point[],color:number,now:number){
    points.forEach((at,i)=>{
      if(this.markers.length>=MAX_MARKERS)return;
      const sprite=new Sprite(this.claimTexture);sprite.anchor.set(.5);sprite.tint=color;sprite.alpha=0;this.layer.addChild(sprite);
      this.markers.push({at,color,start:now+i*50,sprite,seed:i});
    });
  }
  peace(points:readonly Point[],now:number){
    for(const at of points){const sprite=new Sprite(this.birdTexture);sprite.anchor.set(.5);sprite.alpha=0;this.layer.addChild(sprite);this.birds.push({at,start:now,sprite});}
  }
  /** Redraw at the current camera; returns true while anything is still animating. */
  draw(now:number,cameraScale:number){
    const px=1/cameraScale;
    this.arrows=this.arrows.filter(a=>{
      const t=(now-a.start)/1000;if(t>=2){a.graphic.destroy();return false;}
      drawFlowArrow(a.graphic,a.from,a.to,px,t*5,Math.min(1,(2-t)/.3));return true;
    });
    this.markers=this.markers.filter(m=>{
      const t=(now-m.start)/1000,s=m.sprite,size=ICON_PX*.9*px;
      if(t<0){s.alpha=0;return true;}
      const entry=.22,impact=.18,hold=3,fade=.6;
      if(t>=entry+impact+hold+fade){s.destroy();return false;}
      if(t<entry){
        const k=smooth(t/entry),angle=60*Math.PI/180,d=3.2*UNIT_PX*px*(1-k);
        s.position.set(m.at.x+Math.cos(angle)*d,m.at.y-Math.sin(angle)*d);s.alpha=k;s.scale.set(size/s.texture.width);
      }else if(t<entry+impact){
        const k=(t-entry)/impact,squash=1-(1-.88)*Math.sin(Math.PI*k),shake=.06*UNIT_PX*px*Math.sin(k*Math.PI*6+m.seed)*(1-k);
        s.position.set(m.at.x+shake,m.at.y);s.alpha=1;s.scale.set(size/s.texture.width*(2-squash),size/s.texture.width*squash);
      }else if(t<entry+impact+hold){
        const pulse=1+.05*Math.sin((t-entry-impact)*4);
        s.position.set(m.at.x,m.at.y);s.alpha=1;s.scale.set(size/s.texture.width*pulse);
      }else{
        const k=(t-entry-impact-hold)/fade;s.position.set(m.at.x,m.at.y);s.alpha=1-k;s.scale.set(size/s.texture.width);
      }
      return true;
    });
    this.birds=this.birds.filter(b=>{
      const t=(now-b.start)/1000,s=b.sprite,move=.5,stay=.5,fade=.6;
      if(t>=move+stay+fade){s.destroy();return false;}
      const rise=2*UNIT_PX*px*smooth(Math.min(1,t/move));
      s.position.set(b.at.x,b.at.y-rise);s.scale.set(BIRD_PX*px/s.texture.width);
      s.alpha=t<move+stay?1:1-(t-move-stay)/fade;return true;
    });
    return this.active;
  }
  dispose(){this.disposed=true;this.layer.destroy({children:true});if(this.claimTexture!==Texture.EMPTY)this.claimTexture.destroy(true);if(this.birdTexture!==Texture.EMPTY)this.birdTexture.destroy(true);}
}
/** A tapering red arrow along a gentle curve whose dashes flow toward the target. */
function drawFlowArrow(g:Graphics,a:Point,b:Point,px:number,flow:number,alpha:number){
  g.clear();
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<1e-6)return;
  const nx=-dy/len,ny=dx/len,bend=len*.18,c={x:(a.x+b.x)/2+nx*bend,y:(a.y+b.y)/2+ny*bend};
  const at=(t:number)=>({x:(1-t)**2*a.x+2*(1-t)*t*c.x+t*t*b.x,y:(1-t)**2*a.y+2*(1-t)*t*c.y+t*t*b.y});
  const width=(t:number)=>(2+5*Math.sin(Math.PI*Math.min(1,t*1.15)))*px;
  const head=Math.min(len*.22,18*px),end=1-head/len,steps=48,dash=10*px,gap=6*px,offset=(flow*UNIT_PX*px)%(dash+gap);
  let travelled=0,prev=at(0);
  for(let i=1;i<=steps;i++){
    const t=end*i/steps,p=at(t),seg=Math.hypot(p.x-prev.x,p.y-prev.y),phase=(travelled-offset+(dash+gap)*1000)%(dash+gap);
    if(phase<dash)g.moveTo(prev.x,prev.y).lineTo(p.x,p.y).stroke({width:width(t),color:0xff0000,alpha:alpha*.9,cap:'round'});
    travelled+=seg;prev=p;
  }
  const tip=at(1),base=at(end),ux=(tip.x-base.x)/(Math.hypot(tip.x-base.x,tip.y-base.y)||1),uy=(tip.y-base.y)/(Math.hypot(tip.x-base.x,tip.y-base.y)||1),w=9*px;
  g.poly([tip.x,tip.y,base.x-uy*w,base.y+ux*w,base.x+uy*w,base.y-ux*w]).fill({color:0xff0000,alpha});
}
