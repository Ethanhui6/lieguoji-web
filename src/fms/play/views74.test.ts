import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal} from './culture47-session';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {COLOR_VIEWS47,provinceColors47} from './culture47-views';
import {nationColor} from './politics';
import {globalStamp47} from './civilization47-global-orders';

let journal:Culture47Journal;
beforeAll(()=>{journal=new Culture47Session().create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}}).journal;},60000);
describe('original ViewManager color views',()=>{
  it('keys 1–6 in the original order; district is not restored',()=>{
    expect(COLOR_VIEWS47.map(v=>v.key+v.label)).toEqual(['1国家视图','2联盟视图','3文化视图','4家族视图','5宗教视图','6区域视图']);
    expect(COLOR_VIEWS47.find(v=>v.id==='district')!.available).toBe(false);
  });
  it('state view uses state colors; alliance members share one color; culture follows the province city',()=>{
    const s=new Culture47Session();let snap=s.load(journal);const r=snap.run;
    const state=provinceColors47(r,'state');r.world.provinces.forEach((p,i)=>expect(state(i)).toBe(Number.parseInt(nationColor(r.world.nations.find(n=>n.id===p.controller)!).slice(1),16)));
    snap=s.execute({kind:'global',order:{kind:'alliance',edit:{type:'unite',nationId:'n-0',targetId:'n-1'}},expected:globalStamp47(r)},snap.journal.actions.length);
    const alliance=provinceColors47(snap.run,'alliance'),p0=snap.run.world.provinces.findIndex(p=>p.controller==='n-0'),p1=snap.run.world.provinces.findIndex(p=>p.controller==='n-1');
    expect(alliance(p0)).toBe(alliance(p1));
    const culture=provinceColors47(snap.run,'culture'),cultureOf=(i:number)=>{const c=snap.run.world.cities.find(c=>c.provinceId===snap.run.world.provinces[i].id);return c?snap.run.civilization.cities[c.id].cultureId:null;};
    const byCulture=new Map<string,number|null>();snap.run.world.provinces.forEach((_,i)=>{const c=cultureOf(i);if(c){if(byCulture.has(c))expect(culture(i)).toBe(byCulture.get(c));else byCulture.set(c,culture(i));}});
  },60000);
});
