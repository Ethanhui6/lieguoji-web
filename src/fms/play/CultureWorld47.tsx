import {FRAME_TICKS_BY_SPEED47,frameTicks47} from './frame-loop47';
import {allianceOf46} from './war46-alliance';
import {CultureNationActions47,PICK_TIPS47,type NationPick47} from './CultureNationActions47';
import {globalStamp47} from './civilization47-global-orders';
import {CultureAIGlobal47} from './CultureAIGlobal47';
import {CultureMenu47} from './CultureMenu47';
import {CultureProvince47} from './CultureProvince47';
import {FOUNDING_RULE47} from './civilization47-founding-time';
import {COLOR_VIEWS47,colorViewKey47,provinceColors47,type ColorView47} from './culture47-views';
import {CULTURE47_AUTOSAVE,culture47ScopeOf,culture47SlotRevision,loadCulture47Named,saveCulture47Named} from './culture47-library';
import {advanceAutoSave47,readCulture47Config,writeCulture47Config,type Culture47Config} from './culture47-config';
import {downloadBlob47,exportHistoryText47,HISTORY_EXPORT_FILE47} from './culture47-export';
import {politicalStamp47} from './civilization47-political-owner';
import {pickOriginalProvince} from '../original/original-picking';
import {ARMY_BATCH_RULE47} from './army-batch47';
import {CultureFamilyPeople47} from './CultureFamilyPeople47';
import {SETTLEMENT47_ALGORITHM} from './settlement47-regions';
import {CultureLayoutEditor47} from './CultureLayoutEditor47';
import type {OpeningLayout47} from './opening-layout47';
import {populationStamp47} from './civilization47-population-types';
import {CultureHouses47} from './CultureHouses47';
import {CultureNobility47} from './CultureNobility47';
import {PerfOverlay47} from './PerfOverlay47';
import type {NobilityRun47} from './civilization47-nobility';
import {CultureCalendar47} from './CultureCalendar47';
import {reignAge47} from './civilization47-origins';
import {useEffect,useLayoutEffect,useRef,useState,useMemo,type ReactNode} from 'react';
import {CultureNationOverview47,nationFamily47} from './CultureNationOverview47';
import {CultureHistory47} from './CultureHistory47';
import type {FmsDocument} from '../model';
import {FmsRenderer} from '../renderer';
import {OriginalPlayRenderer} from '../original/original-play-renderer';
import {originalGridFor} from '../original/original-document';
import {originalCellProvinces} from '../original/original-politics';
import {originalPortCities} from '../original/original-ports';
import {nationColor} from './politics';
import type {OriginalGrid} from '../original/original-grid';
import {extractFmsOceanCoast} from '../ocean-coast';
import {FMS_STATE_LINE,FMS_STATE_LINE_WIDTH} from '../state-line';
import {FRAME_LOOP_RULE47} from './frame-loop47';
import {deriveFmsCoastCurves,FMS_COAST_CURVE,FMS_COAST_LINE_COLOR,FMS_COAST_LINE_WIDTH} from '../coast-curve';
import {FmsGestures} from '../gestures';
import {fitCamera,screenToWorld,resizeCamera,zoomCameraAt} from '../../world/camera';
import {initialLandCamera47} from './land-camera47';
import {PlayMap} from './map';
import {provinceAt} from './world';
import {PlayIcon} from './PlayIcon';
import {CULTURE_IDS47,CULTURES47,RELIGIONS47,POLITIES47,culture47,type CultureId47,type NamingMode47,type ReligionId47} from './civilization47-catalog';
import {currentRuler47,type CultureChoice47,type CivilizationEdit47} from './civilization47-names';
import {rulerDisplayName47} from './civilization47-ruler-label';
import {Culture47Client} from './culture47-client';
import {sameCulture47Value} from './culture47-equal';
import {Culture47InvalidJournal,Culture47Unavailable,frozenCulture47} from './culture47-contract';
import type {Culture47Snapshot,Culture47Request as WorkerRequest} from './culture47.worker';
import type {Culture47Action,Culture47Journal} from './culture47-session';
import {loadCulture47,saveCulture47,CULTURE47_LONGPLAY_DATABASE,CULTURE47_RETIREMENT_DATABASE,CULTURE47_GENERATIONS_DATABASE,type Culture47Database,type SavedCulture47} from './culture47-storage';
import {GENERATIONS_RULE47} from './civilization47-generations-ledger';
import {ARMY_RETIREMENT_RULE47} from './army-retirement47';
import {ARMY_RECOVERY_RULE47} from './army-recovery47';
import {CULTURE47_CONTINUATION_SOURCE,CULTURE47_RETIREMENT_SOURCE} from './culture47-session';
import {continuationJournal47,assertContinuationMatch47} from './culture47-continuation';
import {previewFamilySuccession47} from './civilization47-succession';
import {graphFor46} from './war46-geography';
import {CultureMotion47} from './CultureMotion47';
import {culture47PlaybackBudget,CULTURE47_SPEEDS,culture47SpeedLabel} from './culture47-pacing';
import type {FoundingForces47} from './civilization47-forces';
import type {NativePolity} from './native-combat/upper-efficiency';
import './culture47.css';
import {CultureDiplomacy47} from './CultureDiplomacy47';
import {CultureNews47} from './CultureNews47';
import {usePresentationClock} from './PresentationClock';
import {Graphics} from 'pixi.js';
import {activeSiegeProvinces47,combatMarkers47,createCombatStrengthIndex47,displayCombatMarkers47,visibleCombatMarkers47} from './combat-map47';
import {CombatTimeline47} from './combat-timeline47';
import {CombatOverlay47} from './CombatOverlay47';
import {CultureMilitary47,intentMatchesForce47,type SelectedForce47} from './CultureMilitary47';
import {actualForces47} from './force-runtime47';
import {armySpatialFor47} from './army-geography47';
import {remainingArmyTravelPoints47} from './army-travel47-state';
import {nationsAtWar} from './realtime-statecraft';
import type {MilitaryIntent47} from './culture47-orders';

