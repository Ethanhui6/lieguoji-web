import {culture47} from './civilization47-catalog';
import {personNameFromParts47} from './civilization47-names';
import {nativeCharacterDefaults,nativeCreateBlankCharacter,nativeCreateNamedCharacter} from './native-economy/character-registry';
import {nativeRandomTraits,NATIVE_CHARACTER_POOL} from './native-economy/character-generation';
import {nativeSpouseRoleDefaults} from './native-economy/family-members';
import type {NativePastRole} from './native-economy/role-history';
import {nameSeed} from './chronicle-records';
import {announce} from './civilization47-history';
import {assertPopulation47} from './civilization47-population-validation';
import {populationStamp47,type Population47,type PopulationStamp47,type FamilyPerson47,type PersonRole47} from './civilization47-population-types';
import {GENERATIONS_RULE47,generationMonth47,closeKin47,type Generations47} from './civilization47-generations-ledger';

export function enableGenerations47<T extends Population47>(input:T,expected:PopulationStamp47):T{
 assertPopulation47(input);const stamp=populationStamp47(input);
 if(!expected||Object.keys(expected).length!==Object.keys(stamp).length||Object.entries(stamp).some(([k,v])=>expected[k as keyof PopulationStamp47]!==v)||input.generations||input.clock.tick!==0||input.houses?.grants.length)throw Error('婚育只能在新世界开篇明确启用，旧档保持。');
 const r=structuredClone(input);for(const f of Object.values(r.kin.families)){f.memberIds=[...f.memberIds];f.collateralMemberIds=[...f.collateralMemberIds];}for(const g of r.houses?.grants??[])g.memberIds=[...g.memberIds];
 r.generations={version:1,rule:GENERATIONS_RULE47,enabledTick:0,firstPersonId:r.people.nextPersonId,lastMonth:generationMonth47(r),random:{state:nameSeed(r.world.custom!.seed+'/generations47'),draws:0},initialCouples:Object.values(r.kin.persons).filter(p=>p.spouseId>p.id).map(p=>[p.id,p.spouseId]),births:[],marriages:[]};r.kin.revision++;assertPopulation47(r);return r;
}
function draw(s:Generations47){if(!Number.isSafeInteger(s.random.draws+1))throw Error('婚育随机记录已达精度上限。');s.random.state=(Math.imul(s.random.state,1664525)+1013904223)>>>0;s.random.draws++;return s.random.state/4294967296;}
const everMarried=(s:Generations47,id:number)=>s.initialCouples.some(pair=>pair.includes(id))||s.marriages.some(m=>m.aId===id||m.bId===id);
export function marriageEligible47(r:Population47,a:FamilyPerson47,b:FamilyPerson47){
 const s=r.generations,f=r.kin.families[a.familyId],old=r.kin.families[b.familyId];
 return !!s&&a.id!==b.id&&a.isAlive&&b.isAlive&&a.age>=18&&b.age>=18&&a.age<=60&&b.age<=60&&a.gender!==b.gender&&a.stateId===b.stateId&&a.cultureName===b.cultureName&&!a.spouseId&&!b.spouseId&&!a.childrenIds.length&&!b.childrenIds.length&&!everMarried(s,a.id)&&!everMarried(s,b.id)&&!closeKin47(r,a.id,b.id)&&!!f?.headId&&!!old?.headId&&b.source!=='founding'&&old.headId!==b.id&&!b.roles.length&&!Object.hasOwn(r.people.persons,b.id)&&!r.houses?.grants.some(g=>g.founderId===b.id)&&!r.houseGovernance?.returns.some(v=>v.familyId===f.id);
}
/** Private transaction: records actual registered partners, never fabricates a spouse. */
export function marryPeopleOwned47(r:Population47,aId:number,bId:number){
 const a=r.kin.persons[aId],b=r.kin.persons[bId];if(!a||!b||!marriageEligible47(r,a,b))throw Error('婚姻需要适龄、从未成婚且无已知近亲关系的同国成员。');
 const from=r.kin.families[b.familyId],to=r.kin.families[a.familyId],fromFamilyId=from.id;
 if(from.id!==to.id){from.memberIds=from.memberIds.filter(id=>id!==b.id);from.collateralMemberIds=from.collateralMemberIds.filter(id=>id!==b.id);if(from.heirId===b.id)from.heirId=0;to.memberIds.push(b.id);b.familyId=to.id;}
 a.spouseId=b.id;b.spouseId=a.id;
 for(const [person,spouse]of [[a,b],[b,a]])person.roles.push({...nativeSpouseRoleDefaults(),nativeKind:'spouse',holderId:person.id,spouseOfId:spouse.id,stateId:person.stateId,startTime:r.life.gameTime});
 const event=announce(r.chronicle,r.world,r.clock.tick,'diplomacy',`${r.world.nations.find(n=>n.id===to.nationId)!.name}：${a.identity.name}与${b.identity.name}成婚`,'真实成年成员缔结婚姻；排除已知直系、兄弟姐妹及共同祖父母。同国跨支系可迁入，旧家谱和授封记录保留。婚配时机是网页规则，不宣称已恢复原作择偶算法。',[to.nationId],null);
 r.generations!.marriages.push({aId,bId,movingPersonId:bId,fromFamilyId,toFamilyId:to.id,day:r.world.day,tick:r.clock.tick,entryId:event.id});r.kin.revision++;
}
export function birthEligible47(r:Population47,father:FamilyPerson47,mother:FamilyPerson47){
 if(!r.generations||!father.isAlive||!mother.isAlive||father.gender!==0||mother.gender!==1||father.age<18||father.age>65||mother.age<18||mother.age>42||father.spouseId!==mother.id||mother.spouseId!==father.id||father.familyId!==mother.familyId)return false;
 const month=generationMonth47(r),last=r.generations.births.filter(b=>b.motherId===mother.id).at(-1),lastDate=last&&r.chronicle.entries.find(e=>e.id===last.entryId);
 if(lastDate){const elapsed=(r.world.day-lastDate.day);if(elapsed<548)return false;}
 // Keep growth useful and bounded by households, without a global lifetime cap.
 return month>12&&mother.childrenIds.length<6&&mother.childrenIds.filter(id=>r.kin.persons[id].isAlive&&r.kin.persons[id].age<18).length<3;
}
export function birthPersonOwned47(r:Population47,fatherId:number,motherId:number){
 const father=r.kin.persons[fatherId],mother=r.kin.persons[motherId],s=r.generations;if(!father||!mother||!s||!birthEligible47(r,father,mother))throw Error('出生父母或生育间隔不满足。');
 const family=r.kin.families[father.familyId],profile=culture47(family.cultureName),gender=draw(s)<.5?0:1,pool=gender===0?profile.givenMale:profile.givenFemale,first=pool[Math.floor(draw(s)*pool.length)],identity=personNameFromParts47(family.cultureName,first,family.surname,gender);
 const random={value:()=>draw(s),intRange:(min:number,max:number)=>min+Math.floor(draw(s)*(max-min)),floatRange:(min:number,max:number)=>Math.fround(min+draw(s)*(max-min))};
 const registry={nextId:r.people.nextPersonId,characters:new Map<number,FamilyPerson47>()};if(registry.nextId>=2147483647)throw Error('人物编号已达上限。');
 const child=nativeCreateNamedCharacter(first,family.surname,gender,family.cultureName,{createBlank:()=>nativeCreateBlankCharacter(registry,{construct:():FamilyPerson47=>({...nativeCharacterDefaults<string,PersonRole47,NativePastRole>(),source:'newborn',initialAge:null,identity}),gameTime:()=>r.life.gameTime}),random,selectTraits:count=>nativeRandomTraits(count,NATIVE_CHARACTER_POOL,random).map(t=>t.name)});
 Object.assign(child,{familyId:family.id,originalFamilyId:family.id,stateId:family.stateId,religionId:mother.religionId,fatherId,motherId});
 r.kin.persons[child.id]=child;r.life.persons[child.id]={source:'web-newborn',birthTime:child.birthTime,age:0,initialAge:null,updatedMonth:generationMonth47(r)};family.memberIds.push(child.id);father.childrenIds.push(child.id);mother.childrenIds.push(child.id);r.people.nextPersonId=registry.nextId;
 const event=announce(r.chronicle,r.world,r.clock.tick,'diplomacy',`${r.world.nations.find(n=>n.id===family.nationId)!.name}：${father.identity.name}与${mother.identity.name}的孩子${identity.name}出生`,'孩子具有实际生日、父母、家族与文化姓名，将随历法成长并进入既有继承候选。出生时机和家庭规模是网页适配规则。',[family.nationId],null);
 s.births.push({personId:child.id,fatherId,motherId,familyId:family.id,day:r.world.day,tick:r.clock.tick,entryId:event.id});r.people.revision++;r.kin.revision++;r.life.revision++;return child.id;
}
/** After monthly aging/death/succession, before autonomous fief allocation.
 * Stable IDs and a separate persisted RNG leave previous rules untouched. */
export function advanceGenerationsMonthOwned47(r:Population47){
 const s=r.generations;if(!s)return;const month=generationMonth47(r);if(month===s.lastMonth)return;if(month!==s.lastMonth+1)throw Error('婚育月份不连续。');s.lastMonth=month;
 const people=Object.values(r.kin.persons).sort((a,b)=>a.id-b.id);
 for(const a of people){if(everMarried(s,a.id)||!a.isAlive||a.age<18||a.age>60)continue;const candidates=people.filter(b=>marriageEligible47(r,a,b));if(candidates.length&&draw(s)<.12)marryPeopleOwned47(r,a.id,candidates[Math.floor(draw(s)*candidates.length)].id);}
 for(const father of people){const mother=r.kin.persons[father.spouseId];if(mother&&birthEligible47(r,father,mother)&&draw(s)<.12)birthPersonOwned47(r,father.id,mother.id);}
}
