import {populationStamp47} from './civilization47-population-types';
import {CultureHouses47} from './CultureHouses47';
import {CultureCalendar47} from './CultureCalendar47';
import {reignAge47} from './civilization47-origins';
import {useEffect,useRef,useState,useMemo,type ReactNode} from 'react';
import {CultureNationOverview47,nationFamily47} from './CultureNationOverview47';
import {CultureHistory47} from './CultureHistory47';
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
import {sameCulture47Value} from './culture47-equal';
import {Culture47Unavailable,frozenCulture47} from './culture47-contract';
import type {Culture47Snapshot,Culture47Request as WorkerRequest} from './culture47.worker';
import type {Culture47Action,Culture47Journal} from './culture47-session';
import {loadCulture47,saveCulture47,CULTURE47_DATABASE,CULTURE47_LONGPLAY_DATABASE,CULTURE47_NEW_DATABASE,CULTURE47_RETIREMENT_DATABASE,CULTURE47_FRESH_DATABASE,type Culture47Database,type SavedCulture47} from './culture47-storage';
import {ARMY_RETIREMENT_RULE47} from './army-retirement47';
import {CULTURE47_CONTINUATION_SOURCE,CULTURE47_RETIREMENT_SOURCE} from './culture47-session';
import {continuationJournal47,assertContinuationMatch47} from './culture47-continuation';
import {previewFamilySuccession47} from './civilization47-succession';
import {graphFor46} from './war46-geography';
import {CultureMotion47} from './CultureMotion47';
import {culture47PlaybackBudget} from './culture47-pacing';
import type {FoundingForces47} from './civilization47-forces';
import type {NativePolity} from './native-combat/upper-efficiency';
import './culture47.css';
import {CultureDiplomacy47} from './CultureDiplomacy47';
import {CultureNews47} from './CultureNews47';
import {usePresentationClock} from './PresentationClock';
import {Graphics} from 'pixi.js';
import {activeSiegeProvinces47,combatMarkers47,drawCombatMarkers47} from './combat-map47';
import {CultureMilitary47,intentMatchesForce47,type SelectedForce47} from './CultureMilitary47';
import {actualForces47} from './force-runtime47';
import type {MilitaryIntent47} from './culture47-orders';

