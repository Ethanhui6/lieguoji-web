import ciestundu from './data/Ciestundu.json';
import eastern from './data/EasternFantasy.json';
import leffathou from './data/Leffathou.json';
import oeczea from './data/Oeczea.json';
import western from './data/WesternFantasy.json';
import wristhos from './data/Wristhos.json';
import type {NativeNamingCulture,NativeLocalizedName} from './localized-name';
import type {NativeCharacterNamingCulture} from './character-name';

export type OriginalNamingCulture=NativeNamingCulture&NativeCharacterNamingCulture&{id:string;nameOrder:0|1};
const reviewed=[ciestundu,eastern,leffathou,oeczea,western,wristhos];
export const originalNamingCultureIds=reviewed.map(c=>c.id);

/** Return owned maps/arrays: a caller cannot mutate the reviewed JSON or another
 * world's naming state. Unknown base identities stay unresolved. Map culture
 * aliases must be resolved by the caller, never inferred from display names. */
export function originalNamingCulture(baseCultureId:string):OriginalNamingCulture|null{
 const data=reviewed.find(c=>c.id===baseCultureId);if(!data)return null;
 if(data.nameOrder!==0&&data.nameOrder!==1)throw Error('Unreviewed name order');
 const pool=(rows:readonly string[][])=>new Map<string,NativeLocalizedName>(rows.map(([key,...names])=>[key,{key,names}]));
 return {id:data.id,nameOrder:data.nameOrder,languages:new Map(data.languages.map((language,i)=>[language,i])),states:pool(data.tables.states),cities:pool(data.tables.cities),male:pool(data.tables.male),female:pool(data.tables.female),surnames:pool(data.tables.surnames)};
}
