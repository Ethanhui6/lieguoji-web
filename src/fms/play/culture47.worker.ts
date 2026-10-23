/// <reference lib="webworker" />
import {Culture47Session,type Culture47Checkpoint,type Culture47Opening,type Culture47Journal,type Culture47Action,type Culture47Progress} from './culture47-session';
import {takePhases47} from './perf47';
import type {PoliticalCommand47} from './civilization47-political-owner';
import type {MilitaryIntent47} from './culture47-orders';
import type {Culture47DisplayPacket} from './culture47-display';
import type {ForceDisplayTrace47} from './force-display-trace47';
export type Culture47Request={type:'create';opening:Culture47Opening}|{type:'load'|'verify';journal:Culture47Journal}|{type:'action';action:Culture47Action;sequence:number}|{type:'advance-batch';ticks:number;sequence:number}|{type:'political-preview';action:PoliticalCommand47}|{type:'military-preview';intent:MilitaryIntent47}|{type:'checkpoint'}|{type:'resume';journal:Culture47Journal;checkpoint:Culture47Checkpoint};
export type Culture47Snapshot=ReturnType<Culture47Session['snapshot']>&{motion?:ForceDisplayTrace47;politicalPreview?:ReturnType<Culture47Session['preview']>;militaryPreview?:ReturnType<Culture47Session['previewOrder']>};
export type Culture47Response={timing?:{compute:number;phases?:Record<string,number>};id:number;snapshot?:Culture47Snapshot;display?:Culture47DisplayPacket;error?:string;unavailable?:boolean;progress?:Culture47Progress;verified?:{engine:string;worldId:string;actions:number;source:'witness'|'replay'};checkpoint?:Culture47Checkpoint};
const session=new Culture47Session();
self.onmessage=(e:MessageEvent<{id:number;command:Culture47Request}>)=>{
  const {id,command:c}=e.data;
  let sending=false;
  const respond=(r:Culture47Response)=>{sending=true;self.postMessage(r);sending=false;};
  const progress=(p:Culture47Progress)=>respond({id,progress:p});
  try{
    if(c.type==='verify'){const source=session.verify(c.journal,progress);respond({id,verified:{engine:c.journal.engine,worldId:c.journal.id,actions:c.journal.actions.length,source}});return;}
    if(c.type==='checkpoint'){respond({id,checkpoint:session.checkpoint()});return;}
    if(c.type==='resume'){session.resume(c.journal,c.checkpoint);respond({id,display:session.displaySnapshot()});return;}
    if(c.type==='create'||c.type==='load'){if(c.type==='create')session.create(c.opening);else session.load(c.journal,progress);respond({id,display:session.displaySnapshot()});return;}
    if(c.type==='action'||c.type==='advance-batch'){
      const actions:Culture47Action[]=[];
      if(c.type==='action')actions.push(c.action);
      else {if(!Number.isSafeInteger(c.ticks)||c.ticks<1||c.ticks>1200)throw Error('推进批次超出范围。');for(let remaining=c.ticks;remaining>0;remaining-=120)actions.push({kind:'advance',ticks:Math.min(120,remaining)});}
      const started=performance.now(),display=session.executeDisplay(actions,c.sequence);
      respond({id,display,timing:{compute:performance.now()-started,phases:takePhases47()}});return;
    }
    const snapshot=c.type==='political-preview'?{...session.snapshot(),politicalPreview:session.preview(c.action)}:c.type==='military-preview'?{...session.snapshot(),militaryPreview:session.previewOrder(c.intent)}:(()=>{throw Error('未知模拟命令。');})();respond({id,snapshot});}
  catch(e){self.postMessage({id,error:e instanceof Error?e.message:'文化模拟失败，原世界保持。',unavailable:sending} satisfies Culture47Response);}
};
