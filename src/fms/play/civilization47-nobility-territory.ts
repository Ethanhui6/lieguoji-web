import {nativeMaxProvinceRatio} from './native-economy/noble-families';
import {recordHistory,type HistoricalKind} from './chronicle-records';
import {nobilityRandom47} from './civilization47-nobility-monthly';
import type {NobilityRun47,Nobility47,NobleFamily47} from './civilization47-nobility';
import {f,roundInt} from './native-economy/numeric';

/** Original territory redistribution (State.AdvanceOneMonth 5BF120 →
 * FamilyManager.RedistributeTerritoriesForState 869E60): every
 * TERRITORY_REDISTRIBUTION_INTERVAL (24) months, first after Random.Range(1,25),
 * the state's land is re-planned among its families by strength and war merit:
 * BuildRedistributionTargets 853EA0, AllocateProvincesForTargets 850480 (seeds,
 * breadth-first growth, closest fill, leftovers), ApplyPlannedAssignments 853210,
 * UpdateFamilyHomeProvince 871F30 and RecordTerritoryRedistributionEvent 869BF0. */
export const TERRITORY_REDISTRIBUTION_INTERVAL47=24;
type Point={x:number;y:number};
type Target={id:string;fam:NobleFamily47;score:number;targetCount:number;remaining:number;maxAllowed:number;center:Point;seed:string|null;hadLand:boolean};

/** Family.CalculateFamilyStrength: provinces×10×0.4 + wealth×0.6. */
export const familyStrength47=(fam:NobleFamily47)=>f(f(f(fam.controlledProvinces.length*10)*f(.4))+f(fam.wealth*f(.6)));
/** Family.GetWarMerit: provinces×10 + destroyed×0.1 + conquered×5. */
export const familyWarMerit47=(fam:NobleFamily47)=>f(f(f(fam.controlledProvinces.length*10)+f(fam.totalEnemyDestroyed*f(.1)))+f(fam.totalProvincesConquered*5));
/** GetFamilyWarContribution: the state's recorded contribution + war merit. */
export const familyWarContribution47=(n:Nobility47,nationId:string,id:string,fam:NobleFamily47)=>f(familyWarMerit47(fam)+(n.warContributions[nationId]?.[id]??0));

