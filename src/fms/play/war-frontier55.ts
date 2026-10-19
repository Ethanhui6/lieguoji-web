/** WEB-04-37 contiguous war front.
 * Province adjacency is injected. The default reader is the live web
 * province.neighbors list. The parallel CellData border projection should
 * replace that reader at the call site in issueArmySelection47: build a
 * ContiguousBorder55 from borderNeighborCells' outside owners. This file
 * does not import province-border54, so the two changes stay independent.
 * Sea entry below is 网页适配: the original GetSeaApproachDistances walker
 * is not recovered, so a coast is eligible only when no land border exists. */
export type WarFrontierKind55='occupied'|'relief'|'border'|'sea-entry';
export interface ContiguousBorder55{adjacent(provinceId:string):readonly string[]}
export function webProvinceNeighbors55(provinces:readonly {id:string;neighbors:readonly string[]}[]):ContiguousBorder55{
  const map=new Map(provinces.map(p=>[p.id,p.neighbors]));
  return {adjacent(id){const row=map.get(id);if(!row)throw Error('边境省份不存在。');return row;}};
}
export function contiguousWarTargets55(input:{ownedIds:readonly string[];assistIds:readonly string[];invadedIds:readonly string[];reliefIds:readonly string[];provinces:readonly {id:string;controller:string}[];enemies:ReadonlySet<string>;coasts:ReadonlySet<string>;border:ContiguousBorder55}):{id:string;kind:WarFrontierKind55}[]{
  const controller=new Map(input.provinces.map(p=>[p.id,p.controller])),kind=new Map<string,WarFrontierKind55>();
  for(const id of input.invadedIds)kind.set(id,'occupied');
  for(const id of input.reliefIds)if(!kind.has(id))kind.set(id,'relief');
  const touch=(seed:string)=>{for(const next of input.border.adjacent(seed)){const owner=controller.get(next);if(owner===undefined)throw Error('边境邻省不存在。');if(input.enemies.has(owner)&&!kind.has(next))kind.set(next,'border');}};
  for(const id of input.ownedIds)touch(id);
  for(const id of input.assistIds)touch(id);
  if(![...kind.values()].some(k=>k==='border'||k==='occupied'||k==='relief'))for(const p of input.provinces)if(input.coasts.has(p.id)&&input.enemies.has(p.controller))kind.set(p.id,'sea-entry');
  return [...kind].map(([id,kind])=>({id,kind}));
}
export function campaignGoalLabel55(goals:readonly {id:number;type:number;scope?:{provinceIds?:readonly number[]|null;requiredCount?:number}|null}[],provinceNumber:number|null):string|null{
  if(!goals.length)return null;
  const hit=provinceNumber===null?goals[0]:goals.find(g=>g.scope?.provinceIds?.includes(provinceNumber))??goals[0];
  const count=hit.scope?.provinceIds?.length??0;
  if(hit.type===1)return `目标 ${hit.id} 要求割让 ${count} 处，只推进其中与当前控制区接壤的一处`;
  if(hit.type===2)return `目标 ${hit.id} 要求在 ${count} 处中控制 ${hit.scope?.requiredCount??0} 处，只推进接壤的一处`;
  if(hit.type===3)return `目标 ${hit.id} 为吞并，军队仍只推进接壤边境`;
  if(hit.type===6)return `目标 ${hit.id} 含赔款，军队仍只推进接壤边境`;
  return `目标 ${hit.id}（类型 ${hit.type}），只推进接壤边境`;
}
export function warGoalAdvanceReason55(input:{kind:WarFrontierKind55;provinceName:string;goal:string|null;protruding:boolean}):string{
  const step=input.kind==='occupied'?`敌已进入${input.provinceName}，沿本国边境回援，不改道跳省`
    :input.kind==='relief'?`友方土地${input.provinceName}已有敌军，沿相连路线前往，不跳省`
    :input.kind==='border'?`沿相连边境进入${input.provinceName}，不能跳过尚未接壤的敌方省份`
    :`陆地边境不相连，沿可登陆海岸进入${input.provinceName}；行军必须逐格相邻。网页适配：海路入口使用现有海岸格，不是原作 GetSeaApproachDistances`;
  const goal=input.goal?`战争目标：${input.goal}。`:'本场没有逐省战争目标记录，只沿当前实控边境推进。';
  const score=input.protruding?'该省为突出部，原作距离权重更短。':'按同陆块距离与故乡距离择近。';
  return `${step}。${goal}${score}`;
}
/** True when a marched route leaves the cell graph. Path search already
 * rejects this; the check is the acceptance guard against a jumped front. */
export function routeSkipsCell55(linked:(from:number,to:number)=>boolean,nodes:readonly number[]):boolean{
  for(let i=1;i<nodes.length;i++)if(!linked(nodes[i-1],nodes[i]))return true;return false;
}
