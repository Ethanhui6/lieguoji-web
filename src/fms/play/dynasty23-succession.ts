import type {Life22Run} from './life22-model';
import {kinHeir,kinName,kinLastName,type KinState} from './dynasty23-state';
import {appointRuler,nameSeed,type Ruler} from './restoration19-records';
type KinWorld=Pick<Life22Run,'world'|'people'|'naming'|'culture'|'chronicle'|'sovereignty'>&{kin:KinState};
export function previewKinSuccession(r:KinWorld,nationId:string):string{
 const id=r.people.nations[nationId]?.leaderId,heir=id?kinHeir(r.kin,id):null;
 return heir?`家族继承候选：${kinName(r,heir)}，${heir.age} 岁；沿用其身份、能力和亲属关系。`:'本国没有已知亲属候选，沿用旧版人物生成；不把未知亲属补写为历史。';
}
/** Native candidate selection, web abdication/term scheduling. No death and no
 * new character draw when an existing heir takes office. */
export function appointKinRuler(r:KinWorld,nationId:string,requestedName?:string):Ruler{
 const headId=r.people.nations[nationId]?.leaderId,heir=headId?kinHeir(r.kin,headId):null;
 if(!heir)return appointRuler(r.chronicle,r.world,nationId,r.naming,requestedName);
 const family=r.kin.families[heir.familyId];if(family.nationId!==nationId||heir.stateId!==r.people.nations[nationId].id)throw Error('继承人不属于本国，已取消交接。');
 const history=r.chronicle.leaders[nationId],order=history.reduce((n,p)=>Math.max(n,p.order),0)+1,id=`ruler-${nationId}-${order}`,previous=history.at(-1),seed=nameSeed(`${r.world.custom!.seed}/${nationId}/${order}`),name=kinName(r,heir),surname=kinLastName(r,heir),regnalName=requestedName??previous!.regnalName;
 const ruler:Ruler={id,name,family:surname,order,regnalName,regnalOrdinal:history.filter(p=>p.regnalName===regnalName).length+1,ascendedDay:r.world.day,endedDay:null,termEndDay:r.world.day+(12+seed%14)*365};
 if(previous&&previous.endedDay===null)previous.endedDay=r.world.day;
 const existing=r.people.persons[heir.id];
 if(existing){if(existing.nationId!==nationId)throw Error('尚不支持跨国旧君主任职。');r.naming.rulers[id]=structuredClone(r.naming.rulers[existing.rulerId]);}
 else{
  const map=r.culture.maps[heir.cultureName!];if(!map||!heir.traits)throw Error('继承人文化或特性缺失。');
  r.people.persons[heir.id]={id:heir.id,stateId:heir.stateId,nationId,rulerId:id,name,family:surname,alive:heir.isAlive,recordedDay:r.world.day,base:structuredClone(heir.base),traits:[...heir.traits]};
  // Naming's old family anchor uses the effective family when native original
  // family is 0; kin keeps that native 0 unchanged. It is not a new ancestor.
  r.naming.rulers[id]={baseCultureId:map.baseCultureId,mapCultureId:heir.cultureName!,first:heir.firstName,storedLast:heir.lastName!,gender:heir.gender as 0|1,originalFamilyId:heir.originalFamilyId||heir.familyId,familyId:heir.familyId,name,origin:'native'};
 }
 r.chronicle.leaders[nationId]=[...history,ruler];r.naming.revision++;r.sovereignty.reigns[id]=heir.id;r.sovereignty.revision++;r.people.nations[nationId].leaderId=heir.id;r.people.revision++;family.headId=heir.id;r.kin.revision++;return ruler;
}