/** The month step of State.AdvanceOneMonth for a living state. */
export function stateNobilityMonth47(r:NobilityRun47,nationId:string){
  const n=r.nobility;if(!n||!r.world.provinces.some(p=>p.controller===nationId))return;
  let months=n.redistribution[nationId]??-1;
  if(months<0)months=nobilityRandom47(n).intRange(1,TERRITORY_REDISTRIBUTION_INTERVAL47+1);
  months--;
  if(months<=0){redistribute(r,n,nationId);months=TERRITORY_REDISTRIBUTION_INTERVAL47;}
  n.redistribution[nationId]=months;
}
const dist=(a:Point,b:Point)=>f(Math.hypot(f(a.x-b.x),f(a.y-b.y)));
function redistribute(r:NobilityRun47,n:Nobility47,nationId:string){
  const order=(r as {upperCombat?:{nations:Record<string,{provinceOrder:string[]}>}}).upperCombat?.nations[nationId]?.provinceOrder??r.world.provinces.map(p=>p.id);
  const land=order.filter(id=>r.world.provinces.find(p=>p.id===id)?.controller===nationId);
  const families=Object.entries(n.families).filter(([,fam])=>fam.nationId===nationId);
  if(!land.length||!families.length)return;
  const pos=new Map(r.world.provinces.map(p=>[p.id,p.center])),population=new Map(r.world.statecraft?.provinces.map(p=>[p.provinceId,p.population])??[]);
  const pop=(id:string)=>population.get(id)??0,owner=new Map<string,string>();
  for(const [id,fam] of families)for(const p of fam.controlledProvinces)owner.set(p,id);
  const targets=buildTargets(r,n,nationId,families,land,pos,pop);
  if(!targets.length)return;
  const plan=allocate(r,targets,land,pos,pop,nationId);
  // ApplyPlannedAssignments: land outside the plan loses its family.
  const planned=new Map<string,string>();for(const [id,list] of plan)for(const p of list)planned.set(p,id);
  const changes=new Map<string,number>(),before=new Map(targets.map(t=>[t.id,t.fam.controlledProvinces.length]));
  for(const p of land){
    const now=planned.get(p)??null,old=owner.get(p)??null;if(now===old)continue;
    if(old){const fam=n.families[old];fam.controlledProvinces.splice(fam.controlledProvinces.indexOf(p),1);}
    if(now)n.families[now].controlledProvinces.push(p);
  }
  for(const t of targets){const list=plan.get(t.id);if(list?.length)updateHome(t.fam,list,pos);}
  for(const t of targets){const d=t.fam.controlledProvinces.length-before.get(t.id)!;if(d)changes.set(t.id,d);}
  // RecordRedistributionChanges → RecordTerritoryRedistributionEvent.
  const moved=land.filter(p=>(owner.get(p)??null)!==(planned.get(p)??null)).length;
  if(changes.size&&moved>0){
    const ranked=[...targets].sort((a,b)=>familyWarContribution47(n,nationId,b.id,b.fam)-familyWarContribution47(n,nationId,a.id,a.fam));
    const name=(t:Target)=>`${r.kin.families[t.id]?.surname??''}家族`,state=r.world.nations.find(v=>v.id===nationId)!.name;
    recordHistory(r.chronicle,r.world,r.clock.tick,'family' as HistoricalKind,`${state}进行领土重新分配，${name(ranked[0])}战功最高，${name(ranked[ranked.length-1])}战功最低`,`${state}进行领土重新分配，涉及${moved}个省份`,[nationId],null);
  }
  n.warContributions[nationId]={};
}
/** BuildRedistributionTargets. */
function buildTargets(r:NobilityRun47,n:Nobility47,nationId:string,families:[string,NobleFamily47][],land:string[],pos:Map<string,Point>,pop:(id:string)=>number):Target[]{
  let ratio=nativeMaxProvinceRatio(r.civilization.nations[nationId].polity);
  if(families.length>0&&f(families.length*ratio)<f(.9)){const v=f(f(.9)/families.length);ratio=0>v?0:v>1?1:v;}
  const maxAllowed=Math.max(1,roundInt(f(land.length*ratio)));
  const scored=families.map(([id,fam])=>{
    let s=f(Math.max(0,f(familyStrength47(fam)*f(.05)))+Math.max(0,familyWarContribution47(n,nationId,id,fam)));if(!Number.isFinite(s))s=0;
    return {id,fam,score:f(Math.max(f(.01),s)),hadLand:fam.controlledProvinces.some(p=>land.includes(p))};
  });
  let total=0;for(const s of scored)total=f(total+s.score);if(!(total>0))total=f(scored.length);
  const targets:Target[]=[],remainders:{id:string;rest:number}[]=[];let assigned=0;
  for(const s of scored){
    const share=total>0?f(s.score/total):f(1/scored.length),exact=f(land.length*share),min=s.hadLand?1:0;
    let count=roundInt(exact);count=count<min?min:count>maxAllowed?maxAllowed:count;
    targets.push({id:s.id,fam:s.fam,score:s.score,targetCount:count,remaining:count,maxAllowed,center:desiredCenter(s.fam,land,pos,r,nationId),seed:null,hadLand:s.hadLand});
    assigned+=count;remainders.push({id:s.id,rest:f(exact-count)});
  }
  let diff=land.length-assigned;
  if(diff>0){
    const order=remainders.map((v,i)=>({v,i})).sort((a,b)=>b.v.rest-a.v.rest||a.i-b.i).map(x=>x.v);
    for(let progress=true;progress&&diff>0;){progress=false;
      for(const p of order){if(diff===0)break;const t=targets.find(t=>t.id===p.id)!;if(t.targetCount<maxAllowed){t.targetCount++;t.remaining++;diff--;progress=true;}}}
  }else if(diff<0){
    for(const t of targets.map((t,i)=>({t,i})).sort((a,b)=>a.t.score-b.t.score||a.i-b.i).map(x=>x.t)){
      if(diff===0)break;if(t.targetCount>(t.hadLand?1:0)){t.targetCount--;t.remaining=Math.max(0,t.remaining-1);diff++;}
    }
  }
  if(targets.every(t=>t.targetCount===0)){const t=targets.map((t,i)=>({t,i})).sort((a,b)=>b.t.score-a.t.score||a.i-b.i)[0].t;t.targetCount=1;t.remaining=1;t.hadLand=true;}
  const used=new Set<string>(),random=nobilityRandom47(r.nobility!);
  for(const t of targets.filter(t=>t.targetCount>0)){
    t.seed=selectSeed(t,land,used,pos,pop);
    if(t.seed===null&&land.length)t.seed=land[random.intRange(0,land.length)];
  }
  return targets;
}
/** CalculateFamilyDesiredCenter: mean of the family's land in the state, else home, else capital. */
function desiredCenter(fam:NobleFamily47,land:string[],pos:Map<string,Point>,r:NobilityRun47,nationId:string):Point{
  let x=0,y=0,count=0;
  for(const p of fam.controlledProvinces){if(!land.includes(p))continue;const v=pos.get(p)!;x=f(x+v.x);y=f(y+v.y);count++;}
  if(count>0)return {x:f(x/count),y:f(y/count)};
  if(pos.has(fam.homeProvinceId))return pos.get(fam.homeProvinceId)!;
  const capital=r.world.cities.find(c=>c.id===r.world.nations.find(v=>v.id===nationId)?.capitalId);
  return capital?{...capital.position}:{x:0,y:0};
}
/** SelectSeedProvince: held +200, home +150, − distance to the desired centre, + population/10000. */
function selectSeed(t:Target,land:string[],used:Set<string>,pos:Map<string,Point>,pop:(id:string)=>number){
  let best:string|null=null,score=-3.4028234663852886e38;
  for(const p of land){
    if(used.has(p))continue;
    let s=t.fam.controlledProvinces.includes(p)?200:0;if(p===t.fam.homeProvinceId)s=f(s+150);
    s=f(f(pop(p)/10000)+f(s-dist(pos.get(p)!,t.center)));
    if(s>score){score=s;best=p;}
  }
  if(best!==null)used.add(best);
  return best;
}
/** EvaluateProvinceForFamily: +200 next to planned land, − distance, + population/10000, home +25, + score×0.05. */
function evaluate(t:Target,p:string,planned:Set<string>,pos:Map<string,Point>,pop:(id:string)=>number,neighbors:Map<string,string[]>){
  let s=planned.size>0&&(neighbors.get(p)??[]).some(v=>planned.has(v))?200:0;
  s=f(f(f(s-dist(pos.get(p)!,t.center))+f(pop(p)/10000)));
  if(p===t.fam.homeProvinceId)s=f(s+25);
  return f(f(t.score*f(.05))+s);
}
/** AllocateProvincesForTargets. */
function allocate(r:NobilityRun47,targets:Target[],land:string[],pos:Map<string,Point>,pop:(id:string)=>number,nationId:string){
  const plan=new Map<string,string[]>(),sets=new Map<string,Set<string>>(),queues=new Map<string,string[]>(),unassigned=new Set(land);
  const neighbors=new Map(r.world.provinces.map(p=>[p.id,p.neighbors]));
  const inState=(id:string)=>r.world.provinces.find(p=>p.id===id)?.controller===nationId;
  const assign=(p:string,t:Target)=>{const set=sets.get(t.id)!;if(!set.has(p)){plan.get(t.id)!.push(p);set.add(p);}unassigned.delete(p);};
  const enqueue=(t:Target,p:string)=>{if(!queues.has(t.id))queues.set(t.id,[]);queues.get(t.id)!.push(p);};
  for(const t of targets){plan.set(t.id,[]);sets.set(t.id,new Set());}
  for(const t of targets.filter(t=>t.targetCount>0)){if(t.seed===null)continue;assign(t.seed,t);t.remaining=Math.max(0,t.targetCount-1);queues.set(t.id,[t.seed]);}
  // Breadth-first growth, one queue layer per family per round.
  for(let progress=true;progress;){progress=false;
    for(const t of targets){
      const q=queues.get(t.id);if(t.remaining<=0||!q||!q.length)continue;
      const layer=q.length;
      for(let i=0;i<layer&&t.remaining>0;i++){
        const id=q.shift()!;
        for(const nb of neighbors.get(id)??[]){
          if(t.remaining<=0)break;if(!unassigned.has(nb)||!inState(nb))continue;
          assign(nb,t);q.push(nb);t.remaining--;progress=true;
        }
      }
    }
  }
  // FillFamilyUsingClosestProvinces, strongest first.
  if(unassigned.size>0)for(const t of targets.map((t,i)=>({t,i})).filter(x=>x.t.remaining>0).sort((a,b)=>b.t.score-a.t.score||a.i-b.i).map(x=>x.t)){
    while(t.remaining>0&&unassigned.size>0){
      let best:string|null=null,score=-3.4028234663852886e38;
      for(const p of [...unassigned]){if(!inState(p)){unassigned.delete(p);continue;}const s=evaluate(t,p,sets.get(t.id)!,pos,pop,neighbors);if(s>score){score=s;best=p;}}
      if(best===null)break;assign(best,t);enqueue(t,best);t.remaining--;
    }
  }
  // Leftovers go to the best-scoring family still under its cap (+50 while it wants more).
  for(const p of [...unassigned]){
    if(!inState(p)){unassigned.delete(p);continue;}
    const under=targets.some(t=>sets.get(t.id)!.size<t.maxAllowed);let best:Target|null=null,score=-3.4028234663852886e38;
    for(const t of targets){
      if(under&&sets.get(t.id)!.size>=t.maxAllowed)continue;
      let s=evaluate(t,p,sets.get(t.id)!,pos,pop,neighbors);if(t.remaining>0)s=f(s+50);
      if(s>score){score=s;best=t;}
    }
    if(best){assign(p,best);enqueue(best,p);best.remaining=Math.max(0,best.remaining-1);}
  }
  return plan;
}
/** UpdateFamilyHomeProvince: the planned province nearest the plan's centroid. */
function updateHome(fam:NobleFamily47,list:string[],pos:Map<string,Point>){
  let x=0,y=0;for(const p of list){const v=pos.get(p)!;x=f(x+v.x);y=f(y+v.y);}
  const c={x:f(x/list.length),y:f(y/list.length)};let home=list[0],best=3.4028234663852886e38;
  for(const p of list){const d=dist(pos.get(p)!,c);if(best>d){best=d;home=p;}}
  fam.homeProvinceId=home;
}
