import {beforeAll,describe,expect,it} from 'vitest';
import {rulerDisplayName47,usesRegnalOrdinal47} from './civilization47-ruler-label';
import {CULTURE_IDS47,CULTURES47,rulerTitle47,type CultureId47} from './civilization47-catalog';
import type {NativePolity} from './native-combat/upper-efficiency';
import {grid} from './fixture.test-support';
import {createCivilizationWorld47} from './civilization47-world';
import {appointFamilyRuler47,previewFamilySuccession47} from './civilization47-succession';
import {currentRuler47,editCivilization47,nationName47} from './civilization47-names';
import {assertPopulation47} from './civilization47-population-validation';
import {diePersonOwned47} from './civilization47-lifecycle';

const label=(cultureId:CultureId47,polity:NativePolity,name:string,given:string,ordinal=2,regnalName=given,gender:0|1=0)=>rulerDisplayName47({cultureId,polity},{name,given,regnalName,regnalOrdinal:ordinal},rulerTitle47(cultureId,polity,CULTURES47[cultureId].suggestedReligion,gender));
describe('culture-specific ruler presentation without invented historical titles',()=>{
  it('keeps Chinese personal names, including a real 世 character, without appending western ordinals',()=>{
    expect(label('chinese','Empire','李世民','世民')).toBe('李世民皇帝');
    expect(label('chinese','Empire','武则天','则天',3,'则天',1)).toBe('武则天女皇');
    expect(label('chinese','Kingdom','赵文昭','文昭')).toBe('赵文昭国王');
    expect(usesRegnalOrdinal47({cultureId:'chinese',polity:'Empire'})).toBe(false);
  });
  it('uses the Japanese imperial office without an ordinal, era or an invented shogunate',()=>{
    expect(label('japanese','Empire','明仁','明仁',7)).toBe('明仁天皇');
    expect(label('japanese','Empire','持统','持统',2,'持统',1)).toBe('持统天皇');
    expect(label('japanese','Kingdom','藤原晴信','晴信')).toBe('藤原晴信国王');
  });
  it.each([
    ['english','亨利·都铎','亨利','亨利二世国王'],
    ['french','路易·波旁','路易','路易二世国王'],
    ['german','奥托·奥托','奥托','奥托二世国王'],
  ] as const)('retains same-name monarchy ordinals for %s independently of the national office order',(culture,name,given,expected)=>{
    expect(label(culture,'Kingdom',name,given)).toBe(expected);
    expect(label(culture,'Kingdom',name,given,1)).toBe(given+'一世国王');
  });
  it('does not apply monarchy numbering to republics, federations, tribes, or theocratic offices',()=>{
    expect(label('roman','Republic','盖乌斯·尤利乌斯','盖乌斯',16)).toBe('盖乌斯·尤利乌斯执政官');
    expect(label('roman','Empire','奥古斯都','奥古斯都',4)).toBe('奥古斯都皇帝');
    expect(label('chinese','Republic','李文昭','文昭',3)).toBe('李文昭总统');
    expect(label('english','Federation','亨利·都铎','亨利',3)).toBe('亨利·都铎联邦主席');
    expect(label('english','Theocracy','亨利·都铎','亨利',3)).toBe('亨利·都铎教宗');
    expect(label('norse','Tribal','奥拉夫','奥拉夫',3)).toBe('奥拉夫雅尔');
  });
  it('respects an explicitly chosen accession name without interpreting it as an era or altering the personal name',()=>{
    expect(label('chinese','Empire','李文昭','文昭',3,'景明')).toBe('景明皇帝');
    expect(label('japanese','Empire','藤原晴信','晴信',3,'光明')).toBe('光明天皇');
    expect(label('chinese','Republic','李文昭','文昭',3,'景明')).toBe('李文昭总统');
  });
});

