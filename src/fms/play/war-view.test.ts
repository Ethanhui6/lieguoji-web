import {describe,it,expect} from 'vitest';
import {createWorld} from '../../sim/demo';
import {initialBattles} from './battle';
import {warDetail,warSites,warSummary,warMarkers,type WarSite} from './war-view';

function fixture(){const world=createWorld(),a=world.armies[0],b=world.armies.find(b=>b.nationId!==a.nationId)!,c=world.armies.find(c=>c.nationId!==a.nationId&&c.nationId!==b.nationId)!,p=world.provinces.find(p=>p.id===a.provinceId)!;
  world.armies=[a,b,c];
  a.troops=b.troops=2000;b.provinceId=p.id;a.route=b.route=[];a.progress=b.progress=0;a.status=b.status='fighting';
  const battles=initialBattles();battles.engagements.push({id:'test',a:p.id,b:null,t:0,armies:[a.id,b.id],started:20,pulse:20,carry:{},losses:{[a.id]:100,[b.id]:200}});
  return {world,a,b,p,battles,sites:warSites(world,battles)};
}
describe('read-only battle overview and scale hierarchy',()=>{
  it('derives national comparison from the actual live participants, without changing combat',()=>{
    const {world,a,b,sites,battles}=fixture(),before=structuredClone({world,battles});
    const summary=warSummary(world,sites);expect(summary.troops).toBe(4000);expect(summary.armyCount).toBe(2);
    expect(summary.sides.find(s=>s.nationId===a.nationId)).toMatchObject({troops:2000,losses:100,armyIds:[a.id]});
    expect(summary.sides.find(s=>s.nationId===b.nationId)).toMatchObject({troops:2000,losses:200,armyIds:[b.id]});expect({world,battles}).toEqual(before);
  });
  it('does not double-count an army listed in both a field contact and its province siege',()=>{
    const {world,a,b,p,battles}=fixture();p.controller=b.nationId;
    const occupation={version:1 as const,sieges:[{provinceId:p.id,controller:b.nationId,attacker:a.nationId,resistance:300,maximum:400,started:15,pulse:15}]};
    const sites=warSites(world,battles,occupation);expect(sites).toHaveLength(2);const summary=warSummary(world,sites);expect(summary.troops).toBe(4000);expect(summary.sides.reduce((n,s)=>n+s.losses,0)).toBe(300);
    expect(sites.find(s=>s.kind==='siege')?.resistance).toEqual({remaining:300,maximum:400});
  });
  it('includes a besieged defending country with no troops without inventing a garrison',()=>{
    const {world,a,b,p}=fixture();p.controller=b.nationId;b.status='destroyed';b.troops=0;
    const sites=warSites(world,undefined,{version:1,sieges:[{provinceId:p.id,controller:b.nationId,attacker:a.nationId,resistance:300,maximum:400,started:15,pulse:15}]});
    const summary=warSummary(world,sites);expect(summary.sides).toHaveLength(2);expect(summary.sides.find(s=>s.nationId===b.nationId)).toMatchObject({troops:0,armyIds:[]});
  });
  it('hides small contacts in overview while retaining selected contact access and local detail',()=>{
    const {world,a,sites}=fixture(),view={width:2000,height:2000};
    expect(warDetail(world,1,.05)).toBe('overview');expect(warMarkers(world,sites,undefined,1,{x:0,y:0,scale:.05},view)).toEqual([]);
    expect(warMarkers(world,sites,undefined,1,{x:0,y:0,scale:.05},view,[sites[0].id])).toHaveLength(1);
    a.troops=4000;expect(warMarkers(world,sites,undefined,1,{x:0,y:0,scale:.05},view)).toHaveLength(1);
    a.troops=2000;expect(warDetail(world,1,1)).toBe('local');expect(warMarkers(world,sites,undefined,1,{x:0,y:0,scale:1},view)).toHaveLength(1);
  });
  it('groups adjacent sites of the same participants and never adds their duplicated soldiers',()=>{
    const {world,a,sites}=fixture();a.troops=6000;const extra:WarSite={...sites[0],id:'field:second',point:{x:sites[0].point.x+10,y:sites[0].point.y+10}};
    const markers=warMarkers(world,[...sites,extra],undefined,1,{x:0,y:0,scale:.05},{width:2000,height:2000});expect(markers).toHaveLength(1);expect(markers[0]).toMatchObject({troops:8000,sites:2});expect(markers[0].ids).toEqual(['field:second','field:test']);
  });
  it('bounds overview markers and preserves a selected large encounter before lower-priority ones',()=>{
    const {world,a,sites}=fixture();a.troops=6000;const many=Array.from({length:12},(_,i)=>({...sites[0],id:`field:${i}`,point:{x:i*1500,y:0}}));
    const markers=warMarkers(world,many,undefined,1,{x:20,y:30,scale:.05},{width:1200,height:400},['field:11']);expect(markers).toHaveLength(8);expect(markers[0].ids).toContain('field:11');expect(markers.every(m=>m.y===30)).toBe(true);
  });
  it('does not label unrelated nearby participants as one alliance',()=>{
    const {world,a,b,sites}=fixture();a.troops=6000;const c=world.armies.find(c=>c.nationId!==a.nationId&&c.nationId!==b.nationId)!;c.troops=6000;
    const third:WarSite={...sites[0],id:'field:third',armyIds:[a.id,c.id],nationIds:[a.nationId,c.nationId]};
    expect(warMarkers(world,[...sites,third],undefined,1,{x:0,y:0,scale:.05},{width:2000,height:2000})).toHaveLength(2);
    expect(warSummary(world,[...sites,third]).sides).toHaveLength(3);
    const local=warMarkers(world,[...sites,third],undefined,1,{x:0,y:0,scale:1},{width:2000,height:2000});expect(local).toHaveLength(1);expect(local[0].ids).toHaveLength(2);
  });
});
