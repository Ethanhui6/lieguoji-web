import type {PoliticalRun47} from './civilization47-diplomatic-world';
import type {War46Campaign} from './war47-wars';
import type {Ruler} from './chronicle-records';
import {isoPlusDays} from './civilization47-iso-calendar';

/** Original WarType (legacy war type) and StateInfoUI.GetWarTypeLocalizationKey names. A V2 war
 * reads as its internal legacy type, or Conquest (WarContextBridgeV2.MapWarType); the player's
 * own declarations go through State.ForceStartWar (强制战争); wars from before the record are
 * unknown. RebelRegular has no text of its own and reads as 叛乱战争. */
export const WAR_TYPE_NAMES47:Record<number,string>={0:'征服战争',1:'解放战争',2:'叛乱战争',3:'叛乱战争',4:'家族叛乱',5:'内战',6:'强制战争',7:'附庸战争',8:'继承权内战',9:'改革内战',10:'独立内战',11:'推翻内战'};
export type LeaderRun47=PoliticalRun47&{forcedWars47?:number[];reigns47?:Record<string,{start:[number,number];end:[number,number]|null}>};
export function warType47(r:LeaderRun47,c:War46Campaign):number|null{
  if(c.internal)return c.internal.legacyType as number;
  if(c.history==='unknown')return null;
  return r.forcedWars47?.includes(c.id)?6:0;
}
export const warTypeName47=(r:LeaderRun47,c:War46Campaign)=>{const t=warType47(r,c);return t===null?'未知战争':WAR_TYPE_NAMES47[t]??'未知战争';};

/** StateSnapshot (provinceCount, vassalCount) at the start and end of each reign, taken as the
 * reign begins and ends. Only worlds created with the ledger keep it. */
const counts=(r:LeaderRun47,nationId:string):[number,number]=>[r.world.provinces.filter(p=>p.controller===nationId).length,r.vassals.records.filter(v=>v.overlordId===nationId&&v.endedTick===null).length];
export function recordReigns47(r:LeaderRun47){
  const ledger=r.reigns47;if(!ledger)return;
  for(const [nationId,reigns] of Object.entries(r.chronicle.leaders))for(const reign of reigns){
    const row=ledger[reign.id];
    if(!row){if(reign.endedDay===null)ledger[reign.id]={start:counts(r,nationId),end:null};}
    else if(row.end===null&&reign.endedDay!==null)row.end=counts(r,nationId);
  }
}

/** The LeaderHistoryRecord counters of one reign, from the war, alliance and vassal ledgers:
 * RecordWarParticipation (initiator / defender / ally, and the legacy war type), RecordWarOutcome
 * (the settlement's outcome for the state) and UpdateCurrentLeaderStats (alliances founded,
 * rebellions won as the mother state). */
export function leaderRecord47(r:LeaderRun47,nationId:string,reign:Ruler){
  const startTick=reign.ascendedDay*120,endTick=reign.endedDay===null?Infinity:reign.endedDay*120+119,inReign=(t:number)=>t>=startTick&&t<=endTick;
  const state=r.nativeWars.nationIds.find(v=>v[1]===nationId)?.[0];
  const rec={initiated:0,defended:0,ally:0,won:0,lost:0,drawn:0,regularRebel:0,familyRebel:0,civil:0,suppressed:0,alliances:0,provincesGained:0,provincesLost:0,vassalChange:0};
  for(const c of r.nativeWars.campaigns){
    const members=c.coalition?.members??[...c.participants,...c.destroyedParticipants],joined=c.attacker===nationId||c.defender===nationId||members.some(m=>m.stateId===state);
    if(joined&&inReign(c.openedTick)){
      if(c.attacker===nationId)rec.initiated++;else if(c.defender===nationId)rec.defended++;else rec.ally++;
      const t=warType47(r,c);
      if(t===2)rec.regularRebel++;else if(t===4)rec.familyRebel++;else if(t===5||t!==null&&t>=8&&t<=11)rec.civil++;
    }
    const s=c.settlement;if(!s||!inReign(s.tick))continue;
    const outcome=s.outcomes.find(o=>o[0]===state)?.[1];
    if(outcome===0)rec.won++;else if(outcome===1)rec.lost++;else if(outcome===2)rec.drawn++;
    // A rebellion or family rebellion the mother state won.
    const legacy=c.internal?.legacyType as number|undefined;
    if(outcome===0&&(legacy===2||legacy===4)&&c.internal!.motherStateId===state)rec.suppressed++;
  }
  rec.alliances=r.alliances.records.filter(a=>a.founders.includes(nationId)&&inReign(a.startedTick)).length;
  const snap=r.reigns47?.[reign.id];
  if(snap){const end=snap.end??counts(r,nationId),change=end[0]-snap.start[0];rec.provincesGained=Math.max(0,change);rec.provincesLost=Math.max(0,-change);rec.vassalChange=end[1]-snap.start[1];}
  return {rec,snapshot:!!snap};
}

/** State.GetLeaderAchievementsText, Chinese: header (state, 第N任/届, title), name, reign period,
 * territorial changes, military achievements with war results, alliances, vassals, rebellions
 * faced and suppressed. Empty parts are left out as in the original. */
export function leaderAchievements47(r:LeaderRun47,nationId:string,reign:Ruler,title:string):string[]{
  const {rec,snapshot}=leaderRecord47(r,nationId,reign),identity=r.civilization.nations[nationId],state=r.world.nations.find(n=>n.id===nationId)?.name??'';
  const unit=identity&&(identity.polity==='Republic'||identity.polity==='Federation')?'届':'任';
  const year=(day:number)=>isoPlusDays(r.life.startDate,day).year,end=reign.endedDay??r.world.day;
  const lines=[`${state} 第${reign.order}${unit}${title}`,reign.name,`在位时期: ${year(reign.ascendedDay)} - ${reign.endedDay===null?'现在':year(reign.endedDay)} (${Math.floor((end-reign.ascendedDay)/365.25)}年)`];
  if(snapshot){const land=[rec.provincesGained>0&&`获得 ${rec.provincesGained} 省份`,rec.provincesLost>0&&`失去 ${rec.provincesLost} 省份`].filter(Boolean);if(land.length)lines.push(`领土变化: ${land.join(' ')}`);}
  const part=[rec.initiated>0&&`主动征战${rec.initiated}次`,rec.defended>0&&`御敌卫国${rec.defended}次`,rec.ally>0&&`出兵援助${rec.ally}次`].filter(Boolean),result=[rec.won>0&&`胜${rec.won}`,rec.lost>0&&`损失${rec.lost}`,rec.drawn>0&&`和${rec.drawn}`].filter(Boolean);
  if(part.length||result.length)lines.push(`军事功绩: ${part.join('，')}${result.length?`${part.length?'，':''}战果${result.join('，')}`:''}`);
  if(rec.alliances>0)lines.push(`缔结的联盟: ${rec.alliances}`);
  if(snapshot&&rec.vassalChange!==0)lines.push(`征服的附庸: ${rec.vassalChange>0?`+${rec.vassalChange}`:rec.vassalChange}`);
  const faced=[rec.regularRebel>0&&`${rec.regularRebel}次地方叛乱`,rec.familyRebel>0&&`${rec.familyRebel}次家族叛乱`,rec.civil>0&&`${rec.civil}次内战`].filter(Boolean);
  if(faced.length)lines.push(`爆发 ${faced.join('，')}`);
  if(rec.suppressed>0)lines.push(`成功镇压叛乱: ${rec.suppressed}`);
  return lines;
}
