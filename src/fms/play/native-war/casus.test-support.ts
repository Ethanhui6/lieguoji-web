import {vi} from 'vitest';
import {NativeWarIdSet} from '../war26-native';
import {NATIVE_CASUS_BELLI_CATALOG,type NativeCasusState,type NativeCasusProvince} from './casus-belli';

export const casus=(id:number)=>NATIVE_CASUS_BELLI_CATALOG.find(cb=>cb.id===id)!;
/** Synthetic countries only: never reads a player world or original save. */
export function casusFixture(){
 const p=(id:number,stateId:number,culture=1,isLand=true,neighbors:number[]=[]):NativeCasusProvince=>({id,stateId,culture,isLand,center:id,neighbors:new NativeWarIdSet(neighbors)});
 const own=p(10,1),land=p(20,2,1,true,[10,30]),second=p(21,2,1,true,[10]),water=p(30,0,0,false),provinces=new Map([[10,own],[20,land],[21,second],[30,water]]);
 const state=(id:number):NativeCasusState=>({id,dead:false,blankState:false,conquerable:false,vassal:false,pacifist:false,autoDiplomacy:true,expansionism:1,neighbors:new Set([3-id]),seaNeighbors:new Set(),provinces:id===1?[own]:[land,second],culture:1,politicalSystem:0,religionId:'faith-'+id});
 const a=state(1),d=state(2);
 const q={
  province:vi.fn((id:number)=>provinces.get(id)??null),
  landCount:vi.fn((s:NativeCasusState)=>s.provinces?.filter(p=>p?.isLand).length??0),
  unifier:vi.fn((_s:NativeCasusState)=>false),validReligion:vi.fn((_id:string|null)=>true),isVassal:vi.fn((s:NativeCasusState)=>s.vassal),
  strength:vi.fn((s:NativeCasusState):number=>s===a?60:40),affinity:vi.fn((_a:NativeCasusState,_d:NativeCasusState)=>-25),ambitious:vi.fn((_s:NativeCasusState)=>false),
  cedeable:vi.fn((_a:NativeCasusState,_d:NativeCasusState)=>[20,21]),connected:vi.fn((_a:NativeCasusState,_d:NativeCasusState,_count:number)=>[20,21]),randomValue:vi.fn(()=>1),
 };
 return{a,d,own,land,second,water,provinces,q};
}
