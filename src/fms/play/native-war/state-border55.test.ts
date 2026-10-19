import {expect,it} from 'vitest';
import {nativeBorderEnemies55} from './state-border55';
it('deduplicates fronts, excludes own provinces and keeps independent war memberships',()=>{
 const owner=(id:number)=>['home','enemy','rebel','neutral','home'][id];
 const read=()=>nativeBorderEnemies55('home',[0,4],()=>[1,2,3,4,1],owner,new Set(['enemy','rebel']),new Set(['enemy']),new Set(['rebel']));
 expect([...read().all]).toEqual([1,2]);expect([...read().regular]).toEqual([1]);expect([...read().rebels]).toEqual([2]);
});
it('does not infer regular or rebel membership from the general enemy set',()=>{
 const r=nativeBorderEnemies55('home',[0],()=>[1],()=> 'enemy',new Set<string>(),new Set(['enemy']),new Set(['enemy']));
 expect([...r.all]).toEqual([]);expect([...r.regular]).toEqual([1]);expect([...r.rebels]).toEqual([1]);
});
