import { useEffect, useRef, useState } from 'react';
import { cameraScaleBounds, fitCamera, resizeCamera, zoomCameraAt, type AtlasCamera, type CameraPoint, type CameraSize } from '../world/camera';
import { createFmsDocument, FmsEditHistory, prepareFmsBrushEdit, prepareFmsLockEdit, prepareFmsOutlineEdit, type FmsDocument, type FmsEditPatch } from './model';
import { loadFmsDocument, saveFmsDocument } from './persistence';
import { FmsGestures } from './gestures';
import { FmsRenderer } from './renderer';
import { FmsTerrainClient } from './terrain-client';
import { prepareFmsTerrainPreview } from './terrain-preview';
import type { FmsDrainage } from './hydrology';
import { FMS_DEFAULT_COASTAL_WIDTH, FMS_MIN_COASTAL_WIDTH, FMS_MAX_COASTAL_WIDTH } from './terrain-options';
import './fms.css';

type Tool = 'browse' | 'outline' | 'land' | 'sea' | 'lock' | 'unlock';
const tools: { id: Tool; name: string; symbol: string; help: string }[] = [
  { id:'browse',name:'浏览',symbol:'✥',help:'单指移动地图，双指缩放。' },
  { id:'outline',name:'轮廓',symbol:'◇',help:'一笔描出大陆，松手闭合。双指随时转为移动或缩放。' },
  { id:'land',name:'陆地',symbol:'▲',help:'涂出陆地，也可以把岛屿连起来。双指移动或缩放。' },
  { id:'sea',name:'海洋',symbol:'≈',help:'擦出海湾、水道或内海。双指移动或缩放。' },
  { id:'lock',name:'保护',symbol:'▣',help:'涂抹要保留的地形。金色区域固定高程，生成与笔刷都不会改写。' },
  { id:'unlock',name:'解锁',symbol:'□',help:'涂抹解除保护。松手后可继续修改，也可撤销解锁。' },
];
interface Session {
  history: FmsEditHistory; renderer: FmsRenderer; camera: AtlasCamera; viewport: CameraSize; gestures: FmsGestures;
  storedRevision: number | null; savedDocumentRevision: number;
}
interface Stroke { points: CameraPoint[]; tool: Tool; radius: number; height: number }
type TerrainPhase = 'idle' | 'generating' | 'preview';
interface TerrainCandidate { patch: FmsEditPatch; document: FmsDocument; drainage: FmsDrainage; coastalWidth: number }
const messageOf = (error: unknown) => error instanceof Error ? error.message : '这次操作未能完成，地图保持原样。';

