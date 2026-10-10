import type {Population47,PopulationStamp47} from './civilization47-population-types';
import {populationStamp47} from './civilization47-population-types';
import {assertPopulation47} from './civilization47-population-validation';
import {announce} from './chronicle-records';
import {nativeCreateFamily,type NativeCreatedFamily} from './native-economy/family-create';

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
 const grants=r.houses?.grants??[];
 return r.world.provinces.filter(p=>{
  const title=grants.find(g=>g.provinceId===p.id);
  return (title?title.familyId===familyId:f.id===f.stateId)&&p.legalOwner===f.nationId&&p.controller===f.nationId;
 });
}
/** A recorded appointment, not the still-unrecovered automatic split trigger.
 * Only an existing adult's actual spouse/descendants move. Parent links stay. */
export function previewHouseGrant47(r:Population47,intent:HouseIntent47){
 assertPopulation47(r);const {nationId,personId,provinceId}=intent,h=r.houses;
 if(!h||!exact(intent,['nationId','personId','provinceId']))throw Error('此世界没有分封规则，请保留旧档。');
 const n=r.world.nations.find(n=>n.id===nationId),p=r.kin.persons[personId],f=p&&r.kin.families[p.familyId],land=r.world.provinces.find(p=>p.id===provinceId);
 if(!n||!p?.isAlive||p.age<18||!f||f.nationId!==nationId||f.id!==f.stateId||p.id===f.headId||r.people.nations[nationId].leaderId===p.id||p.roles.some(v=>v.nativeKind==='leader'))throw Error('请选择主家中已成年的非族长、非现任领袖成员。');
 if(!land||land.controller!==nationId||land.legalOwner!==nationId||r.world.cities.find(c=>c.id===n.capitalId)?.provinceId===provinceId||h.grants.some(g=>g.provinceId===provinceId))throw Error('分封需要本国实控且未分封的非首都辖区。');
 const members=new Set<number>();
 const visit=(id:number)=>{if(members.has(id))return;const v=r.kin.persons[id];if(v?.source==='founding')throw Error('该家庭包含主家始祖，当前分封需保留其原家谱归属。');if(!v||v.familyId!==f.id||v.id===f.headId||v.roles.some(role=>role.nativeKind==='leader'))throw Error('该家庭不能完整分出，原家谱保留。');members.add(id);if(v.spouseId)visit(v.spouseId);for(const old of Object.values(r.kin.persons))if(!old.isAlive&&old.spouseId===id)visit(old.id);for(const role of v.roles)if(role.nativeKind==='spouse')visit(role.spouseOfId);for(const child of v.childrenIds)visit(child);};visit(p.id);
 if(h.nextFamilyId>=2147483647||h.grants.length>=4096||r.chronicle.entries.length>=9999||r.kin.revision>=2147483647)throw Error('家族记录已达上限。');
 return {...intent,parentId:f.id,familyId:h.nextFamilyId,memberIds:[...members].sort((a,b)=>a-b),expected:populationStamp47(r)};
}
export function grantHouse47<T extends Population47>(input:T,intent:HouseIntent47,expected:PopulationStamp47):T{
 const stamp=populationStamp47(input);
 if(!exact(expected,Object.keys(stamp))||Object.entries(stamp).some(([k,v])=>expected[k as keyof PopulationStamp47]!==v))throw Error('分封预览已过期，请重新查看。');
 const preview=previewHouseGrant47(input,intent),r=structuredClone(input),h=r.houses!,parent=r.kin.families[preview.parentId],person=r.kin.persons[intent.personId],province=r.world.provinces.find(p=>p.id===intent.provinceId)!;
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
 r.kin.families[created.id]={...structuredClone(parent),id:created.id,headId:person.id,heirId:0,memberIds:preview.memberIds,collateralMemberIds:[]};
 const event=announce(r.chronicle,r.world,r.clock.tick,'diplomacy',`${r.world.nations.find(n=>n.id===intent.nationId)!.name}分封${province.name}，${person.identity.name}建立${parent.surname}氏支系`,'由已登记同族成员携实际家庭分出，取得本国辖区封地。亲属身份与父母关系保留；分封不等于国家独立，敌占或正式割让的土地不计为可支配封地。',[intent.nationId],province.id);
 h.grants.push({familyId:created.id,parentId:parent.id,founderId:person.id,nationId:intent.nationId,provinceId:province.id,memberIds:preview.memberIds,day:r.world.day,tick:r.clock.tick,entryId:event.id});
 r.kin.revision++;assertPopulation47(r);return r;
}
export function assertHouses47(r:Population47){
 const h=r.houses;if(h===undefined)return;
 const fail=()=>{throw Error('家族支系或分封依据不一致，保留原世界。');},first=Math.max(...Object.values(r.people.nations).map(n=>n.id))+1;
 if(!exact(h,['version','nextFamilyId','grants'])||h.version!==1||!Array.isArray(h.grants)||h.grants.length>4096||h.nextFamilyId!==first+h.grants.length)return fail();
 const moved=new Set<number>(),lands=new Set<string>();let tick=0;
 for(const [i,g] of h.grants.entries()){
  const f=r.kin.families[g?.familyId],parent=r.kin.families[g?.parentId],p=r.kin.persons[g?.founderId],e=r.chronicle.entries.find(e=>e.id===g?.entryId);
  if(!exact(g,['familyId','parentId','founderId','nationId','provinceId','memberIds','day','tick','entryId'])||g.familyId!==first+i||!f||!parent||parent.id!==parent.stateId||!p||p.familyId!==f.id||f.stateId!==parent.stateId||f.nationId!==g.nationId||f.surname!==parent.surname||f.cultureName!==parent.cultureName||!Array.isArray(g.memberIds)||new Set(g.memberIds).size!==g.memberIds.length||!g.memberIds.includes(g.founderId)||g.memberIds.length!==f.memberIds.length+f.collateralMemberIds.length||g.memberIds.some(id=>moved.has(id)||r.kin.persons[id]?.familyId!==f.id)||!e||e.kind!=='diplomacy'||e.place?.id!==g.provinceId||e.nationIds.length!==1||e.nationIds[0]!==g.nationId||e.day!==g.day||e.tick!==g.tick||g.tick<tick||lands.has(g.provinceId)||!r.world.provinces.some(p=>p.id===g.provinceId))return fail();
  tick=g.tick;lands.add(g.provinceId);g.memberIds.forEach(id=>moved.add(id));
 }
 for(const p of Object.values(r.kin.persons))if(!moved.has(p.id)&&p.familyId!==p.stateId)return fail();
}
