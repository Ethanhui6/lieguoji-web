import {it,expect} from 'vitest';
import {createWorld} from '../../sim/demo';
import {initialChronicle,recordHistory,type HistoricalKind} from './chronicle-records';
import {historicalNews} from './ChroniclePanel';
import {queryHistory} from './chronicle-query';
import {recentNews} from './news';
it('major history and top ribbon exclude daily territorial captures without mutating any stored record',()=>{
 const w=createWorld();w.custom={id:'news',seed:'news',name:'史记测试',rivers:[]};const c=initialChronicle(w),kinds:HistoricalKind[]=['occupation','diplomacy','accession','uprising','independence','extinction','capital','restoration'];
 kinds.forEach(k=>recordHistory(c,w,0,k,k,'原因',[w.nations[0].id],null));const before=structuredClone(c);
 expect(historicalNews(c).map(e=>e.text)).toEqual(kinds.slice(1));expect(queryHistory(c.entries,{text:'',kind:'important',nationId:''})).toHaveLength(7);
 expect(queryHistory(c.entries,{text:'',kind:'',nationId:''})).toHaveLength(8);expect(queryHistory(c.entries,{text:'',kind:'occupation',nationId:''}).map(e=>e.kind)).toEqual(['occupation']);expect(c).toEqual(before);
 w.events=[{id:1,day:0,kind:'occupation',text:'控制某地',reason:'占领'},{id:2,day:0,kind:'diplomacy',text:'宣战',reason:'敌对'}];expect(recentNews(w).map(e=>e.text)).toEqual(['宣战']);
});