export default function FmsApp() {
  const host = useRef<HTMLDivElement>(null), session = useRef<Session | null>(null), stroke = useRef<Stroke | null>(null);
  const [tool,setTool] = useState<Tool>('outline'), [radius,setRadius] = useState(48), [height,setHeight] = useState(45), [expanded,setExpanded] = useState(false);
  const settings = useRef({ tool,radius,height }); settings.current={tool,radius,height};
  const [ready,setReady] = useState(false), [fatal,setFatal] = useState(''), [busy,setBusy] = useState(false), [notice,setNotice] = useState('正在读取本机地图…');
  const busyRef=useRef(false), renderUnavailable=useRef(false);
  const [terrainPhase,setTerrainPhaseState]=useState<TerrainPhase>('idle'), [seed,setSeed]=useState('1337'), [strength,setStrength]=useState(1), [showOriginal,setShowOriginal]=useState(false);
  const [coastalWidth,setCoastalWidth]=useState(FMS_DEFAULT_COASTAL_WIDTH);
  const terrainPhaseRef=useRef<TerrainPhase>('idle'), terrainCandidate=useRef<TerrainCandidate|null>(null);
  const terrainClient=useRef<FmsTerrainClient|null>(null), terrainAbort=useRef<AbortController|null>(null), generationToken=useRef(0);
  const editable=ready&&!busy&&!fatal&&terrainPhase==='idle', navigable=ready&&!fatal;
  const setTerrainPhase=(phase:TerrainPhase)=>{terrainPhaseRef.current=phase;setTerrainPhaseState(phase);};
  const [stats,setStats] = useState({ revision:0,land:0,locked:0,version:1,undo:false,redo:false,dirty:false,zoom:1 });
  const refresh = (s: Session) => setStats({ revision:s.history.document.revision,land:s.history.document.elevations.reduce((n,h)=>n+(h>=20?1:0),0),locked:s.history.document.terrainLocks?.reduce((n,value)=>n+value,0)??0,version:s.history.document.version,undo:s.history.canUndo,redo:s.history.canRedo,dirty:s.history.document.revision!==s.savedDocumentRevision,zoom:s.camera.scale/cameraScaleBounds(s.history.document,s.viewport).fitScale });

  useEffect(()=>{
    const lifetime=new AbortController(); let disposed=false, renderer:FmsRenderer|undefined, observer:ResizeObserver|undefined;
    const clearStroke = () => { stroke.current=null; renderer?.showStroke([],'outline',0); };
    const append = (point: CameraPoint, force=false) => {
      const active=stroke.current, s=session.current; if(!active||!s)return false;
      const last=active.points.at(-1);
      if(last&&Math.hypot(point.x-last.x,point.y-last.y)*s.camera.scale<(force ? .01 : 2))return true;
      if(active.points.length>=(active.tool==='outline'?1024:4096)) { clearStroke(); s.gestures.interrupt(); setNotice('这一笔过长，已取消。请拆成几笔继续描绘。'); return false; }
      active.points.push(point); renderer?.showStroke(active.points,active.tool,active.radius); return true;
    };
    const start = async () => {
      const saved=await loadFmsDocument(); if(disposed)return;
      if(!saved)setNotice('正在准备空白海洋…');
      const document=saved?.document??await createFmsDocument({signal:lifetime.signal}); if(disposed)return;
      const history=new FmsEditHistory(document);
      renderer=new FmsRenderer(); await renderer.init(host.current!); if(disposed)return;
      const viewport={width:host.current!.clientWidth,height:host.current!.clientHeight};
      const s = {history,renderer,viewport,camera:fitCamera(document,viewport),storedRevision:saved?.storedRevision??null,savedDocumentRevision:saved?document.revision:-1} as Session;
      s.gestures=new FmsGestures({camera:()=>s.camera,world:()=>s.history.document,viewport:()=>s.viewport,
        setCamera:camera=>{s.camera=camera;s.renderer.setCamera(camera);refresh(s);},
        begin:point=>{ if(busyRef.current||renderUnavailable.current||terrainPhaseRef.current!=='idle')return; stroke.current={points:[],...settings.current};append(point); },
        move:point=>append(point),cancel:clearStroke,
        commit:point=>{
          if(!append(point,true))return; const active=stroke.current; clearStroke(); if(!active||busyRef.current||renderUnavailable.current||terrainPhaseRef.current!=='idle')return;
          try {
            const patch=active.tool==='outline'
              ?prepareFmsOutlineEdit(s.history.document,active.points.map(p=>[p.x,p.y]),active.height)
              :active.tool==='lock'||active.tool==='unlock'
                ?prepareFmsLockEdit(s.history.document,active.points.map(p=>({...p,radius:active.radius})),active.tool==='lock')
                :prepareFmsBrushEdit(s.history.document,{tool:active.tool==='sea'?'sea':'land',height:active.height,stamps:active.points.map(p=>({...p,radius:active.radius}))});
            const result=s.history.commit(patch); s.renderer.setDocument(result);refresh(s);
            setNotice(patch.lockChanges?.length?'保护区域已更新，可撤销；保存后刷新仍保留。':patch.changes.length?'这一笔已完成，可撤销；保存后可以刷新继续。':'这一笔没有改变地图；受保护地形需先解锁。');
          } catch(error) { setNotice(messageOf(error)); }
        },
      });
      session.current=s; s.renderer.setDocument(document); s.renderer.setCamera(s.camera);
      const canvas=s.renderer.canvas;
      const point=(event:PointerEvent|WheelEvent)=>{const bounds=canvas.getBoundingClientRect();return{x:event.clientX-bounds.left,y:event.clientY-bounds.top};};
      const options={signal:lifetime.signal};
      canvas.addEventListener('pointerdown',event=>{ if(busyRef.current||renderUnavailable.current||event.button!==0)return;event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);s.gestures.down(event.pointerId,point(event),terrainPhaseRef.current==='idle'&&settings.current.tool!=='browse'); },options);
      canvas.addEventListener('pointermove',event=>s.gestures.move(event.pointerId,point(event)),options);
      canvas.addEventListener('pointerup',event=>{s.gestures.up(event.pointerId,point(event));if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);},options);
      canvas.addEventListener('pointercancel',event=>s.gestures.cancelPointer(event.pointerId),options);
      canvas.addEventListener('lostpointercapture',event=>s.gestures.cancelPointer(event.pointerId),options);
      canvas.addEventListener('wheel',event=>{event.preventDefault();if(!renderUnavailable.current)s.gestures.wheel(point(event),event.deltaY);},{...options,passive:false});
      canvas.addEventListener('contextmenu',event=>event.preventDefault(),options);
      canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderUnavailable.current=true;s.gestures.reset();cancelTerrain(false);setNotice('未确认的地形已取消；已提交的地图仍可保存。');setFatal('地图显示连接中断。未保存的绘图仍在内存中，请先保存，再重新打开。');},options);
      window.addEventListener('blur',()=>s.gestures.reset(),options);
      window.addEventListener('pagehide',()=>s.gestures.reset(),options);
      window.addEventListener('beforeunload',event=>{if(s.history.document.revision!==s.savedDocumentRevision||terrainPhaseRef.current!=='idle'){event.preventDefault();event.returnValue='';}},options);
      documentVisibility(options,()=>s.gestures.reset());
      window.addEventListener('keydown',event=>{
        if(event.key==='Escape'){s.gestures.interrupt();if(terrainPhaseRef.current!=='idle')cancelTerrain();setExpanded(false);}
        if(!(event.target instanceof HTMLInputElement)&&(event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){
          event.preventDefault();if(busyRef.current||renderUnavailable.current||terrainPhaseRef.current!=='idle')return;s.gestures.interrupt();
          const changed=event.key.toLowerCase()==='y'||event.shiftKey?s.history.redo():s.history.undo();s.renderer.setDocument(changed);refresh(s);
        }
      },options);
      observer=new ResizeObserver(()=>{
        const size={width:host.current?.clientWidth??0,height:host.current?.clientHeight??0};
        if(size.width<=0||size.height<=0||(size.width===s.viewport.width&&size.height===s.viewport.height))return;
        s.gestures.interrupt();s.camera=resizeCamera(s.camera,s.viewport,size,s.history.document);s.viewport=size;s.renderer.resize(size.width,size.height);s.renderer.setCamera(s.camera);refresh(s);
      }); observer.observe(host.current!);
      refresh(s);setReady(true);setNotice(saved?.requiresProtectionUpgrade?'保护存档损坏，已恢复不含保护区域的旧备份。重新启用保护后才能保存。':saved?(saved.recovery==='backup'?'已从有效备份恢复。确认地图后保存可修复当前记录。':'已恢复本机地图，可以继续绘制。'):'先描一块大陆，再用陆地与海洋笔刷修改。');
    };
    void start().catch(error=>{if(!disposed){setFatal(messageOf(error));setNotice('已有存档未被覆盖。');}});
    return()=>{disposed=true;lifetime.abort();generationToken.current++;terrainAbort.current?.abort();terrainClient.current?.close();terrainClient.current=null;terrainCandidate.current=null;observer?.disconnect();session.current?.gestures.reset();session.current=null;renderer?.destroy();};
  },[]);

  function documentVisibility(options: { signal: AbortSignal }, reset: () => void) { document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();},options); }
  const choose = (next:Tool) => {session.current?.gestures.interrupt();setTool(next);setNotice(tools.find(t=>t.id===next)!.help);if(next==='lock'||next==='unlock')setExpanded(false);};
  const historyAction = (redo:boolean) => {const s=session.current;if(!s||busyRef.current||renderUnavailable.current||terrainPhaseRef.current!=='idle')return;s.gestures.interrupt();const doc=redo?s.history.redo():s.history.undo();s.renderer.setDocument(doc);refresh(s);setNotice(redo?'已重做上一笔。':'已撤销上一笔。');};
  const zoom = (factor:number) => {const s=session.current;if(!s||renderUnavailable.current)return;s.gestures.interrupt();s.camera=zoomCameraAt(s.camera,factor,{x:s.viewport.width/2,y:s.viewport.height/2},s.history.document,s.viewport);s.renderer.setCamera(s.camera);refresh(s);};
  const fit = () => {const s=session.current;if(!s||renderUnavailable.current)return;s.gestures.interrupt();s.camera=fitCamera(s.history.document,s.viewport);s.renderer.setCamera(s.camera);refresh(s);};
  const save = async () => {
    const s=session.current;if(!s||busyRef.current||terrainPhaseRef.current!=='idle')return;s.gestures.interrupt();busyRef.current=true;setBusy(true);setNotice('正在保存到此浏览器…');
    const captured:FmsDocument=s.history.document;
    try {const saved=await saveFmsDocument(captured,s.storedRevision);if(session.current!==s)return;s.storedRevision=saved.storedRevision;s.savedDocumentRevision=captured.revision;refresh(s);setNotice('已保存到此浏览器，刷新后可以继续。');}
    catch(error){if(session.current===s)setNotice(messageOf(error));}
    finally{busyRef.current=false;setBusy(false);}
  };
  function cancelTerrain(announce=true) {
    generationToken.current++;terrainAbort.current?.abort();terrainAbort.current=null;
    const s=session.current, hadPreview=terrainCandidate.current!==null;
    terrainCandidate.current=null;setTerrainPhase('idle');setShowOriginal(false);
    if(s&&hadPreview&&!renderUnavailable.current)s.renderer.setDocument(s.history.document);
    if(announce)setNotice('已取消地形预览，原地图保持不变。');
  }
  const generateTerrain=async()=>{
    const s=session.current;if(!s||!editable)return;
    if(!/^\d{1,10}$/.test(seed)||Number(seed)>0xffffffff){setNotice('地形种子须为0至4294967295之间的整数。');return;}
    s.gestures.interrupt();setExpanded(false);setShowOriginal(false);setTerrainPhase('generating');setNotice('正在生成山地与河湖，可以随时取消。');
    const token=++generationToken.current, source=s.history.document, controller=new AbortController();terrainAbort.current=controller;
    const client=terrainClient.current??(terrainClient.current=new FmsTerrainClient());
    try {
      const result=await client.naturalize(source,{seed:Number(seed),strength,coastalWidth},{signal:controller.signal});
      if(generationToken.current!==token||session.current!==s||renderUnavailable.current)return;
      const prepared=prepareFmsTerrainPreview(s.history.document,result);
      if(prepared.patch.changes.length===0){setTerrainPhase('idle');setNotice('没有可更新的内陆地形；海岸与小岛边缘保持原高程，可扩大内陆或调整参数。');return;}
      terrainCandidate.current={...prepared,drainage:result.drainage,coastalWidth:result.stats.coastalWidth};s.renderer.setDocument(prepared.document,result.drainage);
      setTerrainPhase('preview');setNotice('内陆地形已生成；海岸边界固定。缩放对照后确认，可整步撤销。');
    } catch(error) {
      if(generationToken.current===token&&session.current===s){terrainCandidate.current=null;setTerrainPhase('idle');s.renderer.setDocument(s.history.document);setNotice(messageOf(error));}
    } finally {if(generationToken.current===token)terrainAbort.current=null;}
  };
  const confirmTerrain=()=>{
    const s=session.current,candidate=terrainCandidate.current;if(!s||!candidate||renderUnavailable.current)return;
    s.gestures.interrupt();
    try {const doc=s.history.commit(candidate.patch);s.renderer.setDocument(doc,candidate.drainage);terrainCandidate.current=null;setTerrainPhase('idle');setShowOriginal(false);refresh(s);setNotice('自然地形已应用，可整步撤销。保存后刷新仍保留山地和河湖。');}
    catch(error){cancelTerrain(false);setNotice(messageOf(error));}
  };
  const compareTerrain=()=>{const s=session.current,candidate=terrainCandidate.current;if(!s||!candidate)return;s.gestures.interrupt();s.renderer.setDocument(showOriginal?candidate.document:s.history.document,showOriginal?candidate.drainage:undefined);setShowOriginal(!showOriginal);};
  return <main onPointerDownCapture={event=>{if(event.target!==session.current?.renderer.canvas)session.current?.gestures.interrupt();}} className="fms-app" data-testid="fms-app" data-revision={stats.revision} data-land-cells={stats.land} data-locked-cells={stats.locked} data-document-version={stats.version} data-tool={tool} data-dirty={stats.dirty} data-terrain-phase={terrainPhase} data-show-original={showOriginal}>
    <div className="fms-map" ref={host}/>
    <header className="fms-header"><div><span className="fms-kicker">列国纪 · 创世</span><h1>地图编辑</h1></div><div className="fms-header-actions"><button onClick={()=>void generateTerrain()} disabled={!editable||stats.land===0}>生成地形</button><button className="fms-save" onClick={()=>void save()} disabled={!ready||busy||terrainPhase!=='idle'}>{busy?'保存中…':'保存'}<span className={stats.dirty?'fms-unsaved':'fms-saved'} aria-label={stats.dirty?'有未保存修改':'已保存'}/></button></div></header>
    {!ready&&!fatal&&<div className="fms-loading" role="status">{notice}</div>}
    {ready&&stats.land===0&&!fatal&&<div className="fms-empty"><span>一片海洋，等你落笔</span><p>选择轮廓，描出第一块大陆</p></div>}
    {fatal&&<div className="fms-error" role="alert"><strong>地图暂时无法打开</strong><p>{fatal}</p>{!ready&&<button onClick={()=>window.location.reload()}>重新尝试</button>}</div>}
    <div className="fms-zoom" aria-label="地图视角"><button onClick={()=>zoom(1.4)} disabled={!navigable} aria-label="放大">＋</button><button onClick={fit} disabled={!navigable} aria-label="查看全图">⌖</button><button onClick={()=>zoom(1/1.4)} disabled={!navigable} aria-label="缩小">−</button><output>{stats.zoom.toFixed(1)}×</output></div>
    <div className="fms-bottom">
      <div className="fms-status" role="status" aria-live="polite">{ready?notice:''}</div>
      {terrainPhase!=='idle'&&<section className="fms-terrain-preview" aria-label="自然地形预览"><strong>{terrainPhase==='generating'?'山地与河湖生成中…':showOriginal?'正在对照原地图':'自然地形预览'}</strong><p>{terrainPhase==='generating'?'原地图仍被保留。':`沿海低地宽度 ${Math.round((terrainCandidate.current?.coastalWidth??coastalWidth)*1000)/10}% · 海岸线固定。`}</p><p>单指移动、双指缩放；确认前不会保存。</p><div><button onClick={()=>cancelTerrain()}>取消</button>{terrainPhase==='preview'&&<><button onClick={compareTerrain}>{showOriginal?'查看地形':'查看原图'}</button><button className="fms-confirm" onClick={confirmTerrain}>确认地形</button></>}</div></section>}
      {expanded&&<section className="fms-settings" aria-label="绘图设置"><div className="fms-panel-heading"><h2>高度编辑</h2><button aria-label="收起绘图设置" onClick={()=>setExpanded(false)}>×</button></div>
        <label>笔刷半径 <output>{radius}</output><input type="range" min="8" max="160" step="4" value={radius} onChange={e=>{session.current?.gestures.interrupt();setRadius(+e.target.value);}} disabled={!editable}/></label>
        <label>陆地高度 <output>{height}</output><input type="range" min="25" max="100" step="1" value={height} onChange={e=>{session.current?.gestures.interrupt();setHeight(+e.target.value);}} disabled={!editable}/></label>
        <fieldset><legend>自然地形</legend><label>地形种子<input aria-label="地形种子" inputMode="numeric" value={seed} maxLength={10} onChange={e=>setSeed(e.target.value)} disabled={!editable}/></label><label>起伏强度 <output>{Math.round(strength*100)}%</output><input type="range" min="0.2" max="1" step="0.1" value={strength} onChange={e=>setStrength(+e.target.value)} disabled={!editable}/></label><label>沿海低地宽度 <output>{Math.round(coastalWidth*1000)/10}%</output><input aria-label="沿海低地宽度" type="range" min={FMS_MIN_COASTAL_WIDTH*100} max={FMS_MAX_COASTAL_WIDTH*100} step="0.5" value={coastalWidth*100} onChange={e=>setCoastalWidth(+e.target.value/100)} disabled={!editable}/></label><p>按地图短边比例调整内陆过渡，不移动海岸线；保护区高程不变。生成参数仅用于本次会话，保存的是实际地形。</p></fieldset><p>双指移动或缩放 · 松手完成一笔<br/>地图仅保存在当前浏览器</p>
        <fieldset><legend>地形保护</legend><p>金色区域固定高程，笔刷和重新生成都会避开；阴影、河流仍可能变化。</p>{stats.version===1&&<p className="fms-upgrade-note">启用并保存后，旧试玩版本无法编辑此地图；保存时保留启用前备份。</p>}<div className="fms-lock-actions"><button onClick={()=>choose('lock')} disabled={!editable}>{stats.version===1?'启用并涂抹保护':'涂抹保护'}</button><button onClick={()=>choose('unlock')} disabled={!editable||stats.locked===0}>涂抹解锁</button></div><p>{stats.locked?'已有保护区域；解锁也是可撤销的一笔。':'尚未保护任何区域。'}</p></fieldset>
      </section>}
      {(tool==='lock'||tool==='unlock')&&<div className="fms-lock-mode"><span>{tool==='lock'?'▣ 保护笔刷':'□ 解锁笔刷'}</span><button onClick={()=>choose('browse')} disabled={!editable}>完成</button></div>}
      <div className="fms-toolbar"><nav aria-label="地图工具">{tools.filter(t=>t.id!=='lock'&&t.id!=='unlock').map(t=><button key={t.id} onClick={()=>choose(t.id)} aria-pressed={tool===t.id} disabled={!editable}><span aria-hidden="true">{t.symbol}</span>{t.name}</button>)}</nav>
      <div className="fms-actions"><button aria-label="撤销" onClick={()=>historyAction(false)} disabled={!editable||!stats.undo}>↶</button><button aria-label="重做" onClick={()=>historyAction(true)} disabled={!editable||!stats.redo}>↷</button><button aria-label="绘图设置" aria-expanded={expanded} onClick={()=>{session.current?.gestures.interrupt();setExpanded(!expanded);}} disabled={!editable}>☷</button></div></div>
    </div>
  </main>;
}
