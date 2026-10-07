import {it,expect} from 'vitest';
import {nativeAttackFleetCount,nativeAttackFleets,nativeNavalAttacking} from './naval-roles';
it('native ceil float32 ratio keeps at least one attacker and one defender for multiple fleets',()=>{
 expect(Array.from({length:11},(_,i)=>nativeAttackFleetCount(i))).toEqual([0,1,1,2,2,2,3,3,3,4,4]);
 expect(nativeAttackFleetCount(3,0)).toBe(1);expect(nativeAttackFleetCount(3,1)).toBe(2);
});
it('prioritizes frontline before strength and stable integer ID; never mutates the input order',()=>{
 const a=[{id:'rear',ordinal:0,frontline:false,strength:1},{id:'weak-front',ordinal:1,frontline:true,strength:.2},{id:'front-late',ordinal:3,frontline:true,strength:.9},{id:'front-early',ordinal:2,frontline:true,strength:.9}];
 expect(nativeAttackFleets(a)).toEqual(['front-early','front-late']);expect(a[0].id).toBe('rear');
});
it('home loss and valid targets keep a fleet attacking independently of assignment, but only in war',()=>{
 expect(nativeNavalAttacking(true,false,true,false)).toBe(true);expect(nativeNavalAttacking(true,false,false,true)).toBe(true);expect(nativeNavalAttacking(false,true,true,true)).toBe(false);expect(nativeNavalAttacking(true,false,false,false)).toBe(false);
});
