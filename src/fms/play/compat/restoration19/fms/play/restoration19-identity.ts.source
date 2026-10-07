import type {World} from '../../sim/types';
import type {Chronicle} from './chronicle-records';
import type {Sovereignty} from './restoration19-sovereignty';
import type {CultureState} from './restoration19-culture';
import type {NamingState,PlaceName} from './restoration19-names';
import {originalNamingCulture} from './native-culture/original-naming';
import {nativeProvinceRebelIdentity,nativeCultureStateTranslations,type NativeRebelIdentity} from './native-culture/rebel-identity';
import {seededCharacterRandom} from './native-economy/character-generation';

export type RebelWorld={world:World;clock:{tick:number};chronicle:Chronicle;sovereignty:Sovereignty;culture:CultureState;naming:NamingState};
/** Read-only deterministic preview. The temporary native object never enters
 * any real entity table; historical identity is resolved before committing. */
export function previewRebelIdentity(r:RebelWorld,provinceId:string){
 const p=r.world.provinces.find(p=>p.id===provinceId),source=r.sovereignty.provinces[provinceId];if(!p||!source)throw Error('起义省文化记录缺失。');
 const culture=r.culture.maps[source.mapCultureId];if(!culture)throw Error('起义省地图文化缺失。');
 const cultures=new Map(Object.values(r.culture.maps).map(c=>[c.id,originalNamingCulture(c.baseCultureId)]));
 const states:NativeRebelIdentity[]=r.world.nations.map((nation,i)=>{const name=r.naming.nations[nation.id],data=cultures.get(name.mapCultureId),isAlive=r.world.provinces.some(p=>p.controller===nation.id);return {i:i+1,name:nation.name,cultureName:name.mapCultureId,isDead:Object.hasOwn(r.chronicle.ended,nation.id),isAlive,nameKey:name.key,translatedNames:data&&name.key?nativeCultureStateTranslations(data,name.key):new Map(),useCustomNaming:false,customNameTranslations:new Map()};});
 const created:NativeRebelIdentity={i:states.length+1,name:'',cultureName:null,isDead:false,isAlive:false,nameKey:null,translatedNames:null,useCustomNaming:false,customNameTranslations:null};
 const rng=seededCharacterRandom(`${r.world.custom!.seed}/native-rebel/${r.clock.tick}/${provinceId}/${r.chronicle.nextNationId}`);
 const result=nativeProvinceRebelIdentity({created,states:[...states,created],province:{name:p.name,mapCultureName:source.mapCultureId,translatedNames:new Map([['Chinese',p.name]])},parentCultureName:r.naming.nations[p.controller].mapCultureId,cultures,currentLanguage:()=>r.naming.language,intRange:rng.intRange});
 const index=result.restored?states.indexOf(result.state):-1,existingId=index>=0?r.world.nations[index].id:null;
 if(!result.state.name)throw Error('原起义候选未得到有效国名。');
 const name:PlaceName=existingId?structuredClone(r.naming.nations[existingId]):{baseCultureId:culture.baseCultureId,mapCultureId:source.mapCultureId,key:result.source==='culture'?result.state.nameKey:null,name:result.state.name,origin:result.source==='culture'?'native':'province'};
 return {existingId,name,provinceId,source:result.source};
}
