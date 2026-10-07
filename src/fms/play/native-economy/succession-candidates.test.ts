import {describe,it,expect,vi} from 'vitest';
import {nativeHasLivingFamily as hasLiving,nativeRepublicEmergencyLeader as republic,nativeTheocracyEmergencyLeader as theocracy,nativeTribalEmergencyLeader as tribal,nativeTheocracySuccessionScore as theocracyScore,nativeTribalSuccessionScore as tribalScore,type NativeCandidatePerson,type NativeCandidateFamily,type NativeCandidatePorts} from './succession-candidates';
type Person=NativeCandidatePerson&{id:number;skill:number};
type Family=NativeCandidateFamily&{members:(Person|null)[];merit:number};
const person=(id:number,age=35,skill=10):Person=>({id,age,skill,isAlive:true});
const family=(members:(Person|null)[],extra:Partial<Family>={}):Family=>({members,merit:0,influence:0,collateralMemberIds:[],...extra});
const state={i:17};
function ports(list:(Family|null)[]):NativeCandidatePorts<typeof state,Family,Person>{return {
 familyManager:()=>({getFamiliesByState:id=>{expect(id).toBe(17);return list;}}),stateId:s=>s.i,
 characterManager:()=>({getCharacter:()=>null}),getLivingMembers:f=>f.members,warMerit:f=>f.merit,
 administrative:c=>c.skill,charisma:c=>c.skill,military:c=>c.skill,diplomatic:c=>c.skill,
};}
describe('native living-family gate',()=>{
 it('null family skips all ports',()=>{const p=ports([]);p.getLivingMembers=vi.fn(()=>{throw Error('unexpected')});expect(hasLiving(null,p)).toBe(false);expect(p.getLivingMembers).not.toHaveBeenCalled();});
 it('nonempty living list is counted without filtering and skips collateral manager',()=>{const p=ports([]);p.characterManager=()=>{throw Error('unexpected')};expect(hasLiving(family([null],{collateralMemberIds:null}),p)).toBe(true);});
 it('collateral short circuits on first live person and rereads manager per ID',()=>{const trace:number[]=[],p=ports([]);let managers=0;p.characterManager=()=>{managers++;return {getCharacter:id=>{trace.push(id);return id===3?person(3):id===2?{...person(2),isAlive:false}:null}}};expect(hasLiving(family([],{collateralMemberIds:[1,2,3,4]}),p)).toBe(true);expect(trace).toEqual([1,2,3]);expect(managers).toBe(3);});
 it('null reached members/collateral/manager throw instead of fabricating empty families',()=>{const f=family([]),p=ports([]);p.getLivingMembers=()=>null;expect(()=>hasLiving(f,p)).toThrow();p.getLivingMembers=()=>[];f.collateralMemberIds=null;expect(()=>hasLiving(f,p)).toThrow();f.collateralMemberIds=[];p.characterManager=()=>null;expect(hasLiving(f,p)).toBe(false);f.collateralMemberIds=[1];expect(()=>hasLiving(f,p)).toThrow();});
});
describe('original score age bands and f32 arithmetic',()=>{
 it.each([[-1,0],[0,.25],[9,.25],[10,.4],[17,.4],[18,.6],[24,.6],[25,.8],[29,.8],[30,.9],[34,.9],[35,1],[99,1]])('theocracy age %s -> multiplier %s',(age,multiplier)=>{expect(theocracyScore(person(1,age,50),ports([]))).toBe(Math.fround(100*Math.fround(multiplier)));});
 it.each([[-1,0],[0,.2],[5,.2],[6,.3],[11,.3],[12,.45],[17,.45],[18,.65],[24,.65],[25,.8],[29,.8],[30,.9],[34,.9],[35,1]])('tribal age %s -> multiplier %s',(age,multiplier)=>{expect(tribalScore(person(1,age,50),ports([]))).toBe(Math.fround(100*Math.fround(multiplier)));});
 it('null has no reads; negative age still reads the two abilities in original order',()=>{const trace:string[]=[],p=ports([]);p.administrative=()=>{trace.push('administrative');return 1};p.military=()=>{trace.push('military');return 1};p.charisma=()=>{trace.push('charisma');return 1};expect(theocracyScore(null,p)).toBe(0);expect(tribalScore(null,p)).toBe(0);expect(trace).toEqual([]);expect(theocracyScore(person(1,-1),p)).toBe(0);expect(tribalScore(person(1,-1),p)).toBe(0);expect(trace).toEqual(['administrative','charisma','military','charisma']);});
 it('reads age after abilities and rounds the addition before multiplying',()=>{const c=person(1,35),p=ports([]);p.administrative=()=>16777216;p.charisma=()=>{c.age=0;return 1};expect(theocracyScore(c,p)).toBe(4194304);});
 it('finite values can overflow without a synthetic clamp',()=>{const p=ports([]);p.administrative=p.charisma=p.military=()=>3.4e38;expect(theocracyScore(person(1,0),p)).toBe(Infinity);expect(tribalScore(person(1,6),p)).toBe(Infinity);});
});
describe('three emergency selectors',()=>{
 for(const [name,select]of [['republic',republic],['theocracy',theocracy],['tribal',tribal]] as const){
  it(`${name}: absent manager returns before state dereference; reached null inputs fail`,()=>{const p=ports([]);p.familyManager=()=>null;expect(select(null,p)).toBe(null);p.familyManager=()=>({getFamiliesByState:()=>[]});expect(()=>select(null,p)).toThrow();p.familyManager=()=>({getFamiliesByState:()=>null});expect(()=>select(state,p)).toThrow();});
  it(`${name}: exact score/age ties keep family and member order, not smallest ID`,()=>{const a=person(90),b=person(1),c=person(2);expect(select(state,ports([family([a,b]),family([c])]))).toBe(a);});
  it(`${name}: equal score prefers age, higher score beats age`,()=>{const a=person(1,80,10),b=person(2,40,11),c=person(3,50,11);expect(select(state,ports([family([a,b,c])]))).toBe(c);});
  it(`${name}: null/dead candidates never become rulers`,()=>{const c=person(1);c.isAlive=false;expect(select(state,ports([family([null,c])]))).toBe(null);});
 }
 it('republic >=25; rejects younger genius, reads gate list separately, never appends collateral',()=>{const a=person(1,24,100),b=person(2,25,1),collateral=person(3,90,1000),f=family([a,b],{collateralMemberIds:[3]}),p=ports([null,f]);let reads=0;p.getLivingMembers=()=>{reads++;return reads===1?[]:[a,b]};p.characterManager=()=>({getCharacter:()=>collateral});expect(republic(state,p)).toBe(b);expect(reads).toBe(2);});
 it('republic includes exact family merit and influence terms, after four ability reads',()=>{const a=person(1),b=person(2),f1=family([a]),f2=family([b],{merit:10,influence:20}),p=ports([f1,f2]),trace:string[]=[];p.warMerit=f=>{trace.push('merit');return f.merit};p.military=c=>{trace.push('military');return c.skill};p.charisma=c=>{trace.push('charisma');return c.skill};p.diplomatic=c=>{trace.push('diplomatic');return c.skill};p.administrative=c=>{trace.push('administrative');return c.skill};expect(republic(state,p)).toBe(b);expect(trace).toEqual(['merit','military','charisma','diplomatic','administrative','merit','military','charisma','diplomatic','administrative']);});
 it('republic rounds each addition before merit, influence and score comparison',()=>{const a=person(1),b=person(2),p=ports([family([a,b])]);p.military=c=>c===a?16777216:.5;p.charisma=c=>c===a?1:0;p.diplomatic=c=>c===a?-16777216:0;p.administrative=()=>0;expect(republic(state,p)).toBe(b);});
 it('republic stores scores during collection; it does not repeat alive filtering at ranking',()=>{const a=person(1,50,100),f1=family([a]),f2=family([]),p=ports([f1,f2]);p.getLivingMembers=f=>{if(f===f2)a.isAlive=false;return f.members};expect(republic(state,p)).toBe(a);});
 it('republic retains finite-input overflow and uses numeric before NaN ordering',()=>{const a=person(1),b=person(2),p=ports([family([a,b])]);p.military=p.charisma=c=>c===a?3.4e38:1;p.diplomatic=p.administrative=c=>c===a?-3.4e38:1;expect(republic(state,p)).toBe(a); // +Infinity cannot return to finite through a finite add.
  p.military=p.charisma=()=>-3.4e38;p.diplomatic=p.administrative=()=>0;p.warMerit=()=>0;expect(republic(state,p)).toBe(a); // -Infinity ties keep first.
 });
 it('theocracy accepts newborns, tribal starts at12, neither requires an adult',()=>{const baby=person(1,0,100),child=person(2,11,100),young=person(3,12,1);expect(theocracy(state,ports([family([baby,young])]))).toBe(baby);expect(tribal(state,ports([family([child,young])]))).toBe(young);});
 it('theocracy/tribal recheck alive after collecting families without using merit or collateral',()=>{for(const select of [theocracy,tribal]){const a=person(1,40,100),b=person(2,40,1),f1=family([a],{collateralMemberIds:null}),f2=family([b]),p=ports([f1,f2]);p.getLivingMembers=f=>{if(f===f2)a.isAlive=false;return f.members};p.warMerit=()=>{throw Error('unexpected')};p.characterManager=()=>{throw Error('unexpected')};expect(select(state,p)).toBe(b);}});
 it('theocracy and tribal dereference a reached null family while republic skips it',()=>{expect(republic(state,ports([null]))).toBe(null);expect(()=>theocracy(state,ports([null]))).toThrow();expect(()=>tribal(state,ports([null]))).toThrow();});
});
