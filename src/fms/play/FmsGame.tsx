import { useEffect, useRef, useState } from 'react';
import { playRules } from './runtime';
import type { MilitaryAction } from './military-actions';
import { militaryRules } from './military-registry';
import { militaryCapacity } from './mobilization';
import { dayInterval } from './tempo';
import { unitProfile } from './military-profile';
import icons from './military-icons.json';
import {AttackPanel} from './AttackPanel';
import {previewBattle,type BattleAction} from './battle';
import { MilitaryPanel } from './MilitaryPanel';
import type { Order, StateAction } from '../../sim/types';
import { fitCamera, screenToWorld, resizeCamera, zoomCameraAt, type AtlasCamera } from '../../world/camera';
import type { FmsDocument } from '../model';
import { FmsRenderer } from '../renderer';
import { FmsGestures } from '../gestures';
import { PlayClient } from './client';
import { PlayMap } from './map';
import { provinceAt, type FmsRun } from './world';
import { loadRun, saveRun, runStore, type StoreKey, type SavedRun } from './storage';
import type { PlayCommand,PlayVersion } from './session';
import { armyPosition, focusMapPoint } from './navigation';
import type { EventLocation } from './observation';
import { EventPanel } from './EventPanel';
import { namedWorld } from './names';
import { LocalityPanel } from './LocalityPanel';
import { nationColor, type PoliticalView } from './politics';
import './play.css';
import { NavalPanel } from './NavalPanel';
import { fleetPosition, type NavalAction } from './navy';
import { MovementClock } from './motion';
import { startDayLoop,startRealtimeLoop } from './playback';
import {TICKS_PER_DAY} from './clock';
import {graphFor,navalRules} from './naval-rules';
import { mobilizationFingerprint } from './military-registry';

