import type {World} from '../../sim/types';
import type {Chronicle} from './chronicle-records';
import {originalNamingCulture,originalNamingCultureIds} from './native-culture/original-naming';
import {nativePlaceName} from './native-culture/localized-name';
import {nativeFullName,nativeLastName,nativeFullNameCulture,nativeNameOrder} from './native-culture/full-name';
import {nativeDefaultCulture} from './native-culture/default-culture';
import {mapCultureId,type NamingState} from './naming18-names';
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
const placeKeys=['baseCultureId','mapCultureId','key','name','origin'],rulerKeys=['baseCultureId','mapCultureId','first','storedLast','gender','originalFamilyId','familyId','name','origin'];
export function assertNamingSchema(value:unknown):void{
 const n=value as NamingState|undefined,fail=()=>{throw Error('命名存档含未来规则或未知字段，已锁定读写。');};
 if(unknown(n,['version','revision','language','enabled','nations','cities','rulers','families','nextFamilyId'])||n?.version!=null&&n.version!==1||n?.language!=null&&n.language!=='Chinese'||Array.isArray(n?.enabled)&&n.enabled.some(id=>typeof id==='string'&&!originalNamingCultureIds.includes(id)))fail();
 for(const rows of [n?.nations,n?.cities,n?.rulers])if(record(rows))for(const row of Object.values(rows)){if(!record(row))continue;if(typeof row.baseCultureId==='string'&&!originalNamingCultureIds.includes(row.baseCultureId))fail();}
 for(const rows of [n?.nations,n?.cities])if(record(rows)&&Object.values(rows).some(r=>unknown(r,placeKeys)||record(r)&&r.origin!=null&&!['native','legacy','custom','exhausted'].includes(r.origin as string)))fail();
 if(record(n?.rulers)&&Object.values(n.rulers).some(r=>unknown(r,rulerKeys)||record(r)&&r.origin!=null&&!['native','legacy'].includes(r.origin as string)||record(r)&&r.gender!=null&&r.gender!==0&&r.gender!==1))fail();
 if(record(n?.families)&&Object.values(n.families).some(r=>unknown(r,['id','surname','cultureName'])))fail();
}
export function assertNaming(n:NamingState,r:{world:World;chronicle:Chronicle}):void{
 assertNamingSchema(n);const fail=()=>{throw Error('命名记录损坏，已保留原档。');},integer=(v:unknown,min=0)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=2147483647;
 if(!record(n)||n.version!==1||n.language!=='Chinese'||!integer(n.revision)||!integer(n.nextFamilyId,1)||!Array.isArray(n.enabled)||!n.enabled.length||n.enabled.length>6||new Set(n.enabled).size!==n.enabled.length||n.enabled.some(id=>!originalNamingCultureIds.includes(id))||![n.nations,n.cities,n.rulers,n.families].every(record))return fail();
 const cultures=new Map(originalNamingCultureIds.map(id=>[id,originalNamingCulture(id)!]));
 for(const [rows,entities,kind]of [[n.nations,r.world.nations,'state'],[n.cities,r.world.cities,'city']] as const){
  if(Object.keys(rows).length!==entities.length)return fail();
  for(const entity of entities){const row=rows[entity.id];if(!record(row)||!n.enabled.includes(row.baseCultureId)||row.mapCultureId!==mapCultureId(row.baseCultureId)||row.name!==entity.name)return fail();
   if(row.origin==='native'){const c=cultures.get(row.baseCultureId)!;if(typeof row.key!=='string'||!(kind==='state'?c.states:c.cities).has(row.key)||nativePlaceName(cultures,kind,row.baseCultureId,row.key,n.language)!==row.name)return fail();}
   else if(!['legacy','custom','exhausted'].includes(row.origin)||row.key!==null||row.origin==='exhausted'&&(kind!=='state'||row.name!==`Out of state Names for Culture ${row.baseCultureId}`))return fail();
  }
 }
 for(const [key,f]of Object.entries(n.families))if(!record(f)||!integer(f.id,1)||f.id>=n.nextFamilyId||String(f.id)!==key||typeof f.surname!=='string'||!f.surname||f.surname.length>20||!n.enabled.some(id=>mapCultureId(id)===f.cultureName))return fail();
 const rulers=Object.entries(r.chronicle.leaders).flatMap(([nationId,history])=>history.map(ruler=>({nationId,ruler})));if(Object.keys(n.rulers).length!==rulers.length)return fail();
 for(const {nationId,ruler} of rulers){const person=n.rulers[ruler.id],nation=n.nations[nationId];if(!record(person)||!nation||person.baseCultureId!==nation.baseCultureId||person.mapCultureId!==nation.mapCultureId||!n.enabled.includes(person.baseCultureId)||person.mapCultureId!==mapCultureId(person.baseCultureId)||person.name!==ruler.name||typeof person.storedLast!=='string'||!integer(person.originalFamilyId,1)||!integer(person.familyId,1)||!n.families[person.originalFamilyId]||!n.families[person.familyId])return fail();
  const lookup=(id:number)=>n.families[id]??null,last=nativeLastName(person.originalFamilyId,person.familyId,person.storedLast,lookup);if(last!==ruler.family)return fail();
  if(person.origin==='legacy'){if(person.first!==null||person.gender!==null)return fail();continue;}
  if(person.origin!=='native'||person.gender!==0&&person.gender!==1||typeof person.first!=='string'||!person.first)return fail();
  const c=cultures.get(person.baseCultureId)!,pool=person.gender===0?c.male:c.female,index=c.languages.get(n.language)!;
  if(![...pool.values()].some(row=>row.names?.[index]===person.first)||![...c.surnames.values()].some(row=>row.names?.[index]===person.storedLast))return fail();
  const fullCulture=nativeFullNameCulture(person.originalFamilyId,person.familyId,lookup,id=>{const base=n.enabled.find(b=>mapCultureId(b)===id);return base?cultures.get(base)!:null;});
  if(nativeFullName(person.first,last,fullCulture?nativeNameOrder(fullCulture,()=>nativeDefaultCulture(n.language)):null)!==person.name)return fail();
 }
}
