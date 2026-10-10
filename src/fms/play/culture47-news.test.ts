import {describe,it,expect} from 'vitest';
import {cultureNewsItem47,cultureNewsDwell47,CultureNewsQueue47,newsEntriesAtTick47} from './CultureNews47';
import {historyPresentation47} from './CultureHistory47';
import type {HistoricalEntry} from './chronicle-records';
const entry=(id:number,text:string,kind:HistoricalEntry['kind']='diplomacy'):HistoricalEntry=>({id,day:10,tick:1200,sourceEventId:null,text,kind,reason:'实际结算',nationIds:['n'],people:[],place:null});
describe('actual history message priorities',()=>{
 it('does not announce a future endpoint event ahead of the moving calendar or label same-day succession as founding',()=>{
  const before={...entry(1,'开篇','accession'),day:0,tick:0},future={...entry(2,'甲国对乙国宣战：边境争议'),day:3,tick:360};
  expect(newsEntriesAtTick47([before,future],359.9)).toEqual([before]);expect(newsEntriesAtTick47([before,future],360)).toEqual([before,future]);
  expect(historyPresentation47({...before,people:[{id:'r-2',name:'新君',order:2,regnalName:'新君',regnalOrdinal:1}]}).kind).toBe('领袖继任');
 });
 it('does not let monthly recruitment hold a real declaration behind an eight-second backlog',()=>{
  const records=[entry(1,'甲国新编3支常备军'),entry(2,'乙国新编4支常备军'),entry(3,'甲国对乙国宣战：边境争议')],original=structuredClone(records),queue=new CultureNewsQueue47();
  queue.ingest([cultureNewsItem47(records[0])]);const first=queue.next()!;expect(cultureNewsDwell47(first)).toBe(1000);
  queue.ingest(records.map(e=>cultureNewsItem47(e)));const next=queue.next()!;expect(next.historyId).toBe(3);expect(cultureNewsDwell47(next)).toBe(8000);
  expect(queue.next()!.historyId).toBe(2);expect(queue.count).toBe(0);expect(records).toEqual(original);
 });
 it('keeps emergency muster, succession, death and war settlement important while demobilization uses the normal channel',()=>{
  for(const e of [entry(1,'甲国紧急动员，征召4支军队'),entry(2,'新君继任','accession'),entry(3,'甲国与乙国的战争结束：议和')])expect(cultureNewsItem47(e).priority).toBe('major');
  const death=cultureNewsItem47(entry(4,'领袖去世'),true);expect(death.priority).toBe('major');expect(death.reason).toContain('自然去世');
  expect(cultureNewsItem47(entry(5,'甲国遣散3支应急军')).priority).toBe('normal');
 });
 it('keeps waiting major news through an ordinary flood without reviving evicted news',()=>{
  const queue=new CultureNewsQueue47();queue.ingest([]);
  const major=cultureNewsItem47(entry(1,'甲国对乙国宣战：边境争议')),ordinary=Array.from({length:80},(_,i)=>cultureNewsItem47(entry(i+2,'甲国新编3支常备军')));
  queue.ingest([major]);queue.ingest(ordinary);expect(queue.count).toBe(64);expect(queue.next()).toEqual(major);
  const retained=[];while(queue.count)retained.push(queue.next()!.historyId);expect(retained).toEqual(ordinary.slice(-63).map(i=>i.historyId));
  queue.ingest([major,...ordinary]);expect(queue.count).toBe(0);
 });
 it('bounds an all-major flood while retaining FIFO order and starts restored history at the latest item',()=>{
  const queue=new CultureNewsQueue47(),items=Array.from({length:80},(_,i)=>cultureNewsItem47(entry(i+1,'甲国对乙国宣战：边境争议')));
  queue.ingest(items.slice(0,2));expect(queue.next()).toEqual(items[1]);queue.ingest(items);expect(queue.count).toBe(64);
  const retained=[];while(queue.count)retained.push(queue.next());expect(retained).toEqual(items.slice(-64));
 });
});
