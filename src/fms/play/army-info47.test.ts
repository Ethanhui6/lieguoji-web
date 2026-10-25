import {describe,expect,it} from 'vitest';
import {armyInfo47,armyName47} from './army-info47';
import {wanderPoint} from './army-wander47';

const army={id:'force-12',name:'',nationId:'n-0',provinceId:'p-1',originId:'p-2',troops:2999.6,morale:80,supplies:100,status:'idle' as const,route:[],progress:0};
const square=[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
const run=(homeController='n-0')=>({
  world:{nations:[{id:'n-0',name:'景庆帝国'}],provinces:[{id:'p-1',name:'高滨',controller:'n-0'},{id:'p-2',name:'克劳亚',controller:homeController}],armies:[army]},
  units:{'force-12':'Cavalry'},tactics:{forces:{'force-12':{homeId:'p-2'}}},
}) as never;

describe('original army name and info rows',()=>{
  it('ArmyName is 「{state}第{id}军团」',()=>expect(armyName47(run(),army)).toBe('景庆帝国第12军团'));
  it('rows follow GetCurrentStatus order; a lost homeland is marked',()=>{
    expect(armyInfo47(run(),army,null,false)).toEqual([
      {label:'军队人数',value:'3,000'},{label:'兵种',value:'骑兵'},{label:'当前状态',value:'休整待命'},{label:'故乡',value:'克劳亚'},{label:'当前位置',value:'高滨'},
    ]);
    expect(armyInfo47(run('n-9'),army,null,true).map(r=>r.value).slice(2,4)).toEqual(['重组','克劳亚（已沦陷）']);
  });
  it('stationary armies stand at a stable point inside their province',()=>{
    const a=wanderPoint(square,'force-1'),b=wanderPoint(square,'force-2');
    for(const p of [a,b]){expect(p.x).toBeGreaterThan(0);expect(p.x).toBeLessThan(10);expect(p.y).toBeGreaterThan(0);expect(p.y).toBeLessThan(10);}
    expect(wanderPoint(square,'force-1')).toEqual(a);expect(a).not.toEqual(b);
  });
  it('stationary armies keep clear of the city marker and its name when they can',()=>{
    const big=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}],city={x:50,y:50},clear=100*.22;
    for(const id of ['force-1','force-2','force-3','force-4','force-5']){
      const p=wanderPoint(big,id,[city]);
      expect(Math.abs(p.x-city.x)>clear*1.6||p.y-city.y>clear*.6||city.y-p.y>clear*1.2).toBe(true);
    }
  });
});

