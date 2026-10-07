import {describe,it,expect,vi} from 'vitest';
import {nativeGenerateCharacterFromCulture,type NativeCharacterCreatePorts,type NativeCharacterFather} from './character-create';
type C={id:number};
const father=():NativeCharacterFather=>({familyId:1,firstName:'Father'});
function ports():NativeCharacterCreatePorts<string,C,NativeCharacterFather>{return {lookupMapCulture:vi.fn(()=> 'resolved'),generateName:vi.fn(()=>({first:'Given',last:'Family'})),getLastName:vi.fn(()=> 'Paternal'),createCharacter:vi.fn(()=>({id:1}))};}
describe('GenerateCharacterFromCulture, not InitState fallback',()=>{
 it('names with null language, false patronymic and raw father first-name before creating',()=>{
  const p=ports(),calls:string[]=[];p.lookupMapCulture=id=>{calls.push('lookup');expect(id).toBe('input');return 'resolved';};
  p.generateName=(...args)=>{calls.push('name');expect(args).toEqual(['resolved',1,null,false,'Father']);return {first:'Given',last:'Family'};};
  p.getLastName=()=>{calls.push('surname');return 'Paternal';};p.createCharacter=(...args)=>{calls.push('create');expect(args).toEqual(['Given','Paternal',1,'input']);return {id:1};};
  expect(nativeGenerateCharacterFromCulture('input',1,father(),p)).toEqual({id:1});expect(calls).toEqual(['lookup','name','surname','surname','create']);
 });
 it('missing culture still creates Unknown with original culture and no naming call',()=>{
  const p=ports();p.lookupMapCulture=()=>null;nativeGenerateCharacterFromCulture('missing',0,null,p);
  expect(p.generateName).not.toHaveBeenCalled();expect(p.createCharacter).toHaveBeenCalledWith('Unknown','Unknown',0,'missing');
 });
 it('missing culture can still use the father surname without reading father first-name',()=>{
  const p=ports();p.lookupMapCulture=()=>null;const f={familyId:1,get firstName():string{throw Error('Unreached field');}};
  nativeGenerateCharacterFromCulture('missing',0,f,p);expect(p.createCharacter).toHaveBeenCalledWith('Unknown','Paternal',0,'missing');
 });
 it.each([null,''])('null/empty first surname %s performs only one getter and keeps generated name',value=>{
  const p=ports();p.getLastName=vi.fn(()=>value);nativeGenerateCharacterFromCulture('input',0,father(),p);
  expect(p.getLastName).toHaveBeenCalledTimes(1);expect(p.createCharacter).toHaveBeenCalledWith('Given','Family',0,'input');
 });
 it('nonempty surname checks then reads again, even if the second value becomes null',()=>{
  const p=ports();p.getLastName=vi.fn().mockReturnValueOnce(' ').mockReturnValueOnce(null);
  nativeGenerateCharacterFromCulture('input',0,father(),p);expect(p.createCharacter).toHaveBeenCalledWith('Given',null,0,'input');expect(p.getLastName).toHaveBeenCalledTimes(2);
 });
 it('does not use a father surname unless family ID is positive',()=>{
  for(const id of [0,-1]){const p=ports();nativeGenerateCharacterFromCulture('input',0,{...father(),familyId:id},p);expect(p.getLastName).not.toHaveBeenCalled();}
 });
 it('does not repair null/empty generated names, empty culture or a null created character',()=>{
  const p=ports();p.generateName=()=>({first:null,last:''});p.createCharacter=vi.fn(()=>null);
  expect(nativeGenerateCharacterFromCulture('',0,null,p)).toBeNull();expect(p.createCharacter).toHaveBeenCalledWith(null,'',0,'');
 });
 it('does not create when naming or a surname getter fails',()=>{
  const p=ports();p.generateName=()=>{throw Error('names failed');};
  expect(()=>nativeGenerateCharacterFromCulture('input',0,null,p)).toThrow('names failed');expect(p.createCharacter).not.toHaveBeenCalled();
  const q=ports();q.getLastName=()=>{throw Error('surname failed');};expect(()=>nativeGenerateCharacterFromCulture('input',0,father(),q)).toThrow('surname failed');expect(q.createCharacter).not.toHaveBeenCalled();
 });
});
