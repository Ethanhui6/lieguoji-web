import {beforeAll,describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal,type Culture47Opening} from './culture47-session';
import {politicalStamp47} from './civilization47-political-owner';
import {assertProvinceEdit47,type ProvinceEdit47} from './civilization47-province-edit';
import {provinceCityType47} from './CultureProvince47';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {provinceDefense} from './upper14-state';

const opening:Culture47Opening={terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:3,cityCount:24,relations:'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,setup:{mode:'culture-generated',enabled:['chinese','japanese','arab']}};
let journal:Culture47Journal;
beforeAll(()=>{journal=new Culture47Session().create(opening).journal;},60000);
const load=()=>{const s=new Culture47Session();s.load(journal);return s;};
const edit=(s:Culture47Session,e:ProvinceEdit47)=>s.execute({kind:'province',edit:e,expected:politicalStamp47(s.snapshot().run)},s.snapshot().journal.actions.length);
const none=new Set<string>();

describe('original ProvinceInfoUI actions',()=>{
  it('设为首都 moves the state capital to the province city, refreshes cores, no history entry, replays exactly',()=>{
    const s=load(),run=s.snapshot().run,nation=run.world.nations[0],old=run.world.cities.find(c=>c.id===nation.capitalId)!;
    const target=run.world.provinces.find(p=>p.controller===nation.id&&p.id!==old.provinceId&&run.world.cities.some(c=>c.provinceId===p.id))!;
    const entries=run.chronicle.entries.length,out=edit(s,{type:'capital',provinceId:target.id});
    expect(out.run.world.cities.find(c=>c.id===out.run.world.nations[0].capitalId)!.provinceId).toBe(target.id);
    expect(out.run.upperCombat.provinces[target.id].distance).toBe(0);
    expect(out.run.chronicle.entries.length).toBe(entries);
    expect(provinceCityType47(out.run,target.id,none)).toBe('Capital');
    expect(new Culture47Session().load(out.journal)).toEqual(out);
    expect(()=>edit(s,{type:'capital',provinceId:target.id})).toThrow('已是首都');
  },60000);
  it('要塞化 / 去要塞化 set the manual fortress flags used by native province defense',()=>{
    const s=load(),run=s.snapshot().run,nation=run.world.nations[1],capital=run.world.cities.find(c=>c.id===nation.capitalId)!.provinceId;
    const p=run.world.provinces.find(v=>v.controller===nation.id&&v.id!==capital)!;
    let out=edit(s,{type:'fortress',provinceId:p.id});
    expect(out.run.upperCombat.provinces[p.id]).toMatchObject({manualSet:true,manualFortress:true});
    expect(provinceDefense(out.run.upperCombat,p.id)).toBe(3);expect(provinceCityType47(out.run,p.id,none)).toBe('Fortress');
    out=edit(s,{type:'city',provinceId:p.id});
    expect(out.run.upperCombat.provinces[p.id]).toMatchObject({manualSet:true,manualFortress:false});expect(provinceCityType47(out.run,p.id,none)).toBe('City');
    const after=s.execute({kind:'advance',ticks:120},s.snapshot().journal.actions.length);
    expect(new Culture47Session().load(after.journal)).toEqual(after);
  },60000);
  it('rejects stale stamps and unknown fields',()=>{
    const s=load(),run=s.snapshot().run,p=run.world.provinces[0];
    expect(()=>assertProvinceEdit47({type:'fortress',provinceId:p.id,extra:1})).toThrow();
    expect(()=>assertProvinceEdit47({type:'rebel',provinceId:p.id})).toThrow();
    const stamp=politicalStamp47(run);s.execute({kind:'advance',ticks:120},0);
    expect(()=>s.execute({kind:'province',edit:{type:'fortress',provinceId:p.id},expected:stamp},s.snapshot().journal.actions.length)).toThrow('世界已变化');
  },60000);
});
