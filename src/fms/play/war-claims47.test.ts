import {describe,expect,it} from 'vitest';
import type {PoliticalRun47} from './civilization47-diplomatic-world';
import type {War46Campaign} from './war47-wars';
import {warClaimProvinces47} from './war-claims47';

const province=(id:string,controller:string)=>({id,controller,center:{x:0,y:0},neighbors:[]});
const run=()=>({
  world:{provinces:[province('a','n-0'),province('b','n-1'),province('c','n-1'),province('d','n-2')]},
  nativeWars:{nationIds:[[1,'n-0'],[2,'n-1'],[3,'n-2']],provinceIds:['a','b','c','d']},
}) as unknown as PoliticalRun47;
const campaign=(goals:unknown[])=>({goals}) as unknown as War46Campaign;

describe('war claim provinces',()=>{
  it('annexation claims every province the target holds',()=>{
    expect(warClaimProvinces47(run(),campaign([{type:3,target:2}])).map(p=>p.id)).toEqual(['b','c']);
  });
  it('other goals claim their scope once, in goal order',()=>{
    const goals=[{type:1,target:2,scope:{provinceIds:[3,2]}},{type:2,target:3,scope:{provinceIds:[2,4]}}];
    expect(warClaimProvinces47(run(),campaign(goals)).map(p=>p.id)).toEqual(['c','b','d']);
  });
  it('a goal without scope claims nothing',()=>{
    expect(warClaimProvinces47(run(),campaign([{type:1,target:2}]))).toEqual([]);
  });
});
