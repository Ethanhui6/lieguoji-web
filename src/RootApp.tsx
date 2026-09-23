import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {WorldStudio} from './editor/WorldStudio';
import {createDraft,compileWorld} from './worldgen/engine';
import type {EditorDraft} from './worldgen/types';
import {loadWorkspace,saveWorkspace,encodeWorkspace,decodeWorkspace,type Workspace} from './editor/store';
import {readSave,writeSave,decodeSave} from './persistence';
import './styles.css';
const Game=lazy(()=>import('./App'));

const runFromUrl=()=>{const id=new URLSearchParams(window.location.search).get('world');return id&&/^run-[a-z0-9-]{1,55}$/.test(id)?id:'';};
const initialScreen=()=>runFromUrl()?'simulation':window.location.pathname.startsWith('/campaign')||new URLSearchParams(window.location.search).has('demo')?'demo':'studio';
export default function RootApp(){
 const [screen,setScreen]=useState<'studio'|'demo'|'simulation'>(initialScreen);
 const [workspace,setWorkspace]=useState<Workspace>(()=>({schemaVersion:1,draft:createDraft('山河-2026'),runs:[]}));
 const [loaded,setLoaded]=useState(false),[error,setError]=useState<string|null>(null),[saveStatus,setSaveStatus]=useState('正在读取草稿…');
 const [activeRun,setActiveRun]=useState(runFromUrl);
 const [operating,setOperating]=useState(false);const operation=useRef(false);
 const revision=useRef(0),locked=useRef(false),writing=useRef(false),dirty=useRef(false);
 useEffect(()=>{let stale=false;void loadWorkspace().then(result=>{if(stale)return;revision.current=result.revision;locked.current=false;if(result.data)setWorkspace(result.data);setSaveStatus(result.data?(result.recovered?'已恢复上一份有效草稿':'已恢复工坊草稿'):'新草稿 · 尚未保存');}).catch(err=>{if(!stale){locked.current=true;setError(String(err));setSaveStatus('原草稿已锁定保护，本局仍可导出');}}).finally(()=>{if(!stale)setLoaded(true);});return()=>{stale=true;};},[]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 useEffect(()=>{const navigate=()=>{setScreen(initialScreen());setActiveRun(runFromUrl());};window.addEventListener('popstate',navigate);return()=>window.removeEventListener('popstate',navigate);},[]);
 const back=()=>{window.history.pushState(null,'','/');setScreen('studio');};
 const demo=()=>{window.history.pushState(null,'','/?demo=1');setScreen('demo');};
 async function persist(next:Workspace){
  if(locked.current)throw new Error('原工坊存档无法读取，已锁定写入；请导出当前草稿，并使用兼容版本恢复。');
  if(writing.current)throw new Error('工坊正在保存，请稍候。');writing.current=true;
  try{revision.current=await saveWorkspace(next,revision.current);dirty.current=false;setSaveStatus('草稿已保存');setError(null);}finally{writing.current=false;}
 }
 const begin=()=>{if(operation.current)throw new Error('工坊正在处理上一项操作，请稍候。');operation.current=true;setOperating(true);};
 const end=()=>{operation.current=false;setOperating(false);};
 const change=(draft:EditorDraft)=>{if(operation.current)return;setWorkspace(current=>({...current,draft}));dirty.current=true;setSaveStatus('草稿有未保存修改');};
 async function save(){begin();try{await persist(workspace);}catch(err){setError(err instanceof Error?err.message:String(err));throw err;}finally{end();}}
 async function start(draft:EditorDraft){
  begin();
  try{
   const world=compileWorld(draft);if(!world.custom)throw new Error('自建世界缺少身份信息');
   const id=`run-${crypto.randomUUID()}`;world.custom.id=id;
   const next:Workspace={...workspace,draft,runs:[{id,name:draft.name,createdAt:new Date().toISOString()},...workspace.runs]};
   if(next.runs.length>100)throw new Error('已经保留100个历史世界。请先导出备份后整理，当前历史未删除。');
   await writeSave(world,0,`custom-${id}`);await persist(next);setWorkspace(next);setActiveRun(id);window.history.pushState(null,'',`/?world=${id}`);setScreen('simulation');
  }catch(err){setError(err instanceof Error?err.message:String(err));throw err;}finally{end();}
 }
 async function resume(id=workspace.runs[0]?.id){
  if(!id)return;try{const saved=await readSave(`custom-${id}`);if(!saved.world)throw new Error('此推演的存档不在当前浏览器，请导入推演备份。');setActiveRun(id);window.history.pushState(null,'',`/?world=${id}`);setScreen('simulation');setError(null);}catch(err){setError(err instanceof Error?err.message:String(err));}
 }
 async function exportDraft(){const data=await encodeWorkspace({...workspace,runs:[]});const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`列国纪-${workspace.draft.name}.world.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function importDraft(file:File){begin();try{
  if(file.size>5*1024*1024)throw new Error('工坊文件超过5MB，未导入。');const raw:unknown=JSON.parse(await file.text());
  if(raw&&typeof raw==='object'&&'format'in raw&&raw.format==='lieguoji-save'){
   const world=await decodeSave(raw);if(!world.custom||world.scenario!=='custom-world')throw new Error('此文件是战役样例存档，请在战役样例中导入。');
   const id=`run-${crypto.randomUUID()}`;world.custom.id=id;const next={...workspace,runs:[{id,name:world.custom.name,createdAt:new Date().toISOString()},...workspace.runs]};
   await writeSave(world,0,`custom-${id}`);await persist(next);setWorkspace(next);setActiveRun(id);window.history.pushState(null,'',`/?world=${id}`);setScreen('simulation');return;
  }
  const incoming=await decodeWorkspace(raw);const next={...workspace,draft:{...incoming.draft,id:`world-${crypto.randomUUID()}`}};await persist(next);setWorkspace(next);setError(null);
 }catch(err){setError(err instanceof Error?err.message:String(err));throw err;}finally{end();}}
 if(screen==='demo'||screen==='simulation')return <Suspense fallback={<main className="loading-state"><h1>正在打开推演地图…</h1></main>}><Game key={screen==='demo'?'test-continent':activeRun} scope={screen==='demo'?'test-continent':`custom-${activeRun}`} onBack={back}/></Suspense>;
 if(!loaded)return <main className="loading-state" style={{minHeight:'100dvh'}}><h1>正在打开世界工坊</h1><p>读取地图草稿与历史世界…</p></main>;
 return <div inert={operating} aria-busy={operating}>
  {workspace.runs.length>1&&<div className="world-archive"><label>已保存的推演 <select aria-label="已保存的推演" defaultValue="" onChange={e=>{void resume(e.target.value);}}><option value="" disabled>选择历史世界</option>{workspace.runs.map(r=><option key={r.id} value={r.id}>{r.name} · {new Date(r.createdAt).toLocaleString('zh-CN')}</option>)}</select></label></div>}
  <WorldStudio draft={workspace.draft} onChange={change} onStart={start} onDemo={demo} onSave={save} onExport={exportDraft} onImport={importDraft} saveStatus={saveStatus} error={error} onResume={()=>void resume()} canResume={workspace.runs.length>0}/>
 </div>;
}
