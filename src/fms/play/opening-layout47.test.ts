import {describe,expect,it} from 'vitest';
import {grid} from './fixture.test-support';
import {CULTURE_IDS47} from './civilization47-catalog';
import {createCivilizationWorld47} from './civilization47-world';
import {settlementRegions47,SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {assignRegion47,assertOpeningLayout47,defaultLayout47,placeNation47,removeNation47,setCapital47} from './opening-layout47';
import {assertCulture47Journal,CULTURE47_RULE} from './culture47-session';

const d=grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0);
const setup=(count:number)=>({mode:'culture-generated' as const,enabled:[...CULTURE_IDS47],nations:Object.fromEntries(Array.from({length:count},(_,i)=>['n-'+i,{cultureId:CULTURE_IDS47[i%CULTURE_IDS47.length],religionId:'none' as const,polity:'Empire' as const}]))});
const regions=settlementRegions47(d,24).regions;
const territory=(w:ReturnType<typeof createCivilizationWorld47>)=>({controllers:w.world.provinces.map(p=>p.controller),capitals:w.world.nations.map(n=>n.capitalId)});

describe('opening layout (original map editor: place/draw states)',()=>{
  it('the default layout reproduces the automatic opening exactly',()=>{
    const auto=createCivilizationWorld47(d,4,24,'peace',setup(4),SETTLEMENT47_ALGORITHM);
    const given=createCivilizationWorld47(d,4,24,'peace',setup(4),SETTLEMENT47_ALGORITHM,defaultLayout47(regions,4));
    expect(territory(given)).toEqual(territory(auto));
  });
  it('edits keep every nation with its capital and refuse invalid moves',()=>{
    const base=defaultLayout47(regions,4),free=base.owners.findIndex((o,i)=>o!==0&&!base.seeds.includes(i));
    const drawn=assignRegion47(base,free,0)!;expect(drawn.owners[free]).toBe(0);
    expect(assignRegion47(base,base.seeds[1],0)).toBeNull();
    const own=drawn.owners.findIndex((o,i)=>o===0&&i!==drawn.seeds[0]),moved=setCapital47(drawn,own)!;expect(moved.seeds[0]).toBe(own);
    const placed=placeNation47(moved,moved.owners.findIndex((o,i)=>!moved.seeds.includes(i)))!;expect(placed.seeds).toHaveLength(5);
    const removed=removeNation47(regions,placed,1)!;expect(removed.seeds).toHaveLength(4);
    expect(removed.owners.every(o=>o>=0&&o<4)).toBe(true);
    for(const l of [drawn,moved,placed,removed])assertOpeningLayout47(l,regions.length,l.seeds.length);
    expect(removeNation47(regions,defaultLayout47(regions,2),0)).toBeNull();
  });
  it('builds the world from a player layout and rejects inconsistent ones',()=>{
    let l=defaultLayout47(regions,3);
    for(let i=0;i<regions.length;i++){const next=assignRegion47(l,i,2);if(next)l=next;}
    const w=createCivilizationWorld47(d,3,24,'peace',setup(3),SETTLEMENT47_ALGORITHM,l);
    expect(w.world.provinces.filter(p=>p.controller==='n-2')).toHaveLength(regions.length-2);
    expect(w.world.nations.map(n=>n.capitalId)).toEqual(l.seeds.map(s=>'c-'+s));
    expect(()=>createCivilizationWorld47(d,3,24,'peace',setup(3),SETTLEMENT47_ALGORITHM,{seeds:l.seeds,owners:l.owners.map(()=>0)})).toThrow('领土布局无效');
    expect(()=>createCivilizationWorld47(d,2,24,'peace',setup(2),SETTLEMENT47_ALGORITHM,l)).toThrow('领土布局无效');
    expect(()=>createCivilizationWorld47(d,3,24,'peace',setup(3),undefined,l)).toThrow('旧划分');
  });
  it('journals accept an opening layout only with the partition algorithm',()=>{
    const journal=(opening:object)=>({format:'lieguoji-culture-play',version:2,fork:null,rule:CULTURE47_RULE,engine:__CULTURE47_ENGINE__,id:'fms-'+crypto.randomUUID(),opening,actions:[]});
    const opening={terrain:d,count:3,cityCount:24,relations:'peace',setup:setup(3),settlementAlgorithm:SETTLEMENT47_ALGORITHM,layout:defaultLayout47(regions,3)};
    expect(()=>assertCulture47Journal(journal(opening))).not.toThrow();
    const legacy:Partial<typeof opening>={...opening};delete legacy.settlementAlgorithm;
    expect(()=>assertCulture47Journal(journal(legacy))).toThrow();
  });
});
