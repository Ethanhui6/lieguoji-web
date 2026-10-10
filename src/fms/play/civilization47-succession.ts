import {nativeFindSuccessor} from './native-economy/family-succession';
import {nameSeed,regnalLabel,validRegnalName,type Ruler} from './chronicle-records';
import {rulerFromPerson47} from './civilization47-names';
import {assertPopulation47} from './civilization47-population-validation';
import {populationStamp47,type Population47,type PopulationStamp47,type FamilyPerson47} from './civilization47-population-types';
import {closeLeaderRole47,leaderRole47} from './civilization47-roles';
import {announce} from './civilization47-history';

export function familyHeir47(r:Population47,nationId:string) {
  if(!Object.hasOwn(r.people.nations,nationId))return null;
  const headId=r.people.nations[nationId].leaderId,head=headId===null?null:r.kin.persons[headId],family=head&&r.kin.families[head.familyId];
  if(!head||!family)return null;
  // Exact native ordering, including minors and female score penalties. Do not
  // invent a virtual relative when the recovered selector has no real candidate.
  return nativeFindSuccessor(family,head,id=>r.kin.persons[id],()=>null);
}
export function previewFamilySuccession47(r:Population47,nationId:string,regnalName?:string) {
  assertPopulation47(r);
  if(!Object.hasOwn(r.civilization.nations,nationId))throw Error('国家不存在。');
  const nation=r.civilization.nations[nationId];
  if(!['Kingdom','Empire','Tribal'].includes(nation.polity))throw Error('该政体不使用当前的家族传位命令；选举及宗教任职流程尚待接入。');
  const heir=familyHeir47(r,nationId);if(!heir)throw Error('当前没有已知且存活的家族继承候选，原任职者保持。');
  if(!heir.isAlive||heir.stateId!==r.people.nations[nationId].id||r.kin.families[heir.familyId].nationId!==nationId)throw Error('继承候选不属于本国。');
  const requested=regnalName??heir.identity.given;if(!validRegnalName(requested))throw Error('请输入有效王号。');
  const history=r.chronicle.leaders[nationId],order=history.length+1,regnalOrdinal=history.filter(h=>h.regnalName===requested).length+1;
  return {nationId,personId:heir.id,name:heir.identity.name,age:heir.age,regnalName:requested,regnalOrdinal,order,title:rulerFromPerson47(heir.identity,nation,requested).titleAtAccession,expected:populationStamp47(r)};
}
/** Atomic known-heir appointment; former rulers keep their first court anchor.
 * An abdication never marks the predecessor dead or consumes a new person ID. */
export function appointFamilyRuler47<T extends Population47>(input:T,nationId:string,expected:PopulationStamp47,requestedName?:string):T {
  assertPopulation47(input);const stamp=populationStamp47(input),keys=Object.keys(stamp) as (keyof PopulationStamp47)[];
  if(!expected||typeof expected!=='object'||Object.keys(expected).length!==keys.length||keys.some(k=>!Object.hasOwn(expected,k)||expected[k]!==stamp[k]))throw Error('传位预览已过期，请重新查看候选。');
  const preview=previewFamilySuccession47(input,nationId,requestedName);
  if(!Number.isSafeInteger(preview.order)||input.world.nextEventId>=Number.MAX_SAFE_INTEGER-100001||!Number.isSafeInteger(input.chronicle.nextEntryId+1)||[input.kin.revision,input.sovereignty.revision,input.people.revision,input.civilization.revision].some(n=>n>=2147483647))throw Error('历史或版本记录已达上限，原任职者保持。');
  const r=structuredClone(input);closeLeaderRole47(r,nationId,'abdication');
  appointKnownPersonOwned47(r,nationId,r.kin.persons[preview.personId],'abdication',preview.regnalName);
  assertPopulation47(r);return r;
}
/** Internal candidate owner only. Government and family leadership are
 * separate; appointment never kills the predecessor or changes the patriarch. */
export function appointKnownPersonOwned47(r:Population47,nationId:string,heir:FamilyPerson47,cause:'abdication'|'death'|'vacancy'|'restoration',requestedName=heir.identity.given){
  const history=r.chronicle.leaders[nationId],old=history.at(-1)!,order=history.length+1,id=`ruler-${nationId}-${order}`,nation=r.civilization.nations[nationId];
  if(!heir.isAlive||r.kin.persons[heir.id]!==heir||heir.stateId!==r.people.nations[nationId].id||heir.roles.some(v=>v.nativeKind==='leader')||!validRegnalName(requestedName)||!Number.isSafeInteger(order))throw Error('接任候选或任次无效。');
  const identity=rulerFromPerson47(heir.identity,nation,requestedName),seed=nameSeed(`${r.world.custom!.seed}/${nationId}/${order}`),regnalOrdinal=history.filter(h=>h.regnalName===requestedName).length+1;
  const reign:Ruler={id,name:identity.name,family:identity.house,order,regnalName:requestedName,regnalOrdinal,ascendedDay:r.world.day,endedDay:null,termEndDay:r.world.day+(12+seed%14)*365};
  if(old.endedDay===null)old.endedDay=r.world.day;
  history.push(reign);r.civilization.rulers[id]=identity;r.civilization.revision++;
  if(!Object.hasOwn(r.people.persons,heir.id))r.people.persons[heir.id]={id:heir.id,stateId:heir.stateId,nationId,rulerId:id,name:identity.name,family:identity.house,alive:true,recordedDay:r.world.day,base:structuredClone(heir.base),traits:[...heir.traits!]};
  r.people.nations[nationId].leaderId=heir.id;r.people.revision++;heir.roles.push(leaderRole47(r,heir,identity.titleAtAccession));r.kin.revision++;
  r.sovereignty.reigns[id]=heir.id;r.sovereignty.revision++;delete r.kin.lifecycle.vacancies[nationId];
  const start=cause==='abdication'?`${old.name}传位，`:cause==='death'?`${old.name}去世后，`:cause==='restoration'?'重获领土后，':'领袖空缺后，';
  const title=['Kingdom','Empire'].includes(nation.polity)?`${regnalLabel(reign)}，第${order}任`:`第${order}任`;
  const reason=cause==='abdication'?'玩家安排已知家族成员传位，前任仍然在世。':(['Republic','Federation'].includes(nation.polity)?'按原作共和国／联邦紧急候选规则，从至少25岁的已知在世成员中补位；正常投票选举尚未接入。':'按已恢复的本政体候选规则，从真实登记的在世人物中接任。');
  announce(r.chronicle,r.world,r.clock.tick,'accession',`${r.world.nations.find(n=>n.id===nationId)!.name}：${start}${identity.name}继任${identity.titleAtAccession}（${title}）`,reason+' 人物身份、生日、能力和亲属关系保留；家主独立继承。',[nationId],null,[reign]);
  return reign;
}
