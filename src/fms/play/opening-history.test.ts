import {expect,it} from 'vitest';
import {createWorld} from '../../sim/demo';
import {initialChronicle,appointRuler,recordHistory} from './chronicle-records';
import {openingRulers,openingNews} from './opening-history';
import {historicalNews} from './ChroniclePanel';
import {NewsQueue} from './news';

function fixture(){const w=createWorld();w.custom={id:'opening',name:'开篇',seed:'opening',rivers:[]};return {w,c:initialChronicle(w)};}
it('shows real opening rulers without adding events or changing save state',()=>{
 const {w,c}=fixture(),snapshot=structuredClone({w,c});
 expect(openingRulers(c,w.nations).map(v=>v.ruler.id)).toEqual(w.nations.map(n=>c.leaders[n.id][0].id));
 expect(openingNews(c,w.nations)).toHaveLength(1);expect(openingNews(c,w.nations)[0].historyId).toBeUndefined();
 expect({w,c}).toEqual(snapshot);expect(c.entries).toHaveLength(0);
});
it('later accession and a newly founded nation never replace the opening ruler',()=>{
 const {w,c}=fixture(),nation=w.nations[0],first=c.leaders[nation.id][0];w.day+=10;appointRuler(c,w,nation.id);
 w.nations.push({...nation,id:'later',name:'后起之国'});appointRuler(c,w,'later');
 const opening=openingRulers(c,w.nations);expect(opening.find(v=>v.nationId===nation.id)!.ruler.id).toBe(first.id);
 expect(opening.some(v=>v.nationId==='later')).toBe(false);
});
it('mid-reign copies show the ruler recorded at origin, not a fabricated coronation',()=>{
 const {w,c}=fixture();const first=c.leaders[w.nations[0].id][0];c.originDay=first.ascendedDay+3;
 const viewed=openingRulers(c,w.nations)[0];expect(viewed.day).toBe(c.originDay);expect(viewed.ruler.ascendedDay).toBe(first.ascendedDay);
});
it('current country rename is a label only and cannot mutate ruler/history snapshots',()=>{
 const {w,c}=fixture(),old=structuredClone(c);w.nations[0].name='改名';
 expect(openingRulers(c,w.nations)[0].currentNationName).toBe('改名');expect(c).toEqual(old);
 const q=new NewsQueue();q.ingest(openingNews(c,w.nations));expect(q.next()).toBeDefined();
 w.nations[0].name='再次改名';q.ingest(openingNews(c,w.nations));expect(q.next()).toBeUndefined();
});
it('latest actual major event takes startup priority; occupation does not crowd the ribbon',()=>{
 const {w,c}=fixture();recordHistory(c,w,0,'diplomacy','真实宣战','外交命令',[w.nations[0].id],null);
 recordHistory(c,w,1,'occupation','控制地方','易手',[w.nations[0].id],null);
 const q=new NewsQueue();q.ingest([...openingNews(c,w.nations),...historicalNews(c)]);expect(q.next()!.text).toBe('真实宣战');
 expect(q.next()).toBeUndefined();
});
