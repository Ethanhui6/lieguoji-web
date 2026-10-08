import {Naming18Session} from './naming18-session';
import {Restoration19Session} from './restoration19-session';
import {Destiny20Session} from './destiny20-session';
import {Muster21Session} from './muster21-session';
import {Life22Session} from './life22-session';
import {Dynasty23Session} from './dynasty23-session';
import {Voyage24Session} from './voyage24-session';
import {Settlement25Session} from './settlement25-session';
import {War26Session} from './war26-session';
import {War27Session} from './war27-session';
import type {LegacyCreate,LegacyRule} from './legacy-create';
const sessions={18:Naming18Session,19:Restoration19Session,20:Destiny20Session,21:Muster21Session,22:Life22Session,23:Dynasty23Session,24:Voyage24Session,25:Settlement25Session,26:War26Session,27:War27Session};
self.onmessage=(e:MessageEvent<{version:LegacyRule;command:LegacyCreate}>)=>{
 try{
  const {version,command}=e.data;if(version===46||!(version in sessions)||command.type!=='create')throw new Error('请选择支持的旧规则。');
  const {terrain,count,relations,cultures,cityCount}=command;
  // Keep ten recursive historical command unions out of one inferred call.
  // Each original creator validates its input; War46 load validates the full
  // returned run again before it can enter the playable state.
  const Creator=sessions[version] as new()=>{execute(c:LegacyCreate):{run?:{version:number}}};
  const session=new Creator();
  const result=session.execute({type:'create',terrain,count,relations,cultures,...(version>=25?{cityCount}:{})} as LegacyCreate);
  if(!result.run||result.run.version!==version)throw new Error('旧规则创建版本不匹配。');
  self.postMessage({run:result.run});
 }catch(e){self.postMessage({error:e instanceof Error?e.message:'旧规则创建失败。'});}
};
