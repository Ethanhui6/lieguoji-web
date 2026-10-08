/// <reference lib="webworker" />
import {Culture47Session,type Culture47Opening,type Culture47Journal,type Culture47Action,type Culture47Progress} from './culture47-session';
import type {PoliticalCommand47} from './civilization47-political-owner';
import type {MilitaryIntent47} from './culture47-orders';
export type Culture47Request={type:'create';opening:Culture47Opening}|{type:'load'|'verify';journal:Culture47Journal}|{type:'action';action:Culture47Action;sequence:number}|{type:'political-preview';action:PoliticalCommand47}|{type:'military-preview';intent:MilitaryIntent47};
export type Culture47Snapshot=ReturnType<Culture47Session['snapshot']>&{politicalPreview?:ReturnType<Culture47Session['preview']>;militaryPreview?:ReturnType<Culture47Session['previewOrder']>};
export type Culture47Response={id:number;snapshot?:Culture47Snapshot;error?:string;progress?:Culture47Progress;verified?:{engine:string;worldId:string;actions:number;source:'witness'|'replay'}};
const session=new Culture47Session();
self.onmessage=(e:MessageEvent<{id:number;command:Culture47Request}>)=>{
  const {id,command:c}=e.data;
  const progress=(p:Culture47Progress)=>self.postMessage({id,progress:p} satisfies Culture47Response);
  try{
    if(c.type==='verify'){const source=session.verify(c.journal,progress);self.postMessage({id,verified:{engine:c.journal.engine,worldId:c.journal.id,actions:c.journal.actions.length,source}} satisfies Culture47Response);return;}
    const snapshot=c.type==='create'?session.create(c.opening):c.type==='load'?session.load(c.journal,progress):c.type==='action'?session.execute(c.action,c.sequence):c.type==='political-preview'?{...session.snapshot(),politicalPreview:session.preview(c.action)}:c.type==='military-preview'?{...session.snapshot(),militaryPreview:session.previewOrder(c.intent)}:(()=>{throw Error('未知模拟命令。');})();self.postMessage({id,snapshot} satisfies Culture47Response);}
  catch(e){self.postMessage({id,error:e instanceof Error?e.message:'文化模拟失败，原世界保持。'} satisfies Culture47Response);}
};
