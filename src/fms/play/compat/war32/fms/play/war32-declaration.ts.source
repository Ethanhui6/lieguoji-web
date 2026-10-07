import {overlord32} from './war32-vassals';
import {presentationOf,type War32Run} from './war32-model';
import type {StateActionPreview} from '../../sim/types';
import {diplomaticProvinceView} from './war30-geography';
import {relation32,truce32,elapsedDiplomacyMonths32,diplomacyRandom32,type DiplomaticRelation32} from './war32-state';
import {nativeUpdateDiplomaticNeighbors} from './native-war/diplomatic-geography';
import {NATIVE_CASUS_BELLI_CATALOG,nativeCasusCanUse,nativeCasusAiWeight,type NativeCasusState,type NativeCasusProvince} from './native-war/casus-belli';
import {nativeBuildCasusGoals,type NativeDeclaredGoal} from './native-war/casus-goals';
import {nativeChooseCasusBelli,nativeDeclarationSuppressed} from './native-war/declaration-choice';
import {nativeEvaluateDeclaration,type NativeDeclaration} from './native-war/declaration';
import {nativeDeclarationCandidates,nativeUnificationAffinityExemption} from './native-war/declaration-candidates';
import {nativeSpendDeclarationPower} from './native-war/diplomatic-power';
import {nativeDiplomaticAffinity,createNativeAffinityCaches,type NativeAffinityState} from './native-war/affinity';
import {nativeLandAdjacent,nativeCoastal} from './native-war/declaration-geography';
import {NativeWarIdSet,nativeGrowClaimComponent,nativeProvinceDistance} from './war26-native';
import {registerWar28,stateNumber,orderedWar28Provinces} from './war28-state';
import {war26Strength} from './war26-strength';
import {buildWar26Goal,reconcileWar26} from './war26-state';
import {graphFor} from './naval-rules';
import {nationsAtWar,setDecision} from './realtime-statecraft';
import {personSkills} from './court16-people';
import {NATIVE_CHARACTER_POOL} from './native-economy/character-generation';
import {POLITIES} from './upper14-state';
import {captureTransitions} from './chronicle-records';
import {landComponents} from './voyage24-geography';
import {reconcileLosses} from './war27-losses';

