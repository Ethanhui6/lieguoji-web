import {describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {CUSTOM_NAME_SEPARATOR47,fullNameTemplateError47,nationName47,stateBaseName47} from './civilization47-names';
import {generateStateTraits47,STATE_TRAITS47} from './state-traits47';
import {civilWarRebels47} from './civil-war-trigger47';
import {globalStamp47} from './civilization47-global-orders';
import {TRAITS} from './upper14-state';
import {FOUNDING_RULE47} from './civilization47-founding-time';
import {populationStamp47} from './civilization47-population-types';

const opening={terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:30,relations:'peace' as const,settlementAlgorithm:SETTLEMENT47_ALGORITHM,families:'original' as const,setup:{mode:'culture-generated' as const,enabled:['chinese','japanese','arab'] as ('chinese'|'japanese'|'arab')[]}};

describe('国家系统 (original State)',()=>{
  it('自定义命名: a {Name} template, an optional new state name, and the original validation texts',()=>{
    const s=new Culture47Session();let x=s.create(opening);
    const id='n-0',before=x.run.civilization.nations[id];
    expect(fullNameTemplateError47('神圣{Name}帝国')).toBeNull();
    expect(fullNameTemplateError47('神圣帝国')).toBe('全名模板必须包含 {Name}');
    expect(fullNameTemplateError47('{Name}{帝国')).toBe('全名模板无效，请检查大括号与格式化语法');
    x=s.execute({kind:'identity',edit:{kind:'nation',id,patch:{customName:'神圣{Name}帝国'}}},x.journal.actions.length);
    expect(x.run.world.nations.find(n=>n.id===id)!.name).toBe(`神圣${before.name.value}帝国`);
    x=s.execute({kind:'identity',edit:{kind:'nation',id,patch:{customName:`大秦${CUSTOM_NAME_SEPARATOR47}{Name}{RestorationOrdinal}王朝`}}},x.journal.actions.length);
    expect(x.run.world.nations.find(n=>n.id===id)!.name).toBe('大秦王朝');
    expect(stateBaseName47(x.run.civilization.nations[id])).toBe('大秦');
    // A custom name without {Name} stays a literal full name, as before.
    expect(nationName47({...x.run.civilization.nations[id],name:{...x.run.civilization.nations[id].name,custom:'临时新国名'}})).toBe('临时新国名');
    x=s.execute({kind:'identity',edit:{kind:'nation',id,patch:{customName:null}}},x.journal.actions.length);
    expect(x.run.world.nations.find(n=>n.id===id)!.name).toBe(nationName47(before));
  },300000);
  it('国家特性: two to five distinct traits per state, combat traits in the combat record, replay exact',()=>{
    for(const n of ['n-0','n-1','n-2','n-3']){const t=generateStateTraits47('seed-a',n);expect(t.length).toBeGreaterThanOrEqual(2);expect(t.length).toBeLessThanOrEqual(5);expect(new Set(t).size).toBe(t.length);expect(t.every(v=>STATE_TRAITS47.some(d=>d.id===v))).toBe(true);}
    expect(generateStateTraits47('seed-a','n-0')).toEqual(generateStateTraits47('seed-a','n-0'));
    const s=new Culture47Session();let x=s.create(opening);
    x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    const r=x.run as unknown as {stateTraits47:Record<string,string[]>;upperCombat:{nations:Record<string,{traits:string[]}>}};
    for(const n of x.run.world.nations){
      expect(r.stateTraits47[n.id].length).toBeGreaterThanOrEqual(2);
      expect(r.upperCombat.nations[n.id].traits).toEqual(TRAITS.filter(t=>r.stateTraits47[n.id].includes(t)));
    }
    const replay=new Culture47Session().load(x.journal).run as unknown as typeof r;
    expect(replay.stateTraits47).toEqual(r.stateTraits47);expect(replay.upperCombat.nations).toEqual(r.upperCombat.nations);
  },300000);
  it('触发内战: the original checks, then the two families worst with the ruling family rise',()=>{
    const s=new Culture47Session();let x=s.create(opening);
    expect('reason' in civilWarRebels47(x.run as never,'n-0')&&(civilWarRebels47(x.run as never,'n-0') as {reason:string}).reason).toBe('这个世界没有启用叛乱建国规则。');
    x=s.execute({kind:'enable-foundings',rule:FOUNDING_RULE47,expected:populationStamp47(x.run)},x.journal.actions.length);
    for(let i=0;i<5;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    const run=x.run as never,nation=x.run.world.nations.map(n=>n.id).find(id=>'rebels' in civilWarRebels47(run,id));
    const reasons=x.run.world.nations.map(n=>civilWarRebels47(run,n.id)).filter(v=>'reason' in v);
    for(const v of reasons)expect((v as {reason:string}).reason).toMatch(/家族|内战|国家/);
    expect(nation).toBeDefined();if(!nation)return;
    const before=x.run.world.nations.length;
    x=s.execute({kind:'global',order:{kind:'civil-war',edit:{nationId:nation}},expected:globalStamp47(x.run as never)},x.journal.actions.length);
    expect(x.run.world.nations.length).toBe(before+1);
    expect(x.run.chronicle.entries.at(-1)!.text).toMatch(/爆发/);
    const replay=new Culture47Session().load(x.journal);
    expect(replay.run.world.nations.length).toBe(before+1);
  },300000);
});
