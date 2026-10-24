import {describe,expect,it} from 'vitest';
import {CULTURE_IDS47} from './civilization47-catalog';
import {FAMILY_PALETTE47,cultureColor47,familyColor47,religionColor47} from './culture47-views';

const channels=(c:number)=>[c>>16&255,c>>8&255,c&255];
describe('original colour-view palettes',()=>{
  it('the family palette is FamilyManager.cctor in order',()=>{
    expect(FAMILY_PALETTE47).toHaveLength(33);
    expect([FAMILY_PALETTE47[0],FAMILY_PALETTE47[1],FAMILY_PALETTE47[32]]).toEqual(['#dababf','#fb8072','#b3b3b3']);
  });
  it('family colours stay close to their palette entry and are stable',()=>{
    for(const id of [1,2,40,977]){
      const base=channels(Number.parseInt(FAMILY_PALETTE47[id%33].slice(1),16)),got=channels(familyColor47(id));
      got.forEach((v,i)=>expect(Math.abs(v-base[i])).toBeLessThan(40));
      expect(familyColor47(id)).toBe(familyColor47(id));
    }
  });
  it('every web culture has its own colour; no religion is white',()=>{
    expect(new Set(CULTURE_IDS47.map(cultureColor47)).size).toBe(CULTURE_IDS47.length);
    expect(religionColor47('none')).toBe(0xffffff);
    expect(religionColor47('buddhism')).not.toBe(0xffffff);
  });
});
