import {describe,expect,it} from 'vitest';
import {HISTORY_TYPES47,halfYear47,halfYearLabel47,historyType47} from './history-view47';
import {historyClusters47} from './CultureHistoryViews47';

const e=(kind:string,text:string)=>({kind,text,reason:'',day:10}) as never;
describe('world history views (original HistoryInfoPanel / HistoryTimelineUI)',()=>{
  it('maps chronicle entries to the original event types and names',()=>{
    expect(historyType47(e('accession','某国新君即位')).label).toBe('领导人继位');
    expect(historyType47(e('accession','x'),true).label).toBe('领导人去世');
    expect(historyType47(e('extinction','某国灭亡')).label).toBe('国家灭亡');
    expect(historyType47(e('occupation','某国攻下某城')).label).toBe('省份被占领');
    expect(historyType47(e('diplomacy','甲国以领土征服为由对乙国宣战：目标')).label).toBe('战争开始');
    expect(historyType47(e('system','甲国与乙国结成联盟')).label).toBe('联盟建立');
    expect(historyType47(e('family','亨利·德维尔出生')).label).toBe('角色出生');
    expect(historyType47(e('family','甲家族的某与乙家族的某结婚（从妻居）')).label).toBe('角色结婚');
    expect(historyType47(e('family','丰滨帝国进行领土重新分配，伊达家族战功最高')).label).toBe('领土重新分配');
  });
  it('pages by half-year',()=>{
    const start={year:1,month:1,day:1} as never;
    expect(halfYear47(start,0)).toBe(2);expect(halfYear47(start,200)).toBe(3);expect(halfYear47(start,366)).toBe(4);
    expect(halfYearLabel47(3)).toBe('公元1年 · 下半年');
  });
  it('merges close nodes into one coloured by the dominant type',()=>{
    const t=HISTORY_TYPES47;
    const c=historyClusters47([{type:t.StartWar,left:10},{type:t.Family,left:14},{type:t.Family,left:18},{type:t.EndWar,left:60}],16);
    expect(c.map(x=>x.items.length)).toEqual([3,1]);expect(c[0].color).toBe(t.Family.color);expect(c[1].color).toBe(t.EndWar.color);
  });
});