type Culture47Request=Exclude<WorkerRequest,{type:'load'|'verify'}>|{type:'load';journal:Culture47Journal};
type ReadyCulture47={client:Culture47Client;snapshot:Culture47Snapshot;journal:Culture47Journal};
const polityLabels:Record<NativePolity,string>={Kingdom:'王国',Empire:'帝国',Republic:'共和国',Federation:'联邦',Tribal:'部族',Theocracy:'神权国'};
const failText=(e:unknown)=>e instanceof Error?e.message:String(e);
async function verifyJournal(journal:Culture47Journal,signal?:AbortSignal,progress?:Parameters<Culture47Client['verify']>[1]){const client=new Culture47Client(journal.engine);try{await client.verify(journal,{...progress,signal,longReplay:true});}finally{client.close();}}
const defaultCultures:CultureId47[]=['chinese','japanese','english','arab','roman','german'];
function originalRuler(run:FoundingForces47,id:string){const reign=run.chronicle.leaders[id]?.at(-1);if(!reign||reign.endedDay!==null||Object.hasOwn(run.chronicle.ended,id))return null;const r=run.civilization.rulers[reign.id];return {...reign,name:r.name,title:r.titleAtAccession+'（就任时）'};}
function NationIdentity({run,id,cityId,busy,act,diplomacy,pause,originalEngine=false}:{originalEngine?:boolean;run:FoundingForces47;id:string;cityId:string|null;busy:boolean;act:(a:Culture47Action)=>void;diplomacy:ReactNode;pause:()=>void}){
  const nation=run.world.nations.find(n=>n.id===id)!,identity=run.civilization.nations[id],ruler=originalEngine?originalRuler(run,id):currentRuler47(run.civilization,run.chronicle,id);
  const [name,setName]=useState(identity.name.custom??''),[religion,setReligion]=useState(identity.religionId),[polity,setPolity]=useState(identity.polity),[pending,setPending]=useState(false);
  const head=run.people.nations[id].leaderId,person=head===null?null:run.kin.persons[head],{family,members}=nationFamily47(run,id);
  const cities=run.world.cities.filter(c=>run.world.provinces.find(p=>p.id===c.provinceId)?.controller===id);
  const city=run.world.cities.find(c=>c.id===cityId)??cities.find(c=>c.id===nation.capitalId)??cities[0];
  const reignAge=reignAge47(run,id);
  const [familyOpen,setFamilyOpen]=useState(false);
  const heir=useMemo(()=>{if(!familyOpen||originalEngine)return null;try{return previewFamilySuccession47(run,id);}catch{return null;}},[familyOpen,originalEngine,run,id]);
  const edit=(e:CivilizationEdit47)=>act({kind:'identity',edit:e});
  return <>
    <div className="c47-identity"><i style={{background:nation.color}}/><div><small>{culture47(identity.cultureId).label}文化 · {polityLabels[identity.polity]}</small><h2>{nation.name}</h2><p>{RELIGIONS47[identity.religionId]}</p></div></div>
    {!ruler&&run.kin.lifecycle?.vacancies[id]&&<section className="c47-ruler"><PlayIcon name="crown"/><div><small>领袖暂缺</small><strong>尚无符合当前政体的接任者</strong></div></section>}
    {ruler&&<section className="c47-ruler"><PlayIcon name="crown"/><div><small>{ruler.title} · {run.origins?'本局记载第':'第'} {ruler.order} 任</small><strong>{ruler.name}</strong><span>{['Kingdom','Empire','Tribal'].includes(identity.polity)?`${ruler.regnalName} ${ruler.regnalOrdinal} 世`:''}{person?` · ${person.age} 岁`:''}{reignAge?` · 在位${reignAge.years>0?`${reignAge.years}年`:`${reignAge.days}日`}`:''}</span></div></section>}
    <CultureNationOverview47 run={run} id={id}/>{diplomacy}
    <details><summary>国家制度与名称</summary><form onSubmit={e=>{e.preventDefault();edit({kind:'nation',id,patch:{polity,religionId:religion,customName:name.trim()||null}});}}>
      <label>自定国名<input aria-label="自定国名" value={name} maxLength={100} placeholder={identity.name.value} onChange={e=>setName(e.target.value)}/></label>
      <label>政体<select aria-label="国家政体" value={polity} onChange={e=>setPolity(e.target.value as NativePolity)}>{POLITIES47.map(p=><option value={p} key={p}>{polityLabels[p]}</option>)}</select></label>
      <label>国家宗教<select aria-label="国家宗教" value={religion} onChange={e=>setReligion(e.target.value as ReligionId47)}>{Object.entries(RELIGIONS47).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <button disabled={busy} type="submit">应用国家设置</button><small>国名留空时，国号随政体变化。国家宗教不会自动改变所有居民的信仰。</small>
    </form></details>
    <details open={cityId!==null||undefined}><summary>城市 · {cities.length}</summary>{city&&<CityIdentity key={city.id+'/'+run.civilization.cities[city.id].name.custom} cityId={city.id} run={run} busy={busy} edit={edit}/>}<div className="c47-city-list">{cities.map(c=><span key={c.id}>{c.id===nation.capitalId?'♛ ':''}{c.name}</span>)}</div></details>
    {run.houses&&!originalEngine&&<CultureHouses47 run={run} id={id} busy={busy} act={act} pause={pause}/>}
    <details onToggle={e=>setFamilyOpen(e.currentTarget.open)}><summary>{family?culture47(identity.cultureId).houseLabel+' · '+family.surname:'家族'}</summary>{family&&<><div className="c47-family-summary"><strong>族长 · {run.kin.persons[family.headId]?.identity.name??'暂缺'}</strong><small>{members.filter(p=>p.isAlive).length} 位在世 · {members.length} 位登记成员</small></div><ul className="c47-family">{members.map(p=><li key={p.id}><strong>{p.identity.name}</strong><small>{p.isAlive?(p.id===head?'现任领袖':p.fatherId===head||p.motherId===head?'子女':person?.spouseId===p.id?'配偶':'亲属'):'已故'} · {p.age} 岁 · {RELIGIONS47[p.religionId as ReligionId47]??'无指定宗教'}</small></li>)}</ul></>}{heir&&<><p>继承候选：{heir.name}，{heir.age} 岁</p><button disabled={busy} onClick={()=>setPending(true)}>安排传位</button>{pending&&<div role="group" aria-label="确认传位"><p>由 {heir.name} 接任{heir.title}，成为第 {heir.order} 任。</p><button disabled={busy} onClick={()=>{act({kind:'succession',nationId:id});setPending(false);}}>确认传位</button><button onClick={()=>setPending(false)}>取消</button></div>}</>}</details>
  </>;
}
function CityIdentity({cityId,run,busy,edit}:{cityId:string;run:FoundingForces47;busy:boolean;edit:(e:CivilizationEdit47)=>void}){
  const row=run.civilization.cities[cityId],city=run.world.cities.find(c=>c.id===cityId)!,[value,setValue]=useState(row.name.custom??'');
  return <form onSubmit={e=>{e.preventDefault();edit({kind:'city',id:cityId,customName:value.trim()||null});}}><label>{city.name} · {culture47(row.cultureId).label}文化<input aria-label="自定城市名" value={value} maxLength={100} placeholder={row.name.value} onChange={e=>setValue(e.target.value)}/></label><button disabled={busy}>应用城市名</button></form>;
}
export function CultureWorld47({terrain,onClose,onLegacy}:{terrain:FmsDocument;onClose:()=>void;onLegacy:()=>void}){
  const [snapshot,setSnapshot]=useState<Culture47Snapshot|null>(null),[busy,setBusy]=useState(false),[playing,setPlaying]=useState(false),[notice,setNotice]=useState(''),[saved,setSaved]=useState<SavedCulture47|null>(null),[locked,setLocked]=useState(false),[storageReady,setStorageReady]=useState(false);
  const [count,setCount]=useState(6),[cityCount,setCityCount]=useState(60),[mode,setMode]=useState<NamingMode47>('culture-generated'),[enabled,setEnabled]=useState<CultureId47[]>(defaultCultures),[choices,setChoices]=useState<Record<string,CultureChoice47>>({}),[war,setWar]=useState(false);
  const [leaving,setLeaving]=useState(false),[historyFocus,setHistoryFocus]=useState<number|null>(null),[historyEpoch,setHistoryEpoch]=useState(0);
  const [politicalPreview,setPoliticalPreview]=useState<Culture47Snapshot['politicalPreview']|null>(null);
  const [nationId,setNationId]=useState('n-0'),[cityId,setCityId]=useState<string|null>(null),[panel,setPanel]=useState<'nation'|'history'|'military'|null>(null);
  const [mapMode,setMapMode]=useState<'political'|'terrain'>('political'),[military,setMilitary]=useState(false),[force,setForce]=useState<SelectedForce47|null>(null),[targetMode,setTargetMode]=useState<'march'|'retreat'|null>(null),[speed,setSpeed]=useState(1);
  const [militaryPreview,setMilitaryPreview]=useState<Culture47Snapshot['militaryPreview']|null>(null),queued=useRef<({kind:'command';command:Culture47Request}|{kind:'save';exit:boolean}|{kind:'close'})|null>(null);
  const [advancing,setAdvancing]=useState(false),[storageReading,setStorageReading]=useState(true),[storageAttempt,setStorageAttempt]=useState(0);
  const [actualRate,setActualRate]=useState<number|null>(null),rateSample=useRef<{at:number;tick:number}|null>(null);
  const instantDisplay=useRef(false);
  useEffect(()=>{rateSample.current=null;setActualRate(null);},[playing,speed]);
  const storageAbort=useRef<AbortController|null>(null),operation=useRef<AbortController|null>(null);
  const [recovering,setRecovering]=useState(false),resumeAfterRecovery=useRef(false);
  const [renderFault,setRenderFault]=useState(''),[rendererEpoch,setRendererEpoch]=useState(0);
  const displayReady=useRef(false);
  const lastView=useRef<{id:string;camera:ReturnType<typeof fitCamera>;viewport:{width:number;height:number}}|null>(null),isPlaying=useRef(playing);isPlaying.current=playing;
  const previewEpoch=useRef({military:0,political:0}),requestEpoch=useRef(new WeakMap<Culture47Request,number>());
  const client=useRef<Culture47Client|null>(null),current=useRef(snapshot),inflight=useRef(false),revision=useRef<number|null>(null),lifetime=useRef<AbortController|null>(null),host=useRef<HTMLDivElement>(null);
  const readyWorld=useRef<ReadyCulture47|null>(null);
  const storageDatabase=useRef<Culture47Database>(CULTURE47_LONGPLAY_DATABASE);
  const [storageChoice,setStorageChoice]=useState<'auto'|Culture47Database>('auto');
  const mapControl=useRef<{zoom:(n:number)=>void;fit:()=>void}|null>(null),selected=useRef({nationId,cityId,force,targetMode,military,mapMode,militaryPreview}),paint=useRef<()=>void>(()=>{}),lastSaved=useRef(-1);
  current.current=snapshot;selected.current={nationId,cityId,force,targetMode,military,mapMode,militaryPreview};
  useEffect(()=>{const controller=new AbortController(),reading=new AbortController();lifetime.current=controller;storageAbort.current=reading;client.current=new Culture47Client();setStorageReading(true);setStorageReady(false);setLocked(false);
    const candidate:{value:ReadyCulture47|null}={value:null};
    const discard=()=>{candidate.value?.client.close();candidate.value=null;};
    const progress=(p:import('./culture47-session').Culture47Progress)=>{if(!controller.signal.aborted&&!reading.signal.aborted)replayProgress(p);};
    const verify=async(j:Culture47Journal)=>{
      reading.signal.throwIfAborted();
      const held=candidate.value;
      if(held){
        // This session has executed the entire current slot. Its existing
        // verifier proves exact prefixes, or replays other histories without
        // replacing that state. Frozen engines still validate by original rules.
        if(held.client.engine===j.engine)await held.client.verify(j,{signal:reading.signal,progress,longReplay:true});
        else await verifyJournal(j,reading.signal,{progress});
        return;
      }
      const restored=new Culture47Client(j.engine);
      try{
        const loaded=await restored.send({type:'load',journal:j},{signal:reading.signal,progress,longReplay:true});
        reading.signal.throwIfAborted();
        if(!sameCulture47Value(loaded.journal,j))throw new Culture47Unavailable('恢复结果与存档不一致，原档保留。');
        candidate.value={client:restored,snapshot:loaded,journal:structuredClone(j)};
      }catch(error){restored.close();throw error;}
    };
    const readWorld=async()=>{const databases:Culture47Database[]=storageChoice==='auto'?[CULTURE47_RETIREMENT_DATABASE,CULTURE47_FRESH_DATABASE,CULTURE47_LONGPLAY_DATABASE,CULTURE47_NEW_DATABASE,CULTURE47_DATABASE]:[storageChoice];for(const db of databases){reading.signal.throwIfAborted();storageDatabase.current=db;const found=await loadCulture47(indexedDB,verify,reading.signal,db);if(found)return found;}return null;};
    void readWorld().then(s=>{
      if(controller.signal.aborted||reading.signal.aborted){discard();return;}
      const held=candidate.value;
      if(s){
        if(!held||held.client.isClosed||!sameCulture47Value(held.journal,s.journal))throw new Culture47Unavailable('已恢复世界与选中存档不一致，请重新读取。');
        client.current?.close();client.current=held.client;readyWorld.current=held;candidate.value=null;
      }else discard();
      setSaved(s);revision.current=s?.revision??null;setStorageReady(true);setNotice('');
    }).catch(e=>{discard();if(!controller.signal.aborted){setLocked(true);setNotice(reading.signal.aborted?'已取消恢复，原存档保持。可重新读取。':failText(e));setStorageReady(true);}}).finally(()=>{if(!controller.signal.aborted)setStorageReading(false);});
    return()=>{controller.abort();reading.abort();discard();operation.current?.abort();readyWorld.current?.client.close();readyWorld.current=null;client.current?.close();client.current=null;};
  },[storageAttempt,storageChoice]);
  function replayProgress(p:import('./culture47-session').Culture47Progress){if(!lifetime.current?.signal.aborted)setNotice(p.stage==='opening'?'正在恢复创建时的地图…':`正在恢复历史 ${p.completed} / ${p.total} · 第 ${Math.floor(p.ticks/120)} 日`);}
  function drain(){const pending=queued.current;queued.current=null;if(!pending)return;if(pending.kind==='command')void send(pending.command);else if(pending.kind==='save')void save(pending.exit);else requestClose();}
  async function send(command:Culture47Request,background=false){
    const isAdvance=command.type==='advance-batch'||command.type==='action'&&command.action.kind==='advance';
    if(isAdvance&&!displayReady.current){setPlaying(false);return;}
    const previewKind=command.type==='military-preview'?'military':command.type==='political-preview'?'political':null;
    if(previewKind&&!requestEpoch.current.has(command))requestEpoch.current.set(command,++previewEpoch.current[previewKind]);
    if(!client.current||storageReading)return;if(inflight.current){if(!background&&!queued.current){queued.current={kind:'command',command};setBusy(true);}return;}inflight.current=true;if(!background)setBusy(true);if(isAdvance)setAdvancing(true);
    if(command.type==='create'||command.type==='load'){const engine=command.type==='load'?command.journal.engine:__CULTURE47_ENGINE__;if(client.current.isClosed||client.current.engine!==engine){client.current.close();client.current=new Culture47Client(engine);}}
    const ready=readyWorld.current;readyWorld.current=null;
    const reuse=command.type==='load'&&ready&&ready.client===client.current&&!ready.client.isClosed&&sameCulture47Value(ready.journal,command.journal)?ready.snapshot:null;
    const op=new AbortController();operation.current=op;
    if(command.type==='load'&&command.journal.engine!==__CULTURE47_ENGINE__)setNotice('正在按原规则恢复旧世界，耗时取决于历史长度；可以取消。');
    // Ordinary edits carry intent. Only previewed decisions retain their exact
    // stamp; never refresh their sequence behind the player's confirmation.
    const dispatched=command.type==='action'&&(command.action.kind==='advance'||command.action.kind==='identity'||command.action.kind==='succession')&&current.current?{...command,sequence:current.current.journal.actions.length}:command;
    const motionTicks=background?(dispatched.type==='advance-batch'?dispatched.ticks:dispatched.type==='action'&&dispatched.action.kind==='advance'?dispatched.action.ticks:0):0,started=performance.now();
    if(motionTicks)motion.current.beginAdvance(motionTicks,started);
    const inspectNewSlot=command.type==='create'&&(storageDatabase.current!==CULTURE47_FRESH_DATABASE||locked);
    try{const newSlot=inspectNewSlot?await loadCulture47(indexedDB,j=>verifyJournal(j,op.signal,{progress:replayProgress}),op.signal,CULTURE47_FRESH_DATABASE):undefined;
      let s=reuse??await client.current.send(dispatched,{signal:op.signal,progress:replayProgress,longReplay:true});if(lifetime.current?.signal.aborted)return;
      if(command.type==='create')s=await client.current.send({type:'action',action:{kind:'enable-retirement',rule:ARMY_RETIREMENT_RULE47,expected:populationStamp47(s.run)},sequence:s.journal.actions.length},{signal:op.signal});
      if(motionTicks)motion.current.recordAdvance(motionTicks,performance.now()-started);
      if(isAdvance&&background){const at=performance.now(),old=rateSample.current;if(old&&at>old.at&&s.run.clock.tick>old.tick){const rate=(s.run.clock.tick-old.tick)/120/((at-old.at)/1000);setActualRate(previous=>previous===null?rate:previous*.65+rate*.35);}rateSample.current={at,tick:s.run.clock.tick};}else rateSample.current=null;
      if(command.type==='create'){if(inspectNewSlot)revision.current=newSlot?.revision??null;storageDatabase.current=CULTURE47_FRESH_DATABASE;setLocked(false);}
      instantDisplay.current=isAdvance&&!background||command.type==='create'||command.type==='load';
      current.current=s;setSnapshot(s);if(command.type==='political-preview'&&requestEpoch.current.get(command)===previewEpoch.current.political)setPoliticalPreview(s.politicalPreview);if(command.type==='military-preview'&&requestEpoch.current.get(command)===previewEpoch.current.military&&s.militaryPreview&&intentMatchesForce47(s.militaryPreview.intent,selected.current.force))setMilitaryPreview(s.militaryPreview);if(command.type==='action'&&command.action.kind==='military')setMilitaryPreview(null);if(command.type==='action'&&command.action.kind==='politics')setPoliticalPreview(null);if(command.type==='create'||command.type==='load'){setForce(null);setTargetMode(null);setMilitaryPreview(null);setPoliticalPreview(null);setNationId(s.run.world.nations[0].id);setCityId(null);setPanel(null);lastSaved.current=command.type==='load'?s.journal.actions.length:-1;}setNotice('');}
    catch(e){if(!lifetime.current?.signal.aborted){setPlaying(false);setNotice(failText(e)+(client.current?.isClosed?(current.current?' 点击继续可恢复最后确认的进度。':' 可以重新点击创建或继续世界；原档保留。'):''));}}
    finally{operation.current=null;inflight.current=false;if(!lifetime.current?.signal.aborted){setBusy(false);setAdvancing(false);drain();}}
  }
  const act=(action:Culture47Action)=>{const s=current.current;if(s)void send({type:'action',action,sequence:s.journal.actions.length});};
  async function continueLongPlay(){
    const source=current.current,original=client.current;
    if(!source||!original||inflight.current||busy||locked||storageReading||![CULTURE47_CONTINUATION_SOURCE,CULTURE47_RETIREMENT_SOURCE].includes(source.journal.engine))return;
    setPlaying(false);inflight.current=true;setBusy(true);setNotice('正在对照原版历史，完成后保存独立续玩副本…');
    const op=new AbortController(),candidateClient=new Culture47Client();operation.current=op;
    let installed=false;
    try{
      await original.verify(source.journal,{signal:op.signal,progress:replayProgress,longReplay:true});
      const copied=continuationJournal47(source.journal);let candidate=await candidateClient.send({type:'load',journal:copied},{signal:op.signal,progress:replayProgress,longReplay:true});
      op.signal.throwIfAborted();assertContinuationMatch47(source,candidate,copied);
      candidate=await candidateClient.send({type:'action',action:{kind:'enable-retirement',rule:ARMY_RETIREMENT_RULE47,expected:populationStamp47(candidate.run)},sequence:copied.actions.length},{signal:op.signal});
      const journal=candidate.journal,target=source.journal.engine===CULTURE47_RETIREMENT_SOURCE?CULTURE47_RETIREMENT_DATABASE:CULTURE47_LONGPLAY_DATABASE;
      const next=await saveCulture47(journal,null,indexedDB,op.signal,async j=>{const c=j.engine===candidateClient.engine?candidateClient:original;await c.verify(j,{signal:op.signal,longReplay:true,progress:replayProgress});},target,source.journal);
      // A successful transaction is already durable. Never write after abort;
      // if the view disappeared, the new slot will be found on the next read.
      if(lifetime.current?.signal.aborted)return;
      client.current=candidateClient;installed=true;original.close();readyWorld.current=null;
      storageDatabase.current=target;revision.current=next;lastSaved.current=journal.actions.length;
      previewEpoch.current={military:previewEpoch.current.military+1,political:previewEpoch.current.political+1};queued.current=null;setMilitaryPreview(null);setPoliticalPreview(null);setForce(null);setTargetMode(null);setPanel(null);
      instantDisplay.current=true;current.current=candidate;setSnapshot(candidate);setSaved({journal,revision:next,recovered:false});setNotice('续玩副本已保存。原局和开局以来的历史均保留；已启用退役归档和持续补军，没有固定结束日期。');
    }catch(e){if(!lifetime.current?.signal.aborted)setNotice('续玩副本未建立，原世界保持。'+failText(e));}
    finally{if(!installed)candidateClient.close();operation.current=null;inflight.current=false;if(!lifetime.current?.signal.aborted){setBusy(false);drain();}}
  }
  async function resume(){
    if(!displayReady.current){resumeAfterRecovery.current=false;setPlaying(false);setNotice('地图尚未就绪，当前世界保留。请先恢复地图显示。');return;}
    if(recovering){resumeAfterRecovery.current=false;setPlaying(false);setNotice('正在恢复进度，完成后保持暂停。');return;}
    if(!client.current?.isClosed){setPlaying(p=>!p);return;}
    if(inflight.current||busy||!current.current)return;
    const op=new AbortController();operation.current=op;
    const acknowledged=current.current,replacement=new Culture47Client(acknowledged.journal.engine);client.current=replacement;inflight.current=true;resumeAfterRecovery.current=true;setRecovering(true);setBusy(true);setNotice('正在恢复最后确认的进度…');
    try{const restored=await replacement.send({type:'load',journal:acknowledged.journal},{signal:op.signal,progress:replayProgress,longReplay:true});if(lifetime.current?.signal.aborted)return;current.current=restored;setSnapshot(restored);setNotice('推演已恢复。');setPlaying(resumeAfterRecovery.current&&displayReady.current&&!document.hidden);}
    catch(e){replacement.close();if(!lifetime.current?.signal.aborted){setPlaying(false);setNotice('恢复未完成，当前进度仍保留。'+failText(e));}}
    finally{operation.current=null;inflight.current=false;resumeAfterRecovery.current=false;if(!lifetime.current?.signal.aborted){setRecovering(false);setBusy(false);}}
  }
  useEffect(()=>{const pauseHidden=()=>{if(document.hidden){resumeAfterRecovery.current=false;setPlaying(false);}};document.addEventListener('visibilitychange',pauseHidden);return()=>document.removeEventListener('visibilitychange',pauseHidden);},[]);
  usePresentationClock({enabled:playing,policyKey:busy,...culture47PlaybackBudget(snapshot?.run.life.secondsPerDay??.1,speed,snapshot?.journal.engine===__CULTURE47_ENGINE__||frozenCulture47(snapshot?.journal.engine??'')?.protocol===2),playing:()=>playing,
    batchBoundary:()=>120-(current.current?.run.clock.tick??0)%120,
    blocked:()=>document.hidden||inflight.current||busy||!current.current||!displayReady.current,
    step:async ticks=>{const s=current.current;if(s)await send((s.journal.engine===__CULTURE47_ENGINE__||frozenCulture47(s.journal.engine)?.protocol===2)?{type:'advance-batch',ticks,sequence:s.journal.actions.length}:{type:'action',action:{kind:'advance',ticks},sequence:s.journal.actions.length},true);}});
  const requestMilitary=(intent:MilitaryIntent47)=>{setPlaying(false);setTargetMode(null);setPanel('military');void send({type:'military-preview',intent});};
  const chooseForce=(value:SelectedForce47)=>{previewEpoch.current.military++;selected.current.force=value;setForce(value);setMilitaryPreview(null);setTargetMode(null);setPanel('military');};
  const interaction=useRef({requestMilitary,chooseForce});interaction.current={requestMilitary,chooseForce};
  async function save(exit=false){
    if(!current.current||locked||!storageReady)return;if(inflight.current){if(!queued.current){queued.current={kind:'save',exit};setBusy(true);setNotice('正在等待本次推演结束，然后保存…');}return;}inflight.current=true;setBusy(true);setNotice('正在保存当前世界…');
    const op=new AbortController();operation.current=op;
    try{const s=current.current,n=await saveCulture47(s.journal,revision.current,indexedDB,op.signal,async j=>{const c=client.current;if(c&&!c.isClosed&&c.engine===j.engine)await c.verify(j,{signal:op.signal,progress:replayProgress,longReplay:true});else await verifyJournal(j,op.signal,{progress:replayProgress});},storageDatabase.current);revision.current=n;lastSaved.current=s.journal.actions.length;setSaved({journal:s.journal,revision:n,recovered:false});setNotice('文化世界已保存，刷新后可继续。');if(exit)onClose();}
    catch(e){setPlaying(false);setNotice(failText(e));}finally{operation.current=null;inflight.current=false;if(!lifetime.current?.signal.aborted){setBusy(false);drain();}}
  }
  function requestClose(){setPlaying(false);if(inflight.current){if(!queued.current){queued.current={kind:'close'};setBusy(true);}return;}if(current.current&&lastSaved.current!==current.current.journal.actions.length)setLeaving(true);else onClose();}
  useEffect(()=>{const protect=(e:BeforeUnloadEvent)=>{if(current.current&&lastSaved.current!==current.current.journal.actions.length){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[]);
  const runId=snapshot?.run.id;
  const motion=useRef(new CultureMotion47());
  function displayFrame(){return motion.current.frame(performance.now());}
  useEffect(()=>{if(snapshot)motion.current.install(snapshot,performance.now(),()=>actualForces47(snapshot.run).spatial.graph,instantDisplay.current);},[snapshot]);
  useEffect(()=>{motion.current.setRunning(playing&&!renderFault,performance.now());},[playing,renderFault]);
  useEffect(()=>{
    if(!runId||!host.current||!current.current)return;
    displayReady.current=false;
    let disposed=false,failed=false,cleanup=()=>{};
    const displayFailed=(e:unknown)=>{if(disposed||failed)return;failed=true;displayReady.current=false;resumeAfterRecovery.current=false;setPlaying(false);cleanup();setRenderFault(failText(e));};
    const element=host.current,source=current.current.run.terrain,renderer=new FmsRenderer(()=>{},displayFailed),map=new PlayMap(()=>paint.current()),orderLine=new Graphics(),combatLayer=new Graphics();
    // Pulsing contact geometry must not invalidate the terrain/label render group.
    combatLayer.enableRenderGroup();
    const viewport={width:Math.max(1,element.clientWidth),height:Math.max(1,element.clientHeight)};
    const savedView=lastView.current,view={viewport,camera:savedView?.id===runId?resizeCamera(savedView.camera,savedView.viewport,viewport,source):fitCamera(source,viewport)};
    let combat:ReturnType<typeof combatMarkers47>=[],combatRun:FoundingForces47|null=null;
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const sea=graphFor46(current.current.run);
    void renderer.init(element).then(()=>{
      if(disposed)return;renderer.setDocument(source);renderer.setTerrainDisplay('biome');renderer.attachGameplayLayer(map.layer);renderer.attachGameplayLayer(combatLayer);renderer.attachGameplayLayer(orderLine);renderer.setCamera(view.camera);
      const canvas=renderer.canvas;canvas.setAttribute('aria-label','真实文化世界地图');canvas.dataset.testid='culture47-map';
      paint.current=()=>{const s=current.current;if(disposed||failed||!s)return;try{const r=s.run;
        const selectedCity=r.world.cities.find(c=>c.id===selected.current.cityId);
        const selection=selected.current;
        map.draw(r.world,r.scale,view.camera.scale,selectedCity?.provinceId??null,selection.force?.kind==='army'?selection.force.id:null,selection.mapMode,r.units,view,{navy:r.navy,graph:sea,selected:selection.force?.kind==='fleet'?selection.force.id:null,nationId:selection.nationId,preview:[],maritime:r.maritime,portControl:r.portControl.ports},displayFrame(),undefined,[],r.id,source);
        if(combatRun!==r){combat=combatMarkers47(r,s.frame.activeSieges!==undefined?new Set(s.frame.activeSieges):activeSiegeProvinces47(r));combatRun=r;canvas.dataset.combat=JSON.stringify(combat);}
        drawCombatMarkers47(combatLayer,combat,r.scale,view.camera.scale);
        orderLine.clear();const points=selection.militaryPreview?.preview.points??[];
        if(points.length){orderLine.moveTo(points[0].x/r.scale,points[0].y/r.scale);for(const p of points.slice(1))orderLine.lineTo(p.x/r.scale,p.y/r.scale);orderLine.stroke({color:0xffedb4,width:3/view.camera.scale,alpha:.95});const end=points.at(-1)!;orderLine.circle(end.x/r.scale,end.y/r.scale,7/view.camera.scale).stroke({color:0xffffff,width:2/view.camera.scale});}
        canvas.dataset.day=String(r.world.day);canvas.dataset.forcePositions=JSON.stringify({armies:[...current.current!.frame.armies],fleets:[...current.current!.frame.fleets]});canvas.dataset.countries=JSON.stringify(r.world.nations.map(n=>({id:n.id,name:n.name})));canvas.dataset.cities=JSON.stringify(map.cityPositions().map(c=>({...c,nationId:r.world.provinces.find(p=>p.id===c.provinceId)?.controller})));canvas.dataset.units=JSON.stringify(map.unitPositions().map(u=>({...u,nationId:(u.kind==='army'?r.world.armies:r.navy.fleets).find(a=>a.id===u.id)?.nationId})));renderer.refresh();displayReady.current=true;}catch(e){displayFailed(e);}
      };
      const setCamera=(c:typeof view.camera)=>{view.camera=c;renderer.setCamera(c);paint.current();};
      mapControl.current={zoom:n=>setCamera(zoomCameraAt(view.camera,n,{x:view.viewport.width/2,y:view.viewport.height/2},source,view.viewport)),fit:()=>setCamera(fitCamera(source,view.viewport))};
      const gestures=new FmsGestures({camera:()=>view.camera,setCamera,world:()=>source,viewport:()=>view.viewport,begin:()=>{},move:()=>{},commit:()=>{},cancel:()=>{}}),ids=new Set<number>();
      let tap:{id:number;x:number;y:number}|null=null;
      const point=(e:PointerEvent|WheelEvent)=>{const b=canvas.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};};
      const down=(e:PointerEvent)=>{if(e.button!==0)return;const p=point(e);ids.add(e.pointerId);tap=ids.size===1?{id:e.pointerId,...p}:null;canvas.setPointerCapture(e.pointerId);gestures.down(e.pointerId,p,false);};
      const move=(e:PointerEvent)=>{const p=point(e);if(tap&&Math.hypot(p.x-tap.x,p.y-tap.y)>5)tap=null;gestures.move(e.pointerId,p);};
      const up=(e:PointerEvent)=>{const p=point(e),t=tap;gestures.up(e.pointerId,p);ids.delete(e.pointerId);tap=null;if(t?.id!==e.pointerId||ids.size||!current.current)return;const r=current.current.run,w=screenToWorld(view.camera,p),at={x:w.x*r.scale,y:w.y*r.scale},id=provinceAt(r.world,at),province=r.world.provinces.find(p=>p.id===id),s=selected.current;
        if(s.targetMode&&s.force){
          if(current.current.journal.engine!==__CULTURE47_ENGINE__){if(s.force.kind==='army'&&province){interaction.current.requestMilitary({force:'army',command:{type:'army-move',armyId:s.force.id,kind:s.targetMode,target:{kind:'province',id:province.id}}});}else{setNotice('旧版本继续保留原规则；此兼容入口暂只支持陆军地区目标，原试玩入口仍保留。');}return;}
          const g=actualForces47(r).spatial.graph,cells=[...g.cells.values()].filter(c=>s.force!.kind==='army'||c.surface==='sea'),cell=cells.sort((a,b)=>Math.hypot(a.center.x-at.x,a.center.y-at.y)-Math.hypot(b.center.x-at.x,b.center.y-at.y))[0];if(!cell)return;
          if(s.force.kind==='army')interaction.current.requestMilitary({force:'army',command:{type:'army-move',armyId:s.force.id,kind:s.targetMode,target:province?{kind:'province',id:province.id}:{kind:'cell',id:cell.id}}});
          else {const port=sea.ports.filter(v=>v.provinceId===province?.id).sort((a,b)=>Math.hypot(sea.nodes.get(a.node)!.center.x-at.x,sea.nodes.get(a.node)!.center.y-at.y)-Math.hypot(sea.nodes.get(b.node)!.center.x-at.x,sea.nodes.get(b.node)!.center.y-at.y))[0];if(province&&!port){setNotice('请选择海面或沿岸港口。');return;}interaction.current.requestMilitary({force:'fleet',command:{type:'fleet-sail',fleetId:s.force.id,target:port?{kind:'port',id:port.id}:{kind:'cell',id:cell.id}}});}return;
        }
        if(s.military){const hit=map.pickUnits(p)[0];if(hit){interaction.current.chooseForce({kind:hit.kind as SelectedForce47['kind'],id:hit.id});return;}}
        if(province){setNationId(province.controller);setCityId(r.world.cities.find(c=>c.provinceId===id)?.id??null);setPanel('nation');}};
      const cancel=()=>{tap=null;ids.clear();gestures.interrupt();},wheel=(e:WheelEvent)=>{e.preventDefault();gestures.wheel(point(e),e.deltaY);};
      const contextLost=(e:Event)=>{e.preventDefault();if(!disposed)displayFailed(new Error('地图渲染中断，推演已暂停。当前世界仍保留，可以重新显示地图。'));};
      canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);canvas.addEventListener('wheel',wheel,{passive:false});
      const observer=new ResizeObserver(()=>{if(disposed||failed)return;try{const next={width:element.clientWidth,height:element.clientHeight};if(next.width<=0||next.height<=0)return;view.camera=resizeCamera(view.camera,view.viewport,next,source);view.viewport=next;renderer.resize(next.width,next.height);renderer.setCamera(view.camera);paint.current();}catch(e){displayFailed(e);}});
      let raf=0,settled=-1,lastDiagnostic=0;
      const animate=()=>{if(disposed||failed)return;try{
        const now=performance.now(),alpha=motion.current.alpha(now),animateCombat=isPlaying.current&&!reducedMotion.matches&&combat.some(m=>m.kind==='contact');
        if(isPlaying.current&&alpha<1||settled!==motion.current.revision||animateCombat){
          const frame=motion.current.frame(now);map.updateUnits(frame);
          if(animateCombat)drawCombatMarkers47(combatLayer,combat,current.current!.run.scale,view.camera.scale,.5+.5*Math.sin(now/240));
          // Evidence sampling is independent of the display refresh rate.
          if(now-lastDiagnostic>=100||alpha===1&&settled!==motion.current.revision||!isPlaying.current){
            canvas.dataset.displayTick=String(motion.current.tick(now));canvas.dataset.displayPositions=JSON.stringify({armies:[...frame.armies],fleets:[...frame.fleets]});canvas.dataset.displayUnits=JSON.stringify(map.unitPositions());lastDiagnostic=now;
          }
          renderer.refresh();settled=alpha===1||!isPlaying.current?motion.current.revision:-1;
        }
        raf=requestAnimationFrame(animate);
      }catch(e){displayFailed(e);}};
      cleanup=()=>{cancelAnimationFrame(raf);observer.disconnect();canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',cancel);canvas.removeEventListener('wheel',wheel);};
      observer.observe(element);paint.current();if(!failed){setRenderFault('');raf=requestAnimationFrame(animate);}
    }).catch(e=>{if(!disposed)displayFailed(e);});
    return()=>{lastView.current={id:runId,camera:view.camera,viewport:view.viewport};disposed=true;displayReady.current=false;cleanup();paint.current=()=>{};mapControl.current=null;renderer.destroy();map.dispose();};
  },[runId,rendererEpoch]);
  useEffect(()=>{paint.current();},[snapshot,nationId,cityId,panel,force,mapMode,militaryPreview]);
  const choice=(i:number):CultureChoice47=>{const c=culture47(enabled[i%enabled.length]??'chinese');return choices['n-'+i]&&enabled.includes(choices['n-'+i].cultureId)?choices['n-'+i]:{cultureId:c.id,religionId:c.suggestedReligion,polity:c.suggestedPolity};};
  const setChoice=(i:number,patch:Partial<CultureChoice47>)=>setChoices(old=>({...old,['n-'+i]:{...choice(i),...patch}}));
  const r=snapshot?.run;
  return <main className="c47-app" data-testid="culture47-app" data-day={r?.world.day} data-tick={r?.clock.tick} data-advancing={advancing}>
    <div className="c47-map" ref={host}/>
    {renderFault&&<div className="c47-render-recovery" role="alert"><span>{renderFault}</span><button onClick={()=>{setRenderFault('');setRendererEpoch(n=>n+1);}}>重新显示地图</button></div>}
    <header className="c47-bar"><button aria-label="返回绘图" disabled={busy} onClick={requestClose}><PlayIcon name="back"/></button><div><strong>列国纪</strong><small>{r?'真实文化世界':'创建文明'}</small></div>{r&&<><CultureCalendar47 worldId={r.id} startDate={r.life.startDate} tick={()=>motion.current.tick(performance.now())}/><button aria-label="切换地形地图" title="政区 / 地形" aria-pressed={mapMode==='terrain'} onClick={()=>setMapMode(m=>m==='terrain'?'political':'terrain')}><PlayIcon name="layers"/></button><button aria-label="军事模式" title="军队与舰队" aria-pressed={military} onClick={()=>{setMilitary(v=>!v);setTargetMode(null);setPanel(military?null:'military');}}><PlayIcon name="locate"/></button><button aria-label="保存文化世界" disabled={busy||locked} onClick={()=>void save()}><PlayIcon name="save"/>{lastSaved.current!==snapshot.journal.actions.length&&<i className="c47-unsaved"/>}</button></>}</header>
    {leaving&&<div className="c47-exit" role="dialog" aria-modal="true" aria-label="保存后离开"><h2>保留这个世界？</h2><p>尚有未保存的时间或编辑。</p><button disabled={busy||locked} onClick={()=>void save(true)}>保存并返回</button><button disabled={busy} onClick={onClose}>放弃未保存进度</button><button disabled={busy} onClick={()=>setLeaving(false)}>继续查看</button></div>}
    {notice&&<div className="c47-notice" role="status">{notice}</div>}{(storageReading||busy)&&<button className="c47-cancel-replay" onClick={()=>{queued.current=null;resumeAfterRecovery.current=false;setPlaying(false);if(storageReading)storageAbort.current?.abort();else operation.current?.abort();}}>取消处理</button>}
    {!r&&<section className="c47-setup"><span className="c47-kicker">文化 · 信仰 · 国家</span><h1>让文明从你的地图诞生</h1><p>为国家选择真实文化，独立设定信仰与政体。名字从同一种文化里生长。</p>
      <div className="c47-segment" role="group" aria-label="国号与城市命名模式">{([['culture-generated','文化生成'],['historical-names','历史名称']] as const).map(([v,label])=><button key={v} aria-pressed={mode===v} onClick={()=>{setMode(v);}}>{label}</button>)}</div><small>{mode==='historical-names'?'使用中文历史国号和真实地名；名称用完可同名，480 座城市均可创建。':'使用中文译写的文化名称；每种文化可生成至少 512 个不同城名。'} 人物均按文化生成，不拼接历史人物家谱。</small>
      <div className="c47-counts"><label>国家<select aria-label="国家数量" value={count} onChange={e=>setCount(Number(e.target.value))}>{[2,3,4,6,8,12,16,24].map(n=><option key={n}>{n}</option>)}</select></label><label>城市<select aria-label="城市数量" value={cityCount} onChange={e=>setCityCount(Number(e.target.value))}>{[24,60,120,240,480].map(n=><option key={n}>{n}</option>)}</select></label></div>
      <fieldset><legend>启用文化</legend><div className="c47-cultures">{CULTURE_IDS47.map(id=><label key={id} className={enabled.includes(id)?'is-selected':''}><input type="checkbox" aria-label={`文化：${CULTURES47[id].label}`} checked={enabled.includes(id)} onChange={e=>setEnabled(old=>e.target.checked?[...old,id]:old.filter(c=>c!==id))}/>{CULTURES47[id].label}</label>)}</div></fieldset>
      <details className="c47-nation-setup"><summary>逐国配置文化、宗教与政体</summary>{Array.from({length:count},(_,i)=>{const c=choice(i);return <div className="c47-choice" key={i}><strong>国家 {i+1}</strong><select aria-label={`国家${i+1}文化`} value={c.cultureId} onChange={e=>{const n=culture47(e.target.value);setChoice(i,{cultureId:n.id,religionId:n.suggestedReligion,polity:n.suggestedPolity});}}>{enabled.map(id=><option value={id} key={id}>{CULTURES47[id].label}</option>)}</select><select aria-label={`国家${i+1}宗教`} value={c.religionId} onChange={e=>setChoice(i,{religionId:e.target.value as ReligionId47})}>{Object.entries(RELIGIONS47).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select><select aria-label={`国家${i+1}政体`} value={c.polity} onChange={e=>setChoice(i,{polity:e.target.value as NativePolity})}>{POLITIES47.map(p=><option key={p} value={p}>{polityLabels[p]}</option>)}</select></div>;})}</details>
      <label className="c47-war"><input type="checkbox" checked={war} onChange={e=>setWar(e.target.checked)}/>战乱开局</label>
      <button className="c47-primary" disabled={busy||storageReading||!enabled.length} onClick={()=>void send({type:'create',opening:{terrain,count,cityCount,relations:war?'war':'peace',setup:{mode,enabled,nations:Object.fromEntries(Array.from({length:count},(_,i)=>['n-'+i,choice(i)]))}}})}>{busy?'正在建立文明…':'从当前地图创建文化世界'}</button>
      {locked&&!storageReading&&<button onClick={()=>setStorageAttempt(n=>n+1)}>重新读取存档</button>}
      {saved&&<button disabled={busy} onClick={()=>void send({type:'load',journal:saved.journal})}>{busy?'正在恢复文化世界…':'继续文化世界'}{saved.recovered?'（已找到有效备份）':''}</button>}
      <details><summary>选择存档位置</summary><div className="c47-segment">{([[CULTURE47_RETIREMENT_DATABASE,'补军续玩副本'],[CULTURE47_FRESH_DATABASE,'新版世界'],[CULTURE47_LONGPLAY_DATABASE,'旧续玩副本'],[CULTURE47_NEW_DATABASE,'上版世界'],[CULTURE47_DATABASE,'原版世界']] as const).map(([db,label])=><button key={db} disabled={busy||storageReading} onClick={()=>{setSaved(null);setStorageChoice(db);setStorageAttempt(n=>n+1);}}>{label}</button>)}</div><small>这些位置互相独立。创建新世界不会覆盖原版世界或续玩副本。</small></details>
      <button onClick={onLegacy} disabled={busy}>继续旧世界 / 原版本功能</button>
      <details className="c47-scope"><summary>本次可试玩的范围</summary><p>真实文化、独立信仰与政体、两种命名、家族传位、财政动员和实际位置行军已接入。可预览宣战及停战；自主外交和有完整宣战史的外战结算已接续。分裂、宗教传播、宗属与内战仍待完善，海陆速度比例尚待校准。</p><p>新世界独立保存；旧世界使用原版本。新版没有固定日数或指令总量的结束门槛，保留完整历史；长历史冷恢复仍需要时间，存储容量取决于设备。旧版保持原 1000 日预算，已验证的版本可明确建立独立续玩副本。已登记版本由原引擎继续，未知版本保留并锁定。旧版兼容入口暂不提供传位预览及任意海面军令。原试玩入口仍保留。</p></details>
    </section>}
    {r&&<>
      {[CULTURE47_CONTINUATION_SOURCE,CULTURE47_RETIREMENT_SOURCE].includes(snapshot.journal.engine)&&<section className="c47-continuation" aria-label="安全续玩"><span>升级补军规则 · 副本保留全部前史，独立保存</span><button disabled={busy||advancing||locked||storageReading} onClick={()=>void continueLongPlay()}>建立续玩副本</button></section>}
      <CultureNews47 displayTick={()=>motion.current.tick(performance.now())} key={r.id} run={r} open={id=>{setHistoryEpoch(n=>n+1);setHistoryFocus(id);setPanel('history');}}/>
      <div className="c47-nations" aria-label="国家列表">{r.world.nations.map(n=><button key={n.id} aria-pressed={nationId===n.id&&panel==='nation'} onClick={()=>{setNationId(n.id);setCityId(null);setPanel('nation');}}><i style={{background:n.color}}/>{n.name}</button>)}</div>
      <div className="c47-zoom"><button aria-label="放大地图" onClick={()=>mapControl.current?.zoom(1.6)}><PlayIcon name="plus"/></button><button aria-label="缩小地图" onClick={()=>mapControl.current?.zoom(1/1.6)}><PlayIcon name="minus"/></button><button aria-label="显示全图" onClick={()=>mapControl.current?.fit()}><PlayIcon name="fit"/></button></div>
      {panel&&<aside className="c47-panel" aria-label={panel==='nation'?'文化与国家详情':panel==='military'?'军队与舰队':'大事记'}><button className="c47-dismiss" aria-label="收起详情" onClick={()=>setPanel(null)}>×</button>{panel==='nation'?<><NationIdentity key={r.id+'/'+nationId} run={r} id={nationId} cityId={cityId} busy={busy||advancing} originalEngine={snapshot.journal.engine!==__CULTURE47_ENGINE__} act={act} pause={()=>setPlaying(false)} diplomacy={<CultureDiplomacy47 key={r.id+'/'+nationId+'/diplomacy'} run={r} id={nationId} busy={busy} preview={politicalPreview} sequence={snapshot.journal.actions.length} onCancel={()=>{previewEpoch.current.political++;setPoliticalPreview(null);}} onPreview={action=>{setPlaying(false);void send({type:'political-preview',action});}} onConfirm={()=>{if(politicalPreview)void send({type:'action',sequence:politicalPreview.sequence,action:{kind:'politics',action:politicalPreview.action,expected:politicalPreview.expected}});}}/>}/></>:panel==='military'?<CultureMilitary47 snapshot={snapshot} selected={force} busy={busy} preview={militaryPreview} choose={chooseForce} target={mode=>{setPlaying(false);setMilitaryPreview(null);setTargetMode(mode);setPanel(null);}} request={requestMilitary} cancel={()=>{previewEpoch.current.military++;setMilitaryPreview(null);setTargetMode(null);}} confirm={()=>{if(militaryPreview&&intentMatchesForce47(militaryPreview.intent,force))void send({type:'action',sequence:militaryPreview.sequence,action:{kind:'military',intent:militaryPreview.intent,expected:militaryPreview.preview.basedOn}});}}/>:<CultureHistory47 key={r.id+'/'+historyEpoch} run={r} focusId={historyFocus} selectNation={id=>{setNationId(id);setCityId(null);setPanel('nation');}}/>}</aside>}
      {targetMode&&<div className="c47-order-hint" role="status">{force?.kind==='fleet'?'点击海面或港口':'点击行军目的地'}<button aria-label="取消选择目标" onClick={()=>{setTargetMode(null);setPanel('military');}}>×</button></div>}
      <div className="c47-playback-status" role="status" aria-live="off">{busy?'正在处理…':advancing?'正在推演…':playing?'推演中':'已暂停'}{playing&&actualRate!==null&&(' · 实际 '+actualRate.toFixed(1)+' 日/秒')}</div><footer className="c47-controls"><button aria-label={playing||(recovering&&resumeAfterRecovery.current)?'暂停时间':'继续时间'} title={playing?'暂停':'继续'} aria-pressed={playing} onClick={()=>void resume()}><PlayIcon name={playing?'pause':'play'}/></button><button aria-label="切换推演速度" title="推演速度" onClick={()=>setSpeed(v=>v===.5?1:v===1?2:v===2?4:.5)}>{speed}×</button><button aria-label="推进一天" title="推进一天" disabled={busy} onClick={()=>act({kind:'advance',ticks:120})}><PlayIcon name="step"/></button><button aria-label="查看大事记" title="大事记" aria-pressed={panel==='history'} onClick={()=>{setHistoryEpoch(n=>n+1);setHistoryFocus(null);setPanel(panel==='history'?null:'history');}}><PlayIcon name="book"/></button></footer>
    </>}
  </main>;
}
