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
  const alive=run.world.provinces.some(p=>p.controller===nationId),alliance=allianceOf46(run,nationId),lord=overlord46(run,nationId);
  const atWar=run.world.statecraft!.relations.some(r=>[r.a,r.b].includes(nationId)&&r.status==='war');
  const button=(kind:NationPick47,label:string,disabled=false)=><button aria-pressed={pick===kind} disabled={busy||!alive||disabled} title={PICK_TIPS47[kind]} onClick={()=>onPick(pick===kind?null:kind)}>{label}</button>;
  return <div className="c47-nation-actions" role="group" aria-label="国家行为">
    <div className="c47-action-grid">
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
  </div>;
}
/** Original StateInfoUI.UpdateDiplomacySection: 敌对国家 / 同盟国家 /
 * 宗主国 / 附庸 lines, or 暂无外交关系. */
/** Original StateRelationsHighlighter.UpdateStateHighlights colours for the selected state:
 * enemies red, alliance members blue, vassals green, the overlord magenta; the state itself
 * keeps the selected-line colour. Nation id → 0xRRGGBB. */
export function relationHighlights47(run:PoliticalRun47,nationId:string):Map<string,number>{
  const out=new Map<string,number>();
  for(const r of run.world.statecraft!.relations)if(r.status==='war'&&(r.a===nationId||r.b===nationId))out.set(r.a===nationId?r.b:r.a,0xff0000);
  for(const id of allianceOf46(run,nationId)?.members??[])if(id!==nationId)out.set(id,0x0000ff);
  for(const v of run.vassals.records)if(v.endedTick===null&&v.overlordId===nationId)out.set(v.vassalId,0x00ff00);
  const lord=overlord46(run,nationId);if(lord)out.set(lord,0xff00ff);
  out.set(nationId,0xfff1b8);
  return out;
}
export function CultureNationRelations47({run,nationId}:{run:PoliticalRun47;nationId:string}){
  const alliance=allianceOf46(run,nationId),lord=overlord46(run,nationId),vassals=run.vassals.records.filter(v=>v.endedTick===null&&v.overlordId===nationId).map(v=>v.vassalId);
  const name=(id:string)=>run.world.nations.find(n=>n.id===id)?.name??id;
  const enemies=run.world.statecraft!.relations.filter(r=>[r.a,r.b].includes(nationId)&&r.status==='war').map(r=>r.a===nationId?r.b:r.a);
  const allies=alliance?alliance.members.filter(id=>id!==nationId):[];
  const tribute=lord?quoteTribute47(run,nationId):null;
  const rows:[string,string][]=[];
  if(enemies.length)rows.push(['敌对国家',enemies.map(name).join('、')]);
  if(allies.length)rows.push(['同盟国家',`${alliance!.name}：${allies.map(name).join('、')}`]);
  if(lord)rows.push(['宗主国',name(lord)+(tribute?`（贡金约 ${tribute.amount}，${tribute.year}年12月${tribute.day}日）`:'')]);
  if(vassals.length)rows.push(['附庸',vassals.map(name).join('、')]);
  return <details className="c47-relations"><summary>外交{enemies.length?` · ${enemies.length} 国交战`:''}</summary>
    {rows.length?<dl className="c47-province-rows">{rows.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>:<p>暂无外交关系</p>}
  </details>;
}
