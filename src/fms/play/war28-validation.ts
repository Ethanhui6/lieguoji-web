import type {War28State,War28World} from './war28-state';
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unknown=(v:unknown,keys:string[])=>record(v)&&Object.keys(v).some(k=>!keys.includes(k));
const externalGoals=[0,1,2,3,4,6,11];
/** Must run against BOTH stored slots before fallback/CAS. Unknown fields are
 * future data, not damage that may be silently replaced by an older backup. */
export function assertWar28Schema(v:unknown){
 const s=v as War28State|undefined;
 if(unknown(v,['version','revision','nextId','originTick','provinceIds','nationIds','campaigns'])||s?.version!=null&&s.version!==1)throw Error('战争历史含未来规则或未知字段，已锁定读写。');
 if(!Array.isArray(s?.campaigns))return;
 for(const c of s.campaigns){
  if(unknown(c,['id','relationId','nations','attacker','defender','startTime','openedTick','endedTick','history','participants','destroyedParticipants','initialOwners','initialProvinceCounts','initialCapitals','goals','kills','deaths','settlement'])||c?.history!=null&&!['complete','unknown'].includes(c.history))throw Error('战争历史含未来规则或未知字段，已锁定读写。');
  const result=c?.settlement;
  if(unknown(result,['reason','tick','winnerSide','outcomes','enforcedGoals','transfers','effects','confirmedOwnership'])||result?.reason!=null&&(!Number.isInteger(result.reason)||result.reason<0||result.reason>11)||result?.winnerSide!=null&&![0,1,2].includes(result.winnerSide))throw Error('和约历史含未来规则或未知字段，已锁定读写。');
  for(const t of Array.isArray(result?.transfers)?result.transfers:[])if(unknown(t,['sourceGoalId','provinceId','from','to','type'])||t?.type!=null&&!externalGoals.includes(t.type))throw Error('和约转地含未知字段或未来类型，已锁定读写。');
  for(const e of Array.isArray(result?.effects)?result.effects:[])if(unknown(e,['sourceGoalId','type','beneficiary','target','status','reason'])||e?.status!=null&&![0,1,2].includes(e.status)||e?.type!=null&&![4,6,11].includes(e.type))throw Error('和约效果含未知字段或未来类型，已锁定读写。');
  for(const row of Array.isArray(result?.outcomes)?result.outcomes:[])if(Array.isArray(row)&&row[1]!=null&&![0,1,2].includes(row[1]))throw Error('和约结局含未来类型，已锁定读写。');
  for(const p of [...(Array.isArray(c?.participants)?c.participants:[]),...(Array.isArray(c?.destroyedParticipants)?c.destroyedParticipants:[])])if(unknown(p,['stateId','side'])||p?.side!=null&&p.side!==0&&p.side!==1)throw Error('战争参与者含未来规则或未知字段，已锁定读写。');
  for(const g of Array.isArray(c?.goals)?c.goals:[])if(unknown(g,['id','type','addedBy','target','beneficiary','scope'])||g?.type!=null&&!externalGoals.includes(g.type)||unknown(g?.scope,['provinceIds','requiredCount']))throw Error('战争目标含未来规则或未知字段，已锁定读写。');
 }
}
export function assertWar28(s:War28State,r:War28World,allowUnregisteredRelations=false){
 assertWar28Schema(s);
 const fail=():never=>{throw Error('战争历史损坏，保留原存档。');};
 const int=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
 const f32=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&Math.fround(v)===v;
 const unique=(v:unknown):v is unknown[]=>Array.isArray(v)&&new Set(v).size===v.length;
 const pairs=(v:unknown,first:(x:unknown)=>boolean,second:(x:unknown)=>boolean)=>Array.isArray(v)&&v.every(p=>Array.isArray(p)&&p.length===2&&first(p[0])&&second(p[1]))&&new Set(v.map(p=>p[0])).size===v.length;
 if(!s||s.version!==1||!int(s.revision)||!int(s.nextId,1,2147483647)||!int(s.originTick,0,r.clock.tick)||!unique(s.provinceIds)||s.provinceIds.length!==r.world.provinces.length||s.provinceIds.some(id=>!r.world.provinces.some(p=>p.id===id))||!Array.isArray(s.nationIds)||!Array.isArray(s.campaigns))fail();
 if(!pairs(s.nationIds,id=>int(id,1,2147483647),id=>typeof id==='string'&&!!id)||new Set(s.nationIds.map(x=>x[1])).size!==s.nationIds.length)fail();
 const nations=new Map(s.nationIds),numberById=new Map(s.nationIds.map(([id,key])=>[key,id]));
 for(const n of r.world.nations)if(numberById.get(n.id)!==r.people.nations[n.id]?.id)fail();
 const pid=(id:unknown)=>int(id,1,s.provinceIds.length),sid=(id:unknown)=>int(id,1,2147483647)&&nations.has(id);
 const active=new Set<string>(),ids=new Set<number>();let previous=0;
 for(const c of s.campaigns){
  if(!record(c)||!int(c.id,1,s.nextId-1)||ids.has(c.id)||c.id<=previous||typeof c.relationId!=='string'||!unique(c.nations)||c.nations.length!==2||c.nations.some(id=>!numberById.has(id))||!int(c.openedTick,s.originTick,r.clock.tick)||c.endedTick!==null&&!int(c.endedTick,c.openedTick,r.clock.tick)||!['complete','unknown'].includes(c.history))fail();
  ids.add(c.id);previous=c.id;
  const sides=[c.participants,c.destroyedParticipants];if(sides.some(v=>!Array.isArray(v)||v.some(p=>!record(p)||!sid(p.stateId)||p.side!==0&&p.side!==1)))fail();
  const all=sides.flat();if(all.length!==2||new Set(all.map(p=>p.stateId)).size!==2||new Set(all.map(p=>p.side)).size!==2||all.some(p=>!c.nations.includes(nations.get(p.stateId)!)))fail();
  const part=(id:unknown)=>int(id)&&all.some(p=>p.stateId===id);
  if(!pairs(c.initialOwners,pid,part)||!pairs(c.initialProvinceCounts,part,x=>int(x,0,s.provinceIds.length))||!pairs(c.initialCapitals,part,pid)||!pairs(c.kills,part,f32)||!pairs(c.deaths,part,f32)||!Array.isArray(c.goals))fail();
  if(c.history==='unknown'){
   if(c.attacker!==null||c.defender!==null||c.startTime!==null||c.initialOwners.length||c.initialProvinceCounts.length||c.initialCapitals.length||c.goals.length)fail();
  }else{
   if(typeof c.attacker!=='string'||typeof c.defender!=='string'||c.attacker===c.defender||!c.nations.includes(c.attacker)||!c.nations.includes(c.defender)||!f32(c.startTime)||c.startTime>r.life.gameTime||c.initialProvinceCounts.length!==2||all.some(p=>p.side!==(nations.get(p.stateId)===c.attacker?0:1)))fail();
   for(const [id,count]of c.initialProvinceCounts)if(c.initialOwners.filter(p=>p[1]===id).length!==count)fail();
  }
  const goals=new Set<number>();
  for(const g of c.goals){
   if(!record(g)||!int(g.id,1,2147483647)||goals.has(g.id)||!externalGoals.includes(g.type)||![g.addedBy,g.target,g.beneficiary].every(part)||g.target===g.beneficiary)fail();
   goals.add(g.id);
   if(g.scope===null){if(![3,4,11].includes(g.type))fail();}
   else if(!record(g.scope)||!int(g.scope.requiredCount,0,2147483647)||g.scope.provinceIds!==null&&(!unique(g.scope.provinceIds)||g.scope.provinceIds.some(id=>!pid(id))))fail();
  }
  const result=c.settlement;
  if(result!==null){
   if(!record(result)||c.history!=='complete'||c.endedTick===null||result.tick!==c.endedTick||!int(result.reason,0,11)||result.winnerSide!==null&&![0,1,2].includes(result.winnerSide)||!pairs(result.outcomes,part,x=>int(x,0,2))||!unique(result.enforcedGoals)||result.enforcedGoals.some(id=>!goals.has(id))||!pairs(result.confirmedOwnership,pid,part)||!Array.isArray(result.transfers)||!Array.isArray(result.effects))fail();
   for(const t of result.transfers)if(!record(t)||!pid(t.provinceId)||!part(t.from)||!part(t.to)||t.from===t.to||t.sourceGoalId!==-1&&!goals.has(t.sourceGoalId)||!externalGoals.includes(t.type))fail();
   for(const e of result.effects)if(!record(e)||!goals.has(e.sourceGoalId)||![4,6,11].includes(e.type)||!part(e.beneficiary)||!part(e.target)||e.target===e.beneficiary||!int(e.status,0,2)||e.reason!==null&&typeof e.reason!=='string')fail();
   if(result.reason===11&&(result.outcomes.length||result.enforcedGoals.length||result.transfers.length||result.effects.length||result.confirmedOwnership.length))fail();
  }
  if(c.endedTick===null){if(active.has(c.relationId))fail();active.add(c.relationId);const relation=r.world.statecraft?.relations.find(x=>`${x.a}/${x.b}/${x.sinceDay}`===c.relationId&&x.status==='war');if(!relation||!c.nations.includes(relation.a)||!c.nations.includes(relation.b))fail();}
 }
 // Installed/saved states are closed under all active relations. Otherwise the
 // first resumed tick would silently lose hits before unknown-history import.
 if(!allowUnregisteredRelations)for(const relation of r.world.statecraft?.relations??[])if(relation.status==='war'&&!active.has(`${relation.a}/${relation.b}/${relation.sinceDay}`))fail();
}
