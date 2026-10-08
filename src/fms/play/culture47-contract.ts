import frozen from './culture47-frozen.json';
import {assertCulture47Journal,CULTURE47_RULE,type Culture47Journal} from './culture47-session';

export const frozenCulture47=(engine:string)=>frozen.find(e=>e.engine===engine);
export const supportsCulture47=(engine:string)=>engine===__CULTURE47_ENGINE__||!!frozenCulture47(engine);
// Execution / transport failure is not evidence of a corrupt journal.
export class Culture47Unavailable extends Error {}
export class Culture47InvalidJournal extends Error {}

export function assertStoredCulture47(value:unknown):asserts value is Culture47Journal {
  const j=value as Partial<Culture47Journal>|null;
  if(!j||typeof j!=='object'||Array.isArray(j)||Object.keys(j).length!==7||!['format','version','rule','engine','id','opening','actions'].every(k=>Object.hasOwn(j,k))||j.format!=='lieguoji-culture-play'||j.version!==1||j.rule!==CULTURE47_RULE||typeof j.engine!=='string'||!supportsCulture47(j.engine)||typeof j.id!=='string'||!/^fms-[0-9a-f-]{36}$/i.test(j.id)||!Array.isArray(j.actions)||j.actions.length>20000)throw new Culture47InvalidJournal('文化日志格式无法验证，原档保留。');
  // Frozen journals must be interpreted by their original validator, not by a
  // newer action or geography implementation. This is only envelope checking.
  if(j.engine===__CULTURE47_ENGINE__)assertCulture47Journal(value);
}
