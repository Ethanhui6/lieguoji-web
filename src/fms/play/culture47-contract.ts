import {assertCulture47Journal,CULTURE47_RULE,culture47Budget,type Culture47Journal} from './culture47-session';

// Since 0.5.0 only worlds of the current engine are supported; older engines are not shipped.
type FrozenEntry={engine:string;file:string;bytes:number;sha256:string;protocol:number;journalVersion?:number};
export const frozenCulture47=(engine:string):FrozenEntry|undefined=>void engine as undefined;
// Saves since 0.5.0 are all version-2 journals, also those of earlier builds (older engines).
export const culture47JournalVersion=(engine:string)=>engine===__CULTURE47_ENGINE__?2:frozenCulture47(engine)?.journalVersion??2;
export const supportsCulture47=(engine:string)=>engine===__CULTURE47_ENGINE__||!!frozenCulture47(engine);
// Execution / transport failure is not evidence of a corrupt journal.
export class Culture47Unavailable extends Error {}
export class Culture47InvalidJournal extends Error {}

export function assertStoredCulture47(value:unknown):asserts value is Culture47Journal {
  const j=value as Partial<Culture47Journal>|null;
  const v2=typeof j?.engine==='string'&&culture47JournalVersion(j.engine)>=2&&j.version===2;
  if(!j||typeof j!=='object'||Array.isArray(j)||Object.keys(j).length!==(v2?8:7)||!['format','version','rule','engine','id','opening','actions',...(v2?['fork']:[])].every(k=>Object.hasOwn(j,k))||j.format!=='lieguoji-culture-play'||(!v2&&j.version!==1)||j.rule!==CULTURE47_RULE||typeof j.engine!=='string'||!supportsCulture47(j.engine)||typeof j.id!=='string'||!/^fms-[0-9a-f-]{36}$/i.test(j.id)||!Array.isArray(j.actions)||j.actions.length>culture47Budget(v2?2:1).actions)throw new Culture47InvalidJournal('文化日志格式无法验证，原档保留。');
  // Frozen journals must be interpreted by their original validator, not by a
  // newer action or geography implementation. This is only envelope checking.
  if(j.engine===__CULTURE47_ENGINE__)assertCulture47Journal(value);
}
