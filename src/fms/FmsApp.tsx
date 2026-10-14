import {PlayIcon,type PlayIconName} from './play/PlayIcon';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cameraScaleBounds, fitCamera, resizeCamera, zoomCameraAt, type AtlasCamera, type CameraPoint, type CameraSize } from '../world/camera';
import { createFmsDocument, FmsEditHistory, prepareFmsBrushEdit, prepareFmsLockEdit, prepareFmsOutlineEdit, type FmsDocument, type FmsEditPatch } from './model';
import { loadFmsDocument, saveFmsDocument } from './persistence';
import { FmsGestures } from './gestures';
import { FmsRenderer } from './renderer';
import { displayFmsDocument } from './display-document';
import { FmsTerrainClient } from './terrain-client';
import type { FmsHillOptions } from './hill';
import { prepareFmsTemplatePreview, type FmsTemplateOptions } from './local-template';
import type { ClickTemplate } from '../world/recovered-terrain/click-engine';
import { FmsCoastClient } from './coast-client';
import { prepareFmsCoastPreview, type FmsCoastResult, type FmsCoastOptions } from './coast-refinement';
import { prepareFmsCoastSmoothPreview, type FmsCoastSmoothResult, type FmsCoastSmoothOptions } from './coast-smoothing';
import { prepareFmsTerrainPreview } from './terrain-preview';
import { prepareFmsFullMapPreview } from './full-map-terrain';
import { SEED_TERRAIN_TEMPLATES, type SeedTerrainTemplate } from '../world/seed-terrain';
import type { FmsDrainage } from './hydrology';
import { FMS_DEFAULT_COASTAL_WIDTH, FMS_MIN_COASTAL_WIDTH, FMS_MAX_COASTAL_WIDTH } from './terrain-options';
import type { FmsTerrainDisplay } from './height-palette';
import './fms.css';
import './fms-interface.css';
import {WorldEntry} from './play/WorldEntry';

type Tool = 'browse' | 'outline' | 'land' | 'sea' | 'lock' | 'unlock' | 'hill' | 'template';
const tools: { id: Tool; name: string; symbol: string; help: string }[] = [
  { id:'browse',name:'浏览',symbol:'✥',help:'单指移动地图，双指缩放。' },
  { id:'outline',name:'轮廓',symbol:'◇',help:'一笔描出大陆，松手闭合。双指随时转为移动或缩放。' },
  { id:'land',name:'陆地',symbol:'▲',help:'涂出陆地，也可以把岛屿连起来。双指移动或缩放。' },
  { id:'sea',name:'海洋',symbol:'≈',help:'擦出海湾、水道或内海。双指移动或缩放。' },
  { id:'lock',name:'保护',symbol:'▣',help:'涂抹要保留的地形。金色区域固定高程，生成与笔刷都不会改写。' },
  { id:'unlock',name:'解锁',symbol:'□',help:'涂抹解除保护。松手后可继续修改，也可撤销解锁。' },
  { id:'template',name:'原作地形',symbol:'⋀',help:'点击放置一片地形；拖动调整落点，松手预览。尺度随落点到地图边缘的距离变化。' },
  { id:'hill',name:'山丘',symbol:'△',help:'在陆地点击放置山丘；拖动调整落点，松手预览。双指移动或缩放。' },
];
interface Session {
  history: FmsEditHistory; renderer: FmsRenderer; camera: AtlasCamera; viewport: CameraSize; gestures: FmsGestures;
  storedRevision: number | null; savedDocumentRevision: number;
}
interface Stroke { points: CameraPoint[]; tool: Tool; radius: number; height: number; hillHeight: number; hillDecay: number; seed: string; localTemplate: ClickTemplate; preserveCoast: boolean }
type TerrainPhase = 'idle' | 'generating' | 'preview';
type TerrainCandidate = { kind:'terrain'; patch:FmsEditPatch; document:FmsDocument; drainage:FmsDrainage; coastalWidth:number }
  | { kind:'full-map'; patch:FmsEditPatch; document:FmsDocument; drainage:FmsDrainage; changedCells:number; landCells:number; template:SeedTerrainTemplate }
  | { kind:'template'; patch:FmsEditPatch; document:FmsDocument; drainage:FmsDrainage; changedCells:number; newLandCells:number; preserveCoast:boolean }
  | { kind:'hill'; patch:FmsEditPatch; document:FmsDocument; drainage:FmsDrainage; changedCells:number }
  | { kind:'coast'; document:FmsDocument; result:FmsCoastResult; options:FmsCoastOptions }
  | { kind:'smooth'; document:FmsDocument; result:FmsCoastSmoothResult; options:FmsCoastSmoothOptions };
const messageOf = (error: unknown) => error instanceof Error ? error.message : '这次操作未能完成，地图保持原样。';

