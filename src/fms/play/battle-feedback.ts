import type { BattleState } from './battle';

/** Presentation follows actual loss pulses; loading an existing fight is not a hit. */
export class BattleFeedback {
  private samples=new Map<string,{pulse:number;loss:number;at:number}>();
  observe(state:BattleState,now:number){
    const live=new Set(state.engagements.map(e=>e.id));
    for(const id of this.samples.keys())if(!live.has(id))this.samples.delete(id);
    for(const e of state.engagements){const loss=Object.values(e.losses).reduce((a,b)=>a+b,0),old=this.samples.get(e.id);
      this.samples.set(e.id,{pulse:e.pulse,loss,at:old&&e.pulse>old.pulse&&loss>old.loss?now:old?.at??-Infinity});
    }
  }
  strength(id:string,now:number,running:boolean,reduced:boolean){const s=this.samples.get(id);return running&&!reduced&&s?Math.max(0,1-(now-s.at)/260):0;}
  active(now:number,running:boolean,reduced:boolean){return [...this.samples.keys()].some(id=>this.strength(id,now,running,reduced)>0);}
}
