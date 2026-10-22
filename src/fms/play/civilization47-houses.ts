import type {Population47,PopulationStamp47} from './civilization47-population-types';
import {populationStamp47} from './civilization47-population-types';
import {assertPopulation47} from './civilization47-population-validation';
import {announce} from './civilization47-history';
import {nativeCreateFamily,type NativeCreatedFamily} from './native-economy/family-create';
import {generationMembership47} from './civilization47-generations-ledger';

export type HouseGrant47={familyId:number;parentId:number;founderId:number;nationId:string;provinceId:string;memberIds:number[];day:number;tick:number;entryId:number};
export type Houses47={version:1;nextFamilyId:number;grants:HouseGrant47[]};
export type HouseIntent47={nationId:string;personId:number;provinceId:string};
const exact=(x:unknown,keys:string[])=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
export function attachHouses47<T extends Population47>(r:T):T&{houses:Houses47}{
 if(r.clock.tick!==0||r.houses)throw Error('家族分封账只能创建一次。');
 return {...r,houses:{version:1,nextFamilyId:Math.max(...Object.values(r.kin.families).map(f=>f.id))+1,grants:[]}};
}
export function houseLands47(r:Population47,familyId:number){
 const f=r.kin.families[familyId];if(!f)return [];
 return r.world.provinces.filter(p=>{
  const title=houseTitle47(r,p.id);
  return (title!==null?title===familyId:f.id===f.stateId)&&p.legalOwner===f.nationId&&p.controller===f.nationId;
 });
}
/** Historical creation is immutable; an explicit recorded return releases its title. */
export function houseTitle47(r:Population47,provinceId:string):number|null {
 const g=r.houses?.grants.filter(g=>g.provinceId===provinceId).at(-1);
 return g&&!r.houseGovernance?.returns.some(v=>v.familyId===g.familyId)?g.familyId:null;
}
export function houseHousehold47(r:Population47,personId:number):number[]|null {
 const p=r.kin.persons[personId],f=p&&r.kin.families[p.familyId];
 if(!p?.isAlive||p.age<18||!f||f.id!==f.stateId||p.id===f.headId||r.people.nations[f.nationId].leaderId===p.id||p.roles.some(v=>v.nativeKind==='leader'))return null;
 const members=new Set<number>();let eligible=true;
 const visit=(id:number)=>{if(members.has(id)||!eligible)return;const v=r.kin.persons[id];if(!v||v.source==='founding'||v.familyId!==f.id||v.id===f.headId||v.roles.some(role=>role.nativeKind==='leader')){eligible=false;return;}members.add(id);if(v.spouseId)visit(v.spouseId);for(const old of Object.values(r.kin.persons))if(!old.isAlive&&old.spouseId===id)visit(old.id);for(const role of v.roles)if(role.nativeKind==='spouse')visit(role.spouseOfId);for(const child of v.childrenIds){if(r.generations&&r.kin.persons[child]?.familyId!==f.id&&r.kin.persons[child]?.age>=18&&(r.generations.marriages.some(m=>m.movingPersonId===child)||r.houses?.grants.some(g=>g.memberIds.includes(child))))continue;visit(child);}};visit(personId);
 return eligible?[...members].sort((a,b)=>a-b):null;
}
/** A recorded appointment, not the still-unrecovered automatic split trigger.
 * Only an existing adult's actual spouse/descendants move. Parent links stay. */