type Confirmation = { command: Extract<PlayCommand, { type: 'order' | 'action' | 'military' | 'naval' | 'battle' }>; title: string; reason: string; details: string[]; valid: boolean };
const errorText = (e: unknown) => e instanceof Error ? e.message : '操作失败，已保留当前世界。';
const number = (n: number) => Math.round(n).toLocaleString('zh-CN');
const runStamp=(r:FmsRun)=>`${r.id}/${r.world.day}/${r.world.nextEventId}/${(r.version===4||r.version===5)?r.clock.tick:0}`;
export default function FmsGame({ terrain, onClose }: { terrain: FmsDocument; onClose: () => void }) {
  const [run, setRun] = useState<FmsRun | null>(null), runRef = useRef<FmsRun | null>(null);
  const [saves,setSaves]=useState<Partial<Record<StoreKey,SavedRun>>>({}),revision=useRef<Record<StoreKey,number|null>>({1:null,2:null,3:null,4:null,5:null,6:null});
  const [storeLocks,setStoreLocks]=useState<Partial<Record<StoreKey,string>>>({});
  const savedStamp=useRef('');
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [notice, setNotice] = useState('正在检查本机推演进度…'), [count, setCount] = useState(6), [war, setWar] = useState(true);
  const [playing, setPlaying] = useState(false), playingRef = useRef(false), [speed, setSpeed] = useState(1);
  const [mapMode,setMapMode]=useState<PoliticalView>('political'),mapModeRef=useRef(mapMode);mapModeRef.current=mapMode;
  const [legend,setLegend]=useState(false);
  const motion=useRef(new MovementClock()),speedRef=useRef(speed);speedRef.current=speed;
  const [fleetId,setFleetId]=useState<string|null>(null),[seaPreview,setSeaPreview]=useState<number[]>([]);
  const navalRef=useRef({fleetId,nationId:'',seaPreview});
  const [pauseOnBattle,setPauseOnBattle]=useState(false),[eventEpoch,setEventEpoch]=useState(0);
  const [targeting,setTargeting]=useState(false),targetingRef=useRef(false);targetingRef.current=targeting;
  const [routeTargets,setRouteTargets]=useState<string[]>([]),[attackPreview,setAttackPreview]=useState<string[]>([]),attackRef=useRef(attackPreview);attackRef.current=attackPreview;
  const [targetId,setTargetId]=useState<string|null>(null),[armyChoices,setArmyChoices]=useState<string[]>([]);
  const [nationId, setNationId] = useState(''), [armyId, setArmyId] = useState<string | null>(null), [provinceId, setProvinceId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'nation' | 'army' | 'navy' | 'events' | null>(null), [confirmation, setConfirmation] = useState<Confirmation | null>(null), [exit, setExit] = useState(false);
  navalRef.current={fleetId,nationId,seaPreview};
  const modalRef=useRef(false);modalRef.current=!!confirmation||exit||armyChoices.length>0;
  const host = useRef<HTMLDivElement>(null), client = useRef<PlayClient | null>(null), alive = useRef(true);
  const selected = useRef({ provinceId, armyId }); selected.current = { provinceId, armyId };
  const view = useRef<{ renderer: FmsRenderer; map: PlayMap; camera: AtlasCamera; viewport: { width: number; height: number }; terrain: FmsDocument } | null>(null);
  const paint = () => { const v = view.current, r = runRef.current; if (v && r) { v.map.draw(namedWorld(r.world), r.scale, v.camera.scale, selected.current.provinceId, selected.current.armyId,mapModeRef.current,r.version!==1?r.units:undefined,v,(r.version===3||(r.version===4||r.version===5))?{navy:r.navy,graph:graphFor(r),selected:navalRef.current.fleetId,nationId:navalRef.current.nationId,preview:navalRef.current.seaPreview}:undefined,motion.current.frame(performance.now()),r.version===5?{state:r.battles,preview:attackRef.current}:undefined);v.renderer.canvas.dataset.battles=JSON.stringify(v.map.battlePositions()); v.renderer.canvas.dataset.countryLabels=JSON.stringify(v.map.labelPositions());v.renderer.canvas.dataset.capitalMarkers=JSON.stringify(v.map.capitalPositions());v.renderer.canvas.dataset.unitPositions=JSON.stringify(v.map.unitPositions()); v.renderer.refresh(); } };
  function pause() { motion.current.setRunning(false,performance.now());playingRef.current = false; setPlaying(false); }
  useEffect(() => {
    alive.current = true; const worker = new PlayClient(); client.current = worker;
    void Promise.allSettled([loadRun(indexedDB,1),loadRun(indexedDB,2),loadRun(indexedDB,3),loadRun(indexedDB,4),loadRun(indexedDB,5),loadRun(indexedDB,6)]).then(results=>{
      if(!alive.current)return;const next:Partial<Record<StoreKey,SavedRun>>={},locks:Partial<Record<StoreKey,string>>={};
      results.forEach((result,i)=>{const version=(i+1) as StoreKey;if(result.status==='fulfilled'){if(result.value)next[version]=result.value;revision.current[version]=result.value?.revision??null;}else locks[version]=errorText(result.reason);});
      setSaves(next);setStoreLocks(locks);setReady(true);setNotice(Object.keys(next).length?'选择继续原世界，或从你的地图开新局。':'从你的地图创建各国，时间开始后它们会自主发展。');
    });
    const hide = () => { if (document.hidden) pause(); };
    const unload=(event:BeforeUnloadEvent)=>{const r=runRef.current;if(r&&savedStamp.current!==runStamp(r)){event.preventDefault();event.returnValue='';}};
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('beforeunload',unload);
    return () => { alive.current = false; worker.close(); document.removeEventListener('visibilitychange', hide);window.removeEventListener('beforeunload',unload); };
  }, []);
  async function command(cmd: PlayCommand) {
    if (busyRef.current || !client.current || ((cmd.type==='step'||cmd.type==='tick')&&modalRef.current)) return;
    const playbackStep=cmd.type==='step'&&playingRef.current;
    busyRef.current = true; setBusy(true);
    try {
      const result = await client.current.send(cmd); if (!alive.current) return;
      const next = result.run!,previous=runRef.current,now=performance.now();
      if((next.version===4||next.version===5))motion.current.reset(next,now);
      else if(cmd.type==='step'&&previous){motion.current.start(previous,next,now,playbackStep?dayInterval(speedRef.current):350);if(playbackStep&&!playingRef.current)motion.current.setRunning(false,now);}
      else if(cmd.type==='create'||cmd.type==='load'||cmd.type==='copy')motion.current.reset(next,now);
      else motion.current.reconcile(next,now);
      runRef.current = next; setRun(next);
      if(cmd.type==='load')savedStamp.current=runStamp(next);
      if (cmd.type==='create'||cmd.type==='load'||cmd.type==='copy') { setNationId(result.world.nations[0].id); setNotice('世界已就绪。开始时间看海，点选国家可干预外交与军队。'); }
      const selectedArmy=next.world.armies.find(a=>a.id===selected.current.armyId);if(selectedArmy?.status==='destroyed'){setArmyId(null);setTargetId(null);setTargeting(false);}
      if(result.halted){motion.current.reset(next,performance.now());pause();setPanel('events');setEventEpoch(n=>n+1);setNotice(`第 ${result.world.day} 日发生交战，已在当前模拟时刻暂停：${namedWorld(result.world).events.find(e=>e.id===result.halted!.id)!.text}`);}
      const sameBattles=next.version!==5||(previous?.version===5&&next.battles.engagements.map(e=>`${e.id}/${e.armies.join()}`).join('|')===previous.battles.engagements.map(e=>`${e.id}/${e.armies.join()}`).join('|'));
      if(sameBattles&&cmd.type==='tick'&&previous&&previous.world.nextEventId===next.world.nextEventId&&previous.world.day===next.world.day&&view.current){const v=view.current;v.map.updateUnits(motion.current.frame(now));if(next.version===5){v.map.updateBattles(next.world,next.battles);v.renderer.canvas.dataset.battles=JSON.stringify(v.map.battlePositions());}v.renderer.canvas.dataset.unitPositions=JSON.stringify(v.map.unitPositions());v.renderer.refresh();}else paint();
      if(view.current&&(next.version===4||next.version===5))view.current.renderer.canvas.dataset.simTick=String(next.clock.tick);
    } catch (e) { if (alive.current) { pause(); setNotice(errorText(e)); } }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => {
    if(!playing)return;
    if(runRef.current?.version===4||runRef.current?.version===5)return startRealtimeLoop({playing:()=>playingRef.current,blocked:()=>busyRef.current||modalRef.current,tickMillis:dayInterval(speed)/TICKS_PER_DAY,step:ticks=>{const r=runRef.current!;return command({type:'tick',ticks,expected:{day:r.world.day,nextEventId:r.world.nextEventId,tick:(r.version===4||r.version===5)?r.clock.tick:undefined},pauseOnBattle});}});
    return startDayLoop({playing:()=>playingRef.current,blocked:()=>busyRef.current||modalRef.current,remaining:()=>motion.current.remaining(performance.now()),step:()=>command({type:'step',days:1,pauseOnBattle})});
  },[playing,speed,pauseOnBattle]);
  useEffect(()=>{
    let raf=0,wasMoving=false,frames=0,lastDiagnostic=0;
    const tick=(now:number)=>{const v=view.current,moving=motion.current.active(now);
      if(v&&(moving||wasMoving)){const frame=motion.current.frame(now);v.map.updateUnits(frame);v.renderer.refresh();frames++;
        if(now-lastDiagnostic>150||!moving){v.renderer.canvas.dataset.motionFrame=String(frames);v.renderer.canvas.dataset.unitPositions=JSON.stringify(v.map.unitPositions());v.renderer.canvas.dataset.motionAlpha=String(frame.alpha);lastDiagnostic=now;}
      }
      wasMoving=moving;raf=requestAnimationFrame(tick);
    };raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
  },[]);
  const runId = run?.id;
  useEffect(() => {
    if (!runId || !host.current || !runRef.current) return;
    const element = host.current, source = runRef.current.terrain, renderer = new FmsRenderer(() => {}, e => { if (alive.current) { pause(); setNotice(errorText(e)); } }), map = new PlayMap(()=>paint()); let disposed = false;
    const viewport = { width: element.clientWidth, height: element.clientHeight }, camera = fitCamera(source, viewport);
    const v = { renderer, map, viewport, camera, terrain: source }; let cleanup = () => {};
    void renderer.init(element).then(() => {
      if (disposed) return;
      view.current = v; renderer.setDocument(source); renderer.setTerrainDisplay('biome'); renderer.attachGameplayLayer(map.layer); renderer.setCamera(camera); paint();
      renderer.canvas.setAttribute('aria-label', '诸国推演地图'); renderer.canvas.dataset.testid = 'fms-play-canvas';
      const setCamera = (next: AtlasCamera) => { v.camera = next; renderer.setCamera(next); paint(); };
      const gestures = new FmsGestures({ camera: () => v.camera, setCamera, world: () => source, viewport: () => v.viewport, begin: () => {}, move: () => {}, commit: () => {}, cancel: () => {} });
      const canvas = renderer.canvas; let tap: { id: number; x: number; y: number } | null = null; const downIds = new Set<number>();
      const point = (e: PointerEvent | WheelEvent) => { const b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
      const down = (e: PointerEvent) => { if (e.button !== 0) return; const p = point(e); downIds.add(e.pointerId); tap = downIds.size === 1 ? { id: e.pointerId, ...p } : null; canvas.setPointerCapture(e.pointerId); gestures.down(e.pointerId, p, false); };
      const move = (e: PointerEvent) => { const p = point(e); if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) > 5) tap = null; gestures.move(e.pointerId, p); };
      const up = (e: PointerEvent) => {
        const p = point(e), candidate = tap; gestures.up(e.pointerId, p); downIds.delete(e.pointerId); tap = null;
        if (candidate?.id !== e.pointerId || downIds.size || !runRef.current) return;
        const r = runRef.current;
        // Only the explicit target mode turns a map tap into a destination.
        if(!targetingRef.current){const hits=v.map.pickUnits(p),hit=hits[0];if(hit){pause();if(hit.kind==='fleet')selectFleet(hit.id,false);else{const ids=[...new Set(hits.filter(h=>h.kind==='army').flatMap(h=>h.ids))];if(ids.length===1)selectArmy(ids[0],false);else setArmyChoices(ids);}return;}}
        const coordinate = screenToWorld(v.camera, p), id = provinceAt(r.world, { x: coordinate.x * r.scale, y: coordinate.y * r.scale });
        if(targetingRef.current){if(!id){setNotice('海域不能作为陆军目标，请选择陆地辖区。');return;}setTargetId(id);setTargeting(false);setPanel('army');setNotice('目标已选中，预览后确认命令。');}
        else if(id){setArmyId(null);setTargetId(null);setNationId(r.world.provinces.find(p=>p.id===id)!.controller);setPanel('nation');}
        setProvinceId(id);
      };
      const cancel = () => { tap = null; downIds.clear(); gestures.interrupt(); };
      const wheel = (e: WheelEvent) => { e.preventDefault(); gestures.wheel(point(e), e.deltaY); };
      canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('lostpointercapture', cancel); canvas.addEventListener('wheel', wheel, { passive: false });
      const observer = new ResizeObserver(() => { const next = { width: element.clientWidth, height: element.clientHeight }; v.camera = resizeCamera(v.camera, v.viewport, next, source); v.viewport = next; renderer.resize(next.width, next.height); renderer.setCamera(v.camera); paint(); }); observer.observe(element);
      cleanup = () => { observer.disconnect(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('lostpointercapture', cancel); canvas.removeEventListener('wheel', wheel); };
    }).catch(e => { if (!disposed) { pause(); setNotice(errorText(e)); } });
    return () => { disposed = true; cleanup(); view.current = null; renderer.destroy(); map.dispose(); };
    // Terrain is immutable for each run; daily simulation never rebuilds it.
  }, [runId]);
  useEffect(() => { paint(); }, [provinceId, armyId,mapMode,fleetId,seaPreview,nationId,attackPreview]);
  async function save() {
    if (busyRef.current || !runRef.current || locked) return;
    pause(); busyRef.current = true; setBusy(true);
    try { const value = runRef.current, next = await saveRun(value, revision.current[runStore(value)]); if (alive.current) { revision.current[runStore(value)] = next;savedStamp.current=runStamp(value); setSaves(old=>({...old,[runStore(value)]:{run:value,revision:next,recovered:false}})); setNotice(`已保存第 ${value.world.day} 日${(value.version===4||value.version===5)?`（日内 ${value.clock.tick%TICKS_PER_DAY}/${TICKS_PER_DAY}）`:""}，刷新后可继续这个世界。`); } }
    catch (e) { if (alive.current) { setNotice(errorText(e)); setStoreLocks(old=>({...old,[runStore(runRef.current!)]:errorText(e)})); } }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  const world = run ? namedWorld(run.world) : undefined, nation = world?.nations.find(n => n.id === nationId), army = world?.armies.find(a => a.id === armyId), province = world?.provinces.find(p => p.id === targetId);
  const rules=run?playRules(run):undefined;
  const report=world?rules!.nationReports(world).find(n=>n.nationId===nationId):undefined;
  const policyOptions=rules?.policyOptions??[];
  const isAtWar=rules?.isAtWar??(()=>false);
  const locked=!!storeLocks[run?runStore(run):6];
  const unit=run&&run.version!==1&&army?unitProfile(run.units[army.id]):undefined;
  const expected = (): PlayVersion => ({ day: world!.day, nextEventId: world!.nextEventId,...((run?.version===4||run?.version===5)?{tick:run.clock.tick}:{}) });
  function action(value: StateAction) { if (!world || busy) return; pause(); const p = rules!.previewStateAction(world, value); setConfirmation({ command: { type: 'action', action: value, expected: expected() }, title: value.type === 'policy' ? '调整国策' : value.type === 'declare-war' ? '宣战' : '讲和', valid: p.valid, reason: p.reason, details: [...p.changes, ...p.warnings] }); }
  function military(action:MilitaryAction){if(!world||busy||!run||run.version===1)return;pause();const p=militaryRules(run.engine,run.units).previewMilitaryAction(world,action);setConfirmation({command:{type:'military',action,expected:expected()},title:action.type==='recruit'?'征募军团':'迁移首都',valid:p.valid,reason:p.reason,details:[...p.changes,...p.warnings]});}
  function battle(action:BattleAction){if(run?.version!==5||busy)return;pause();const p=previewBattle(run.world,run.battles,run.units,action);setAttackPreview(p.route);setConfirmation({command:{type:'battle',action,expected:expected()},title:action.type==='withdraw'?'脱离交锋':'沿线进攻',valid:p.valid,reason:p.reason,details:p.details});}
  function naval(action:NavalAction){if(!run||(run.version!==3&&run.version!==4&&run.version!==5)||busy)return;pause();const p=navalRules(run).previewNaval(run.world,run.navy,graphFor(run),action);setSeaPreview(p.route);setConfirmation({command:{type:'naval',action,expected:expected()},title:action.type==='build-fleet'?'编成舰队':action.type==='sail'?'舰队出航':'自动巡航',valid:p.valid,reason:p.reason,details:p.details});}
  function selectFleet(id:string,center=true){const r=runRef.current;if((!r||(r.version!==3&&r.version!==4&&r.version!==5)))return;const f=r.navy.fleets.find(f=>f.id===id);if(!f){setFleetId(null);return;}pause();setTargeting(false);setTargetId(null);setArmyId(null);setFleetId(id);setNationId(f.nationId);setPanel('navy');if(center)focus(motion.current.frame(performance.now()).fleets.get(f.id)??fleetPosition(graphFor(r),f));setNotice('已选舰队；预览海路后确认出航。');}
  function order(kind: Order['kind']) { if (!world || !armyId || !targetId || busy) return; pause(); const order = { armyId, targetId, kind }, p = rules!.previewOrder(world, order); setConfirmation({ command: { type: 'order', order, expected: expected() }, title: kind === 'retreat' ? '撤退命令' : '行军命令', valid: p.valid, reason: p.reason, details: [`预计 ${p.days} 日 · 补给消耗 ${p.supplyCost}`, ...p.warnings] }); }
  function focus(point:{x:number;y:number},panelShown=true){const v=view.current,r=runRef.current;if(!v||!r)return;v.camera=focusMapPoint(v.camera,{x:point.x/r.scale,y:point.y/r.scale},r.terrain,v.viewport,panelShown);v.renderer.setCamera(v.camera);paint();}
  function selectArmy(id:string,center=true){const r=runRef.current,a=r?namedWorld(r.world).armies.find(a=>a.id===id&&a.status!=='destroyed'&&a.troops>0):undefined;if(!a||!r)return;pause();setTargeting(false);setTargetId(null);setFleetId(null);setRouteTargets([]);setArmyId(id);setNationId(a.nationId);setProvinceId(a.provinceId);setPanel('army');setArmyChoices([]);if(center)focus(motion.current.frame(performance.now()).armies.get(a.id)??armyPosition(r.world,a));setNotice(`已选 ${a.name}。选择目标前不会发出军令。`);}
  function locate(location:EventLocation){const r=runRef.current;if(!r)return;pause();setTargeting(false);if(location.kind==='army-current'){selectArmy(location.id);return;}const p=namedWorld(r.world).provinces.find(p=>p.id===location.id);if(!p)return;setProvinceId(p.id);focus(p.center);setNotice(`${location.label}：${p.name}。当前地图已高亮，时间暂停。`);}
  function zoom(factor: number) { const v = view.current; if (!v) return; v.camera = zoomCameraAt(v.camera, factor, { x: v.viewport.width / 2, y: v.viewport.height / 2 }, v.terrain, v.viewport); v.renderer.setCamera(v.camera); paint(); }
  return <section className="fms-play" data-testid="fms-play" data-day={world?.day ?? ''} data-run-id={run?.id ?? ''} data-map-mode={mapMode}>
    <div className="play-body" inert={!!confirmation||exit||armyChoices.length>0}>
    <div className="fms-play-map" ref={host} />
    <header className="play-header"><button onClick={() => { pause(); if (run) setExit(true); else onClose(); }} disabled={busy}>‹ 绘图</button><div><small>列国纪 · 诸国沙盒</small><strong>{world ? `第 ${world.day} 日${(run?.version===4||run?.version===5)?` · ${String(Math.floor(run.clock.tick%TICKS_PER_DAY*24/TICKS_PER_DAY)).padStart(2,'0')}:${String(Math.floor(run.clock.tick%TICKS_PER_DAY*1440/TICKS_PER_DAY)%60).padStart(2,'0')}`:''}` : '让世界开始生活'}</strong></div>{world && <button onClick={() => void save()} disabled={busy || locked}>保存进度</button>}</header>
    <p className="play-notice" role="status">{notice}</p>
    {targeting&&<div className="play-targeting"><strong>正在选择行军目标</strong><button onClick={()=>{setTargeting(false);setPanel('army');setNotice('已取消选择，没有发出军令。');}}>取消选目标</button></div>}
    {!run && <div className="play-start"><span className="play-eyebrow">从你的大陆出发</span><h1>群国并起</h1><p>自动划分陆地、建立首都与城市。观察各国发展，也可以随时干预国策、外交与军队。</p><label>国家数量 <select aria-label="国家数量" value={count} onChange={e => setCount(Number(e.target.value))}>{[2,3,4,5,6,7,8].map(n => <option key={n}>{n}</option>)}</select></label><label className="play-checkbox"><input type="checkbox" checked={war} onChange={e => setWar(e.target.checked)} />战乱开局 <small>各国从第一天起交战</small></label><button className="play-primary" disabled={!ready || busy || locked} onClick={() => void command({ type: 'create', terrain, count, relations: war ? 'war' : 'peace' })}>{busy ? '正在建立真实陆地区划…' : '从当前地图开新局'}</button>{([6,5,4,3,2,1] as const).map(version=>{const saved=saves[version];return <div key={version}>{storeLocks[version]&&<p role="alert">{version===1?'旧版':version===2?'兵种版':version===3?'整军版':version===4?'海军版':version===5?'日内版':'交锋版'}：{storeLocks[version]}</p>}{saved&&<><button disabled={busy} onClick={()=>void command({type:'load',run:saved.run})}>继续{version===1?'旧版':version===2?'兵种版':version===3?'整军版':version===4?'海军版':version===5?'日内版':'交锋版'}第 {saved.run.world.day} 日</button>{version!==6&&<button disabled={busy||!!storeLocks[6]} onClick={()=>void command({type:'copy',run:saved.run})}>创建交锋版副本</button>}</>}</div>;})}<small>旧世界继续按原规则运行。交锋版独立保存；创建副本保留原世界、陆军命令与现有舰队航线。</small><p className="play-muted">本版开放持续陆战、沿线进攻、五类陆军、整军补员、迁都、外交、舰队航行与巡航。海战、运输、完整政体、家族与信仰仍待接入。</p></div>}
    {world && <><div className="play-map-options"><div className="play-map-modes">{([['political','政区'],['terrain','地形']] as const).map(([value,label])=><button key={value} aria-pressed={mapMode===value} className={mapMode===value?'is-active':''} onClick={()=>setMapMode(value)}>{label}</button>)}<button aria-expanded={legend} onClick={()=>setLegend(!legend)}>国家图例</button></div>{legend&&<div className="play-legend">{world.nations.map(n=><button key={n.id} onClick={()=>{pause();setNationId(n.id);setArmyId(null);setTargetId(null);setTargeting(false);setPanel('nation');setLegend(false);const c=world.cities.find(c=>c.id===n.capitalId);if(c){setProvinceId(c.provinceId);focus(c.position);}}}><i style={{background:nationColor(n)}}/>{n.name}</button>)}<small>填色表示当前控制国 · 黑白双环为首都</small></div>}</div><aside className="play-zoom"><button aria-label="放大推演地图" onClick={() => zoom(1.6)}>＋</button><button aria-label="缩小推演地图" onClick={() => zoom(1/1.6)}>−</button><button onClick={() => { const v = view.current; if (v) { v.camera = fitCamera(v.terrain, v.viewport); v.renderer.setCamera(v.camera); paint(); } }}>全图</button></aside>
      <div className="play-controls"><div className="play-time"><button className="play-primary" disabled={(busy&&!playing) || !!confirmation || targeting} onClick={() => { const next = !playing; motion.current.setRunning(next,performance.now());playingRef.current = next; setPlaying(next); }}>{playing ? '暂停' : '开始时间'}</button><button disabled={busy || playing || !!confirmation || targeting} onClick={() => void command({ type: 'step', days: 1, pauseOnBattle })}>＋1日</button><select aria-label="推演速度" value={speed} onChange={e => {const value=Number(e.target.value);motion.current.setDuration(dayInterval(value),performance.now());setSpeed(value);}}><option value={0.5}>慢速 · 6秒/日</option><option value={1}>常速 · 3秒/日</option><option value={2}>快进 · 1.5秒/日</option><option value={4}>疾速 · 0.75秒/日</option></select></div><label className="play-autopause"><input type="checkbox" checked={pauseOnBattle} onChange={e=>setPauseOnBattle(e.target.checked)}/>遇交战暂停</label><nav>{([['nation','国家'],['army','军队'],['navy','海军'],['events','大事记']] as const).map(([id,title]) => <button className={panel === id ? 'is-active' : ''} key={id} onClick={() => {setTargeting(false);if(id!=='army'){setArmyId(null);setTargetId(null);}setPanel(panel === id ? null : id);}}>{title}</button>)}</nav></div>
      {panel && <aside className="play-panel"><div className="play-panel-title"><strong>{panel === 'events' ? '大事记与原因' : panel === 'army' ? '军队与命令' : panel==='navy'?'港口与舰队' : '国家与城市'}</strong><button aria-label="收起面板" onClick={() => {setTargeting(false);setPanel(null);}}>×</button></div>
        {panel === 'nation' && <>{provinceId&&<LocalityPanel world={world} id={provinceId} focus={focus} selectArmy={selectArmy}/>}<select aria-label="查看国家" value={nationId} onChange={e => {setNationId(e.target.value);setArmyId(null);setTargetId(null);setTargeting(false);const c=world.cities.find(c=>c.id===world.nations.find(n=>n.id===e.target.value)?.capitalId);if(c){setProvinceId(c.provinceId);focus(c.position);}}}>{world.nations.map(n => <option value={n.id} key={n.id}>{n.name}</option>)}</select>{nation && report && <><h2 className="play-nation-name"><i style={{background:nationColor(nation)}}/>{nation.name}</h2><button onClick={()=>{const c=world.cities.find(c=>c.id===nation.capitalId);if(c){setProvinceId(c.provinceId);focus(c.position);}}}>定位当前首都</button><details className="play-army-list"><summary>指挥本国军团（{report.armyCount} 支）</summary><div className="play-army-shortcuts">{world.armies.filter(a=>a.nationId===nation.id&&a.status!=='destroyed').map(a=><button key={a.id} onClick={()=>selectArmy(a.id)}>指挥{a.name}</button>)}</div></details><p>首都：{world.cities.find(c => c.id === nation.capitalId)?.name} · 实控 {report.territoryCount} 区</p><dl className="play-stats"><div><dt>人口</dt><dd>{number(report.population)}</dd></div><div><dt>粮储</dt><dd>{number(report.grain)}</dd></div><div><dt>下日粮食预测</dt><dd>{number(report.balancePerDay)}</dd></div><div><dt>军队</dt><dd>{report.armyCount} 支</dd></div></dl>{report.lastLedger && <p>第 {report.lastLedger.day} 日实际结粮 {number(report.lastLedger.closingGrain)}；饿亡 {number(report.lastLedger.starvationDeaths)}</p>}<label>国策 <select aria-label="国家政策" disabled={busy} value={report.priority} onChange={e => action({ type: 'policy', nationId, priority: e.target.value as 'civilian'|'balanced'|'military' })}>{policyOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>{report.lastDecision && <p className="play-muted">自主决策：{report.lastDecision.action}。{report.lastDecision.reason}</p>}{run&&run.version!==1&&(run.version===3||(run.version===4||run.version===5)||run.engine===mobilizationFingerprint)&&<p className="play-muster">常规军 {militaryCapacity(world,nation.id).active} / 目标 {militaryCapacity(world,nation.id).target} 支（领土上限 {militaryCapacity(world,nation.id).cap}）。第 {militaryCapacity(world,nation.id).nextDay} 日检查新编；驻守军每5日补员，人口或十日民粮不足会暂缓。<br/>和平与民生政策保留较小常备军，战时提高目标。</p>}<h3>外交</h3>{world.nations.filter(n => n.id !== nationId).map(other => <div className="play-row" key={other.id}><span className="play-nation-name"><i style={{background:nationColor(other)}}/>{other.name} · {isAtWar(world, nationId, other.id) ? '交战' : '和平'}</span><button disabled={busy} onClick={() => action({ type: isAtWar(world, nationId, other.id) ? 'make-peace' : 'declare-war', nationId, targetNationId: other.id })}>{isAtWar(world, nationId, other.id) ? '讲和' : '宣战'}</button></div>)}{run&&run.version!==1&&<MilitaryPanel key={nationId} world={world} nationId={nationId} busy={busy} act={military}/>}<h3>城市</h3>{world.cities.filter(c => world.provinces.find(p => p.id === c.provinceId)?.controller === nationId).map(c => <button className="play-city" key={c.id} onClick={() => { setProvinceId(c.provinceId);focus(c.position); }}>{c.id === nation.capitalId ? '◎ 首都 · ' : '· '}{c.name} · 城防 {c.fort}</button>)}</>}</>}
        {panel === 'army' && <><p>远景小旗合并附近同国部队，数字为军团数；放大查看兵种，点军旗即可选军。先选择目标，再预览确认；浏览地图不会直接下令。</p><select aria-label="选择军队" value={armyId ?? ''} onChange={e => {if(e.target.value)selectArmy(e.target.value);else{setArmyId(null);setTargetId(null);setTargeting(false);}}}><option value="">选择军队</option>{world.armies.filter(a => a.status !== 'destroyed').map(a => <option key={a.id} value={a.id}>{a.name} · {number(a.troops)}</option>)}</select>{army && <><h2 className="play-army-title">{unit&&<img src={icons[unit.key]} alt={unit.name}/>} {army.name}</h2>{unit&&<p>{unit.name} · 战力 {unit.power} · 移动速度 {unit.speed}倍</p>}<div className="play-row"><button onClick={()=>focus(motion.current.frame(performance.now()).armies.get(army.id)??armyPosition(world,army))}>定位军队</button><button disabled={busy||army.status==='destroyed'} className={targeting?'is-active':''} onClick={()=>{pause();setTargeting(!targeting);if(!targeting)setPanel(null);setNotice(targeting?'已退出目标选择。':'在地图上点选陆地作为目标；选择后还需预览确认。');}}>{targeting?'取消选目标':'在地图选目标'}</button></div><p>{({ idle:'驻守',marching:'行军',retreating:'撤退',fighting:'交战',destroyed:'覆灭' })[army.status]} · {world.provinces.find(p => p.id === army.provinceId)?.name}</p><p>兵力 {number(army.troops)} · 士气 {Math.round(army.morale)} · 补给 {Math.round(army.supplies)}</p>{run?.version===5&&army.status==='fighting'&&<AttackPanel world={world} army={army} state={run.battles} targets={routeTargets} targetId={targetId} busy={busy} setTargets={setRouteTargets} act={battle}/>}{!(run?.version===5&&army.status==='fighting')&&<><label>目标辖区<select aria-label="目标辖区" value={targetId ?? ''} onChange={e => {setTargetId(e.target.value||null);setProvinceId(e.target.value||null);setTargeting(false);}}><option value="">点击地图选目标</option>{world.provinces.map(p => <option key={p.id} value={p.id}>{p.name} · {world.nations.find(n => n.id === p.controller)?.name}</option>)}</select></label><p>{province ? `已选 ${province.name}` : '尚未选择目标'}</p><div className="play-row"><button disabled={!province || busy || army.status==='destroyed'} onClick={() => order('march')}>预览行军</button><button disabled={!province || busy || army.status==='destroyed'} onClick={() => order('retreat')}>预览撤退</button></div></>}</>}</>}
        {panel==='army'&&run?.version===5&&army&&army.status!=='fighting'&&<AttackPanel world={world} army={army} state={run.battles} targets={routeTargets} targetId={targetId} busy={busy} setTargets={setRouteTargets} act={battle}/>}
        {panel==='navy'&&((run?.version===3||(run?.version===4||run?.version===5))?<><label>国家<select aria-label="海军国家" value={nationId} onChange={e=>{setNationId(e.target.value);setFleetId(null);}}>{world.nations.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label><NavalPanel realtime={(run.version===4||run.version===5)} key={nationId} world={world} navy={run.navy} graph={graphFor(run)} nationId={nationId} fleetId={fleetId} busy={busy} select={selectFleet} focus={()=>{const f=run.navy.fleets.find(f=>f.id===fleetId);if(f)focus(motion.current.frame(performance.now()).fleets.get(f.id)??fleetPosition(graphFor(run),f));}} act={naval}/></>:<p>原世界继续使用原有规则。返回绘图后进入推演入口，创建独立的海军版副本即可使用港口与舰队。</p>)}
        {panel === 'events' && <EventPanel key={eventEpoch} world={world} locate={locate}/> }
      </aside>}
    </>}
    </div>
    {confirmation && <div className="play-modal"><div role="dialog" aria-modal="true" aria-label="命令确认"><h2>{confirmation.title}</h2><p>{confirmation.reason}</p>{confirmation.details.map((d,i) => <p key={i}>{d}</p>)}<div className="play-row"><button disabled={busy || !confirmation.valid} className="play-primary" onClick={() => { const c = confirmation.command; setConfirmation(null);setSeaPreview([]);setAttackPreview([]); void command(c); }}>确认执行</button><button autoFocus disabled={busy} onClick={() => {setConfirmation(null);setSeaPreview([]);setAttackPreview([]);}}>取消</button></div></div></div>}
    {armyChoices.length>0&&world&&<div className="play-modal"><div role="dialog" aria-modal="true" aria-label="选择重叠军队"><h2>这里有多支军队</h2>{armyChoices.map(id=>{const a=world.armies.find(a=>a.id===id);return a&&<button className="play-city" key={id} onClick={()=>selectArmy(id)}>{a.name} · {number(a.troops)}</button>;})}<button autoFocus onClick={()=>setArmyChoices([])}>取消选择</button></div></div>}
    {exit && <div className="play-modal"><div role="dialog" aria-modal="true" aria-label="返回绘图"><h2>返回绘图</h2><p>推演已暂停。未保存的进度退出后会丢失；绘图原稿保持原样。</p><div className="play-row"><button disabled={busy} onClick={() => { setExit(false); onClose(); }}>退出推演</button><button onClick={() => setExit(false)}>留在世界</button></div><button disabled={busy || locked} onClick={() => void save()}>先保存进度</button></div></div>}
  </section>;
}
