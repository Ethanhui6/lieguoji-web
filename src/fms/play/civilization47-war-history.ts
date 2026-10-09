import type {PoliticalRun47} from './civilization47-diplomatic-world';
import type {War46Campaign} from './war47-wars';

/** Capture names and facts at the event, not when a history panel is opened. */
export function warHistoryDetails47(r:PoliticalRun47,c:War46Campaign,ended=false):string {
  const key=(id:number)=>r.nativeWars.nationIds.find(n=>n[0]===id)?.[1];
  const name=(id:number)=>r.world.nations.find(n=>n.id===key(id))?.name??'未记录国家';
  const members=c.coalition?.members??[...c.participants,...c.destroyedParticipants];
  const sides=([0,1]as const).map(side=>[...new Set(members.filter(m=>m.side===side).map(m=>m.stateId))]);
  const sideName=(i:number)=>c.history==='complete'?(i===0?'进攻':'防守'):(i===0?'记录方一':'记录方二');
  const groups=sides.map((ids,i)=>`${sideName(i)}阵营（${ids.length}国）：${ids.slice(0,4).map(name).join('、')}${ids.length>4?'等':''}`).join('；');
  const targets=c.history==='unknown'?'开战理由和原始目标未记录。':c.goals.map(g=>{
    const ids=g.scope?.provinceIds??[],places=ids.slice(0,3).map(id=>r.world.provinces.find(p=>p.id===r.nativeWars.provinceIds[id-1])?.name??'未记录地区').join('、'),scope=`${places}${ids.length>3?'等':''}${ids.length}处地区`;
    if(g.type===1)return `割让${scope}`;
    if(g.type===2)return `在${scope}中控制${g.scope?.requiredCount??0}处`;
    if(g.type===3)return `吞并${name(g.target)}`;
    if(g.type===6)return `由${name(g.target)}向${name(g.beneficiary)}支付战争赔款`;
    return `目标${g.id}（类型${g.type}）`;
  }).join('；');
  if(!ended)return `${groups}。目标：${targets}。部队须实际行军、交锋或登陆。`;
  const elapsed=Math.round(((c.endedTick??r.clock.tick)-c.openedTick)/120*10)/10;
  const loss=sides.map((ids,i)=>`${sideName(i)} ${Math.round(c.deaths.filter(([id])=>ids.includes(id)).reduce((sum,[,amount])=>sum+amount,0)*100)/100}`).join('、');
  const settlement=c.settlement;
  return `${c.history==='complete'?'历时':'自本局记录起经过'}${elapsed}日。${groups}。目标：${targets}。累计军力损失：${loss||'0'}（原作战分单位，非阵亡人数）。本次和约执行${settlement?.transfers.length??0}项转地、确认${settlement?.confirmedOwnership.length??0}处实控归属。`;
}
