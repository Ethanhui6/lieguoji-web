import {describe,expect,it} from 'vitest';
import type {TravelGraph47} from './army-travel47-graph';
import {arrowCount47,BattleArrowState47,pathMidPoint47,provinceNeighbors47} from './battle-arrows47';

/** A strip of 12 land cells: a-0..5 belong to A, 6..11 to B, plus a 3-cell C after B. */
function strip():TravelGraph47{
  const owner=(i:number)=>i<6?'A':i<12?'B':'C',cells=new Map(),byProvince=new Map<string,number[]>();
  for(let i=0;i<15;i++){
    const links=[i-1,i+1].filter(j=>j>=0&&j<15).map(to=>({to,gate:{x:0,y:0},distance:10,toGate:5}));
    cells.set(i,{id:i,face:i,surface:'land',provinceId:owner(i),center:{x:i*10,y:0},polygon:[],links});
    byProvince.set(owner(i),[...byProvince.get(owner(i))??[],i]);
  }
  return {cells,byProvince,scale:1,polygonWork:0} as TravelGraph47;
}
const world=(a='n-1')=>({nations:[{id:'n-1'},{id:'n-2'}],provinces:[{id:'A',center:{x:25,y:0},controller:a},{id:'B',center:{x:85,y:0},controller:'n-2'},{id:'C',center:{x:130,y:0},controller:'n-2'}]}) as never;

describe('original province battle arrows',()=>{
  it('arrow count per attacking state follows the army thresholds',()=>{
    expect([1,2,5,6,7,8,20].map(arrowCount47)).toEqual([0,1,1,2,2,3,3]);
  });
  it('neighbours and the border crossing come from the travel cells',()=>{
    const g=strip();
    expect(provinceNeighbors47(g).get('B')).toEqual(['A','C']);
    expect(pathMidPoint47(g,{id:'A',center:{x:25,y:0},controller:''},{id:'B',center:{x:85,y:0},controller:''})).toEqual({x:55,y:0});
  });
  it('two enemy armies draw one arrow from their neighbouring province; it lives while targeted',()=>{
    const s=new BattleArrowState47(strip(),1);
    s.update(world(),new Map([['B',['n-1']]]),0);expect(s.all).toEqual([]);
    s.update(world(),new Map([['B',['n-1','n-1']]]),5);
    expect(s.all.map(a=>[a.source,a.target,a.attacker,a.defender,a.born])).toEqual([['A','B','n-1','n-2',5]]);
    s.update(world(),new Map([['B',['n-1','n-1','n-1']]]),9);expect(s.all[0].born).toBe(5);
    s.update(world(),new Map(),10);expect(s.all).toEqual([]);
  });
  it('an arrow is dropped once its source province changes hands',()=>{
    const s=new BattleArrowState47(strip(),1);
    s.update(world(),new Map([['B',['n-1','n-1']]]),0);expect(s.all).toHaveLength(1);
    s.update(world('n-2'),new Map([['B',['n-1','n-1']]]),1);expect(s.all).toEqual([]);
  });
  it('provinces under 6 cells and own armies never get arrows',()=>{
    const s=new BattleArrowState47(strip(),1);
    s.update(world(),new Map([['C',['n-1','n-1','n-1']],['B',['n-2','n-2']]]),0);
    expect(s.all).toEqual([]);
  });
});
