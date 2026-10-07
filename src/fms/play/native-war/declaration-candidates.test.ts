import {describe,it,expect,vi} from 'vitest';
import {NativeWarIdSet} from '../war26-native';
import {nativeDeclarationCandidates,nativeUnificationAffinityExemption,type NativeCandidateQueries} from './declaration-candidates';
import {nativeEvaluateDeclaration,type NativeDeclarationQueries} from './declaration';
import type {NativeDeclarationState} from './declaration-choice';
const state=(id:number):NativeDeclarationState=>({id,dead:false,blankState:false,conquerable:false,vassal:false,pacifist:false,autoDiplomacy:true,expansionism:1});
function candidates(){
 const a=state(1),b=state(2),c=state(3),d=state(4),states=new Map([[1,a],[2,b],[3,c],[4,d]]),land=new NativeWarIdSet([2,3]),sea=new NativeWarIdSet([3,4]);
 const q:NativeCandidateQueries<NativeDeclarationState,{years:number;truce:number}>={neighbors:()=>land,seaNeighbors:()=>sea,resolve:id=>states.get(id)??null,atWar:()=>false,vassalOf:()=>false,alliance:()=>null,overlord:()=>null,strength:()=>100,relation:()=>({years:3,truce:3}),yearsSinceWar:r=>r.years,truceYears:r=>r.truce,affinity:()=>0,exemptUnification:()=>false};
 return {a,b,c,d,states,land,sea,q};
}
describe('native declaration candidate enumeration',()=>{
 it('is lazy, visits land then sea, and preserves native HashSet reused-slot order',()=>{
  const t=candidates();t.land.delete(2);t.land.add(4);const resolve=vi.fn(t.q.resolve),iter=nativeDeclarationCandidates(t.a,{...t.q,resolve});expect(resolve).not.toHaveBeenCalled();expect([...iter].map(s=>s.id)).toEqual([4,3]);expect(resolve.mock.calls.map(x=>x[0])).toEqual([4,3]);
 });
 it('marks invalid IDs seen before resolution and does not deduplicate different IDs by object',()=>{
  const t=candidates();let resolved=0;const q={...t.q,neighbors:()=>[9,2],seaNeighbors:()=>[9,7],resolve:(id:number)=>id===9?(++resolved===1?null:t.d):t.b};
  expect([...nativeDeclarationCandidates(t.a,q)]).toEqual([t.b,t.b]);expect(resolved).toBe(1);
 });
 it.each(['dead','self','war','own-vassal','blank','ally'] as const)('rejects %s before relation/affinity reads',mode=>{
  const t=candidates(),relation=vi.fn(t.q.relation),affinity=vi.fn(t.q.affinity);
  if(mode==='dead')t.b.dead=true;if(mode==='blank')t.b.blankState=true;
  const q={...t.q,neighbors:()=>[2],seaNeighbors:()=>[],resolve:()=>mode==='self'?t.a:t.b,atWar:()=>mode==='war',vassalOf:()=>mode==='own-vassal',alliance:()=>mode==='ally'?{states:new Set([t.b])}:null,relation,affinity};
  expect([...nativeDeclarationCandidates(t.a,q)]).toEqual([]);expect(relation).not.toHaveBeenCalled();expect(affinity).not.toHaveBeenCalled();
 });
 it('checks target plus overlord strength before treaties, allowing exact equality',()=>{
  const t=candidates();t.b.vassal=true;const reads:number[]=[],q={...t.q,neighbors:()=>[2],seaNeighbors:()=>[],overlord:()=>t.c,strength:(s:NativeDeclarationState)=>{reads.push(s.id);return s===t.a?100:50;}};
  expect([...nativeDeclarationCandidates(t.a,q)]).toEqual([t.b]);expect(reads).toEqual([2,3,1]);expect([...nativeDeclarationCandidates(t.a,{...q,strength:s=>s===t.a?99:50})]).toEqual([]);
 });
 it('uses whole years then positive-affinity exemption; zero/NaN need no exemption',()=>{
  const t=candidates(),exempt=vi.fn(()=>false),q={...t.q,neighbors:()=>[2],seaNeighbors:()=>[],exemptUnification:exempt};
  expect([...nativeDeclarationCandidates(t.a,{...q,relation:()=>({years:2,truce:3})})]).toEqual([]);
  expect([...nativeDeclarationCandidates(t.a,{...q,affinity:()=>1})]).toEqual([]);expect(exempt).toHaveBeenCalledTimes(1);
  expect([...nativeDeclarationCandidates(t.a,{...q,affinity:()=>NaN})]).toEqual([t.b]);expect(exempt).toHaveBeenCalledTimes(1);
  expect([...nativeDeclarationCandidates(t.a,{...q,affinity:()=>1,exemptUnification:()=>true})]).toEqual([t.b]);
 });
 it('validates both Concat inputs before any land yield and retains mutation failure',()=>{
  const t=candidates(),resolve=vi.fn(t.q.resolve);expect(()=>[...nativeDeclarationCandidates(t.a,{...t.q,seaNeighbors:()=>null,resolve})]).toThrow(/null neighbor/);expect(resolve).not.toHaveBeenCalled();
  const iter=nativeDeclarationCandidates(t.a,t.q);expect(iter.next().value).toBe(t.b);t.land.add(4);expect(()=>iter.next()).toThrow(/modified/);
 });
 it('does not ignore a malformed alliance member set',()=>{const t=candidates();expect(()=>[...nativeDeclarationCandidates(t.a,{...t.q,alliance:()=>({states:null})})]).toThrow(/null alliance/);});
 it('unification honors inclusive .45 and conditional null-target failure',()=>{
  const a=state(1),b=state(2),q={unifier:()=>true,strength:(s:NativeDeclarationState)=>s===a?45:55,usable:()=>({id:6})};
  expect(nativeUnificationAffinityExemption(a,b,q)).toBe(true);expect(nativeUnificationAffinityExemption(a,b,{...q,strength:s=>s===a?44:56})).toBe(false);expect(nativeUnificationAffinityExemption(a,b,{...q,strength:()=>0})).toBe(true);
  expect(nativeUnificationAffinityExemption(a,null,{...q,unifier:()=>false})).toBe(false);const strength=vi.fn(q.strength);expect(()=>nativeUnificationAffinityExemption(a,null,{...q,strength})).toThrow(/null target/);expect(strength).toHaveBeenCalledWith(a);
 });
});
describe('native declaration orchestration',()=>{
 function evaluation(){
  const a=state(1),b=state(2),c=state(3),catalog=[{id:1},{id:2},{id:9}],goals=[{id:21}],calls:string[]=[],result={id:100};
  const q:NativeDeclarationQueries<NativeDeclarationState,{id:number},{id:number},{id:number}>={worldAutoDiplomacy:()=>true,activeIntervalMonths:12,passiveIntervalMonths:12,monthsSinceActive:()=>12,monthsSincePassive:()=>12,suppressed:()=>false,candidates:()=>[b,c],catalog:()=>catalog,internal:cb=>cb.id===9,canUse:(cb,_a,d)=>{calls.push(`use:${d.id}/${cb.id}`);return true;},weight:(cb,_a,d)=>{calls.push(`weight:${d.id}/${cb.id}`);return .6;},choose:(_a,d,cb)=>{calls.push(`choose:${d.id}/${cb.id}`);return {id:6};},defaultGoals:()=>goals,stateTag:id=>{calls.push(`tag:${id}`);return String(id);},log:(a,d,cb,weight)=>{calls.push(`log:${a}/${d}/${cb}/${weight}`);},startWar:declaration=>{expect(declaration.goals).toBe(goals);calls.push(`start:${declaration.casusBelliId}`);return result;}};
  return {a,b,c,catalog,goals,calls,q,result};
 }
 it('materializes all eligible CBs before scoring each target, preserves ties and final chosen CB',()=>{
  const t=evaluation();expect(nativeEvaluateDeclaration(t.a,t.q)).toBe(t.result);expect(t.calls).toEqual(['use:2/1','use:2/2','weight:2/1','weight:2/2','use:3/1','use:3/2','weight:3/1','weight:3/2','choose:2/1','tag:1','tag:2',`log:1/2/6/${Math.fround(.6)}`,'start:6']);
 });
 it('weight mutation changes next candidate catalog but not the materialized current list',()=>{
  const t=evaluation(),weight=t.q.weight;t.q.weight=(cb,a,d)=>{if(d===t.b&&cb.id===1)t.catalog.splice(1,1);return weight(cb,a,d);};nativeEvaluateDeclaration(t.a,t.q);expect(t.calls.filter(s=>s.startsWith('weight:'))).toEqual(['weight:2/1','weight:2/2','weight:3/1']);
 });
 it.each(['no-choice','null-goals','empty-goals'] as const)('does not retry second best on %s',mode=>{
  const t=evaluation(),choose=vi.fn(t.q.choose),start=vi.fn(t.q.startWar);t.q.choose=mode==='no-choice'?vi.fn(()=>null):choose;t.q.defaultGoals=()=>mode==='null-goals'?null:[];t.q.startWar=start;
  expect(nativeEvaluateDeclaration(t.a,t.q)).toBeNull();expect(t.q.choose).toHaveBeenCalledTimes(1);expect(start).not.toHaveBeenCalled();
 });
 it('checks suppression only after cooldown, touching no catalog on either rejection',()=>{
  const t=evaluation(),suppressed=vi.fn(()=>true),catalog=vi.fn(t.q.catalog);expect(nativeEvaluateDeclaration(t.a,{...t.q,suppressed,catalog,monthsSinceActive:()=>11})).toBeNull();expect(suppressed).not.toHaveBeenCalled();expect(catalog).not.toHaveBeenCalled();
  expect(nativeEvaluateDeclaration(t.a,{...t.q,suppressed,catalog})).toBeNull();expect(suppressed).toHaveBeenCalledTimes(1);expect(catalog).not.toHaveBeenCalled();
 });
 it('returns actual StartWar failure',()=>{const t=evaluation();expect(nativeEvaluateDeclaration(t.a,{...t.q,startWar:()=>null})).toBeNull();});
 it('throws on null catalog before weights, instead of skipping it',()=>{const t=evaluation();expect(()=>nativeEvaluateDeclaration(t.a,{...t.q,catalog:()=>[{id:1},null]})).toThrow(/null casus/);expect(t.calls).toEqual(['use:2/1']);});
});
