import type {FoundingForces47} from './civilization47-forces';
import {nationsAtWar} from './realtime-statecraft';

/** Original NavyInfoUI (舰队信息) summaries, texts from the original localization:
 * - BuildStateSummary (当前状态): 海战 while engaging enemies at sea; attacking → 进攻（夺回港口）
 *   for an own land-owned port held by the enemy (IsReclaimTarget), 进攻（攻击港口）, or
 *   进攻（搜索目标） without a target; idle with an assigned port → 待命（港口巡逻） once in that port,
 *   else 待命（前往驻扎）; a forward base → 待命（前沿待命）; otherwise 待命（母港巡逻）.
 * - BuildMissionSummary (任务概览): the same branches with port names.
 * - BuildExpectedDestinationSummary: the target or assigned port, 等待分配进攻目标 for an attacking
 *   fleet without one, else "-".
 * The web fleet AI's records map onto these: its attack role (attackFleetIds) with a target port is
 * Attacking; an attack-role fleet that found no enemy port and stands by in a home-side port at war
 * is the forward base (Navy.TryStartWarPatrolMove, 无敌港可打，前往前沿港口驻扎). */
export type NavyInfo47={status:string;mission:string;destination:string;homePort:string|null};
export function navyInfo47(r:FoundingForces47,fleetId:string):NavyInfo47|null{
  const f=r.navy.fleets.find(v=>v.id===fleetId);if(!f||f.status==='lost')return null;
  const row=r.navalAutonomy.fleets[fleetId],order=r.portControl.fleets[fleetId];
  const site=(id:string|null|undefined)=>id?r.harbors.sites.find(s=>s.id===id)??null:null;
  const province=(id:string|null|undefined)=>id?r.world.provinces.find(p=>p.id===id)??null:null;
  const home=province(site(row?.homePortId)?.provinceId),assigned=site(row?.assignedPortId),assignedLand=province(assigned?.provinceId);
  const atWar=r.world.nations.some(n=>nationsAtWar(r.world,f.nationId,n.id));
  const engaging=row?.decision==='busy'&&!(r.maritime.retreating[fleetId]>r.clock.tick);
  const attackRole=atWar&&r.portControl.attackFleetIds.includes(fleetId),target=province(order?.targetId);
  const reclaim=!!target&&r.portControl.ports[target.id]?.landOwnerId===f.nationId&&r.portControl.ports[target.id]?.occupierId!==f.nationId;
  const inPort=!!assigned&&r.fleetPositions.records[fleetId]?.status!=='moving';
  const homePort=home?.name??null;
  // Web addition: the original has no player-commanded fleets.
  if(row?.decision==='manual')return {status:'玩家指挥',mission:'执行玩家军令',destination:'-',homePort};
  if(engaging)return {status:'海战',mission:'海上交战中',destination:assignedLand?.name??'-',homePort};
  if(attackRole&&(target||row?.decision==='attacking'||!assigned)){
    if(target)return reclaim?{status:'进攻（夺回港口）',mission:`进攻态：夺回港口 ${target.name}`,destination:target.name,homePort}:{status:'进攻（攻击港口）',mission:`进攻态：攻击港口 ${target.name}`,destination:target.name,homePort};
    return {status:'进攻（搜索目标）',mission:'进攻态：正在搜索可攻击港口',destination:'等待分配进攻目标',homePort};
  }
  if(attackRole&&assignedLand)return {status:'待命（前沿待命）',mission:`待命前沿待命：${assignedLand.name}`,destination:assignedLand.name,homePort};
  if(assignedLand)return inPort?{status:'待命（港口巡逻）',mission:`待命驻扎：${assignedLand.name}（港口巡逻）`,destination:assignedLand.name,homePort}:{status:'待命（前往驻扎）',mission:`待命前往驻扎港：${assignedLand.name}`,destination:assignedLand.name,homePort};
  return {status:'待命（母港巡逻）',mission:'待命：母港附近巡逻',destination:'-',homePort};
}
