/// <reference lib="webworker" />
import {Culture47Session,type Culture47Opening,type Culture47Journal,type Culture47Action} from './culture47-session';
export type Culture47Request={type:'create';opening:Culture47Opening}|{type:'load'|'verify';journal:Culture47Journal}|{type:'action';action:Culture47Action;sequence:number};
export type Culture47Snapshot=ReturnType<Culture47Session['snapshot']>;
export type Culture47Response={id:number;snapshot?:Culture47Snapshot;error?:string};
const session=new Culture47Session();
self.onmessage=(e:MessageEvent<{id:number;command:Culture47Request}>)=>{
  const {id,command:c}=e.data;
  try{const snapshot=c.type==='create'?session.create(c.opening):c.type==='load'?session.load(c.journal):c.type==='verify'?new Culture47Session().load(c.journal):c.type==='action'?session.execute(c.action,c.sequence):(()=>{throw Error('未知模拟命令。');})();self.postMessage({id,snapshot} satisfies Culture47Response);}
  catch(e){self.postMessage({id,error:e instanceof Error?e.message:'文化模拟失败，原世界保持。'} satisfies Culture47Response);}
};
