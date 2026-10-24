/** Original CasusBelliServiceV2.BuildCatalog names (CasusBelli_* keys) and
 * WarV2EventText.GoalDesc (WarV2_Goal* keys), Chinese localization. */
export const CASUS_BELLI_NAMES47:Record<number,string>={
  1:'领土征服',2:'吞并',3:'霸权臣服',6:'文化统一',7:'强制改宗',8:'空白开拓',
  10:'继承内战',11:'改革内战',12:'独立内战',13:'推翻内战',14:'行省叛乱',15:'家族叛乱',16:'傀儡反抗',
};
export const casusBelliName47=(id:number)=>CASUS_BELLI_NAMES47[id]??'未知';

/** GoalDesc(type, province count) for WarGoalTypeV2 0–11. */
export function warGoalDesc47(type:number,count:number):string{
  switch(type){
    case 0:case 1:return `索取${count}省`;
    case 2:return `占领${count}省`;
    case 3:return '吞并全境';
    case 4:return '附庸';
    case 6:return '索取赔款';
    case 7:return '独立';
    case 8:return '推翻统治';
    case 9:return '改革政体';
    case 10:return '夺取王位';
    case 11:return '迫使目标改信本国宗教';
    default:return '未知';
  }
}

/** WarV2DeclaredEvent.GetDescription: WarV2_Declared, plus WarV2_Coalition
 * when either side has more than one state. */
export function warDeclaredText47(attacker:string,casusBelliId:number,defender:string,goal:{type:number;scope?:{provinceIds:readonly number[]|null}|null}|undefined,attackers:number,defenders:number){
  const base=`${attacker}以${casusBelliName47(casusBelliId)}为由对${defender}宣战，目标：${goal?warGoalDesc47(goal.type,goal.scope?.provinceIds?.length??0):'未知'}`;
  return attackers>1||defenders>1?`${base}（${attacker}方${attackers}国 vs ${defender}方${defenders}国）`:base;
}
/** WarV2EventText.Duration. */
export const warDuration47=(months:number)=>months>=12?(months%12?`${Math.floor(months/12)}年${months%12}个月`:`${months/12}年`):`${months}个月`;
/** WarV2SettledEvent.GetDescription: outcome sentence, reason, ceded clause and
 * duration. Reasons follow WarV2EventText.ReasonName (0 达成目标：goal,
 * 1 战局已定, 2/3 对方崩溃, 4 久战厌兵, 9 首都沦陷). */
export function warSettledText47(o:{aggressor:string;defender:string;winnerSide:0|1|null;annexed:boolean;reason:number;goal?:{type:number;scope?:{provinceIds:readonly number[]|null}|null};ceded:number;months:number}){
  const reason=o.reason===0?(o.goal?`达成目标：${warGoalDesc47(o.goal.type,o.goal.scope?.provinceIds?.length??0)}`:'达成目标'):o.reason===1?'战局已定':o.reason===2||o.reason===3?'对方崩溃':o.reason===4?'久战厌兵':o.reason===9?'首都沦陷':'';
  const tail=reason?`，${reason}`:'';
  const winner=o.winnerSide===1?o.defender:o.aggressor,loser=o.winnerSide===1?o.aggressor:o.defender;
  const base=o.annexed?`${winner}击灭并吞并${loser}${tail}`:o.winnerSide===0?`${o.aggressor}战胜${o.defender}${tail}${o.ceded>0?`，割得${o.ceded}省`:''}`:o.winnerSide===1?`${o.defender}击退${o.aggressor}${tail}`:`${o.aggressor}与${o.defender}停战${tail}`;
  return `${base}，历时${warDuration47(o.months)}`;
}
