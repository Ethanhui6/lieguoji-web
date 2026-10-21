import type {PoliticalRun47} from './civilization47-diplomatic-world';
import {allianceOf46} from './war46-alliance';
import {overlord46} from './war46-vassals';
import {quoteTribute47} from './civilization47-vassal-manager';

/** Original StateInfoUI "国家行为": pick an action, then click a target state
 * on the map (StartWarTips / AllianceTips / ClickGenTips / AnnexTips). Texts
 * follow the original localization; the vassal pick tip and "停战" tip are web
 * wording because the original has no such strings. */
export type NationPick47='war'|'peace'|'alliance'|'expand'|'draw'|'annex'|'vassal';
export const PICK_TIPS47:Record<NationPick47,string>={war:'点击其他国家，发动战争',peace:'点击交战国家，停止战争',alliance:'点击其他国家，缔结同盟',expand:'点击地图，将点击的省份设置为当前国家领土',draw:'点击地图，将点击的省份设置为所选国家领土',annex:'点击敌对国家，直接吞并',vassal:'点击其他国家，收为附庸'};
export function CultureNationActions47({run,nationId,busy,pick,onPick,onLeaveAlliance,onRelease,onAutoDiplomacy}:{run:PoliticalRun47;nationId:string;busy:boolean;pick:NationPick47|null;onPick:(kind:NationPick47|null)=>void;onLeaveAlliance:()=>void;onRelease:()=>void;onAutoDiplomacy:(enabled:boolean)=>void}){
  const alive=run.world.provinces.some(p=>p.controller===nationId),alliance=allianceOf46(run,nationId),lord=overlord46(run,nationId),vassals=run.vassals.records.filter(v=>v.endedTick===null&&v.overlordId===nationId).map(v=>v.vassalId);
  const name=(id:string)=>run.world.nations.find(n=>n.id===id)?.name??id;
  const atWar=run.world.statecraft!.relations.some(r=>[r.a,r.b].includes(nationId)&&r.status==='war');
  const button=(kind:NationPick47,label:string,disabled=false)=><button aria-pressed={pick===kind} disabled={busy||!alive||disabled} title={PICK_TIPS47[kind]} onClick={()=>onPick(pick===kind?null:kind)}>{label}</button>;
  return <details open className="c47-nation-actions"><summary>国家行为</summary>
    <div className="c47-action-grid" role="group" aria-label="国家行为">
      {button('war','宣战',lord!==null)}
      {button('peace','停战',!atWar)}
      {button('alliance','缔结盟约',lord!==null)}
      <button disabled={busy||!alliance} title="退出当前同盟" onClick={onLeaveAlliance}>退出同盟</button>
      {button('expand','点击扩张')}
      {button('annex','吞并')}
      {button('vassal','收为附庸',lord!==null)}
      <button disabled={busy||lord===null} title="解除附庸" onClick={onRelease}>解除附庸</button>
    </div>
    <label className="c47-check"><input type="checkbox" aria-label="本国自主外交" checked={run.diplomacy.nations[nationId]===true} disabled={busy||!alive} onChange={e=>onAutoDiplomacy(e.target.checked)}/>自主外交{run.diplomacy.worldAuto?'':'（全局已关闭）'}</label>
    <small>{alliance?`联盟信息：${alliance.name} · 成员 ${alliance.members.map(name).join('、')}`:'未加入联盟'}{lord?` · 附庸于${name(lord)}（附庸国无法自主行使外交权力，需独立）${(q=>q?`；贡金约 ${q.amount} 金币，${q.year}年12月${q.day}日缴纳`:'')(quoteTribute47(run,nationId))}`:''}{vassals.length?` · 附庸：${vassals.map(name).join('、')}`:''}</small>
  </details>;
}
