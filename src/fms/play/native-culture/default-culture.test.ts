import {describe,it,expect} from 'vitest';
import {nativeDefaultCulture} from './default-culture';
describe('original localization-derived default culture',()=>{
 it('uses case-sensitive CN set, with a separate Korean ignore-case branch',()=>{
  for(const language of ['Chinese','Japanese','TraditionalChinese','Korean','korean','KOREAN','kOrEaN'])expect(nativeDefaultCulture(language)).toBe('EasternFantasy');
  for(const language of ['chinese','japanese','traditionalChinese','CHINESE','Korean ',' Chinese','English',null,''])expect(nativeDefaultCulture(language)).toBe('WesternFantasy');
 });
 it('does not treat culture IDs, language prefixes or unrecognized aliases as native language names',()=>{
  for(const language of ['EasternFantasy','zh','zh-CN','zh-TW','ja','ko','ChineseSimplified','Korean-kr'])expect(nativeDefaultCulture(language)).toBe('WesternFantasy');
 });
});