type Culture47Request=Exclude<WorkerRequest,{type:'load'|'verify'}>|{type:'load';journal:Culture47Journal};
type ReadyCulture47={client:Culture47Client;snapshot:Culture47Snapshot;journal:Culture47Journal};
const polityLabels:Record<NativePolity,string>={Kingdom:'王国',Empire:'帝国',Republic:'共和国',Federation:'联邦',Tribal:'部族',Theocracy:'神权国'};
const failText=(e:unknown)=>e instanceof Error?e.message:String(e);
async function verifyJournal(journal:Culture47Journal,signal?:AbortSignal,progress?:Parameters<Culture47Client['verify']>[1]){const client=new Culture47Client(journal.engine);try{await client.verify(journal,{...progress,signal,longReplay:true});}finally{client.close();}}
const defaultCultures:CultureId47[]=['chinese','japanese','english','arab','roman','german'];
function originalRuler(run:FoundingForces47,id:string){const reign=run.chronicle.leaders[id]?.at(-1);if(!reign||reign.endedDay!==null||Object.hasOwn(run.chronicle.ended,id))return null;const r=run.civilization.rulers[reign.id];return {...reign,name:r.name,given:r.given,title:r.titleAtAccession+'（就任时）'};}
function NationIdentity({run,id,cityId,busy,act,diplomacy,pause,originalEngine=false,familyCapable=false}:{originalEngine?:boolean;familyCapable?:boolean;run:FoundingForces47;id:string;cityId:string|null;busy:boolean;act:(a:Culture47Action)=>void;diplomacy:ReactNode;pause:()=>void}){
  const nation=run.world.nations.find(n=>n.id===id)!,identity=run.civilization.nations[id],ruler=originalEngine?originalRuler(run,id):currentRuler47(run.civilization,run.chronicle,id);
  const [name,setName]=useState(identity.name.custom??''),[religion,setReligion]=useState(identity.religionId),[polity,setPolity]=useState(identity.polity),[pending,setPending]=useState(false);
  const head=run.people.nations[id].leaderId,person=head===null?null:run.kin.persons[head],{family,members}=nationFamily47(run,id);
  const cities=run.world.cities.filter(c=>run.world.provinces.find(p=>p.id===c.provinceId)?.controller===id);
  const city=run.world.cities.find(c=>c.id===cityId)??cities.find(c=>c.id===nation.capitalId)??cities[0];
  const reignAge=reignAge47(run,id);
  const [familyOpen,setFamilyOpen]=useState(false);
  const heir=useMemo(()=>{if(!familyOpen||!familyCapable)return null;try{return previewFamilySuccession47(run,id);}catch{return null;}},[familyOpen,familyCapable,run,id]);
  const edit=(e:CivilizationEdit47)=>act({kind:'identity',edit:e});
  return <>
    <div className="c47-identity"><i style={{background:nation.color}}/><div><small>{culture47(identity.cultureId).label}文化 · {polityLabels[identity.polity]}</small><h2>{nation.name}</h2><p>{RELIGIONS47[identity.religionId]}</p></div></div>
    {!ruler&&run.kin.lifecycle?.vacancies[id]&&<section className="c47-ruler"><PlayIcon name="crown"/><div><small>领袖暂缺</small><strong>尚无符合当前政体的接任者</strong></div></section>}
    {ruler&&<section className="c47-ruler"><PlayIcon name="crown"/><div><small>{ruler.title} · 本局记载第 {ruler.order} 任</small><strong>{rulerDisplayName47(identity,ruler,ruler.title)}</strong><span>{ruler.name}{person?` · ${person.age} 岁`:''}{reignAge?` · 在位${reignAge.years>0?`${reignAge.years}年`:`${reignAge.days}日`}`:''}</span></div></section>}
    <CultureNationOverview47 run={run} id={id}/>{diplomacy}
    <details><summary>国家制度与名称</summary><form onSubmit={e=>{e.preventDefault();edit({kind:'nation',id,patch:{polity,religionId:religion,customName:name.trim()||null}});}}>
      <label>自定国名<input aria-label="自定国名" value={name} maxLength={100} placeholder={identity.name.value} onChange={e=>setName(e.target.value)}/></label>
      <label>政体<select aria-label="国家政体" value={polity} onChange={e=>setPolity(e.target.value as NativePolity)}>{POLITIES47.map(p=><option value={p} key={p}>{polityLabels[p]}</option>)}</select></label>
      <label>国家宗教<select aria-label="国家宗教" value={religion} onChange={e=>setReligion(e.target.value as ReligionId47)}>{Object.entries(RELIGIONS47).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <button disabled={busy} type="submit">应用国家设置</button><small>国名留空时，国号随政体变化。国家宗教不会自动改变所有居民的信仰。</small>
    </form></details>
    <details className="c47-cities-section" open={cityId!==null||undefined}><summary>城市 · {cities.length}</summary>{city&&<CityIdentity key={city.id+'/'+run.civilization.cities[city.id].name.custom} cityId={city.id} run={run} busy={busy} edit={edit}/>}<div className="c47-city-list">{cities.map(c=><span key={c.id}>{c.id===nation.capitalId?'♛ ':''}{c.name}</span>)}</div></details>
    {run.houses&&familyCapable&&<CultureHouses47 run={run} id={id} busy={busy} act={act} pause={pause}/>}
    {(run as unknown as NobilityRun47).nobility&&<CultureNobility47 run={run} id={id} busy={busy} act={act} pause={pause}/>}
    <details onToggle={e=>setFamilyOpen(e.currentTarget.open)}><summary>{family?culture47(identity.cultureId).houseLabel+' · '+family.surname:'家族'}</summary>{family&&<><div className="c47-family-summary"><strong>族长 · {run.kin.persons[family.headId]?.identity.name??'暂缺'}</strong><small>{members.filter(p=>p.isAlive).length} 位在世 · {members.length} 位登记成员</small></div><CultureFamilyPeople47 run={run} ids={members.map(p=>p.id)} leaderId={head??undefined}/></>}{heir&&<><p>继承候选：{heir.name}，{heir.age} 岁</p><button disabled={busy} onClick={()=>setPending(true)}>安排传位</button>{pending&&<div role="group" aria-label="确认传位"><p>由 {heir.name} 接任{heir.title}，成为第 {heir.order} 任。</p><button disabled={busy} onClick={()=>{act({kind:'succession',nationId:id});setPending(false);}}>确认传位</button><button onClick={()=>setPending(false)}>取消</button></div>}</>}</details>
  </>;
}
function CityIdentity({cityId,run,busy,edit}:{cityId:string;run:FoundingForces47;busy:boolean;edit:(e:CivilizationEdit47)=>void}){
  const row=run.civilization.cities[cityId],city=run.world.cities.find(c=>c.id===cityId)!,[value,setValue]=useState(row.name.custom??'');
  return <form onSubmit={e=>{e.preventDefault();edit({kind:'city',id:cityId,customName:value.trim()||null});}}><label>{city.name} · {culture47(row.cultureId).label}文化<input aria-label="自定城市名" value={value} maxLength={100} placeholder={row.name.value} onChange={e=>setValue(e.target.value)}/></label><button disabled={busy}>应用城市名</button></form>;
}
export function CultureWorld47({terrain,onClose,entryNotice}:{terrain:FmsDocument;onClose:()=>void;entryNotice?:string}){
  const [snapshot,setSnapshot]=useState<Culture47Snapshot|null>(null),[busy,setBusy]=useState(false),[playing,setPlayingState]=useState(false),[notice,setNotice]=useState(''),[saved,setSaved]=useState<SavedCulture47|null>(null),[locked,setLocked]=useState(false),[storageReady,setStorageReady]=useState(false);
  // ACK continuations can run before React commits a queued pause. Keep the
  // playback gate synchronous for pause, foreground previews, close and errors.
  const isPlaying=useRef(false);
  function setPlaying(next:boolean|((value:boolean)=>boolean)){const value=typeof next==='function'?next(isPlaying.current):next;isPlaying.current=value;setPlayingState(value);}
  const [layout,setLayout]=useState<OpeningLayout47|null>(null),[layoutOpen,setLayoutOpen]=useState(false);
  // Original map picks while paused: 编辑国家/绘制国家 and StateInfoUI actions
  // (宣战/停战/缔结盟约/点击扩张) choose a target by clicking the map.
  type Pick={kind:NationPick47;nationId:string};
  const [pick,setPickState]=useState<Pick|null>(null),pickRef=useRef<Pick|null>(null),territoryTap=useRef<(provinceId:string)=>void>(()=>{});
  const setPick=(next:Pick|null)=>{pickRef.current=next;setPickState(next);if(next)setPlaying(false);};
  const territoryNation=pick?.kind==='draw'?pick.nationId:null,setTerritoryNation=(id:string|null)=>setPick(id===null?null:{kind:'draw',nationId:id});
  const [aiGlobalOpen,setAIGlobalOpen]=useState(false),appRoot=useRef<HTMLElement>(null),[showPerf]=useState(()=>new URLSearchParams(location.search).has('perf'));
  const [menu,setMenu]=useState<null|'menu'|'load'>(null),[config,setConfigState]=useState<Culture47Config>(readCulture47Config),exportImage=useRef<(()=>Promise<Blob>)|null>(null),[autoSavePrompt,setAutoSavePrompt]=useState<{countdown:number}|'saving'|null>(null);
  const [count,setCount]=useState(6),[cityCount,setCityCount]=useState(60),[mode,setMode]=useState<NamingMode47>('culture-generated'),[enabled,setEnabled]=useState<CultureId47[]>(defaultCultures),[choices,setChoices]=useState<Record<string,CultureChoice47>>({}),[war,setWar]=useState(false);
  const [leaving,setLeaving]=useState(false),[historyFocus,setHistoryFocus]=useState<number|null>(null),[historyEpoch,setHistoryEpoch]=useState(0);
  const [politicalPreview,setPoliticalPreview]=useState<Culture47Snapshot['politicalPreview']|null>(null);
  const [nationId,setNationId]=useState('n-0'),[cityId,setCityId]=useState<string|null>(null),[panel,setPanel]=useState<'nation'|'history'|'military'|'province'|null>(null),[provinceId,setProvinceId]=useState<string|null>(null),[panelExpanded,setPanelExpanded]=useState(false);
  const [colorView,setColorView]=useState<ColorView47>('state'),[mapMode,setMapMode]=useState<'political'|'terrain'>('political'),[military,setMilitary]=useState(false),[force,setForce]=useState<SelectedForce47|null>(null),[targetMode,setTargetMode]=useState<'march'|'retreat'|null>(null),[speed,setSpeed]=useState(1);
  const [militaryPreview,setMilitaryPreview]=useState<Culture47Snapshot['militaryPreview']|null>(null),queued=useRef<({kind:'command';command:Culture47Request}|{kind:'save';exit:boolean}|{kind:'close'})|null>(null);
  const [advancing,setAdvancing]=useState(false),[storageReading,setStorageReading]=useState(true),[storageAttempt,setStorageAttempt]=useState(0);
  const [actualRate,setActualRate]=useState<number|null>(null),rateSample=useRef<{at:number;tick:number}|null>(null);
  const playbackBudget=culture47PlaybackBudget(snapshot?.run.life.secondsPerDay??.1,speed,snapshot?.journal.engine===__CULTURE47_ENGINE__||frozenCulture47(snapshot?.journal.engine??'')?.protocol===2,snapshot?.journal.engine===__CULTURE47_ENGINE__);
  const instantDisplay=useRef(false);
  useEffect(()=>{rateSample.current=null;setActualRate(null);},[playing,speed]);
  const panelScroll=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{
    setPanelExpanded(false);
    const sheet=panelScroll.current;
    if(!sheet)return;
    const focus=()=>{
      if(panelScroll.current!==sheet)return;
      sheet.scrollTop=0;
      if(panel==='nation'&&cityId){
        const cities=sheet.querySelector('.c47-cities-section');
        if(cities)sheet.scrollTop=Math.max(0,cities.getBoundingClientRect().top-sheet.getBoundingClientRect().top+sheet.scrollTop-56);
      }
    };
    focus();
    const frame=requestAnimationFrame(focus);
    return ()=>cancelAnimationFrame(frame);
  },[panel,nationId,cityId,historyEpoch]);
  useLayoutEffect(()=>{
    const sheet=panelScroll.current,preview=sheet?.querySelector('.c47-diplomatic-preview,.c47-order-preview');
    if(!sheet||!preview||(!politicalPreview&&!militaryPreview))return;
    setPanelExpanded(true);
    sheet.scrollTop=Math.max(0,preview.getBoundingClientRect().top-sheet.getBoundingClientRect().top+sheet.scrollTop-56);
  },[politicalPreview,militaryPreview]);
  const storageAbort=useRef<AbortController|null>(null),operation=useRef<AbortController|null>(null);
  const [recovering,setRecovering]=useState(false),resumeAfterRecovery=useRef(false);
  const [renderFault,setRenderFault]=useState(''),[rendererEpoch,setRendererEpoch]=useState(0);
  const displayReady=useRef(false);
  const lastView=useRef<{id:string;camera:ReturnType<typeof fitCamera>;viewport:{width:number;height:number}}|null>(null);
  const previewEpoch=useRef({military:0,political:0}),requestEpoch=useRef(new WeakMap<Culture47Request,number>());
  const client=useRef<Culture47Client|null>(null),current=useRef(snapshot),inflight=useRef(false),revision=useRef<number|null>(null),lifetime=useRef<AbortController|null>(null),host=useRef<HTMLDivElement>(null);
  const readyWorld=useRef<ReadyCulture47|null>(null);
  const storageDatabase=useRef<Culture47Database>(CULTURE47_LONGPLAY_DATABASE);
  const storageChoice='auto';
  const mapControl=useRef<{zoom:(n:number)=>void;fit:()=>void}|null>(null),selected=useRef({nationId,cityId,force,targetMode,military,mapMode,militaryPreview,colorView}),paint=useRef<()=>void>(()=>{}),lastSaved=useRef(-1);
  current.current=snapshot;selected.current={nationId,cityId,force,targetMode,military,mapMode,militaryPreview,colorView};
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
    const readWorld=async()=>{const databases:Culture47Database[]=[CULTURE47_GENERATIONS_DATABASE];for(const db of databases){reading.signal.throwIfAborted();storageDatabase.current=db;const found=await loadCulture47(indexedDB,verify,reading.signal,db,true);if(found){if(!await resumeFound(found)){staleNotice='这个存档来自旧版本，无法在新版本继续，请新建世界（新世界保存后替换旧档）。';return null;}return found;}}return null;};
    let staleNotice='';
    // Fast continue: a save with a checkpoint resumes its world state directly; a checkpoint the
    // Worker refuses falls back to replaying the journal.
    // A save of an earlier build continues in this build from its checkpoint (the journal is
    // re-stamped with the current engine); without one, or if refused, it cannot continue.
    const resumeFound=async(found:SavedCulture47):Promise<boolean>=>{
      const older=found.journal.engine!==__CULTURE47_ENGINE__;
      if(candidate.value)return true;if(!found.checkpoint)return !older;
      const journal=older?{...found.journal,engine:__CULTURE47_ENGINE__}:found.journal;
      setNotice('正在载入存档…');const restored=new Culture47Client();
      try{const loaded=await restored.send({type:'resume',journal,checkpoint:found.checkpoint},{signal:reading.signal,longReplay:true});reading.signal.throwIfAborted();
        if(!sameCulture47Value(loaded.journal,journal))throw new Culture47Unavailable('恢复结果与存档不一致，原档保留。');
        candidate.value={client:restored,snapshot:loaded,journal:structuredClone(journal)};found.journal=journal;return true;}
      catch(error){restored.close();if(!(error instanceof Culture47InvalidJournal))throw error;if(older)return false;await verify(found.journal);return true;}
    };
    void readWorld().then(s=>{
      if(controller.signal.aborted||reading.signal.aborted){discard();return;}
      const held=candidate.value;
      if(s){
        if(!held||held.client.isClosed||!sameCulture47Value(held.journal,s.journal))throw new Culture47Unavailable('已恢复世界与选中存档不一致，请重新读取。');
        client.current?.close();client.current=held.client;readyWorld.current=held;candidate.value=null;
      }else discard();
      setSaved(s);revision.current=s?.revision??null;setStorageReady(true);setNotice(staleNotice);
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
    if(motionTicks){motion.current.setPresentationTickMillis(playbackBudget.tickMillis,started);motion.current.beginAdvance(motionTicks,started);}
    const inspectNewSlot=command.type==='create'&&(storageDatabase.current!==CULTURE47_GENERATIONS_DATABASE||locked);
    try{const newSlot=inspectNewSlot?await loadCulture47(indexedDB,j=>verifyJournal(j,op.signal,{progress:replayProgress}),op.signal,CULTURE47_GENERATIONS_DATABASE):undefined;
      let s=reuse??await client.current.send(dispatched,{signal:op.signal,progress:replayProgress,longReplay:true});if(lifetime.current?.signal.aborted)return;
      if(command.type==='create')s=await client.current.send({type:'action',action:{kind:'enable-retirement',rule:ARMY_RETIREMENT_RULE47,expected:populationStamp47(s.run)},sequence:s.journal.actions.length},{signal:op.signal});
      if(command.type==='create')s=await client.current.send({type:'action',action:{kind:'enable-recovery',rule:ARMY_RECOVERY_RULE47,expected:populationStamp47(s.run)},sequence:s.journal.actions.length},{signal:op.signal});
      // Original-family worlds use the original births and marriages instead.
      if(command.type==='create'&&!(s.run as unknown as NobilityRun47).nobility)s=await client.current.send({type:'action',action:{kind:'enable-generations',rule:GENERATIONS_RULE47,expected:populationStamp47(s.run)},sequence:s.journal.actions.length},{signal:op.signal});
      // New worlds run the original frame loop (frame-loop47.ts); loaded saves keep their own rules.
      if(command.type==='create')s=await client.current.send({type:'action',action:{kind:'enable-frame-loop',rule:FRAME_LOOP_RULE47,expected:populationStamp47(s.run)},sequence:s.journal.actions.length},{signal:op.signal});
      if(command.type==='create')s=await client.current.send({type:'action',action:{kind:'enable-army-batch',rule:ARMY_BATCH_RULE47,expected:populationStamp47(s.run)},sequence:s.journal.actions.length},{signal:op.signal});
      // Original province rebellion (Province.TryRebel) runs in new worlds only.
      if(command.type==='create')s=await client.current.send({type:'action',action:{kind:'enable-foundings',rule:FOUNDING_RULE47,expected:populationStamp47(s.run)},sequence:s.journal.actions.length},{signal:op.signal});
      if(motionTicks)motion.current.recordAdvance(motionTicks,performance.now()-started);
      const timing=client.current.lastTiming;if(isAdvance&&timing&&appRoot.current)appRoot.current.dataset.pipeline=JSON.stringify({...timing,ticks:motionTicks||(dispatched.type==='advance-batch'?dispatched.ticks:0),total:performance.now()-started});
      if(isAdvance&&background){const at=performance.now(),old=rateSample.current;if(old&&at>old.at&&s.run.clock.tick>old.tick){const rate=(s.run.clock.tick-old.tick)/120/((at-old.at)/1000);setActualRate(previous=>previous===null?rate:previous*.65+rate*.35);}rateSample.current={at,tick:s.run.clock.tick};}else rateSample.current=null;
      if(command.type==='create'){if(inspectNewSlot)revision.current=newSlot?.revision??null;storageDatabase.current=CULTURE47_GENERATIONS_DATABASE;setLocked(false);}
      instantDisplay.current=isAdvance&&!background||command.type==='create'||command.type==='load';
      // Install every accepted path before allowing the next Worker request.
      // React may coalesce fast snapshots; it must not discard intermediate turns.
      installAcceptedDisplay(s,instantDisplay.current);
      current.current=s;setSnapshot(s);if(command.type==='political-preview'&&requestEpoch.current.get(command)===previewEpoch.current.political)setPoliticalPreview(s.politicalPreview);if(command.type==='military-preview'&&requestEpoch.current.get(command)===previewEpoch.current.military&&s.militaryPreview&&intentMatchesForce47(s.militaryPreview.intent,selected.current.force))setMilitaryPreview(s.militaryPreview);if(command.type==='action'&&command.action.kind==='military')setMilitaryPreview(null);if(command.type==='action'&&command.action.kind==='politics')setPoliticalPreview(null);if(command.type==='create'||command.type==='load'){setForce(null);setTargetMode(null);setMilitaryPreview(null);setPoliticalPreview(null);setNationId(s.run.world.nations[0].id);setCityId(null);setPanel(null);lastSaved.current=command.type==='load'?s.journal.actions.length:-1;}setNotice('');}
    catch(e){if(!lifetime.current?.signal.aborted){setPlaying(false);setNotice(failText(e)+(client.current?.isClosed?(current.current?' 点击继续可恢复最后确认的进度。':' 可以重新点击创建或继续世界；原档保留。'):''));}}
    finally{operation.current=null;inflight.current=false;if(!lifetime.current?.signal.aborted){setBusy(false);setAdvancing(false);drain();}}
  }
  const act=(action:Culture47Action)=>{const s=current.current;if(s)void send({type:'action',action,sequence:s.journal.actions.length});};
  territoryTap.current=provinceId=>{
    const s=current.current,chosen=pickRef.current;if(!s||!chosen||busy)return;const nationId=chosen.nationId;
    const p=s.run.world.provinces.find(v=>v.id===provinceId);if(!p)return;
    if(chosen.kind==='draw'||chosen.kind==='expand'){
      if(p.controller===nationId&&p.legalOwner===nationId){setNotice(`${p.name}已属于该国。`);return;}
      act({kind:'territory',edit:{nationId,provinceIds:[provinceId]},expected:politicalStamp47(s.run)});return;
    }
    const target=p.controller;if(target===nationId){setNotice('请点击其他国家。');return;}
    const ally=allianceOf46(s.run,nationId),sameAlliance=!!ally&&ally.members.includes(target),atWar=s.run.world.statecraft!.relations.some(v=>[v.a,v.b].includes(nationId)&&[v.a,v.b].includes(target)&&v.status==='war');
    if(chosen.kind==='war'&&sameAlliance){setNotice('不能向同一联盟的盟国宣战，请点击其他国家。');return;}
    if(chosen.kind==='war'&&atWar){setNotice('两国已经处于战争中，请点击其他国家。');return;}
    if(chosen.kind==='peace'&&!atWar){setNotice('两国当前没有战争，请点击交战国家。');return;}
    if(chosen.kind==='alliance'&&sameAlliance){setNotice('两国已在同一联盟，请点击其他国家。');return;}
    setPick(null);setNationId(nationId);setPanel('nation');
    if(chosen.kind==='alliance')act({kind:'global',order:{kind:'alliance',edit:{type:'unite',nationId,targetId:target}},expected:globalStamp47(s.run)});
    else if(chosen.kind==='annex')act({kind:'global',order:{kind:'annex',edit:{nationId,targetId:target}},expected:globalStamp47(s.run)});
    else if(chosen.kind==='vassal')act({kind:'global',order:{kind:'vassal',edit:{type:'make',vassalId:target,overlordId:nationId}},expected:globalStamp47(s.run)});
    else act({kind:'politics',action:{type:chosen.kind==='war'?'declare-war':'make-peace',nationId,targetNationId:target},expected:politicalStamp47(s.run)});
  };
  const globalOrder=(order:import('./civilization47-global-orders').GlobalOrder47)=>{const s=current.current;if(s)act({kind:'global',order,expected:globalStamp47(s.run)});};
  const setConfig=(c:Culture47Config)=>{writeCulture47Config(c);setConfigState(c);};
  /** Original SaveSystem.SaveGame into a named save (菜单选项 → 保存游戏, and the autosave). */
  async function saveNamed(name:string,quiet=false):Promise<boolean>{
    const s=current.current;if(!s||inflight.current){if(!quiet)setNotice('正在推演，请稍后再保存。');return false;}
    inflight.current=true;setBusy(true);if(!quiet)setNotice('正在保存游戏…');const op=new AbortController();operation.current=op;
    try{const stored=await saveCulture47Named(s.journal,name,async j=>{const c=client.current;if(c&&!c.isClosed&&c.engine===j.engine)await c.verify(j,{signal:op.signal,progress:replayProgress,longReplay:true});else await verifyJournal(j,op.signal,{progress:replayProgress});});if(!lifetime.current?.signal.aborted)setNotice(`已保存游戏：${stored}`);return true;}
    catch(e){if(!lifetime.current?.signal.aborted)setNotice('保存失败，原存档保留。'+failText(e));return false;}
    finally{operation.current=null;inflight.current=false;if(!lifetime.current?.signal.aborted){setBusy(false);drain();}}
  }
  /** LoadSaveDataUI → 加载存档: the save's own map and history replace the open world. */
  async function loadNamed(name:string):Promise<boolean>{
    if(inflight.current||busy)return false;setPlaying(false);setPick(null);
    let journal:Culture47Journal;try{journal=await loadCulture47Named(name);}catch(e){setNotice(failText(e));return false;}
    await send({type:'load',journal});const s=current.current;
    if(!s||s.journal.id!==journal.id||s.journal.actions.length!==journal.actions.length)return false;
    const scope=culture47ScopeOf(journal);storageDatabase.current=scope;
    try{revision.current=await culture47SlotRevision(scope);setLocked(false);}catch(e){setLocked(true);setNotice(failText(e));}
    setNotice(`已加载存档：${name}`);return true;
  }
  function exportHistory(includeEmergencyMobilize:boolean){const r=current.current?.run;if(!r)return;downloadBlob47(new Blob(['﻿'+exportHistoryText47(r.chronicle.entries,r.life.startDate,includeEmergencyMobilize)],{type:'text/plain;charset=utf-8'}),HISTORY_EXPORT_FILE47);setNotice('历史记录导出完成！');}
  async function exportMapImage(){const make=exportImage.current;if(!make){setNotice('地图尚未就绪。');return;}setNotice('正在导出中，请稍候...');try{downloadBlob47(await make(),`FantasyMap_${new Date().toISOString().replace(/D/g,'').slice(0,14)}.png`);setNotice('地图截图导出完成！');}catch(e){setNotice('截图保存失败: '+failText(e));}}
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
      candidate=await candidateClient.send({type:'action',action:{kind:'enable-recovery',rule:ARMY_RECOVERY_RULE47,expected:populationStamp47(candidate.run)},sequence:candidate.journal.actions.length},{signal:op.signal});
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
    if(pickRef.current){setPick(null);setNotice('已退出地图选择，继续推演。');}
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
  // Leaving the page (app switch, lock screen, tab overview) saves the world: a
  // reloaded page continues from it (the world continue slot).
  const saveOnHide=useRef<()=>void>(()=>{});saveOnHide.current=()=>{if(current.current&&lastSaved.current!==current.current.journal.actions.length)void save(false);};
  useEffect(()=>{const pauseHidden=()=>{if(document.hidden){resumeAfterRecovery.current=false;setPlaying(false);saveOnHide.current();}};document.addEventListener('visibilitychange',pauseHidden);return()=>document.removeEventListener('visibilitychange',pauseHidden);},[]);
  usePresentationClock({enabled:playing,policyKey:busy,...playbackBudget,acknowledgedContinuation:true,playing:()=>isPlaying.current,
    batchBoundary:()=>120-(current.current?.run.clock.tick??0)%120,
    blocked:()=>document.hidden||inflight.current||busy||!current.current||!displayReady.current,
    step:async ticks=>{const s=current.current;
      // Original timeScale: a new speed takes effect at the next day boundary as a journalled frame length.
      const wanted=FRAME_TICKS_BY_SPEED47[String(speed)];
      if(s&&s.journal.engine===__CULTURE47_ENGINE__&&s.run.frameLoop&&wanted!==undefined&&frameTicks47(s.run)!==wanted&&s.run.clock.tick%120===0){await send({type:'action',action:{kind:'frame-length',ticks:wanted},sequence:s.journal.actions.length},true);return;}
      if(s)await send((s.journal.engine===__CULTURE47_ENGINE__||frozenCulture47(s.journal.engine)?.protocol===2)?{type:'advance-batch',ticks,sequence:s.journal.actions.length}:{type:'action',action:{kind:'advance',ticks},sequence:s.journal.actions.length},true);}});
  const requestMilitary=(intent:MilitaryIntent47)=>{setPlaying(false);setTargetMode(null);setPanel('military');void send({type:'military-preview',intent});};
  const chooseForce=(value:SelectedForce47)=>{previewEpoch.current.military++;selected.current.force=value;setForce(value);setMilitaryPreview(null);setTargetMode(null);setPanel('military');};
  const interaction=useRef({requestMilitary,chooseForce});interaction.current={requestMilitary,chooseForce};
  async function save(exit=false){
    if(!current.current||locked||!storageReady)return;if(inflight.current){if(!queued.current){queued.current={kind:'save',exit};setBusy(true);setNotice('正在等待本次推演结束，然后保存…');}return;}inflight.current=true;setBusy(true);setNotice('正在保存当前世界…');
    const op=new AbortController();operation.current=op;
    try{const s=current.current,live=client.current,checkpoint=live&&!live.isClosed&&live.engine===s.journal.engine?await live.checkpoint({signal:op.signal}):undefined;
      const n=await saveCulture47(s.journal,revision.current,indexedDB,op.signal,async j=>{const c=client.current;if(c&&!c.isClosed&&c.engine===j.engine)await c.verify(j,{signal:op.signal,progress:replayProgress,longReplay:true});else await verifyJournal(j,op.signal,{progress:replayProgress});},storageDatabase.current,undefined,checkpoint);revision.current=n;lastSaved.current=s.journal.actions.length;setSaved({journal:s.journal,revision:n,recovered:false});setNotice('文化世界已保存，刷新后可继续。');if(exit)onClose();}
    catch(e){setPlaying(false);setNotice(failText(e));}finally{operation.current=null;inflight.current=false;if(!lifetime.current?.signal.aborted){setBusy(false);drain();}}
  }
  function requestClose(){setPlaying(false);if(inflight.current){if(!queued.current){queued.current={kind:'close'};setBusy(true);}return;}if(current.current&&lastSaved.current!==current.current.journal.actions.length)setLeaving(true);else onClose();}
  useEffect(()=>{const protect=(e:BeforeUnloadEvent)=>{if(current.current&&lastSaved.current!==current.current.journal.actions.length){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[]);
  // AutoSaveManager.Update: counts real seconds once a world exists (isGameStarted).
  const autoSave=useRef({elapsed:0,pending:false});
  const hasRun=!!snapshot;
  useEffect(()=>{
    autoSave.current={elapsed:0,pending:false};setAutoSavePrompt(null);
    if(!config.autoSave||!hasRun)return;
    let last=performance.now();
    const timer=setInterval(()=>{const now=performance.now(),delta=(now-last)/1000;last=now;const state=autoSave.current;
      if(state.pending){if(!inflight.current){state.pending=false;void saveNamed(CULTURE47_AUTOSAVE,true).then(()=>saveOnHide.current()).finally(()=>setAutoSavePrompt(null));}return;}
      if(document.hidden)return;
      const next=advanceAutoSave47(state.elapsed,delta,config.autoSaveMinutes);state.elapsed=next.elapsed;
      if(next.due){state.pending=true;setAutoSavePrompt('saving');}else setAutoSavePrompt(next.countdown===null?null:{countdown:next.countdown});
    },200);
    const cancel=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;const state=autoSave.current,interval=config.autoSaveMinutes*60;if(!state.pending&&interval-state.elapsed<=5){state.elapsed=0;setAutoSavePrompt(null);}};
    window.addEventListener('keydown',cancel);
    return()=>{clearInterval(timer);window.removeEventListener('keydown',cancel);};
  },[config.autoSave,config.autoSaveMinutes,hasRun]);
  // Original PlayerController.DebugViewModeSwitch: number keys 1–6 switch the color view.
  useEffect(()=>{const key=(e:KeyboardEvent)=>{const t=e.target as HTMLElement|null;if(e.ctrlKey||e.metaKey||e.altKey||t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable))return;const v=COLOR_VIEWS47.find(x=>x.key===e.key);if(!v||!current.current)return;if(!v.available){setNotice(v.label+'尚未还原。');return;}setColorView(v.id);setNotice(v.label);};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  useEffect(()=>{paint.current();},[colorView]);
  const runId=snapshot?.run.id;
  const portProvinces=useMemo(()=>snapshot?new Set(graphFor46(snapshot.run).ports.map(p=>p.provinceId)):new Set<string>(),[runId]);
  const motion=useRef(new CultureMotion47());
  const combatTimeline=useRef(new CombatTimeline47());
  const installedDisplay=useRef<Culture47Snapshot|null>(null);
  useEffect(()=>{motion.current.setPresentationTickMillis(playbackBudget.tickMillis,performance.now());},[playbackBudget.tickMillis]);
  function displayFrame(){return motion.current.frame(performance.now());}
  function installAcceptedDisplay(next:Culture47Snapshot,immediate:boolean){
    if(installedDisplay.current===next)return;
    const now=performance.now();combatTimeline.current.install(next,motion.current.tick(now),immediate);motion.current.install(next,now,()=>actualForces47(next.run).spatial.graph,immediate);installedDisplay.current=next;
    if(!isPlaying.current&&!renderFault)motion.current.finishAccepted(now);
  }
  // Loads and recovery also enter through this fallback. ACKs have already
  // installed their paths synchronously, so rendering cannot install them twice.
  // A queued passive effect may belong to an older React commit than the
  // latest ACK. It must never reinstall an already superseded accepted path.
  useEffect(()=>{if(snapshot&&snapshot===current.current)installAcceptedDisplay(snapshot,instantDisplay.current);},[snapshot,renderFault]);
  useEffect(()=>{const now=performance.now();motion.current.setRunning(playing&&!renderFault,now);if(!playing&&!renderFault)motion.current.finishAccepted(now);},[playing,renderFault]);
  // Worlds made on the original's BasicMap grid are drawn the original way.
  const [terrainGrid,setTerrainGrid]=useState<{runId:string;grid:OriginalGrid|null}|null>(null);
  useEffect(()=>{
    if(!runId||!current.current)return;let live=true;
    void originalGridFor(current.current.run.terrain).then(grid=>{if(live)setTerrainGrid({runId,grid});},()=>{if(live)setTerrainGrid({runId,grid:null});});
    return()=>{live=false;};
  },[runId]);
  useEffect(()=>{
    if(!runId||!host.current||!current.current||terrainGrid?.runId!==runId)return;
    displayReady.current=false;
    let disposed=false,failed=false,cleanup=()=>{};
    const displayFailed=(e:unknown)=>{if(disposed||failed)return;failed=true;displayReady.current=false;resumeAfterRecovery.current=false;setPlaying(false);cleanup();setRenderFault(failText(e));};
    const element=host.current,source=current.current.run.terrain,grid=terrainGrid.grid,original=grid?new OriginalPlayRenderer(grid,source.elevations,displayFailed):null;
    const renderer:FmsRenderer|OriginalPlayRenderer=original??new FmsRenderer(()=>{},displayFailed),map=new PlayMap(()=>paint.current(),false),orderLine=new Graphics(),combatOverlay=new CombatOverlay47(()=>paint.current());
    let cellOwners:Int32Array|null=null,stateKey='';
    renderer.setOceanAppearance('paper');
    // Pulsing contact geometry must not invalidate the terrain/label render group.
    const viewport={width:Math.max(1,element.clientWidth),height:Math.max(1,element.clientHeight)};
    const savedView=lastView.current,view={viewport,camera:savedView?.id===runId?resizeCamera(savedView.camera,savedView.viewport,viewport,source):initialLandCamera47(source,viewport)};
    const richDiagnostics=new URLSearchParams(location.search).has('fmsDiagnostics');
    // Map diagnostics (JSON on the canvas each frame) are for automated tests only; normal play skips them.
    const testDiagnostics=richDiagnostics||navigator.webdriver===true;
    let combat:ReturnType<typeof combatMarkers47>=[],contactPairs:ReturnType<CombatTimeline47['pairs']>|null=null,combatRun:FoundingForces47|null=null;
    let strengthRun:FoundingForces47|null=null,strengthIndex:ReturnType<typeof createCombatStrengthIndex47>|undefined,paintCount=0;
    const drawCombat=(frame:ReturnType<typeof displayFrame>,now:number)=>{
      const s=current.current!,r=s.run,pairs=combatTimeline.current.pairs(motion.current.tick(now));
      if(strengthRun!==r){strengthIndex=createCombatStrengthIndex47(r);strengthRun=r;}
      if(contactPairs!==pairs||combatRun!==r){combat=combatMarkers47({...r,forceContacts:{version:1,pairs}},motion.current.tick(now)>=r.clock.tick?(s.frame.activeSieges!==undefined?new Set(s.frame.activeSieges):activeSiegeProvinces47(r)):new Set());contactPairs=pairs;combatRun=r;}
      const displayed=displayCombatMarkers47(combat,map.displayForcePoints(frame)),visible=visibleCombatMarkers47(displayed,r,r.scale,view.camera,view.viewport,strengthIndex);
      combatOverlay.draw(visible,combat.filter(m=>m.kind==='contact').map(m=>m.id),r.scale,view.camera.scale,now,isPlaying.current,reducedMotion.matches);
      if(renderer.canvas&&testDiagnostics){renderer.canvas.dataset.combat=JSON.stringify(displayed);renderer.canvas.dataset.visibleCombat=JSON.stringify(visible);if(richDiagnostics)renderer.canvas.dataset.combatAnimation=JSON.stringify(combatOverlay.diagnostics());}
    };
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const sea=graphFor46(current.current.run);
    void renderer.init(element).then(()=>{
      if(disposed)return;renderer.setDocument(source);renderer.setTerrainDisplay('biome');renderer.attachGameplayLayer(map.layer);renderer.attachGameplayLayer(combatOverlay.layer);renderer.attachGameplayLayer(orderLine);renderer.setCamera(view.camera);
      exportImage.current=async()=>{paint.current();return await renderer.exportPng();};
      const canvas=renderer.canvas;canvas.setAttribute('aria-label','真实文化世界地图');canvas.dataset.testid='culture47-map';
      // The run terrain is immutable while this world is open; one smoothed coastline serves every paint.
      const coast=original?original.coast:deriveFmsCoastCurves(extractFmsOceanCoast(source));if(original&&grid){map.useCellPolitics(true);map.useOriginalIcons(true);const w=current.current!.run;map.setOriginalPorts(originalPortCities(grid,source,w.world.cities.map(c=>({id:c.id,position:c.position,capital:false})),w.scale));}map.setCoastline(coast.lines,FMS_COAST_LINE_WIDTH,FMS_COAST_LINE_COLOR);map.useOriginalStateLines(true);
      canvas.dataset.coastline=JSON.stringify({algorithm:FMS_COAST_CURVE,chains:coast.chains,sourceSegments:coast.sourceSegments,points:coast.points,width:FMS_COAST_LINE_WIDTH,color:FMS_COAST_LINE_COLOR});
      paint.current=()=>{const s=current.current;if(disposed||failed||!s)return;try{const r=s.run;
        if(richDiagnostics)canvas.dataset.mapPaints=String(++paintCount);
        const selectedCity=r.world.cities.find(c=>c.id===selected.current.cityId);
        const selection=selected.current;
        const frame=displayFrame();
        if(original){
          // Cell colors follow the current controller; recolor only when ownership or view changes.
          const key=selection.mapMode+'|'+selection.colorView+'|'+colorViewKey47(r,selection.colorView)+'|'+r.world.provinces.map(p=>p.controller).join(',')+'|'+r.world.nations.map(n=>nationColor(n)).join(',');
          if(key!==stateKey){stateKey=key;cellOwners??=originalCellProvinces(source,r.world.provinces,r.scale);
            original.setStates(selection.mapMode==='political'?cellOwners:null,provinceColors47(r,selection.colorView));canvas.dataset.colorView=selection.colorView;}
        }
        if(!original){const viewKey=selection.colorView+'|'+colorViewKey47(r,selection.colorView);map.setProvinceFill(selection.colorView==='state'?null:provinceColors47(r,selection.colorView),viewKey);canvas.dataset.colorView=selection.colorView;}
        map.draw(r.world,r.scale,view.camera.scale,selectedCity?.provinceId??null,selection.force?.kind==='army'?selection.force.id:null,selection.mapMode,r.units,view,{navy:r.navy,graph:sea,selected:selection.force?.kind==='fleet'?selection.force.id:null,nationId:selection.nationId,preview:[],maritime:r.maritime,portControl:r.portControl.ports},frame,undefined,[],r.id,source,{},r.tactics.forces);
        const graph=armySpatialFor47(r).graph,places=new Map(r.world.provinces.map(p=>[p.id,p])),colors=new Map(r.world.nations.map(n=>[n.id,nationColor(n)]));
        const attacks=r.world.armies.flatMap(a=>{
          const travel=r.armyPositions.records[a.id];
          if(a.status==='destroyed'||a.status==='retreating'||a.troops<=0||travel?.status!=='moving')return [];
          const target=graph.cells.get(travel.nodes.at(-1)!)?.provinceId,owner=target?places.get(target)?.controller:undefined;
          if(!owner||!nationsAtWar(r.world,a.nationId,owner))return [];
          const points=remainingArmyTravelPoints47(travel,graph);points[0]=frame.armies.get(a.id)??points[0];
          return [{id:a.id,points,color:colors.get(a.nationId)!,key:a.nationId+'/'+target}];
        });
        map.drawActualAttackArrows(attacks,r.scale,view.camera.scale);
        drawCombat(frame,performance.now());if(testDiagnostics)canvas.dataset.projection=JSON.stringify({scale:r.scale,zoom:view.camera.scale,x:view.camera.x,y:view.camera.y});
        orderLine.clear();const points=selection.militaryPreview?.preview.points??[];
        if(points.length){orderLine.moveTo(points[0].x/r.scale,points[0].y/r.scale);for(const p of points.slice(1))orderLine.lineTo(p.x/r.scale,p.y/r.scale);orderLine.stroke({color:0xffedb4,width:3/view.camera.scale,alpha:.95});const end=points.at(-1)!;orderLine.circle(end.x/r.scale,end.y/r.scale,7/view.camera.scale).stroke({color:0xffffff,width:2/view.camera.scale});}
        canvas.dataset.day=String(r.world.day);if(testDiagnostics){canvas.dataset.attackArrows=JSON.stringify(map.orderAnimations());canvas.dataset.cityIcons=JSON.stringify(map.iconDiagnostics());canvas.dataset.stateLines=JSON.stringify({algorithm:FMS_STATE_LINE,width:FMS_STATE_LINE_WIDTH,...map.stateLineDiagnostics()});canvas.dataset.forcePositions=JSON.stringify({armies:[...current.current!.frame.armies],fleets:[...current.current!.frame.fleets]});canvas.dataset.countries=JSON.stringify(r.world.nations.map(n=>({id:n.id,name:n.name})));canvas.dataset.cities=JSON.stringify(map.cityPositions().map(c=>({...c,nationId:r.world.provinces.find(p=>p.id===c.provinceId)?.controller})));canvas.dataset.units=JSON.stringify(map.unitPositions().map(u=>({...u,nationId:(u.kind==='army'?r.world.armies:r.navy.fleets).find(a=>a.id===u.id)?.nationId})));if(richDiagnostics){canvas.dataset.countryLabels=JSON.stringify(map.labelPositions());canvas.dataset.mapLabelLayout=JSON.stringify(map.labelDiagnostics());}}renderer.refresh();displayReady.current=true;}catch(e){displayFailed(e);}
      };
      // Original-grid worlds stop at PlayerController ZoomMin 5: 10 world units = 66.7 map units tall.
      const setCamera=(c:typeof view.camera)=>{if(original&&c.scale>view.viewport.height/(10/(240/1600))&&c.scale>view.camera.scale)return;view.camera=c;renderer.setCamera(c);paint.current();};
      mapControl.current={zoom:n=>setCamera(zoomCameraAt(view.camera,n,{x:view.viewport.width/2,y:view.viewport.height/2},source,view.viewport)),fit:()=>setCamera(fitCamera(source,view.viewport))};
      const gestures=new FmsGestures({camera:()=>view.camera,setCamera,world:()=>source,viewport:()=>view.viewport,begin:()=>{},move:()=>{},commit:()=>{},cancel:()=>{}}),ids=new Set<number>();
      let tap:{id:number;x:number;y:number}|null=null;
      const point=(e:PointerEvent|WheelEvent)=>{const b=canvas.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};};
      const down=(e:PointerEvent)=>{if(e.button!==0)return;const p=point(e);ids.add(e.pointerId);tap=ids.size===1?{id:e.pointerId,...p}:null;canvas.setPointerCapture(e.pointerId);gestures.down(e.pointerId,p,false);};
      const move=(e:PointerEvent)=>{const p=point(e);if(tap&&Math.hypot(p.x-tap.x,p.y-tap.y)>5)tap=null;gestures.move(e.pointerId,p);};
      const up=(e:PointerEvent)=>{const p=point(e),t=tap;gestures.up(e.pointerId,p);ids.delete(e.pointerId);tap=null;if(t?.id!==e.pointerId||ids.size||!current.current)return;const r=current.current.run,w=screenToWorld(view.camera,p),at={x:w.x*r.scale,y:w.y*r.scale},id=original?(()=>{cellOwners??=originalCellProvinces(source,r.world.provinces,r.scale);const index=pickOriginalProvince(source,cellOwners,w.x,w.y);return index===null?undefined:r.world.provinces[index]?.id;})():provinceAt(r.world,at),province=r.world.provinces.find(p=>p.id===id),s=selected.current;
        if(pickRef.current){if(province)territoryTap.current(province.id);return;}
        if(s.targetMode&&s.force){
          if(current.current.journal.engine!==__CULTURE47_ENGINE__){if(s.force.kind==='army'&&province){interaction.current.requestMilitary({force:'army',command:{type:'army-move',armyId:s.force.id,kind:s.targetMode,target:{kind:'province',id:province.id}}});}else{setNotice('旧版本继续保留原规则；此兼容入口暂只支持陆军地区目标，原试玩入口仍保留。');}return;}
          const g=actualForces47(r).spatial.graph,cells=[...g.cells.values()].filter(c=>s.force!.kind==='army'||c.surface==='sea'),cell=cells.sort((a,b)=>Math.hypot(a.center.x-at.x,a.center.y-at.y)-Math.hypot(b.center.x-at.x,b.center.y-at.y))[0];if(!cell)return;
          if(s.force.kind==='army')interaction.current.requestMilitary({force:'army',command:{type:'army-move',armyId:s.force.id,kind:s.targetMode,target:province?{kind:'province',id:province.id}:{kind:'cell',id:cell.id}}});
          else {const port=sea.ports.filter(v=>v.provinceId===province?.id).sort((a,b)=>Math.hypot(sea.nodes.get(a.node)!.center.x-at.x,sea.nodes.get(a.node)!.center.y-at.y)-Math.hypot(sea.nodes.get(b.node)!.center.x-at.x,sea.nodes.get(b.node)!.center.y-at.y))[0];if(province&&!port){setNotice('请选择海面或沿岸港口。');return;}interaction.current.requestMilitary({force:'fleet',command:{type:'fleet-sail',fleetId:s.force.id,target:port?{kind:'port',id:port.id}:{kind:'cell',id:cell.id}}});}return;
        }
        if(s.military){const hit=map.pickUnits(p)[0];if(hit){interaction.current.chooseForce({kind:hit.kind as SelectedForce47['kind'],id:hit.id});return;}}
        const city=map.cityPositions().map(c=>({...c,distance:Math.hypot(c.x-p.x,c.y-p.y)})).filter(c=>c.distance<=14).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id))[0];
        if(city){const cityProvince=r.world.provinces.find(v=>v.id===city.provinceId);if(cityProvince){setNationId(cityProvince.controller);setCityId(city.id);setPanel('nation');return;}}
        // Original PlayerController.LeftClickLogic opens ProvinceInfoUI for the clicked province.
        if(province){setNationId(province.controller);setCityId(null);setProvinceId(province.id);setPanel('province');}else{setCityId(null);setPanel(null);}};
      const cancel=()=>{tap=null;ids.clear();gestures.interrupt();},wheel=(e:WheelEvent)=>{e.preventDefault();gestures.wheel(point(e),e.deltaY);};
      const contextLost=(e:Event)=>{e.preventDefault();if(!disposed)displayFailed(new Error('地图渲染中断，推演已暂停。当前世界仍保留，可以重新显示地图。'));};
      canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);canvas.addEventListener('wheel',wheel,{passive:false});
      const observer=new ResizeObserver(()=>{if(disposed||failed)return;try{const next={width:element.clientWidth,height:element.clientHeight};if(next.width<=0||next.height<=0)return;view.camera=resizeCamera(view.camera,view.viewport,next,source);view.viewport=next;renderer.resize(next.width,next.height);renderer.setCamera(view.camera);paint.current();}catch(e){displayFailed(e);}});
      let raf=0,settled=-1,lastDiagnostic=0;
      // Full force snapshots are test evidence, not gameplay. Serializing every
      // army/fleet and querying every visual marker on each interpolated frame
      // steals time from the same main thread that must paint the map. An
      // explicit local query keeps that expensive read-only instrumentation out
      // of ordinary play while retaining it for the browser motion regression.
      const animate=()=>{if(disposed||failed)return;try{
        const now=performance.now(),alpha=motion.current.alpha(now),combatFrame= combatOverlay.animate(now,isPlaying.current,reducedMotion.matches);
        // The authored clip changes at 12 Hz. Keep its clock anchored while
        // paused/offscreen without making a full-map redraw on every RAF.
        if(alpha<1||settled!==motion.current.revision||combatFrame){
          const frame=motion.current.frame(now);map.updateUnits(frame);
          drawCombat(frame,now);
          // The renderer itself updates every RAF. Rich diagnostics are opted
          // in by the regression URL; ordinary play keeps only the small
          // display tick at a settled cadence instead of serializing the full
          // unit set each frame.
          const diagnosticInterval=richDiagnostics&&alpha<1?16:100;
          if(now-lastDiagnostic>=diagnosticInterval||alpha===1&&settled!==motion.current.revision||!isPlaying.current){
            canvas.dataset.displayTick=String(motion.current.tick(now));
            if(richDiagnostics)canvas.dataset.acceptedTick=String(current.current!.run.clock.tick);
            if(richDiagnostics){canvas.dataset.motionRevision=String(motion.current.revision);canvas.dataset.displayPositions=JSON.stringify({armies:[...frame.armies],fleets:[...frame.fleets]});canvas.dataset.displayUnits=JSON.stringify(map.unitPositions());}
            lastDiagnostic=now;
          }
          renderer.refresh();settled=alpha===1?motion.current.revision:-1;
        }
        raf=requestAnimationFrame(animate);
      }catch(e){displayFailed(e);}};
      cleanup=()=>{cancelAnimationFrame(raf);observer.disconnect();canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',cancel);canvas.removeEventListener('wheel',wheel);};
      observer.observe(element);paint.current();if(!failed){setRenderFault('');raf=requestAnimationFrame(animate);}
    }).catch(e=>{if(!disposed)displayFailed(e);});
    return()=>{lastView.current={id:runId,camera:view.camera,viewport:view.viewport};disposed=true;displayReady.current=false;cleanup();paint.current=()=>{};mapControl.current=null;combatOverlay.dispose();renderer.destroy();map.dispose();};
  },[runId,rendererEpoch,terrainGrid]);
  useEffect(()=>{paint.current();},[snapshot,nationId,cityId,force,mapMode,militaryPreview]);
  const choice=(i:number):CultureChoice47=>{const c=culture47(enabled[i%enabled.length]??'chinese');return choices['n-'+i]&&enabled.includes(choices['n-'+i].cultureId)?choices['n-'+i]:{cultureId:c.id,religionId:c.suggestedReligion,polity:c.suggestedPolity};};
  const setChoice=(i:number,patch:Partial<CultureChoice47>)=>setChoices(old=>({...old,['n-'+i]:{...choice(i),...patch}}));
  const r=snapshot?.run;
  return <main ref={appRoot} className="c47-app" data-testid="culture47-app" data-day={r?.world.day} data-tick={r?.clock.tick} data-advancing={advancing}>
    <div className="c47-map" ref={host}/>
    {renderFault&&<div className="c47-render-recovery" role="alert"><span>{renderFault}</span><button onClick={()=>{setRenderFault('');setRendererEpoch(n=>n+1);}}>重新显示地图</button></div>}
    <header className="c47-bar"><button aria-label="返回绘图" disabled={busy} onClick={requestClose}><PlayIcon name="back"/></button><div><strong>列国纪</strong><small>{r?'真实文化世界':'创建文明'}</small></div>{r&&<><CultureCalendar47 worldId={r.id} startDate={r.life.startDate} tick={()=>motion.current.tick(performance.now())}/><button aria-label="切换地形地图" title="政区 / 地形" aria-pressed={mapMode==='terrain'} onClick={()=>setMapMode(m=>m==='terrain'?'political':'terrain')}><PlayIcon name="layers"/></button><button aria-label="菜单选项" title="菜单选项" aria-pressed={menu!==null} onClick={()=>setMenu(m=>m?null:'menu')}><PlayIcon name="more"/></button><button aria-label="AI全局配置" title="AI全局配置" aria-pressed={aiGlobalOpen} onClick={()=>setAIGlobalOpen(v=>!v)}><PlayIcon name="settings"/></button><button aria-label="编辑国家" title="编辑国家（暂停）" aria-pressed={territoryNation!==null} disabled={busy||locked} onClick={()=>{if(territoryNation!==null){setTerritoryNation(null);return;}setPlaying(false);setMilitary(false);setTargetMode(null);setPanel(null);const alive=r.world.nations.find(n=>n.id===nationId&&r.world.provinces.some(p=>p.controller===n.id))??r.world.nations.find(n=>r.world.provinces.some(p=>p.controller===n.id))!;setTerritoryNation(alive.id);setNotice('编辑国家：已暂停。点击地图，把行省划入所选国家。');}}><PlayIcon name="edit"/></button><button aria-label="军事模式" title="军队与舰队" aria-pressed={military} onClick={()=>{setTerritoryNation(null);setMilitary(v=>!v);setTargetMode(null);setPanel(military?null:'military');}}><PlayIcon name="locate"/></button><button aria-label="保存文化世界" disabled={busy||locked} onClick={()=>void save()}><PlayIcon name="save"/>{lastSaved.current!==snapshot.journal.actions.length&&<i className="c47-unsaved"/>}</button></>}</header>
    {leaving&&<div className="c47-exit" role="dialog" aria-modal="true" aria-label="保存后离开"><h2>保留这个世界？</h2><p>尚有未保存的时间或编辑。</p><button disabled={busy||locked} onClick={()=>void save(true)}>保存并返回</button><button disabled={busy} onClick={onClose}>放弃未保存进度</button><button disabled={busy} onClick={()=>setLeaving(false)}>继续查看</button></div>}
    {notice&&<div className="c47-notice" role="status">{notice}</div>}{(storageReading||busy)&&<button className="c47-cancel-replay" onClick={()=>{queued.current=null;resumeAfterRecovery.current=false;setPlaying(false);if(storageReading)storageAbort.current?.abort();else operation.current?.abort();}}>取消处理</button>}
    {menu&&<CultureMenu47 key={menu} busy={busy||storageReading} hasWorld={!!r} unsaved={!!snapshot&&lastSaved.current!==snapshot.journal.actions.length} initial={menu==='load'?'load':undefined} config={config} onConfig={setConfig} onSaveNamed={name=>saveNamed(name)} onLoadNamed={loadNamed} onExportImage={exportMapImage} onExportHistory={exportHistory} onQuit={()=>{setMenu(null);requestClose();}} onClose={()=>setMenu(null)}/>}
    {showPerf&&<PerfOverlay47 root={appRoot}/>}
    {autoSavePrompt&&<div className="c47-autosave" role="status">{autoSavePrompt==='saving'?'正在自动保存':<><b>{autoSavePrompt.countdown}秒</b>后将自动保存，按 ESC 取消</>}</div>}
    {!r&&<section className="c47-setup"><span className="c47-kicker">文化 · 信仰 · 国家</span><h1>让文明从你的地图诞生</h1><p>为国家选择真实文化，独立设定信仰与政体。名字从同一种文化里生长。</p>{entryNotice&&<p className="c47-entry-note" role="note">{entryNotice}</p>}
      <div className="c47-segment" role="group" aria-label="国号与城市命名模式">{([['culture-generated','文化生成'],['historical-names','历史名称']] as const).map(([v,label])=><button key={v} aria-pressed={mode===v} onClick={()=>{setMode(v);}}>{label}</button>)}</div><small>{mode==='historical-names'?'使用中文历史国号和真实地名；名称用完可同名，480 座城市均可创建。':'使用中文译写的文化名称；每种文化可生成至少 512 个不同城名。'} 人物均按文化生成，不拼接历史人物家谱。</small>
      <div className="c47-counts"><label>国家<select aria-label="国家数量" value={count} onChange={e=>{setLayout(null);setCount(Number(e.target.value));}}>{[...new Set([2,3,4,6,8,12,16,24,count])].sort((a,b)=>a-b).map(n=><option key={n}>{n}</option>)}</select></label><label>城市<select aria-label="城市数量" value={cityCount} onChange={e=>{setLayout(null);setCityCount(Number(e.target.value));}}>{[24,60,120,240,480].map(n=><option key={n}>{n}</option>)}</select></label></div>
      <details className="c47-layout-details" open={layoutOpen} onToggle={e=>setLayoutOpen(e.currentTarget.open)}><summary>编辑国家与领土{layout?' · 已自定义':''}</summary>{layoutOpen&&<CultureLayoutEditor47 terrain={terrain} cityCount={cityCount} count={count} layout={layout} onChange={next=>{setLayout(next);if(next)setCount(next.seeds.length);}}/>}</details>
      <fieldset><legend>启用文化</legend><div className="c47-cultures">{CULTURE_IDS47.map(id=><label key={id} className={enabled.includes(id)?'is-selected':''}><input type="checkbox" aria-label={`文化：${CULTURES47[id].label}`} checked={enabled.includes(id)} onChange={e=>setEnabled(old=>e.target.checked?[...old,id]:old.filter(c=>c!==id))}/>{CULTURES47[id].label}</label>)}</div></fieldset>
      <details className="c47-nation-setup"><summary>逐国配置文化、宗教与政体</summary>{Array.from({length:count},(_,i)=>{const c=choice(i);return <div className="c47-choice" key={i}><strong>国家 {i+1}</strong><select aria-label={`国家${i+1}文化`} value={c.cultureId} onChange={e=>{const n=culture47(e.target.value);setChoice(i,{cultureId:n.id,religionId:n.suggestedReligion,polity:n.suggestedPolity});}}>{enabled.map(id=><option value={id} key={id}>{CULTURES47[id].label}</option>)}</select><select aria-label={`国家${i+1}宗教`} value={c.religionId} onChange={e=>setChoice(i,{religionId:e.target.value as ReligionId47})}>{Object.entries(RELIGIONS47).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select><select aria-label={`国家${i+1}政体`} value={c.polity} onChange={e=>setChoice(i,{polity:e.target.value as NativePolity})}>{POLITIES47.map(p=><option key={p} value={p}>{polityLabels[p]}</option>)}</select></div>;})}</details>
      <label className="c47-war"><input type="checkbox" checked={war} onChange={e=>setWar(e.target.checked)}/>战乱开局</label>
      <button className="c47-primary" disabled={busy||storageReading||!enabled.length} onClick={()=>void send({type:'create',opening:{terrain,count,cityCount,relations:war?'war':'peace',settlementAlgorithm:SETTLEMENT47_ALGORITHM,families:'original',...(layout?{layout}:{}),setup:{mode,enabled,nations:Object.fromEntries(Array.from({length:count},(_,i)=>['n-'+i,choice(i)]))}}})}>{busy?'正在建立文明…':'从当前地图创建文化世界'}</button>
      {locked&&!storageReading&&<button onClick={()=>setStorageAttempt(n=>n+1)}>重新读取存档</button>}
      {saved&&<button disabled={busy} onClick={()=>void send({type:'load',journal:saved.journal})}>{busy?'正在恢复文化世界…':'继续文化世界'}{saved.recovered?'（已找到有效备份）':''}</button>}
      <button disabled={busy||storageReading} onClick={()=>setMenu('load')}>加载游戏</button>
      <details className="c47-scope"><summary>本次可试玩的范围</summary><p>原作地图与文化、国家与城市、自主外交与战争、行省叛乱、原作家族（领地、婚育、继承、家族叛乱与内战）已接入。只支持本版本创建的世界，旧版本存档不再读取。</p></details>
    </section>}
    {r&&<>
      {[CULTURE47_CONTINUATION_SOURCE,CULTURE47_RETIREMENT_SOURCE].includes(snapshot.journal.engine)&&<section className="c47-continuation" aria-label="安全续玩"><span>升级补军规则 · 副本保留全部前史，独立保存</span><button disabled={busy||advancing||locked||storageReading} onClick={()=>void continueLongPlay()}>建立续玩副本</button></section>}
      <CultureNews47 displayTick={()=>motion.current.tick(performance.now())} key={r.id} run={r} open={id=>{setHistoryEpoch(n=>n+1);setHistoryFocus(id);setPanel('history');}}/>
      <div className="c47-nations" aria-label="国家列表">{r.world.nations.map(n=><button key={n.id} aria-pressed={nationId===n.id&&panel==='nation'} onClick={()=>{setNationId(n.id);setCityId(null);setPanel('nation');}}><i style={{background:n.color}}/>{n.name}</button>)}</div>
      <select className="c47-view-select" aria-label="地图视图" title="地图视图（数字键1—6）" value={colorView} onChange={e=>{const v=COLOR_VIEWS47.find(x=>x.id===e.target.value)!;setColorView(v.id);setNotice(v.label);}}>{COLOR_VIEWS47.map(v=><option key={v.id} value={v.id} disabled={!v.available}>{v.key} · {v.label}{v.available?'':'（尚未还原）'}</option>)}</select>
      <div className="c47-zoom"><button aria-label="放大地图" onClick={()=>mapControl.current?.zoom(1.6)}><PlayIcon name="plus"/></button><button aria-label="缩小地图" onClick={()=>mapControl.current?.zoom(1/1.6)}><PlayIcon name="minus"/></button><button aria-label="显示全图" onClick={()=>mapControl.current?.fit()}><PlayIcon name="fit"/></button></div>
      {panel&&<aside ref={panelScroll} className={`c47-panel${panelExpanded?' is-expanded':''}`} aria-label={panel==='nation'?'文化与国家详情':panel==='military'?'军队与舰队':panel==='province'?'行省详情':'大事记'}><button className="c47-sheet-size" aria-label={panelExpanded?'收起为半屏':'展开详情面板'} aria-expanded={panelExpanded} onClick={()=>setPanelExpanded(v=>!v)}><span aria-hidden="true">{panelExpanded?'⌄':'⌃'}</span></button><button className="c47-dismiss" aria-label="收起详情" onClick={()=>setPanel(null)}>×</button>{panel==='province'&&provinceId?<CultureProvince47 key={r.id+'/'+provinceId} run={r} provinceId={provinceId} ports={portProvinces} busy={busy} onState={id=>{setNationId(id);setCityId(null);setPanel('nation');}} onFamily={id=>{setNationId(id);setCityId(null);setPanel('nation');}} onEdit={edit=>{setPlaying(false);act({kind:'province',edit,expected:politicalStamp47(r)});}} onRebel={()=>{setPlaying(false);act({kind:'rebellion',provinceId,expected:politicalStamp47(r)});}}/>:panel==='nation'?<><NationIdentity key={r.id+'/'+nationId} run={r} id={nationId} cityId={cityId} busy={busy||advancing} originalEngine={snapshot.journal.engine!==__CULTURE47_ENGINE__} familyCapable={[__CULTURE47_ENGINE__,'fe7a64ad764f776b80547e14a4bcb0f2b005ca65a9b9f63555b78ba42058e5cc'].includes(snapshot.journal.engine)} act={act} pause={()=>setPlaying(false)} diplomacy={<><CultureNationActions47 key={r.id+'/'+nationId+'/actions'} run={r} nationId={nationId} busy={busy} pick={pick?.nationId===nationId&&pick.kind!=='draw'?pick.kind:null} onPick={kind=>{if(kind){setPick({kind,nationId});setPanel(null);setNotice(PICK_TIPS47[kind]);}else setPick(null);}} onLeaveAlliance={()=>globalOrder({kind:'alliance',edit:{type:'leave',nationId}})} onRelease={()=>globalOrder({kind:'vassal',edit:{type:'release',vassalId:nationId}})} onAutoDiplomacy={enabled=>globalOrder({kind:'diplomacy',edit:{scope:'nation',nationId,enabled}})}/><CultureDiplomacy47 key={r.id+'/'+nationId+'/diplomacy'} run={r} id={nationId} activeSiegeIds={snapshot.frame.activeSieges??[]} busy={busy} preview={politicalPreview} sequence={snapshot.journal.actions.length} onCancel={()=>{previewEpoch.current.political++;setPoliticalPreview(null);}} onPreview={action=>{setPlaying(false);void send({type:'political-preview',action});}} onConfirm={()=>{if(politicalPreview)void send({type:'action',sequence:politicalPreview.sequence,action:{kind:'politics',action:politicalPreview.action,expected:politicalPreview.expected}});}}/></>}/></>:panel==='military'?<CultureMilitary47 snapshot={snapshot} selected={force} busy={busy} preview={militaryPreview} choose={chooseForce} target={mode=>{setPlaying(false);setMilitaryPreview(null);setTargetMode(mode);setPanel(null);}} request={requestMilitary} cancel={()=>{previewEpoch.current.military++;setMilitaryPreview(null);setTargetMode(null);}} confirm={()=>{if(militaryPreview&&intentMatchesForce47(militaryPreview.intent,force))void send({type:'action',sequence:militaryPreview.sequence,action:{kind:'military',intent:militaryPreview.intent,expected:militaryPreview.preview.basedOn}});}}/>:<CultureHistory47 key={r.id+'/'+historyEpoch} run={r} focusId={historyFocus} selectNation={id=>{setNationId(id);setCityId(null);setPanel('nation');}}/>}</aside>}
      {targetMode&&<div className="c47-order-hint" role="status">{force?.kind==='fleet'?'点击海面或港口':'点击行军目的地'}<button aria-label="取消选择目标" onClick={()=>{setTargetMode(null);setPanel('military');}}>×</button></div>}
      {territoryNation!==null&&<section className="c47-territory" aria-label="编辑国家" data-owned={r.world.provinces.filter(p=>p.controller===territoryNation).length}><strong>编辑国家</strong><label>领土归属<select aria-label="编辑国家：目标国家" value={territoryNation} onChange={e=>setTerritoryNation(e.target.value)}>{r.world.nations.map(n=><option key={n.id} value={n.id}>{n.name}{r.world.provinces.some(p=>p.controller===n.id)?'':'（已覆亡）'}</option>)}</select></label><small>{PICK_TIPS47.draw}；法理与实控同时转移，可在大事记查到。</small><button onClick={()=>setTerritoryNation(null)}>完成编辑</button></section>}
      {pick&&pick.kind!=='draw'&&<section className="c47-territory" aria-label="国家行为选择" data-kind={pick.kind} data-owned={r.world.provinces.filter(p=>p.controller===pick.nationId).length}><strong>{r.world.nations.find(n=>n.id===pick.nationId)?.name}</strong><small>{PICK_TIPS47[pick.kind]}</small><button onClick={()=>{setNationId(pick.nationId);setPick(null);setPanel('nation');}}>{pick.kind==='expand'?'完成':'取消'}</button></section>}
      {aiGlobalOpen&&<CultureAIGlobal47 run={r} busy={busy} onOrder={globalOrder} onClose={()=>setAIGlobalOpen(false)}/>}
      <div className="c47-playback-status" role="status" aria-live="off">{busy?'正在处理…':advancing?'正在推演…':playing?'推演中':'已暂停'}{playing&&actualRate!==null&&(' · 实际 '+actualRate.toFixed(1)+' 日/秒')}</div><footer className="c47-controls"><button aria-label={playing||(recovering&&resumeAfterRecovery.current)?'暂停时间':'继续时间'} title={playing?'暂停':'继续'} aria-pressed={playing} onClick={()=>void resume()}><PlayIcon name={playing?'pause':'play'}/></button><button aria-label="切换推演速度" title="推演速度" onClick={()=>setSpeed(v=>CULTURE47_SPEEDS[(CULTURE47_SPEEDS.indexOf(v as typeof CULTURE47_SPEEDS[number])+1)%CULTURE47_SPEEDS.length])}>{culture47SpeedLabel(speed)}</button><button aria-label="推进一天" title="推进一天" disabled={busy} onClick={()=>act({kind:'advance',ticks:120})}><PlayIcon name="step"/></button><button aria-label="查看大事记" title="大事记" aria-pressed={panel==='history'} onClick={()=>{setHistoryEpoch(n=>n+1);setHistoryFocus(null);setPanel(panel==='history'?null:'history');}}><PlayIcon name="book"/></button></footer>
    </>}
  </main>;
}
