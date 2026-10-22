/** Original civil war kinds (FamilyManager.MapCivilWarCb / MapCivilWarGoalType):
 * WarType 8 succession → CB10 goal 10 (ClaimThrone); 9 reform → CB11 goal 9
 * (ReformGovernment); 10 independence → CB12 goal 7 (Independence); 11
 * overthrow → CB13 goal 8 (OverthrowRuler). */
export type CivilWarType47=8|9|10|11;
export const civilWarCb47=(t:CivilWarType47)=>(t+2) as 10|11|12|13;
export const civilWarGoal47=(t:CivilWarType47)=>[10,9,7,8][t-8] as 10|9|7|8;
export const isCivilWarCb47=(cb:number)=>cb>=10&&cb<=13;
/** Internal (rebel-shaped) wars: casus belli → [legacy WarType, goal type]. */
export function internalWarShape47(cb:number):[number,number]|null{
  if(cb===14)return [2,7];if(cb===15)return [4,7];if(cb===16)return [10,7];
  if(isCivilWarCb47(cb)){const t=(cb-2) as CivilWarType47;return [t,civilWarGoal47(t)];}
  return null;
}
