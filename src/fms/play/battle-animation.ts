/** Recovered BattleSword clip: 40 authored sprite frames, 12 Hz, looping.
 * This clock only presents existing engagements; it never creates combat or damage.
 */
export const BATTLE_FRAME_COUNT=40;
export const BATTLE_FRAME_RATE=12;
export class BattleAnimationClock{
  private last:number|null=null;
  private entries=new Map<string,{elapsed:number;frame:number}>();
  sync(ids:readonly string[]){const live=new Set(ids);for(const id of this.entries.keys())if(!live.has(id))this.entries.delete(id);for(const id of live)if(!this.entries.has(id))this.entries.set(id,{elapsed:0,frame:0});}
  frame(id:string){return this.entries.get(id)?.frame??0;}
  step(now:number,running:boolean,reduced:boolean){
    // Hidden tabs do not fast-forward a decorative clip when they become visible.
    const delta=this.last===null?0:Math.min(100,Math.max(0,now-this.last));this.last=now;let changed=false;
    for(const value of this.entries.values()){
      if(running&&!reduced)value.elapsed+=delta;
      const frame=reduced?0:Math.floor(value.elapsed*BATTLE_FRAME_RATE/1000)%BATTLE_FRAME_COUNT;
      changed||=frame!==value.frame;value.frame=frame;
    }
    return changed;
  }
}
