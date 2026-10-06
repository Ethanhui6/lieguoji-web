/** Localization.cnSet, cctor 3BA640: default HashSet string comparer, exactly
 * Chinese, Japanese and TraditionalChinese. Korean uses a separate ordinal
 * ignore-case check in DetermineDefaultMapCultureId 717040. */
export function nativeDefaultCulture(language:string|null):'EasternFantasy'|'WesternFantasy'{
 return language==='Chinese'||language==='Japanese'||language==='TraditionalChinese'||language!==null&&language.toUpperCase()==='KOREAN'?'EasternFantasy':'WesternFantasy';
}
