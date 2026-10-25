import {describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {STATISTICS_CATEGORIES47,statistics47} from './statistics47';
import {war26Strength} from './war26-strength';

describe('statistics panel (original StatisticsInfoUI)',()=>{
  it('ranks living states by strength, population and treasury; religions add up to the world',()=>{
    const s=new Culture47Session();
    let x=s.create({terrain:grid((x,y)=>x>10&&x<245&&y>10&&y<245?45:0),count:3,cityCount:30,relations:'war',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}});
    for(let i=0;i<5;i++)x=s.execute({kind:'advance',ticks:120},x.journal.actions.length);
    const r=x.run;
    expect(STATISTICS_CATEGORIES47.map(c=>c.label)).toEqual(['国力排行','人口排名','经济排行','战争统计','宗教信息']);
    const power=statistics47(r,'power');expect(power.length).toBe(3);
    for(let i=1;i<power.length;i++)expect(power[i-1].value).toBeGreaterThanOrEqual(power[i].value);
    expect(power[0].value).toBe(war26Strength(r.world,r,power[0].nationId!));
    const pop=statistics47(r,'population'),total=r.world.statecraft!.provinces.reduce((n,p)=>n+p.population,0);
    expect(pop.reduce((n,row)=>n+row.value,0)).toBeCloseTo(total,0);
    const religion=statistics47(r,'religion');expect(religion.reduce((n,row)=>n+(row.share??0),0)).toBeCloseTo(1,5);
    expect(statistics47(r,'war').length).toBeGreaterThan(0);
    expect(statistics47(r,'economy').every(row=>row.text.startsWith('赤字')===row.value<0)).toBe(true);
  },120000);
});