export const DECLARATION_LABELS32:Record<number,string>={1:'领土争夺',2:'吞并战争',3:'附庸战争',6:'文化统一'};
// Only effects already executed by the live settlement adapter may be chosen.
// Religion/internal CBs remain explicitly unavailable in this slice.
const supported=NATIVE_CASUS_BELLI_CATALOG.filter(c=>[1,2,3,6].includes(c.id));
type State=Omit<NativeCasusState,'provinces'|'neighbors'|'seaNeighbors'>&Omit<NativeAffinityState,'neighbors'|'features'>&{nationId:string;features:Set<number>;neighbors:Set<number>;seaNeighbors:Set<number>;provinces:NativeCasusProvince[]};
function context(r:War32Run){
 const s=r.nativeDiplomacy,g=graphFor(presentationOf(r)),geo=diplomaticProvinceView(r.diplomaticGeography,r.world,id=>stateNumber(r,id)),cultures=Object.keys(r.culture.maps),culture=(id:string)=>cultures.indexOf(id)+1;
 const provinces=geo.provinces.map(p=>Object.assign(p,{culture:p.isLand?culture(r.sovereignty.provinces[r.nativeWars.provinceIds[p.id-1]].mapCultureId):0}));
 const states:State[]=r.world.nations.map(n=>{const owned=orderedWar28Provinces(r,n.id).map(p=>provinces[r.nativeWars.provinceIds.indexOf(p.id)]),d=s.nations[n.id];return {id:stateNumber(r,n.id),nationId:n.id,dead:owned.length===0,blankState:false,conquerable:false,vassal:overlord32(r,n.id)!==null,pacifist:false,autoDiplomacy:r.diplomacy.nations[n.id],expansionism:d.expansionism,culture:culture(r.culture.nations[n.id].mapCultureId),politicalSystem:POLITIES.indexOf(r.upperCombat.nations[n.id].polity),religionId:null,provinces:owned,neighbors:new Set(),seaNeighbors:new Set(),features:new Set(),provinceCount:owned.length,alliance:null};});
 for(const n of states)nativeUpdateDiplomaticNeighbors(n,geo.lookup);
 // Geography features are actual connected land components; water is absent.
 const visited=new Set<number>();let feature=0;for(const p of provinces)if(p.isLand&&!visited.has(p.id)){feature++;const queue=[p];visited.add(p.id);for(let i=0;i<queue.length;i++){const current=queue[i];states.find(n=>n.id===current.stateId)?.features.add(feature);for(const id of current.neighbors!){const next=provinces[id-1];if(next.isLand&&!visited.has(id)){visited.add(id);queue.push(next);}}}}
 const strength=(n:State)=>war26Strength(r.world,r,n.nationId),atWar=(a:State,b:State)=>nationsAtWar(r.world,a.nationId,b.nationId),enemies=(a:State)=>states.filter(b=>atWar(a,b));
 const leader=(n:State)=>{const id=r.people.nations[n.nationId].leaderId;return id===null?null:r.people.persons[id];};
 const unifier=(n:State)=>leader(n)?.traits.includes('Unifier')===true;
 const relation=(a:State,b:State)=>relation32(s,a.nationId,b.nationId);
 const nearSea=(a:State)=>a.provinces.some(p=>nativeCoastal(p,geo.lookup));
 const intersects=(a:State,b:State)=>b.provinces.some(p=>!r.upperCombat.provinces[r.nativeWars.provinceIds[p.id-1]].connected&&!nativeCoastal(p,geo.lookup)&&nativeLandAdjacent(p,a.id,geo.lookup));
 // Live ranking is a web adapter. Native manager ranking refresh/cache cadence
 // is not claimed here; no country is assigned a fabricated permanent rank.
 const ranking=states.filter(n=>!n.dead).sort((a,b)=>strength(b)-strength(a));
 const superPower=(a:State)=>a===ranking[0]||a===ranking[1]&&strength(a)>Math.fround(strength(ranking[0])*.5);
 const dominant=ranking.length>0&&strength(ranking[0])>Math.fround(ranking.slice(1).reduce((sum,n)=>Math.fround(sum+strength(n)),0)*1.5);
 const cache=createNativeAffinityCaches();
 const affinity=(a:State,b:State)=>nativeDiplomaticAffinity(a,b,cache,{isSuperPower:superPower,superSuperpowerExists:()=>dominant,nearSea,intersectLands:(a,b)=>intersects(a,b)||intersects(b,a),atWar,enemies,leader:n=>{const p=leader(n);return p?{...p,traits:p.traits.map(name=>{const t=NATIVE_CHARACTER_POOL.find(t=>t.name===name)!;return {name,relationshipBonus:'relationshipBonus'in t?Number(t.relationshipBonus):0};})}:null;},diplomaticSkill:p=>personSkills(r.people.persons[p.id]).diplomatic,relation,yearsSinceWar:p=>truce32(r,p).elapsed??10000,truceYears:p=>truce32(r,p).required,minimumYearsBeforeNewWar:3});
 const random=()=>Math.fround(diplomacyRandom32(s));
 const positions=[...r.world.provinces.map(p=>({x:p.center.x,y:0,z:p.center.y})),...r.diplomaticGeography.water.map(p=>({x:p.center.x,y:0,z:p.center.y}))];
 const goalQueries={province:geo.lookup,landCount:(n:State)=>n.provinceCount,unifier,validReligion:()=>false,isVassal:(n:State)=>n.vassal,strength,randomValue:random,
  cedeable:(a:State,b:State)=>b.provinces.filter(p=>nativeLandAdjacent(p,a.id,geo.lookup)||a.seaNeighbors.has(b.id)&&nativeCoastal(p,geo.lookup)).map(p=>p.id),
  connected:(a:State,b:State,count:number)=>{const plan=buildWar26Goal(r.world,g,a.nationId,b.nationId,(w,id)=>war26Strength(w,r,id)),first=plan.provinceIds[0],result:number[]=[];if(first)nativeGrowClaimComponent(provinces[r.nativeWars.provinceIds.indexOf(first)],b.id,count,result,new NativeWarIdSet(),geo.lookup,(a,b)=>nativeProvinceDistance(a,b,()=>positions));return result;}};
 const usable=(id:number,a:State,b:State)=>{const cb=supported.find(c=>c.id===id);return cb&&nativeCasusCanUse(cb,a,b,goalQueries)?cb:null;};
 return {states,strength,atWar,enemies,unifier,relation,affinity,goalQueries,usable,random,g};
}
function start(r:War32Run,d:NativeDeclaration<NativeDeclaredGoal>,c:ReturnType<typeof context>){
 const a=c.states.find(s=>s.id===d.attackerId)!,b=c.states.find(s=>s.id===d.defenderId)!;
 const relation=r.world.statecraft!.relations.find(p=>[p.a,p.b].includes(a.nationId)&&[p.a,p.b].includes(b.nationId));
 if(!relation||relation.status==='war'||truce32(r,c.relation(a,b)).blocked)return null;
 const route=buildWar26Goal(r.world,c.g,a.nationId,b.nationId,(w,id)=>war26Strength(w,r,id));if(route.entry==='unavailable')return null;
 const before=structuredClone(r.world);relation.status='war';relation.sinceDay=r.world.day;relation.truceUntilDay=0;
 const projection=d.goals.map(({primary,scopeType,districtId,secondaryStateId,...g})=>{void primary;void scopeType;void districtId;void secondaryStateId;return structuredClone(g);});
 const war=registerWar28(r.nativeWars,r,a.nationId,b.nationId,projection);
 r.nativeDiplomacy.declarations.push({warId:war.id,...structuredClone(d),goals:structuredClone([...d.goals])});r.nativeDiplomacy.nations[a.nationId].activeTime=Math.fround(r.life.gameTime);r.nativeDiplomacy.nations[b.nationId].passiveTime=Math.fround(r.life.gameTime);r.nativeDiplomacy.revision++;
 reconcileWar26(r.world,r.warfare,c.g,r.clock.tick,(w,id)=>war26Strength(w,r,id));
 reconcileLosses(r.losses,r.world,r.warfare,r.clock.tick);
 // Actual military and naval targets consume the selected declaration scope.
 refreshMilitaryTargets32(r);
 const an=r.world.nations.find(n=>n.id===a.nationId)!.name,bn=r.world.nations.find(n=>n.id===b.nationId)!.name,reason=`${DECLARATION_LABELS32[d.casusBelliId]}：战争目标已记录；部队仍须实际行军、交战或登陆。`;
 r.world.events.push({id:r.world.nextEventId++,day:r.world.day,kind:'diplomacy',text:`${an}向${bn}宣战`,reason});r.world.events=r.world.events.slice(-160);setDecision(r.world,a.nationId,'宣战',reason);setDecision(r.world,b.nationId,'应战',reason);captureTransitions(r.chronicle,before,r.world,r.clock.tick);return war;
}
/** Keep the immutable diplomatic scope separate from the executor's connected
 * front. A conquered front can advance to another actual land/landing entry.
 * Never invent an edge joining detached islands to satisfy the old validator. */