let base:ReturnType<typeof createCivilizationWorld47>;
beforeAll(()=>{
  base=createCivilizationWorld47(grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),12,60,'peace',{mode:'culture-generated',enabled:[...CULTURE_IDS47]});
},30000);
describe('actual known-heir accession and current office share the presentation policy',()=>{
  it.each(['n-0','n-1','n-2','n-5','n-6'])('records an actual %s accession using the same label as the nation panel, retaining prior history',id=>{
    const before=structuredClone(base),oldEntries=structuredClone(base.chronicle.entries),oldRulers=structuredClone(base.civilization.rulers);
    const preview=previewFamilySuccession47(base,id),next=appointFamilyRuler47(base,id,preview.expected),ruler=currentRuler47(next.civilization,next.chronicle,id)!,office=next.civilization.nations[id];
    const display=rulerDisplayName47(office,ruler,ruler.title),event=next.chronicle.entries.at(-1)!;
    expect(event.text).toMatch(new RegExp(`^${display}成为.+的统治者，前任领导人.+卸任$`));
    expect(next.chronicle.entries.slice(0,oldEntries.length)).toEqual(oldEntries);
    for(const [key,value] of Object.entries(oldRulers))expect(next.civilization.rulers[key]).toEqual(value);
    if(office.cultureId==='chinese'||office.cultureId==='japanese')expect(event.text).not.toContain(ruler.regnalName+'一世');
    expect(ruler.order).toBe(2);expect(next.chronicle.leaders[id].at(-1)!.regnalOrdinal).toBe(ruler.regnalOrdinal);
    assertPopulation47(next);expect(base).toEqual(before);
  });
  it('keeps a chosen Chinese accession name separate from the genuine identity and persistent same-name count',()=>{
    const id='n-0',preview=previewFamilySuccession47(base,id,'景明'),next=appointFamilyRuler47(base,id,preview.expected,'景明'),ruler=currentRuler47(next.civilization,next.chronicle,id)!;
    const title=ruler.title;
    expect(rulerDisplayName47(next.civilization.nations[id],ruler,title)).toBe('景明'+title);
    expect(next.chronicle.entries.at(-1)!.text).toMatch(new RegExp(`^景明${title}成为`));
    expect(next.chronicle.entries.at(-1)!.text).not.toContain('景明一世');
    expect(next.kin.persons[preview.personId].identity.name).toBe(preview.name);
    expect(next.chronicle.leaders[id].at(-1)!.regnalName).toBe('景明');assertPopulation47(next);
  });
  it('immediately changes the live office after reform without relabeling old successions or custom country names',()=>{
    const id='n-0',named=editCivilization47(base,{kind:'nation',id,patch:{customName:'玩家自定国'}},0),next=editCivilization47(named,{kind:'nation',id,patch:{polity:'Republic'}},1),ruler=currentRuler47(next.civilization,next.chronicle,id)!;
    expect(next.world.nations.find(n=>n.id===id)!.name).toBe('玩家自定国');expect(nationName47(next.civilization.nations[id])).toBe('玩家自定国');
    expect(rulerDisplayName47(next.civilization.nations[id],ruler,ruler.title)).toBe(ruler.name+'总统');
    expect(next.chronicle.entries).toEqual(base.chronicle.entries);expect(next.civilization.rulers).toEqual(base.civilization.rulers);
    const reset=editCivilization47(next,{kind:'nation',id,patch:{customName:null}},2);
    expect(reset.world.nations.find(n=>n.id===id)!.name).toBe(base.civilization.nations[id].name.value+'共和国');
  });
  it('records an actual Roman republican successor as a consul, with no inherited western regnal ordinal',()=>{
    const next=editCivilization47(base,{kind:'nation',id:'n-4',patch:{polity:'Republic'}},0),id=next.people.nations['n-4'].leaderId!;
    diePersonOwned47(next,next.kin.persons[id]);assertPopulation47(next);
    const ruler=currentRuler47(next.civilization,next.chronicle,'n-4')!;
    expect(ruler).not.toBeNull();expect(ruler.title).toBe('执政官');
    expect(next.chronicle.entries.at(-1)!.text).toContain(`${ruler.name}执政官在选举中当选为`);
    expect(rulerDisplayName47(next.civilization.nations['n-4'],ruler,ruler.title)).toBe(ruler.name+'执政官');
  });
});