export function previewHouseGrant47(r:Population47,intent:HouseIntent47){
 assertPopulation47(r);const {nationId,personId,provinceId}=intent,h=r.houses;
 if(!h||!exact(intent,['nationId','personId','provinceId']))throw Error('此世界没有分封规则，请保留旧档。');
 const n=r.world.nations.find(n=>n.id===nationId),p=r.kin.persons[personId],f=p&&r.kin.families[p.familyId],land=r.world.provinces.find(p=>p.id===provinceId);
 if(!n||!p?.isAlive||p.age<18||!f||f.nationId!==nationId||f.id!==f.stateId||p.id===f.headId||r.people.nations[nationId].leaderId===p.id||p.roles.some(v=>v.nativeKind==='leader'))throw Error('请选择主家中已成年的非族长、非现任领袖成员。');
 if(!land||land.controller!==nationId||land.legalOwner!==nationId||r.world.cities.find(c=>c.id===n.capitalId)?.provinceId===provinceId||houseTitle47(r,provinceId)!==null)throw Error('分封需要本国实控且未分封的非首都辖区。');
 const members=houseHousehold47(r,p.id);if(!members)throw Error('该家庭不能完整分出：需保留主家始祖、族长及现任领袖的原家谱归属。');
 if(h.nextFamilyId>=2147483647||h.grants.length>=4096||r.kin.revision>=2147483647)throw Error('家族记录已达上限。');
 return {...intent,parentId:f.id,familyId:h.nextFamilyId,memberIds:members,expected:populationStamp47(r)};
}
export function grantHouse47<T extends Population47>(input:T,intent:HouseIntent47,expected:PopulationStamp47):T{
 const stamp=populationStamp47(input);
 if(!exact(expected,Object.keys(stamp))||Object.entries(stamp).some(([k,v])=>expected[k as keyof PopulationStamp47]!==v))throw Error('分封预览已过期，请重新查看。');
 const r=structuredClone(input);grantHouseOwned47(r,intent);assertPopulation47(r);return r;
}
/** Only a private Session candidate may use this primitive. The caller owns rollback. */
export function grantHouseOwned47(r:Population47,intent:HouseIntent47){
 const preview=previewHouseGrant47(r,intent),h=r.houses!,parent=r.kin.families[preview.parentId],person=r.kin.persons[intent.personId],province=r.world.provinces.find(p=>p.id===intent.provinceId)!;
 const home=r.world.provinces.indexOf(province)+1,proxy={i:home,familyId:parent.id},state={isBlankState:false,isConquerable:true,stateReligionId:r.civilization.nations[intent.nationId].religionId};
 const blank=():NativeCreatedFamily=>({id:0,surname:null,cultureName:null,religionId:null,stateId:0,homeProvinceId:0,originalHomeProvinceId:0,foundingTime:0,founderId:person.id,isNeedNameLabelUpdate:false,isNeedBorderLineUpdate:false});
 const registry={nextId:h.nextFamilyId,families:new Map<number,NativeCreatedFamily>([[parent.id,{...blank(),id:parent.id}]])};
 const created=nativeCreateFamily(parent.surname,parent.cultureName,person.religionId,parent.stateId,home,registry,{
  containsState:id=>id===parent.stateId,getState:()=>state,constructFamily:blank,generateRandomColor:()=>{},gameTime:()=>r.life.gameTime,
  getProvince:id=>id===home?proxy:null,mainReligion:()=>person.religionId,randomReligion:()=>state.stateReligionId,
  removeControlledProvince:()=>{},addControlledProvince:()=>{},updateMaterial:()=>{},getReligion:id=>id,logCreated:()=>{},warn:()=>{throw Error('家族创建失败。');},recordFamilyCreateEvent:false,prepareHistory:()=>{},createFoundedEvent:()=>null,recordGlobal:()=>{},recordState:()=>{},
 });
 if(!created||created.id!==preview.familyId||proxy.familyId!==created.id)throw Error('分封领地未完成登记。');
 h.nextFamilyId=registry.nextId;
 parent.memberIds=parent.memberIds.filter(id=>!preview.memberIds.includes(id));parent.collateralMemberIds=parent.collateralMemberIds.filter(id=>!preview.memberIds.includes(id));if(preview.memberIds.includes(parent.heirId))parent.heirId=0;
 for(const id of preview.memberIds)r.kin.persons[id].familyId=created.id;
 r.kin.families[created.id]={...structuredClone(parent),id:created.id,headId:person.id,heirId:0,memberIds:[...preview.memberIds],collateralMemberIds:[]};
 const event=announce(r.chronicle,r.world,r.clock.tick,'diplomacy',`${r.world.nations.find(n=>n.id===intent.nationId)!.name}分封${province.name}，${person.identity.name}建立${parent.surname}氏支系`,'由已登记同族成员携实际家庭分出，取得本国辖区封地。亲属身份与父母关系保留；分封不等于国家独立，敌占或正式割让的土地不计为可支配封地。',[intent.nationId],province.id);
 h.grants.push({familyId:created.id,parentId:parent.id,founderId:person.id,nationId:intent.nationId,provinceId:province.id,memberIds:[...preview.memberIds],day:r.world.day,tick:r.clock.tick,entryId:event.id});
 r.kin.revision++;return created.id;
}
export function assertHouses47(r:Population47){
 const h=r.houses;if(h===undefined)return;
 const fail=()=>{throw Error('家族支系或分封依据不一致，保留原世界。');},founded=new Set(((r as {foundings?:{records:{stateId:number}[]}}).foundings?.records??[]).map(v=>v.stateId)),first=Math.max(...Object.values(r.people.nations).map(n=>n.id).filter(id=>!founded.has(id)))+1;
 if(!exact(h,['version','nextFamilyId','grants'])||h.version!==1||!Array.isArray(h.grants)||h.grants.length>4096||h.nextFamilyId!==first+h.grants.length+founded.size)return fail();
 // Branch families and states founded mid-run share one id sequence, in creation order.
 const allocated=[...h.grants.map(g=>g?.familyId),...founded].sort((a,b)=>a-b);if(allocated.some((id,i)=>id!==first+i))return fail();let lastFamily=0;
 const moved=new Set<number>(),lands=new Set<string>();let tick=0,entryId=0;
 for(const [i,g] of h.grants.entries()){
  const f=r.kin.families[g?.familyId],parent=r.kin.families[g?.parentId],p=r.kin.persons[g?.founderId],e=r.chronicle.entries.find(e=>e.id===g?.entryId);
  if(!exact(g,['familyId','parentId','founderId','nationId','provinceId','memberIds','day','tick','entryId'])||g.familyId<=lastFamily||!f||!parent||parent.id!==parent.stateId||!p||p.familyId!==f.id||f.stateId!==parent.stateId||f.nationId!==g.nationId||f.surname!==parent.surname||f.cultureName!==parent.cultureName||!Array.isArray(g.memberIds)||new Set(g.memberIds).size!==g.memberIds.length||!g.memberIds.includes(g.founderId)||(!r.generations&&(g.memberIds.length!==f.memberIds.length+f.collateralMemberIds.length||g.memberIds.some(id=>moved.has(id)||r.kin.persons[id]?.familyId!==f.id)))||!e||e.kind!=='diplomacy'||e.place?.id!==g.provinceId||e.nationIds.length!==1||e.nationIds[0]!==g.nationId||e.day!==g.day||e.tick!==g.tick||g.tick<tick||(!r.houseGovernance&&lands.has(g.provinceId))||!r.world.provinces.some(p=>p.id===g.provinceId))return fail();
  if(g.entryId<=entryId)return fail();entryId=g.entryId;lastFamily=g.familyId;
  tick=g.tick;lands.add(g.provinceId);g.memberIds.forEach(id=>moved.add(id));
 }
 if(r.generations){const members=generationMembership47(r);for(const p of Object.values(r.kin.persons))if(members.get(p.id)!==p.familyId)return fail();}
 else for(const p of Object.values(r.kin.persons))if(!moved.has(p.id)&&p.familyId!==p.stateId)return fail();
}
