import {useEffect,useRef,useState} from 'react';
import type {FmsDocument} from '../model';
import {FmsRenderer} from '../renderer';
import {FmsGestures} from '../gestures';
import {fitCamera,screenToWorld,resizeCamera,zoomCameraAt} from '../../world/camera';
import {PlayMap} from './map';
import {provinceAt} from './world';
import {PlayIcon} from './PlayIcon';
import {CULTURE_IDS47,CULTURES47,RELIGIONS47,POLITIES47,culture47,type CultureId47,type NamingMode47,type ReligionId47} from './civilization47-catalog';
import {currentRuler47,type CultureChoice47,type CivilizationEdit47} from './civilization47-names';
import {Culture47Client} from './culture47-client';
import type {Culture47Snapshot,Culture47Request} from './culture47.worker';
import type {Culture47Action,Culture47Journal} from './culture47-session';
import {loadCulture47,saveCulture47,type SavedCulture47} from './culture47-storage';
import {previewFamilySuccession47} from './civilization47-succession';
import {graphFor46} from './war46-geography';
import type {DisplayFrame} from './motion';
import type {FoundingForces47} from './civilization47-forces';
import type {NativePolity} from './native-combat/upper-efficiency';
import './culture47.css';

const polityLabels:Record<NativePolity,string>={Kingdom:'王国',Empire:'帝国',Republic:'共和国',Federation:'联邦',Tribal:'部族',Theocracy:'神权国'};
const failText=(e:unknown)=>e instanceof Error?e.message:String(e);
async function verifyJournal(journal:Culture47Journal){const client=new Culture47Client();try{await client.send({type:'verify',journal});}finally{client.close();}}
const defaultCultures:CultureId47[]=['chinese','japanese','english','arab','roman','german'];
function NationIdentity({run,id,cityId,busy,act}:{run:FoundingForces47;id:string;cityId:string|null;busy:boolean;act:(a:Culture47Action)=>void}){
  const nation=run.world.nations.find(n=>n.id===id)!,identity=run.civilization.nations[id],ruler=currentRuler47(run.civilization,run.chronicle,id);
  const [name,setName]=useState(identity.name.custom??''),[religion,setReligion]=useState(identity.religionId),[polity,setPolity]=useState(identity.polity),[pending,setPending]=useState(false);
  const head=run.people.nations[id].leaderId,person=head===null?null:run.kin.persons[head],family=person?run.kin.families[person.familyId]:null;
  const cities=run.world.cities.filter(c=>run.world.provinces.find(p=>p.id===c.provinceId)?.controller===id);
  const city=run.world.cities.find(c=>c.id===cityId)??cities.find(c=>c.id===nation.capitalId)??cities[0];
  let heir:ReturnType<typeof previewFamilySuccession47>|null=null;try{heir=previewFamilySuccession47(run,id);}catch{/* Unsupported office or no known heir; no pretend succession. */}
  const edit=(e:CivilizationEdit47)=>act({kind:'identity',edit:e});
  return <>
    <div className="c47-identity"><i style={{background:nation.color}}/><div><small>{culture47(identity.cultureId).label}文化 · {polityLabels[identity.polity]}</small><h2>{nation.name}</h2><p>{RELIGIONS47[identity.religionId]}</p></div></div>
    {ruler&&<section className="c47-ruler"><PlayIcon name="crown"/><div><small>{ruler.title} · 第 {ruler.order} 任</small><strong>{ruler.name}</strong><span>{['Kingdom','Empire','Tribal'].includes(identity.polity)?`${ruler.regnalName} ${ruler.regnalOrdinal} 世`:''}{person?` · ${person.age} 岁`:''}</span></div></section>}
    <details open><summary>国家制度与名称</summary><form onSubmit={e=>{e.preventDefault();edit({kind:'nation',id,patch:{polity,religionId:religion,customName:name.trim()||null}});}}>
      <label>自定国名<input aria-label="自定国名" value={name} maxLength={100} placeholder={identity.name.value} onChange={e=>setName(e.target.value)}/></label>
      <label>政体<select aria-label="国家政体" value={polity} onChange={e=>setPolity(e.target.value as NativePolity)}>{POLITIES47.map(p=><option value={p} key={p}>{polityLabels[p]}</option>)}</select></label>
      <label>国家宗教<select aria-label="国家宗教" value={religion} onChange={e=>setReligion(e.target.value as ReligionId47)}>{Object.entries(RELIGIONS47).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <button disabled={busy} type="submit">应用国家设置</button><small>国名留空时，国号随政体变化。国家宗教不会自动改变所有居民的信仰。</small>
    </form></details>
    <details open><summary>城市 · {cities.length}</summary>{city&&<CityIdentity key={city.id+'/'+run.civilization.cities[city.id].name.custom} cityId={city.id} run={run} busy={busy} edit={edit}/>}<div className="c47-city-list">{cities.map(c=><span key={c.id}>{c.id===nation.capitalId?'♛ ':''}{c.name}</span>)}</div></details>
    <details><summary>{family?culture47(identity.cultureId).houseLabel+' · '+family.surname:'家族'}</summary>{family&&<ul className="c47-family">{family.memberIds.map(pid=>{const p=run.kin.persons[pid];return <li key={pid}><strong>{p.identity.name}</strong><small>{pid===head?'现任领袖':p.fatherId===head||p.motherId===head?'子女':person?.spouseId===pid?'配偶':'亲属'} · {p.age} 岁 · {RELIGIONS47[p.religionId as ReligionId47]??'无指定宗教'}</small></li>;})}</ul>}{heir&&<><p>继承候选：{heir.name}，{heir.age} 岁</p><button disabled={busy} onClick={()=>setPending(true)}>安排传位</button>{pending&&<div role="group" aria-label="确认传位"><p>由 {heir.name} 接任{heir.title}，成为第 {heir.order} 任。</p><button disabled={busy} onClick={()=>{act({kind:'succession',nationId:id});setPending(false);}}>确认传位</button><button onClick={()=>setPending(false)}>取消</button></div>}</>}</details>
  </>;
}
function CityIdentity({cityId,run,busy,edit}:{cityId:string;run:FoundingForces47;busy:boolean;edit:(e:CivilizationEdit47)=>void}){
  const row=run.civilization.cities[cityId],city=run.world.cities.find(c=>c.id===cityId)!,[value,setValue]=useState(row.name.custom??'');
  return <form onSubmit={e=>{e.preventDefault();edit({kind:'city',id:cityId,customName:value.trim()||null});}}><label>{city.name} · {culture47(row.cultureId).label}文化<input aria-label="自定城市名" value={value} maxLength={100} placeholder={row.name.value} onChange={e=>setValue(e.target.value)}/></label><button disabled={busy}>应用城市名</button></form>;
}
export function CultureWorld47({terrain,onClose,onLegacy}:{terrain:FmsDocument;onClose:()=>void;onLegacy:()=>void}){
  const [snapshot,setSnapshot]=useState<Culture47Snapshot|null>(null),[busy,setBusy]=useState(false),[playing,setPlaying]=useState(false),[notice,setNotice]=useState(''),[saved,setSaved]=useState<SavedCulture47|null>(null),[locked,setLocked]=useState(false),[storageReady,setStorageReady]=useState(false);
  const [count,setCount]=useState(6),[cityCount,setCityCount]=useState(60),[mode,setMode]=useState<NamingMode47>('culture-generated'),[enabled,setEnabled]=useState<CultureId47[]>(defaultCultures),[choices,setChoices]=useState<Record<string,CultureChoice47>>({}),[war,setWar]=useState(false);
  const [leaving,setLeaving]=useState(false);
  const [nationId,setNationId]=useState('n-0'),[cityId,setCityId]=useState<string|null>(null),[panel,setPanel]=useState<'nation'|'history'|null>(null);
  const client=useRef<Culture47Client|null>(null),current=useRef(snapshot),inflight=useRef(false),revision=useRef<number|null>(null),lifetime=useRef<AbortController|null>(null),host=useRef<HTMLDivElement>(null);
  const mapControl=useRef<{zoom:(n:number)=>void;fit:()=>void}|null>(null),selected=useRef({nationId,cityId}),paint=useRef<()=>void>(()=>{}),lastSaved=useRef(-1);
  current.current=snapshot;selected.current={nationId,cityId};
  useEffect(()=>{const controller=new AbortController();lifetime.current=controller;client.current=new Culture47Client();void loadCulture47(indexedDB,verifyJournal).then(s=>{if(controller.signal.aborted)return;setSaved(s);revision.current=s?.revision??null;setStorageReady(true);}).catch(e=>{if(!controller.signal.aborted){setLocked(true);setNotice(failText(e));setStorageReady(true);}});return()=>{controller.abort();client.current?.close();client.current=null;};},[]);
  async function send(command:Culture47Request){
    if(inflight.current||!client.current)return;inflight.current=true;setBusy(true);
    try{const s=await client.current.send(command);if(lifetime.current?.signal.aborted)return;setSnapshot(s);if(command.type==='create'||command.type==='load'){setNationId(s.run.world.nations[0].id);setCityId(null);setPanel(null);lastSaved.current=command.type==='load'?s.journal.actions.length:-1;}setNotice('');}
    catch(e){if(!lifetime.current?.signal.aborted){setPlaying(false);setNotice(failText(e));}}
    finally{inflight.current=false;if(!lifetime.current?.signal.aborted)setBusy(false);}
  }
  const act=(action:Culture47Action)=>{const s=current.current;if(s)void send({type:'action',action,sequence:s.journal.actions.length});};
  useEffect(()=>{if(!playing)return;const timer=setInterval(()=>{const s=current.current;if(s&&!inflight.current)void send({type:'action',action:{kind:'advance',ticks:5},sequence:s.journal.actions.length});},250);return()=>clearInterval(timer);},[playing]);
  async function save(exit=false){
    if(!current.current||inflight.current||locked||!storageReady)return;inflight.current=true;setBusy(true);
    try{const s=current.current,n=await saveCulture47(s.journal,revision.current,indexedDB,lifetime.current?.signal,verifyJournal);revision.current=n;lastSaved.current=s.journal.actions.length;setSaved({journal:s.journal,revision:n,recovered:false});setNotice('文化世界已保存，刷新后可继续。');if(exit)onClose();}
    catch(e){setPlaying(false);setNotice(failText(e));}finally{inflight.current=false;if(!lifetime.current?.signal.aborted)setBusy(false);}
  }
  function requestClose(){if(inflight.current)return;setPlaying(false);if(current.current&&lastSaved.current!==current.current.journal.actions.length)setLeaving(true);else onClose();}
  useEffect(()=>{const protect=(e:BeforeUnloadEvent)=>{if(current.current&&lastSaved.current!==current.current.journal.actions.length){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[]);
  const runId=snapshot?.run.id;
  const transition=useRef<{id:string;from:DisplayFrame;to:DisplayFrame;start:number;duration:number}|null>(null);
  function displayFrame(){const t=transition.current;if(!t)return current.current!.frame;const alpha=t.duration?Math.min(1,(performance.now()-t.start)/t.duration):1;const mix=(a:Map<string,{x:number;y:number}>,b:Map<string,{x:number;y:number}>)=>new Map([...b].map(([id,p])=>{const q=a.get(id)??p;return[id,{x:q.x+(p.x-q.x)*alpha,y:q.y+(p.y-q.y)*alpha}];}));return{armies:mix(t.from.armies,t.to.armies),fleets:mix(t.from.fleets,t.to.fleets),alpha};}
  useEffect(()=>{if(!snapshot)return;const now=performance.now(),old=transition.current,from=old&&old.id===snapshot.run.id?displayFrame():snapshot.frame;transition.current={id:snapshot.run.id,from,to:snapshot.frame,start:now,duration:old&&old.id===snapshot.run.id?Math.min(750,Math.max(150,now-old.start)):0};},[snapshot]);
  useEffect(()=>{
    if(!runId||!host.current||!current.current)return;
    const element=host.current,source=current.current.run.terrain,renderer=new FmsRenderer(()=>{},e=>{setPlaying(false);setNotice(failText(e));}),map=new PlayMap(()=>paint.current());
    const view={viewport:{width:element.clientWidth,height:element.clientHeight},camera:fitCamera(source,{width:element.clientWidth,height:element.clientHeight})};
    const sea=graphFor46(current.current.run);
    let disposed=false,cleanup=()=>{};
    void renderer.init(element).then(()=>{
      if(disposed)return;renderer.setDocument(source);renderer.setTerrainDisplay('biome');renderer.attachGameplayLayer(map.layer);renderer.setCamera(view.camera);
      const canvas=renderer.canvas;canvas.setAttribute('aria-label','真实文化世界地图');canvas.dataset.testid='culture47-map';
      paint.current=()=>{const s=current.current;if(disposed||!s)return;const r=s.run;
        const selectedCity=r.world.cities.find(c=>c.id===selected.current.cityId);
        map.draw(r.world,r.scale,view.camera.scale,selectedCity?.provinceId??null,null,'political',r.units,view,{navy:r.navy,graph:sea,selected:null,nationId:selected.current.nationId,preview:[]},displayFrame(),undefined,[],r.id,source);
        canvas.dataset.day=String(r.world.day);canvas.dataset.countries=JSON.stringify(r.world.nations.map(n=>({id:n.id,name:n.name})));canvas.dataset.cities=JSON.stringify(map.cityPositions());canvas.dataset.units=JSON.stringify(map.unitPositions());renderer.refresh();
      };
      const setCamera=(c:typeof view.camera)=>{view.camera=c;renderer.setCamera(c);paint.current();};
      mapControl.current={zoom:n=>setCamera(zoomCameraAt(view.camera,n,{x:view.viewport.width/2,y:view.viewport.height/2},source,view.viewport)),fit:()=>setCamera(fitCamera(source,view.viewport))};
      const gestures=new FmsGestures({camera:()=>view.camera,setCamera,world:()=>source,viewport:()=>view.viewport,begin:()=>{},move:()=>{},commit:()=>{},cancel:()=>{}}),ids=new Set<number>();
      let tap:{id:number;x:number;y:number}|null=null;
      const point=(e:PointerEvent|WheelEvent)=>{const b=canvas.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};};
      const down=(e:PointerEvent)=>{if(e.button!==0)return;const p=point(e);ids.add(e.pointerId);tap=ids.size===1?{id:e.pointerId,...p}:null;canvas.setPointerCapture(e.pointerId);gestures.down(e.pointerId,p,false);};
      const move=(e:PointerEvent)=>{const p=point(e);if(tap&&Math.hypot(p.x-tap.x,p.y-tap.y)>5)tap=null;gestures.move(e.pointerId,p);};
      const up=(e:PointerEvent)=>{const p=point(e),t=tap;gestures.up(e.pointerId,p);ids.delete(e.pointerId);tap=null;if(t?.id!==e.pointerId||ids.size||!current.current)return;const r=current.current.run,w=screenToWorld(view.camera,p),id=provinceAt(r.world,{x:w.x*r.scale,y:w.y*r.scale}),province=r.world.provinces.find(p=>p.id===id);if(province){setNationId(province.controller);setCityId(r.world.cities.find(c=>c.provinceId===id)?.id??null);setPanel('nation');}};
      const cancel=()=>{tap=null;ids.clear();gestures.interrupt();},wheel=(e:WheelEvent)=>{e.preventDefault();gestures.wheel(point(e),e.deltaY);};
      canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);canvas.addEventListener('wheel',wheel,{passive:false});
      const observer=new ResizeObserver(()=>{const next={width:element.clientWidth,height:element.clientHeight};view.camera=resizeCamera(view.camera,view.viewport,next,source);view.viewport=next;renderer.resize(next.width,next.height);renderer.setCamera(view.camera);paint.current();});observer.observe(element);paint.current();
      let raf=0;const animate=()=>{if(disposed)return;const frame=displayFrame();if(frame.alpha<1){map.updateUnits(frame);renderer.refresh();}raf=requestAnimationFrame(animate);};raf=requestAnimationFrame(animate);
      cleanup=()=>{cancelAnimationFrame(raf);observer.disconnect();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',cancel);canvas.removeEventListener('wheel',wheel);};
    }).catch(e=>{if(!disposed)setNotice(failText(e));});
    return()=>{disposed=true;cleanup();paint.current=()=>{};mapControl.current=null;renderer.destroy();map.dispose();};
  },[runId]);
  useEffect(()=>{paint.current();},[snapshot,nationId,cityId,panel]);
  const choice=(i:number):CultureChoice47=>{const c=culture47(enabled[i%enabled.length]??'chinese');return choices['n-'+i]&&enabled.includes(choices['n-'+i].cultureId)?choices['n-'+i]:{cultureId:c.id,religionId:c.suggestedReligion,polity:c.suggestedPolity};};
  const setChoice=(i:number,patch:Partial<CultureChoice47>)=>setChoices(old=>({...old,['n-'+i]:{...choice(i),...patch}}));
  const r=snapshot?.run;
  return <main className="c47-app" data-testid="culture47-app" data-day={r?.world.day} data-tick={r?.clock.tick}>
    <div className="c47-map" ref={host}/>
    <header className="c47-bar"><button aria-label="返回绘图" disabled={busy} onClick={requestClose}><PlayIcon name="back"/></button><div><strong>列国纪</strong><small>{r?'真实文化世界':'创建文明'}</small></div>{r&&<><time>第 {r.world.day} 日 <small>{r.life.currentDate.year}年 {r.life.currentDate.month}月 {r.life.currentDate.day}日</small></time><button aria-label="保存文化世界" disabled={busy||locked} onClick={()=>void save()}><PlayIcon name="save"/>{lastSaved.current!==snapshot.journal.actions.length&&<i className="c47-unsaved"/>}</button></>}</header>
    {leaving&&<div className="c47-exit" role="dialog" aria-modal="true" aria-label="保存后离开"><h2>保留这个世界？</h2><p>尚有未保存的时间或编辑。</p><button disabled={busy||locked} onClick={()=>void save(true)}>保存并返回</button><button disabled={busy} onClick={onClose}>放弃未保存进度</button><button disabled={busy} onClick={()=>setLeaving(false)}>继续查看</button></div>}
    {notice&&<div className="c47-notice" role="status">{notice}</div>}
    {!r&&<section className="c47-setup"><span className="c47-kicker">文化 · 信仰 · 国家</span><h1>让文明从你的地图诞生</h1><p>为国家选择真实文化，独立设定信仰与政体。名字从同一种文化里生长。</p>
      <div className="c47-segment" role="group" aria-label="国号与城市命名模式">{([['culture-generated','文化生成'],['historical-names','历史名称']] as const).map(([v,label])=><button key={v} aria-pressed={mode===v} onClick={()=>{setMode(v);if(v==='historical-names')setCityCount(24);}}>{label}</button>)}</div><small>{mode==='historical-names'?'使用历史国号和城市名，版图与人物仍为新创世界。名称库不足时会明确提示。':'生成符合各文化构词习惯的新国名和城市名。'} 人物均按文化生成，不拼接历史人物家谱。</small>
      <div className="c47-counts"><label>国家<select aria-label="国家数量" value={count} onChange={e=>setCount(Number(e.target.value))}>{[2,3,4,6,8,12,16,24].map(n=><option key={n}>{n}</option>)}</select></label><label>城市<select aria-label="城市数量" value={cityCount} onChange={e=>setCityCount(Number(e.target.value))}>{[24,60,120,240,480].map(n=><option key={n}>{n}</option>)}</select></label></div>
      <fieldset><legend>启用文化</legend><div className="c47-cultures">{CULTURE_IDS47.map(id=><label key={id} className={enabled.includes(id)?'is-selected':''}><input type="checkbox" aria-label={`文化：${CULTURES47[id].label}`} checked={enabled.includes(id)} onChange={e=>setEnabled(old=>e.target.checked?[...old,id]:old.filter(c=>c!==id))}/>{CULTURES47[id].label}</label>)}</div></fieldset>
      <details className="c47-nation-setup"><summary>逐国配置文化、宗教与政体</summary>{Array.from({length:count},(_,i)=>{const c=choice(i);return <div className="c47-choice" key={i}><strong>国家 {i+1}</strong><select aria-label={`国家${i+1}文化`} value={c.cultureId} onChange={e=>{const n=culture47(e.target.value);setChoice(i,{cultureId:n.id,religionId:n.suggestedReligion,polity:n.suggestedPolity});}}>{enabled.map(id=><option value={id} key={id}>{CULTURES47[id].label}</option>)}</select><select aria-label={`国家${i+1}宗教`} value={c.religionId} onChange={e=>setChoice(i,{religionId:e.target.value as ReligionId47})}>{Object.entries(RELIGIONS47).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select><select aria-label={`国家${i+1}政体`} value={c.polity} onChange={e=>setChoice(i,{polity:e.target.value as NativePolity})}>{POLITIES47.map(p=><option key={p} value={p}>{polityLabels[p]}</option>)}</select></div>;})}</details>
      <label className="c47-war"><input type="checkbox" checked={war} onChange={e=>setWar(e.target.checked)}/>战乱开局</label>
      <button className="c47-primary" disabled={busy||!enabled.length} onClick={()=>void send({type:'create',opening:{terrain,count,cityCount,relations:war?'war':'peace',setup:{mode,enabled,nations:Object.fromEntries(Array.from({length:count},(_,i)=>['n-'+i,choice(i)]))}}})}>{busy?'正在建立文明…':'从当前地图创建文化世界'}</button>
      {saved&&<button disabled={busy} onClick={()=>void send({type:'load',journal:saved.journal})}>继续文化世界{saved.recovered?'（已找到有效备份）':''}</button>}
      <button onClick={onLegacy} disabled={busy}>继续旧世界 / 原版本功能</button>
      <details className="c47-scope"><summary>本次可试玩的范围</summary><p>真实文化、独立信仰与政体、两种命名、国家与城市改名、家族及传位，时间、财政、动员和实际位置行军已接入。自动外交、分裂、宗教传播和完整战争终局仍在接续，海陆速度比例尚待校准。</p><p>新世界独立保存；旧世界使用原版本。该本地版以操作重放恢复，最多 1000 日或 20000 条指令；较长世界读取需要时间。规则变化时保留并锁定旧记录，不自动转换。</p></details>
    </section>}
    {r&&<>
      <div className="c47-nations" aria-label="国家列表">{r.world.nations.map(n=><button key={n.id} aria-pressed={nationId===n.id&&panel==='nation'} onClick={()=>{setNationId(n.id);setCityId(null);setPanel('nation');}}><i style={{background:n.color}}/>{n.name}</button>)}</div>
      <div className="c47-zoom"><button aria-label="放大地图" onClick={()=>mapControl.current?.zoom(1.6)}><PlayIcon name="plus"/></button><button aria-label="缩小地图" onClick={()=>mapControl.current?.zoom(1/1.6)}><PlayIcon name="minus"/></button><button aria-label="显示全图" onClick={()=>mapControl.current?.fit()}><PlayIcon name="fit"/></button></div>
      {panel&&<aside className="c47-panel" aria-label={panel==='nation'?'文化与国家详情':'大事记'}><button className="c47-dismiss" aria-label="收起详情" onClick={()=>setPanel(null)}>×</button>{panel==='nation'?<NationIdentity key={r.id+'/'+nationId} run={r} id={nationId} cityId={cityId} busy={busy} act={act}/>:<><h2>大事记</h2><ol className="c47-history">{r.chronicle.entries.slice().reverse().map(e=><li key={e.id}><small>第 {e.day} 日</small><p>{e.text}</p></li>)}</ol></>}</aside>}
      <footer className="c47-controls"><button aria-label={playing?'暂停时间':'继续时间'} onClick={()=>setPlaying(p=>!p)}><PlayIcon name={playing?'pause':'play'}/></button><button aria-label="推进一天" disabled={busy} onClick={()=>act({kind:'advance',ticks:120})}><PlayIcon name="step"/></button><span>{playing?'世界推演中':'时间已暂停'}<small>查看详情不会暂停</small></span><button aria-label="查看大事记" onClick={()=>setPanel(panel==='history'?null:'history')}><PlayIcon name="book"/></button></footer>
    </>}
  </main>;
}
