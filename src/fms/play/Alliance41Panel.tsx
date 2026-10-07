import {militaryAccess41} from './war41-access';
import type {War41Run} from './war41-model';
import {allianceOf41,type AllianceEdit41} from './war41-alliance';
export function Alliance41Panel({run,nationId,busy,edit}:{run:War41Run;nationId:string;busy:boolean;edit:(e:AllianceEdit41)=>void}){
 const current=allianceOf41(run,nationId),live=new Set(run.world.provinces.map(p=>p.controller)),nation=(id:string)=>run.world.nations.find(n=>n.id===id)!;
 return <section className="play-alliance" data-testid="alliance-panel"><p className="play-muted">陆军可经盟国与本国附庸借道、驰援；不改变土地归属，不自动共享粮仓。</p><p data-testid="military-access">可通行：{run.world.nations.filter(n=>n.id!==nationId&&militaryAccess41(run)(run.world,nationId,n.id)).map(n=>n.name).join("、")||"仅本国"}</p><header><div><small>共同进退</small><h3>{current?.name??'尚未结盟'}</h3></div><span className="play-alliance-count">{current?`${current.members.length} 国`:'独立外交'}</span></header>
  {current&&<><div className="play-alliance-members">{current.members.map(id=><span key={id}><i style={{background:nation(id).color}}/>{nation(id).name}{id===nationId?' · 本国':''}</span>)}</div><p className="play-muted">此后的宣战将召集当前盟友。退出联盟不会自动结束已参加的战争。</p><button disabled={busy} onClick={()=>edit({type:'leave',nationId})}>预览退出联盟</button></>}
  <details><summary>选择结盟国家</summary><p className="play-muted">上帝干预可直接结盟。双方已有联盟时，先预览合并及停战范围。</p>{run.world.nations.filter(n=>live.has(n.id)&&n.id!==nationId&&(!current||allianceOf41(run,n.id)!==current)).map(n=><div className="play-row" key={n.id} data-nation-id={n.id}><span className="play-nation-name"><i style={{background:n.color}}/>{n.name}<small>{allianceOf41(run,n.id)?.name??'未结盟'}</small></span><button disabled={busy} onClick={()=>edit({type:'unite',nationId,targetId:n.id})}>预览结盟</button></div>)}</details>
  <div className="play-alliance-auto"><span>各国自主结盟 <strong>{run.alliances.enabled?'开启':'暂停'}</strong></span><button disabled={busy} onClick={()=>edit({type:'automatic',enabled:!run.alliances.enabled})}>{run.alliances.enabled?'预览暂停结盟':'预览开启结盟'}</button></div>
  <p className="play-muted">自主外交开启的国家按实力、好感、邻接和时间条件决定结盟。暂停结盟不会冻结已有联盟，强国仍可能结束旧盟约。</p>
 </section>;
}