export default function FmsApp() {
  const [playTerrain,setPlayTerrain]=useState<FmsDocument|null>(null);
  const playingRef=useRef(false);playingRef.current=!!playTerrain;
  const host = useRef<HTMLDivElement>(null), session = useRef<Session | null>(null), stroke = useRef<Stroke | null>(null);
  const [tool,setTool] = useState<Tool>('outline'), [radius,setRadius] = useState(48), [height,setHeight] = useState(45), [expanded,setExpanded] = useState(false);
  const [ready,setReady] = useState(false), [fatal,setFatal] = useState(''), [busy,setBusy] = useState(false), [notice,setNotice] = useState('正在读取本机地图…');
  const busyRef=useRef(false), renderUnavailable=useRef(false);
  const [terrainPhase,setTerrainPhaseState]=useState<TerrainPhase>('idle'), [seed,setSeed]=useState('1337'), [strength,setStrength]=useState(1), [showOriginal,setShowOriginal]=useState(false);
  const [fullMapTemplate,setFullMapTemplate]=useState<SeedTerrainTemplate>('continents');
  const [hillHeight,setHillHeight]=useState(85),[hillDecay,setHillDecay]=useState(.96);
  const [localTemplate,setLocalTemplate]=useState<ClickTemplate>('pangea'),[preserveCoast,setPreserveCoast]=useState(true);
  const [terrainDisplay,setTerrainDisplay]=useState<FmsTerrainDisplay>('height');
  const [displayNotice,setDisplayNotice]=useState('');
  const showDocument=(s:Session,doc:FmsDocument,drainage?:FmsDrainage)=>displayFmsDocument(s.renderer,doc,drainage,reason=>{setTerrainDisplay('height');setDisplayNotice(reason);});
  const settings=useRef({tool,radius,height,hillHeight,hillDecay,seed,localTemplate,preserveCoast});settings.current={tool,radius,height,hillHeight,hillDecay,seed,localTemplate,preserveCoast};
  const [coastalWidth,setCoastalWidth]=useState(FMS_DEFAULT_COASTAL_WIDTH);
  const [coastOffset,setCoastOffset]=useState(0),[generationKind,setGenerationKind]=useState<'terrain'|'coast'|'smooth'|'hill'|'template'|'full-map'>('terrain');
  const terrainPhaseRef=useRef<TerrainPhase>('idle'), terrainCandidate=useRef<TerrainCandidate|null>(null);
  const terrainClient=useRef<FmsTerrainClient|null>(null), terrainAbort=useRef<AbortController|null>(null), generationToken=useRef(0);
  const coastClient=useRef<FmsCoastClient|null>(null);
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
      if(active.tool==='template'){active.points=[point];renderer?.showStroke(active.points,'template',6/s.camera.scale);return true;}
      if(active.tool==='hill'){active.points=[point];renderer?.showStroke(active.points,'hill',active.radius);return true;}
      if(active.points.length>=(active.tool==='outline'?1024:4096)) { clearStroke(); s.gestures.interrupt(); setNotice('这一笔过长，已取消。请拆成几笔继续描绘。'); return false; }
      active.points.push(point); renderer?.showStroke(active.points,active.tool,active.radius); return true;
    };
    const start = async () => {
      const saved=await loadFmsDocument(); if(disposed)return;
      if(!saved)setNotice('正在准备空白海洋…');
      const document=saved?.document??await createFmsDocument({signal:lifetime.signal}); if(disposed)return;
      const history=new FmsEditHistory(document);
      renderer=new FmsRenderer(state=>{
        if(disposed)return;
        setTerrainDisplay(state.requested);
        setDisplayNotice(state.error?'气候地貌暂不可用，已保留当前地图的高度视图；可重新选择重试。':state.pending?'正在计算气候与河流，暂显示高度；可以继续移动、缩放。':'');
      },error=>{if(!disposed){renderUnavailable.current=true;setFatal(messageOf(error));setNotice('地图显示未能更新，未保存的绘图仍可保存。');}}); await renderer.init(host.current!); if(disposed)return;
      // A newly opened/hidden app panel can briefly have no layout size. Match
      // the renderer's safe initial extent; ResizeObserver fits its real size.
      const viewport={width:Math.max(1,host.current!.clientWidth),height:Math.max(1,host.current!.clientHeight)};
      const s = {history,renderer,viewport,camera:fitCamera(document,viewport),storedRevision:saved?.storedRevision??null,savedDocumentRevision:saved?document.revision:-1} as Session;
      s.gestures=new FmsGestures({camera:()=>s.camera,world:()=>s.history.document,viewport:()=>s.viewport,
        setCamera:camera=>{s.camera=camera;s.renderer.setCamera(camera);refresh(s);},
        begin:point=>{ if(busyRef.current||renderUnavailable.current||terrainPhaseRef.current!=='idle')return; stroke.current={points:[],...settings.current};append(point); },
        move:point=>append(point),cancel:clearStroke,
        commit:point=>{
          if(!append(point,true))return; const active=stroke.current; clearStroke(); if(!active||busyRef.current||renderUnavailable.current||terrainPhaseRef.current!=='idle')return;
          if(active.tool==='template'){
            if(!/^\d{1,10}$/.test(active.seed)||Number(active.seed)>0xffffffff){setNotice('地形种子须为0至4294967295之间的整数。');return;}
            void generateTemplate({ ...point,template:active.localTemplate,preserveCoast:active.preserveCoast,seed:Number(active.seed) });return;
          }
          if(active.tool==='hill'){
            if(!/^\d{1,10}$/.test(active.seed)||Number(active.seed)>0xffffffff){setNotice('地形种子须为0至4294967295之间的整数。');return;}
            void generateHill({ ...point,radius:active.radius,height:active.hillHeight,decay:active.hillDecay,seed:Number(active.seed) });return;
          }
          try {
            const patch=active.tool==='outline'
              ?prepareFmsOutlineEdit(s.history.document,active.points.map(p=>[p.x,p.y]),active.height)
              :active.tool==='lock'||active.tool==='unlock'
                ?prepareFmsLockEdit(s.history.document,active.points.map(p=>({...p,radius:active.radius})),active.tool==='lock')
                :prepareFmsBrushEdit(s.history.document,{tool:active.tool==='sea'?'sea':'land',height:active.height,stamps:active.points.map(p=>({...p,radius:active.radius}))});
            const result=s.history.commit(patch); showDocument(s,result);refresh(s);
            setNotice(patch.lockChanges?.length?'保护区域已更新，可撤销；保存后刷新仍保留。':patch.changes.length?'这一笔已完成，可撤销；保存后可以刷新继续。':'这一笔没有改变地图；受保护地形需先解锁。');
          } catch(error) { setNotice(messageOf(error)); }
        },
      });
      session.current=s; showDocument(s,document); s.renderer.setCamera(s.camera);
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
        if(playingRef.current)return;
        if(event.key==='Escape'){s.gestures.interrupt();if(terrainPhaseRef.current!=='idle')cancelTerrain();setExpanded(false);}
        if(!(event.target instanceof HTMLInputElement)&&(event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){
          event.preventDefault();if(busyRef.current||renderUnavailable.current||terrainPhaseRef.current!=='idle')return;s.gestures.interrupt();
          const changed=event.key.toLowerCase()==='y'||event.shiftKey?s.history.redo():s.history.undo();showDocument(s,changed);refresh(s);
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
    return()=>{disposed=true;lifetime.abort();generationToken.current++;terrainAbort.current?.abort();terrainClient.current?.close();terrainClient.current=null;coastClient.current?.close();coastClient.current=null;terrainCandidate.current=null;observer?.disconnect();session.current?.gestures.reset();session.current=null;renderer?.destroy();};
  },[]);

  function documentVisibility(options: { signal: AbortSignal }, reset: () => void) { document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();},options); }
  const choose = (next:Tool) => {session.current?.gestures.interrupt();setTool(next);setNotice(tools.find(t=>t.id===next)!.help);if(next==='lock'||next==='unlock'||next==='hill'||next==='template')setExpanded(false);};
  const historyAction = (redo:boolean) => {const s=session.current;if(!s||busyRef.current||renderUnavailable.current||terrainPhaseRef.current!=='idle')return;s.gestures.interrupt();const doc=redo?s.history.redo():s.history.undo();showDocument(s,doc);refresh(s);setNotice(redo?'已重做上一笔。':'已撤销上一笔。');};
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
    if(s&&hadPreview&&!renderUnavailable.current)showDocument(s,s.history.document);
    if(announce)setNotice('已取消地形预览，原地图保持不变。');
  }
  async function generateTemplate(options:FmsTemplateOptions){
    const s=session.current;if(!s||busyRef.current||renderUnavailable.current||terrainPhaseRef.current!=='idle')return;
    s.gestures.interrupt();setExpanded(false);setShowOriginal(false);setGenerationKind('template');setTerrainPhase('generating');setNotice('正在生成原作模板地形，可以随时取消。');
    const token=++generationToken.current,controller=new AbortController();terrainAbort.current=controller;
    try{
      const client=terrainClient.current??(terrainClient.current=new FmsTerrainClient());
      const result=await client.localTemplate(s.history.document,options,{signal:controller.signal});
      if(generationToken.current!==token||session.current!==s||renderUnavailable.current)return;
      const prepared=prepareFmsTemplatePreview(s.history.document,result,options);
      if(!prepared.patch.changes.length){setTerrainPhase('idle');setNotice(options.preserveCoast?'这里没有可抬高的内陆；移向陆地，或在设置中关闭保留海岸以新增陆地。':'这里已有更高地形或受到保护，请更换落点或种子。');return;}
      terrainCandidate.current={kind:'template',...prepared,drainage:result.drainage,changedCells:result.stats.changedCells,newLandCells:result.stats.newLandCells,preserveCoast:options.preserveCoast};
      showDocument(s,prepared.document,result.drainage);setTerrainPhase('preview');setNotice(options.preserveCoast?'原作模板已预览；已有海岸和保护区固定，对照后确认。':'原作模板已预览；会新增陆地或扩展海岸，已有更高地形与保护区保留。');
    }catch(error){if(generationToken.current===token&&session.current===s){terrainCandidate.current=null;setTerrainPhase('idle');showDocument(s,s.history.document);setNotice(messageOf(error));}}
    finally{if(generationToken.current===token)terrainAbort.current=null;}
  }
  function previewFirstContinent() {
    const s=session.current;
    if(!s||busyRef.current||renderUnavailable.current||terrainPhaseRef.current!=='idle')return;
    // A one-shot, explicitly requested empty-map preview. Do not change the
    // player's preserveCoast setting or bypass painted protection regions.
    if(s.history.document.elevations.some(h=>h>=20)){setNotice('已有陆地，请使用地形工具继续编辑。');return;}
    if(!/^\d{1,10}$/.test(seed)||Number(seed)>0xffffffff){setNotice('地形种子须为0至4294967295之间的整数。');return;}
    void generateTemplate({x:s.history.document.width/2,y:s.history.document.height/2,template:localTemplate,seed:Number(seed),preserveCoast:false});
  }
  async function generateFullMap() {
    const s=session.current;
    if(!s||busyRef.current||renderUnavailable.current||terrainPhaseRef.current!=='idle')return;
    if(!/^\d{1,10}$/.test(seed)||Number(seed)>0xffffffff){setNotice('地形种子须为0至4294967295之间的整数。');return;}
    const options={seed,template:fullMapTemplate};
    s.gestures.interrupt();setExpanded(false);setShowOriginal(false);setGenerationKind('full-map');setTerrainPhase('generating');setNotice('正在生成整张地图；现有地图在确认前不会改变。');
    const token=++generationToken.current,controller=new AbortController();terrainAbort.current=controller;
    try {
      const client=terrainClient.current??(terrainClient.current=new FmsTerrainClient());
      const result=await client.fullMap(s.history.document,options,{signal:controller.signal});
      if(generationToken.current!==token||session.current!==s||renderUnavailable.current)return;
      const prepared=await prepareFmsFullMapPreview(s.history.document,result,options);
      if(generationToken.current!==token||session.current!==s||renderUnavailable.current)return;
      if(!prepared.patch.changes.length){setTerrainPhase('idle');setNotice('该种子没有生成可见地形，原地图保持不变。');return;}
      terrainCandidate.current={kind:'full-map',...prepared,drainage:result.drainage,changedCells:result.stats.changedCells,landCells:result.stats.landCells,template:options.template};
      showDocument(s,prepared.document,result.drainage);setTerrainPhase('preview');setNotice('整图地形已预览；可移动缩放、对照原图，确认后仍可撤销和保存。');
    }catch(error){if(generationToken.current===token&&session.current===s){terrainCandidate.current=null;setTerrainPhase('idle');showDocument(s,s.history.document);setNotice(messageOf(error));}}
    finally{if(generationToken.current===token)terrainAbort.current=null;}
  }
  async function generateHill(options:FmsHillOptions){
    const s=session.current;if(!s||busyRef.current||renderUnavailable.current||terrainPhaseRef.current!=='idle')return;
    s.gestures.interrupt();setExpanded(false);setShowOriginal(false);setGenerationKind('hill');setTerrainPhase('generating');setNotice('正在生成这座山丘，可以随时取消。');
    const token=++generationToken.current,controller=new AbortController();terrainAbort.current=controller;
    try{
      const client=terrainClient.current??(terrainClient.current=new FmsTerrainClient());
      const result=await client.hill(s.history.document,options,{signal:controller.signal});
      if(generationToken.current!==token||session.current!==s||renderUnavailable.current)return;
      const prepared=prepareFmsTerrainPreview(s.history.document,result,'放置山丘');
      if(!prepared.patch.changes.length){setTerrainPhase('idle');setNotice('这里没有可抬高的地形，请移向内陆、避开保护区，或提高山顶高度。');return;}
      terrainCandidate.current={kind:'hill',...prepared,drainage:result.drainage,changedCells:result.stats.changedCells};
      showDocument(s,prepared.document,result.drainage);setTerrainPhase('preview');setNotice('山丘已预览，原有更高地形保留；对照后确认，可整步撤销。');
    }catch(error){if(generationToken.current===token&&session.current===s){terrainCandidate.current=null;setTerrainPhase('idle');showDocument(s,s.history.document);setNotice(messageOf(error));}}
    finally{if(generationToken.current===token)terrainAbort.current=null;}
  }
  const generateTerrain=async()=>{
    const s=session.current;if(!s||!editable)return;
    if(!/^\d{1,10}$/.test(seed)||Number(seed)>0xffffffff){setNotice('地形种子须为0至4294967295之间的整数。');return;}
    s.gestures.interrupt();setExpanded(false);setShowOriginal(false);setGenerationKind('terrain');setTerrainPhase('generating');setNotice('正在生成山地与河湖，可以随时取消。');
    const token=++generationToken.current, source=s.history.document, controller=new AbortController();terrainAbort.current=controller;
    const client=terrainClient.current??(terrainClient.current=new FmsTerrainClient());
    try {
      const result=await client.naturalize(source,{seed:Number(seed),strength,coastalWidth},{signal:controller.signal});
      if(generationToken.current!==token||session.current!==s||renderUnavailable.current)return;
      const prepared=prepareFmsTerrainPreview(s.history.document,result);
      if(prepared.patch.changes.length===0){setTerrainPhase('idle');setNotice('没有可更新的内陆地形；海岸与小岛边缘保持原高程，可扩大内陆或调整参数。');return;}
      terrainCandidate.current={kind:'terrain',...prepared,drainage:result.drainage,coastalWidth:result.stats.coastalWidth};showDocument(s,prepared.document,result.drainage);
      setTerrainPhase('preview');setNotice('内陆地形已生成；海岸边界固定。缩放对照后确认，可整步撤销。');
    } catch(error) {
      if(generationToken.current===token&&session.current===s){terrainCandidate.current=null;setTerrainPhase('idle');showDocument(s,s.history.document);setNotice(messageOf(error));}
    } finally {if(generationToken.current===token)terrainAbort.current=null;}
  };
  const generateCoast=async()=>{
    const s=session.current;if(!s||!editable||coastOffset===0)return;
    if(!/^\d{1,10}$/.test(seed)||Number(seed)>0xffffffff){setNotice('地形种子须为0至4294967295之间的整数。');return;}
    s.gestures.interrupt();setExpanded(false);setShowOriginal(false);setGenerationKind('coast');setTerrainPhase('generating');setNotice('正在细化海岸，可以随时取消。');
    const token=++generationToken.current,controller=new AbortController(),options={seed:Number(seed),maxOffset:coastOffset};terrainAbort.current=controller;
    try{
      const client=coastClient.current??(coastClient.current=new FmsCoastClient());
      const preview=await client.refine(s.history.document,options,{signal:controller.signal});
      if(generationToken.current!==token||session.current!==s||renderUnavailable.current)return;
      if(!preview.result.splits.length){setTerrainPhase('idle');setNotice(`没有可细化的海岸；已细化、受保护或支撑不足的狭小区域保持原样。${s.history.canUndo?'可撤销本次操作或用笔刷修改后再试。':'可用笔刷修改海岸后再试。'}`);return;}
      terrainCandidate.current={kind:'coast',...preview,options};showDocument(s,preview.document);
      setTerrainPhase('preview');setNotice('海岸细化已预览；原始边界交点固定，局部弯折受位移和面积约束。');
    }catch(error){if(generationToken.current===token&&session.current===s){terrainCandidate.current=null;setTerrainPhase('idle');showDocument(s,s.history.document);setNotice(messageOf(error));}}
    finally{if(generationToken.current===token)terrainAbort.current=null;}
  };
  const confirmTerrain=()=>{
    const s=session.current,candidate=terrainCandidate.current;if(!s||!candidate||renderUnavailable.current)return;
    s.gestures.interrupt();
    try {
      const doc=candidate.kind==='terrain'||candidate.kind==='hill'||candidate.kind==='template'||candidate.kind==='full-map'?s.history.commit(candidate.patch):s.history.replaceDocument(candidate.kind==='coast'?prepareFmsCoastPreview(s.history.document,candidate.result,candidate.options):prepareFmsCoastSmoothPreview(s.history.document,candidate.result,candidate.options),s.history.document.revision);
      showDocument(s,doc,candidate.kind==='terrain'||candidate.kind==='hill'||candidate.kind==='template'||candidate.kind==='full-map'?candidate.drainage:undefined);terrainCandidate.current=null;setTerrainPhase('idle');setShowOriginal(false);refresh(s);
      setNotice(candidate.kind==='full-map'?'整图地形已应用，可整步撤销；保存后刷新保留实际版图。':candidate.kind==='template'?'原作模板地形已应用，可整步撤销；保存后刷新保留实际地形。':candidate.kind==='hill'?'山丘已应用，可整步撤销；保存后刷新保留实际高度。':candidate.kind==='terrain'?'自然地形已应用，可整步撤销。保存后刷新仍保留山地和河湖。':candidate.kind==='smooth'?'海岸轮廓已平滑，可整步撤销；保存后刷新保留实际位置。每次确认以当前地图为基准。':'海岸细化已应用，可整步撤销；保存后刷新保留实际轮廓。重调这次细化请先撤销。');
    }
    catch(error){cancelTerrain(false);setNotice(messageOf(error));}
  };
  const compareTerrain=()=>{const s=session.current,candidate=terrainCandidate.current;if(!s||!candidate)return;s.gestures.interrupt();showDocument(s,showOriginal?candidate.document:s.history.document,showOriginal&&(candidate.kind==='terrain'||candidate.kind==='hill'||candidate.kind==='template'||candidate.kind==='full-map')?candidate.drainage:undefined);setShowOriginal(!showOriginal);};
  const coastCandidate=terrainCandidate.current?.kind==='coast'?terrainCandidate.current:null;
  const smoothCandidate=terrainCandidate.current?.kind==='smooth'?terrainCandidate.current:null;
  const fullMapCandidate=terrainCandidate.current?.kind==='full-map'?terrainCandidate.current:null;
  const generateSmooth=async()=>{
    const s=session.current;if(!s||!editable||coastOffset===0)return;
    s.gestures.interrupt();setExpanded(false);setShowOriginal(false);setGenerationKind('smooth');setTerrainPhase('generating');setNotice('正在平滑海岸折角并检查形状约束，可以随时取消。');
    const token=++generationToken.current,controller=new AbortController(),options:FmsCoastSmoothOptions={maxOffset:coastOffset,resample:true};terrainAbort.current=controller;
    try{
      const client=coastClient.current??(coastClient.current=new FmsCoastClient()),preview=await client.smooth(s.history.document,options,{signal:controller.signal});
      if(generationToken.current!==token||session.current!==s||renderUnavailable.current)return;
      if(!preview.result.moves.length){setTerrainPhase('idle');setNotice('当前限制内没有能改善折角的平滑结果；地图保持原样。');return;}
      terrainCandidate.current={kind:'smooth',...preview,options};showDocument(s,preview.document);setTerrainPhase('preview');setNotice('轮廓平滑已预览；对照海湾与岬角后确认。本次以当前地图为基准。');
    }catch(error){if(generationToken.current===token&&session.current===s){terrainCandidate.current=null;setTerrainPhase('idle');showDocument(s,s.history.document);setNotice(messageOf(error));}}
    finally{if(generationToken.current===token)terrainAbort.current=null;}
  };
  const changeTerrainDisplay=(display:FmsTerrainDisplay)=>{try{session.current?.gestures.interrupt();session.current?.renderer.setTerrainDisplay(display);}catch(error){setNotice(messageOf(error));}};
  return <main inert={!!playTerrain} onPointerDownCapture={event=>{if(event.target!==session.current?.renderer.canvas)session.current?.gestures.interrupt();}} className="fms-app" data-testid="fms-app" data-revision={stats.revision} data-land-cells={stats.land} data-locked-cells={stats.locked} data-document-version={stats.version} data-tool={tool} data-dirty={stats.dirty} data-terrain-phase={terrainPhase} data-show-original={showOriginal}>
      <div className="fms-map" ref={host}/>
      <button aria-label="进入世界 →" className="play-entry" hidden={expanded || terrainPhase !== 'idle'} disabled={!editable} onClick={()=>{const s=session.current;if(s){s.gestures.interrupt();setExpanded(false);setPlayTerrain(structuredClone(s.history.document));}}}><span>进入世界</span><PlayIcon name="chevron" size={16}/></button>
      {playTerrain&&createPortal(<WorldEntry terrain={playTerrain} onClose={()=>setPlayTerrain(null)}/>,document.body)}
    <header className="fms-header"><div><span className="fms-kicker">列国纪 · 创世</span><h1>地图编辑</h1></div><div className="fms-header-actions"><button aria-label="原作地形" onClick={()=>choose('template')} disabled={!editable} title="原作地形"><PlayIcon name="terrain"/><span>地形</span></button><button aria-label="保存地图" title="保存地图" className="fms-save" onClick={()=>void save()} disabled={!ready||busy||terrainPhase!=='idle'}><PlayIcon name="save"/><span className={stats.dirty?'fms-unsaved':'fms-saved'} aria-label={stats.dirty?'有未保存修改':'已保存'}/></button></div></header>
    {!ready&&!fatal&&<div className="fms-loading" role="status">{[notice,displayNotice].filter(Boolean).join(' ')}</div>}
    {ready&&stats.land===0&&!fatal&&!expanded&&terrainPhase==='idle'&&<div className="fms-empty"><span>从一片海洋开始</span><p>手绘轮廓，或生成完整世界</p><div className="fms-world-options"><label className="fms-world-template">版图<select aria-label="整图版图" value={fullMapTemplate} onChange={e=>setFullMapTemplate(e.target.value as SeedTerrainTemplate)} disabled={!editable}>{SEED_TERRAIN_TEMPLATES.map(template=><option value={template.id} key={template.id}>{template.label}</option>)}</select></label><label className="fms-world-seed">种子<input aria-label="整图种子" inputMode="numeric" maxLength={10} value={seed} onChange={e=>setSeed(e.target.value)} disabled={!editable}/></label></div><button className="fms-first-land" onClick={()=>void generateFullMap()} disabled={!editable}><PlayIcon name="terrain"/><span>预览整张地图</span><PlayIcon name="chevron" size={16}/></button><button className="fms-first-local" title="只生成一片局部大陆" onClick={previewFirstContinent} disabled={!editable}>生成大陆</button><small>两种方式均可取消、撤销；确认后需保存</small></div>}
    {fatal&&<div className="fms-error" role="alert"><strong>地图暂时无法打开</strong><p>{fatal}</p>{!ready&&<button onClick={()=>window.location.reload()}>重新尝试</button>}</div>}
    <div className="fms-zoom" aria-label="地图视角"><button onClick={()=>zoom(1.4)} disabled={!navigable} aria-label="放大"><PlayIcon name="plus"/></button><button onClick={fit} disabled={!navigable} aria-label="查看全图"><PlayIcon name="fit"/></button><button onClick={()=>zoom(1/1.4)} disabled={!navigable} aria-label="缩小"><PlayIcon name="minus"/></button><output>{stats.zoom.toFixed(1)}×</output></div>
    <div className="fms-bottom">
      <div className="fms-status" role="status" aria-live="polite">{ready?[notice,displayNotice].filter(Boolean).join(' '):''}</div>
      {terrainPhase!=='idle'&&<section className="fms-terrain-preview" aria-label={generationKind==='full-map'?'整图地形预览':generationKind==='template'?'原作地形预览':generationKind==='hill'?'山丘预览':generationKind==='smooth'?'轮廓平滑预览':generationKind==='coast'?'海岸细化预览':'自然地形预览'}>
        <strong>{terrainPhase==='generating'?(generationKind==='full-map'?'整张地图生成中…':generationKind==='template'?'原作模板生成中…':generationKind==='hill'?'山丘生成中…':generationKind==='smooth'?'轮廓平滑中…':generationKind==='coast'?'海岸细化中…':'山地与河湖生成中…'):showOriginal?'正在对照原地图':generationKind==='full-map'?'整图地形预览':generationKind==='template'?'原作地形预览':generationKind==='hill'?'山丘预览':generationKind==='smooth'?'轮廓平滑预览':generationKind==='coast'?'海岸细化预览':'自然地形预览'}</strong>
        <p>{terrainPhase==='generating'?'原地图仍被保留。':fullMapCandidate?`${SEED_TERRAIN_TEMPLATES.find(t=>t.id===fullMapCandidate.template)?.label} · 陆地点 ${fullMapCandidate.landCells} · 改变 ${fullMapCandidate.changedCells} 处；确认后可编辑。`:terrainCandidate.current?.kind==='template'?`抬高 ${terrainCandidate.current.changedCells} 处 · 新增陆地点 ${terrainCandidate.current.newLandCells} · ${terrainCandidate.current.preserveCoast?'海岸固定':'允许扩展海岸'}，保护区固定。`:terrainCandidate.current?.kind==='hill'?`抬高 ${terrainCandidate.current.changedCells} 处地形 · 海岸和保护区高程固定。`:smoothCandidate?`加密 ${smoothCandidate.result.stats.addedPoints} 点 · 最大偏移 ${smoothCandidate.result.stats.maxDisplacement.toFixed(3)} 地图单位（上限 ${smoothCandidate.options.maxOffset}）· 单块面积最大变化 ${(smoothCandidate.result.stats.maxComponentAreaFraction*100).toFixed(3)}%`:coastCandidate?`${coastCandidate.result.splits.length} 段 · 最大偏移 ${coastCandidate.result.stats.maxDisplacement.toFixed(3)} 地图单位（上限 ${coastCandidate.options.maxOffset}）${coastCandidate.result.stats.budgetLimited?' · 已达地图点数上限':''}`:`沿海低地宽度 ${Math.round((terrainCandidate.current?.kind==='terrain'?terrainCandidate.current.coastalWidth:coastalWidth)*1000)/10}% · 海岸线固定。`}</p>
        {coastCandidate&&<p>局部海陆面积各变化不超过 2%；保护区跳过。河流与阴影会重新计算。</p>}{smoothCandidate&&<p>每块陆地、水域总面积变化 ≤2%，任意两点间距缩短 ≤20%。小岛边界与支撑不足的细部跳过；保护面固定。每次相对当前地图，连续确认会累积。</p>}<p>单指移动、双指缩放；确认前不会保存。</p><label className="fms-preview-display">地图显示<select aria-label="预览地图显示" value={terrainDisplay} onChange={e=>changeTerrainDisplay(e.target.value as FmsTerrainDisplay)} disabled={!navigable}><option value="height">原作高度配色</option><option value="relief">起伏与阴影</option><option value="biome">气候地貌（试算）</option></select></label>{terrainDisplay==='biome'&&<p>降水河网与地貌增湿同步；切回高度显示汇水面积水系。</p>}<div><button onClick={()=>cancelTerrain()}>取消</button>{terrainPhase==='preview'&&<><button onClick={compareTerrain}>{showOriginal?'查看地形':'查看原图'}</button><button className="fms-confirm" onClick={confirmTerrain}>{generationKind==='full-map'?'确认整图':generationKind==='template'?'确认原作地形':generationKind==='hill'?'确认山丘':generationKind==='smooth'?'确认平滑':generationKind==='coast'?'确认海岸':'确认地形'}</button></>}</div>
      </section>}
      {expanded&&<section className="fms-settings" aria-label="绘图设置"><div className="fms-panel-heading"><h2>高度编辑</h2><button aria-label="收起绘图设置" onClick={()=>setExpanded(false)}><PlayIcon name="close" size={16}/></button></div>
        <label>地图显示<select aria-label="地图显示" value={terrainDisplay} onChange={e=>changeTerrainDisplay(e.target.value as FmsTerrainDisplay)} disabled={!navigable}><option value="height">原作高度配色</option><option value="relief">起伏与阴影</option><option value="biome">气候地貌（试算）</option></select></label><p>{terrainDisplay==='height'?'按原作高度视图着色：低地浅黄，高地橙褐。海洋、河湖仍可见。':terrainDisplay==='biome'?'按原作初始气候试算地貌与降水河网，河流参与增湿。高度／阴影视图仍显示汇水面积水系。':'查看山体阴影与地势起伏。'}切换仅改变显示，不修改地图；当前选择不写入存档。</p>
        <label>笔刷半径 <output>{radius}</output><input type="range" min="8" max="160" step="4" value={radius} onChange={e=>{session.current?.gestures.interrupt();setRadius(+e.target.value);}} disabled={!editable}/></label>
        <label>陆地高度 <output>{height}</output><input type="range" min="25" max="100" step="1" value={height} onChange={e=>{session.current?.gestures.interrupt();setHeight(+e.target.value);}} disabled={!editable}/></label>
        <details className="fms-setting-group"><summary><PlayIcon name="terrain"/><span>原作局部地形</span><PlayIcon name="chevron" size={16}/></summary><fieldset aria-label="原作局部地形"><label>地形模板<select aria-label="原作地形模板" value={localTemplate} onChange={e=>{session.current?.gestures.interrupt();setLocalTemplate(e.target.value as ClickTemplate);}} disabled={!editable}><option value="pangea">连绵大陆 · 原作点击默认</option><option value="highIsland">高山大岛</option></select></label><label className="fms-check"><input type="checkbox" checked={preserveCoast} onChange={e=>{session.current?.gestures.interrupt();setPreserveCoast(e.target.checked);}} disabled={!editable}/>保留已画海岸</label><p>{preserveCoast?'只抬高内陆，海岸固定。要在空白海洋生成岛陆，请关闭此选项。':'允许新增陆地和扩展海岸。已有更高地形、保护区域保留。'}</p><p>落点越靠近地图边缘，生成尺度越小；使用下方种子。模板按整张地图计算，不按笔刷圆形裁切。</p><button onClick={()=>choose('template')} disabled={!editable}>放置原作地形</button></fieldset></details>
        <details className="fms-setting-group"><summary><PlayIcon name="terrain"/><span>山丘</span><PlayIcon name="chevron" size={16}/></summary><fieldset aria-label="山丘"><label>山顶高度 <output>{hillHeight}</output><input aria-label="山顶高度" type="range" min="25" max="100" step="1" value={hillHeight} onChange={e=>{session.current?.gestures.interrupt();setHillHeight(+e.target.value);}} disabled={!editable}/></label><label>向外延展 <output>{hillDecay.toFixed(2)}</output><input aria-label="山丘向外延展" type="range" min="0.8" max="0.98" step="0.01" value={hillDecay} onChange={e=>{session.current?.gestures.interrupt();setHillDecay(+e.target.value);}} disabled={!editable}/></label><p>沿用原作山丘的高度传播与取高方式。数值越大，山体向外延展越远；已有更高地形保留，海岸与保护区固定。使用上方半径、下方种子。</p><button onClick={()=>choose('hill')} disabled={!editable||stats.land===0}>放置山丘</button></fieldset></details>
        <details className="fms-setting-group"><summary><PlayIcon name="layers"/><span>自然地形</span><PlayIcon name="chevron" size={16}/></summary><fieldset aria-label="自然地形"><label>地形种子<input aria-label="地形种子" inputMode="numeric" value={seed} maxLength={10} onChange={e=>setSeed(e.target.value)} disabled={!editable}/></label><label>起伏强度 <output>{Math.round(strength*100)}%</output><input type="range" min="0.2" max="1" step="0.1" value={strength} onChange={e=>setStrength(+e.target.value)} disabled={!editable}/></label><label>沿海低地宽度 <output>{Math.round(coastalWidth*1000)/10}%</output><input aria-label="沿海低地宽度" type="range" min={FMS_MIN_COASTAL_WIDTH*100} max={FMS_MAX_COASTAL_WIDTH*100} step="0.5" value={coastalWidth*100} onChange={e=>setCoastalWidth(+e.target.value/100)} disabled={!editable}/></label><p>按地图短边比例调整内陆过渡，不移动海岸线；保护区高程不变。生成参数仅用于本次会话，保存的是实际地形。</p><button onClick={()=>void generateTerrain()} disabled={!editable||stats.land===0}>预览保形自然化</button></fieldset></details><p>双指移动或缩放 · 松手完成一笔<br/>地图仅保存在当前浏览器</p>
        <details className="fms-setting-group"><summary><PlayIcon name="sea"/><span>海岸形状</span><PlayIcon name="chevron" size={16}/></summary><fieldset aria-label="海岸形状"><label>最大偏移 <output>{coastOffset===0?'固定海岸':`${coastOffset} 地图单位`}</output><input aria-label="海岸细化最大偏移" type="range" min="0" max="4" step="0.25" value={coastOffset} onChange={e=>setCoastOffset(+e.target.value)} disabled={!editable}/></label><p>沿真实海岸局部加密后平滑，最多保留 50,000 点；每块陆地、水域总面积变化 ≤2%，间距缩短 ≤20%。每次相对当前地图，多次确认会累积。保护面、面积小于 4096 平方地图单位的岛屿与水域边界、支撑不足的细部固定。</p><button onClick={()=>void generateSmooth()} disabled={!editable||stats.land===0||coastOffset===0}>预览轮廓平滑</button><p>海岸细化只加入细小弯折，受每个原三角面内海陆面积各 2% 上限约束。保护区及支撑不足的细部跳过。</p><button onClick={()=>void generateCoast()} disabled={!editable||stats.land===0||coastOffset===0}>预览海岸细化</button><p>细化使用上方种子，已细化段不重复叠加。两种操作都可整步撤销，确认后仍需保存。加密会重算水系与阴影。</p></fieldset></details>
        <details className="fms-setting-group"><summary><PlayIcon name="lock"/><span>地形保护</span><PlayIcon name="chevron" size={16}/></summary><fieldset aria-label="地形保护"><p>金色区域固定高程，笔刷、重新生成与海岸细化都会避开；阴影、河流仍可能变化。</p>{stats.version===1&&<p className="fms-upgrade-note">启用并保存后，旧试玩版本无法编辑此地图；保存时保留启用前备份。</p>}<div className="fms-lock-actions"><button onClick={()=>choose('lock')} disabled={!editable}>{stats.version===1?'启用并涂抹保护':'涂抹保护'}</button><button onClick={()=>choose('unlock')} disabled={!editable||stats.locked===0}>涂抹解锁</button></div><p>{stats.locked?'已有保护区域；解锁也是可撤销的一笔。':'尚未保护任何区域。'}</p></fieldset></details>
      </section>}
      {(tool==='lock'||tool==='unlock'||tool==='hill'||tool==='template')&&<div className="fms-lock-mode"><span>{tool==='template'?'⋀ 原作地形 · 松手预览':tool==='hill'?'△ 山丘 · 松手预览':tool==='lock'?'▣ 保护笔刷':'□ 解锁笔刷'}</span><button onClick={()=>choose('browse')} disabled={!editable}>完成</button></div>}
      <div className="fms-toolbar"><nav aria-label="地图工具">{tools.filter(t=>t.id!=='lock'&&t.id!=='unlock'&&t.id!=='hill'&&t.id!=='template').map(t=><button key={t.id} onClick={()=>choose(t.id)} aria-pressed={tool===t.id} disabled={!editable}><PlayIcon name={({browse:'browse',outline:'outline',land:'terrain',sea:'sea',lock:'lock',unlock:'lock',hill:'terrain',template:'terrain'} satisfies Record<Tool,PlayIconName>)[t.id]}/><span>{t.name}</span></button>)}</nav>
      <div className="fms-actions"><button aria-label="撤销" onClick={()=>historyAction(false)} disabled={!editable||!stats.undo}><PlayIcon name="undo"/></button><button aria-label="重做" onClick={()=>historyAction(true)} disabled={!editable||!stats.redo}><PlayIcon name="redo"/></button><button aria-label="绘图设置" aria-expanded={expanded} onClick={()=>{session.current?.gestures.interrupt();setExpanded(!expanded);}} disabled={!editable}><PlayIcon name="settings"/></button></div></div>
    </div>
  </main>;
}