export function refreshMilitaryTargets32(r:War32Run){
 const places=new Map(r.world.provinces.map(p=>[p.id,p])),g=graphFor(presentationOf(r)),lands=landComponents(r.world,g);
 for(const declaration of r.nativeDiplomacy.declarations){const war=r.nativeWars.campaigns.find(w=>w.id===declaration.warId);if(!war||war.endedTick!==null)continue;
  const a=war.attacker!,b=war.defender!,campaign=r.warfare.campaigns.find(w=>w.endedTick===null&&[w.a,w.b].includes(a)&&[w.a,w.b].includes(b)),plan=campaign?.goals.find(p=>p.nationId===a);if(!campaign||!plan)continue;
  const goal=declaration.goals[0],scope=[3,4].includes(goal.type)?war.initialOwners.filter(([,owner])=>owner===declaration.defenderId).map(([id])=>id):(goal.scope?.provinceIds??[]);
  const allowed=new Set(scope.map(id=>r.nativeWars.provinceIds[id-1]).filter(id=>places.get(id)?.controller===b&&campaign.initialOwners[id]===b));
  if(plan.provinceIds.some(id=>allowed.has(id))&&plan.provinceIds.every(id=>scope.some(n=>r.nativeWars.provinceIds[n-1]===id)))continue;
  const starts=g.ports.filter(p=>places.get(p.provinceId)?.controller===a),landing=new Set(g.ports.filter(p=>starts.some(from=>lands.get(from.provinceId)!==lands.get(p.provinceId)&&g.nodes.get(from.node)!.component===g.nodes.get(p.node)!.component)).map(p=>p.provinceId));
  const land=[...allowed].find(id=>places.get(id)!.neighbors.some(n=>places.get(n)?.controller===a)),sea=[...allowed].find(id=>landing.has(id)),first=land??sea;
  // An inaccessible remaining objective is not silently changed to other land.
  if(!first){if(plan.provinceIds.length){plan.provinceIds=[];plan.requestedCount=0;plan.entry='unavailable';r.warfare.revision++;}continue;}
  const seen=new Set([first]),queue=[first];for(let i=0;i<queue.length;i++)for(const id of places.get(queue[i])!.neighbors)if(allowed.has(id)&&!seen.has(id)){seen.add(id);queue.push(id);}
  plan.provinceIds=queue;plan.requestedCount=queue.length;plan.entry=land?'land':'sea';r.warfare.revision++;
 }
}
export function evaluateDeclaration32(r:War32Run,id:string){
 if(!r.diplomacy.worldAuto||!r.diplomacy.nations[id]||overlord32(r,id)!==null)return null;
 const c=context(r),a=c.states.find(n=>n.nationId===id)!;
 return nativeSpendDeclarationPower(r.nativeDiplomacy.nations[id].pools,100,()=>nativeEvaluateDeclaration(a,{worldAutoDiplomacy:()=>r.diplomacy.worldAuto,activeIntervalMonths:12,passiveIntervalMonths:12,monthsSinceActive:n=>elapsedDiplomacyMonths32(r,r.nativeDiplomacy,r.nativeDiplomacy.nations[n.nationId].activeTime),monthsSincePassive:n=>elapsedDiplomacyMonths32(r,r.nativeDiplomacy,r.nativeDiplomacy.nations[n.nationId].passiveTime),suppressed:n=>nativeDeclarationSuppressed(n,c.enemies(n),c.strength),candidates:n=>nativeDeclarationCandidates<State,DiplomaticRelation32>(n,{neighbors:n=>n.neighbors,seaNeighbors:n=>n.seaNeighbors,resolve:id=>c.states.find(n=>n.id===id)??null,atWar:c.atWar,vassalOf:(target,attacker)=>overlord32(r,target.nationId)===attacker.nationId,alliance:()=>null,overlord:target=>c.states.find(n=>n.nationId===overlord32(r,target.nationId))??null,strength:c.strength,relation:c.relation,yearsSinceWar:p=>truce32(r,p).blocked?-1:truce32(r,p).elapsed??10000,truceYears:p=>truce32(r,p).required,affinity:c.affinity,exemptUnification:(a,b)=>nativeUnificationAffinityExemption(a,b,{unifier:c.unifier,strength:c.strength,usable:c.usable})}),catalog:()=>supported,internal:c=>c.internal,canUse:(cb,a,b)=>nativeCasusCanUse(cb,a,b,c.goalQueries),weight:(cb,a,b)=>nativeCasusAiWeight(cb,a,b,{strength:c.strength,affinity:c.affinity,ambitious:()=>false,unifier:c.unifier}),choose:(a,b,cb)=>nativeChooseCasusBelli(a,b,cb,{strength:c.strength,landCount:n=>n.provinceCount,usable:c.usable,randomValue:c.random}),defaultGoals:(cb,a,b)=>nativeBuildCasusGoals(cb,a,b,c.goalQueries),stateTag:id=>c.states.find(n=>n.id===id)!.nationId,log:()=>{},startWar:d=>start(r,d,c)}));
}
export function declareWar32(r:War32Run,attacker:string,defender:string,casusBelliId:1|3=1){
 const c=context(r),a=c.states.find(n=>n.nationId===attacker),b=c.states.find(n=>n.nationId===defender);if(!a||!b||a.dead||b.dead||a===b||c.atWar(a,b))throw Error('宣战双方无效或已交战。');
 const p=c.relation(a,b);if(truce32(r,p).blocked)throw Error(`停战期尚未结束（${truce32(r,p).required} 年规则）。`);
 if(a.vassal||overlord32(r,b.nationId)===a.nationId)throw Error('附庸不能自主发动外战，宗主不能向自己的附庸宣战；可先解除关系。');
 const cb=c.usable(casusBelliId,a,b);if(!cb)throw Error('两国没有可争夺的相邻土地或外交海域。');
 const goals=nativeBuildCasusGoals(cb,a,b,c.goalQueries);if(!goals.length||!start(r,{attackerId:a.id,defenderId:b.id,casusBelliId:cb.id,goals},c))throw Error('没有可执行的陆地或跨海进攻路线。');
}
/** Preview consumes only an isolated copy's RNG/relations. Confirmation in
 * the Worker must recheck the run's day/event/tick stamp before applying. */
export function previewDeclaration32(r:War32Run,a:string,b:string,casusBelliId:1|3=1):StateActionPreview{
 const basedOn={day:r.world.day,nextEventId:r.world.nextEventId};
 try{const copy=structuredClone(r);declareWar32(copy,a,b,casusBelliId);const d=copy.nativeDiplomacy.declarations.at(-1)!;return {basedOn,valid:true,reason:copy.world.events.at(-1)!.text,changes:[`宣战理由：${DECLARATION_LABELS32[d.casusBelliId]}`,d.casusBelliId===3?'胜利后建立宗属关系，国家与城市保留；开战不立即改色。':`目标 ${(d.goals[0].scope?.provinceIds?.length??0)} 处；开战不转移领土。`],warnings:['已接附庸和约与退战；贡金、附庸叛乱、联盟和改宗仍待接入。']};}catch(e){return {basedOn,valid:false,reason:e instanceof Error?e.message:'无法宣战',changes:[],warnings:[]};}
}
