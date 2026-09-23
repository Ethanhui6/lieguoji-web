import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {WorldStudio} from './editor/WorldStudio';
import {createDraft,compileWorld} from './worldgen/engine';
import type {EditorDraft} from './worldgen/types';
import {loadWorkspace,saveWorkspace,encodeWorkspace,decodeWorkspace,type Workspace} from './editor/store';
import {readSave,writeSave,decodeSave} from './persistence';
import {prepareManagementCopy} from './engine/conversions';
import {resolveHistoryEngine,resolveWorldEngine,type EngineFacade} from './engine/registry';
import type {World} from './sim/types';
import {readHistoryRun,writeHistoryRun,parseHistoryFile} from './history/store';
import {ReplaySession} from './history/replay';
import type {HistoryLog,HistoryParent} from './history/types';
import './styles.css';
const Game=lazy(()=>import('./App'));

const runFromUrl=()=>{const id=new URLSearchParams(window.location.search).get('world');return id&&/^run-[a-z0-9-]{1,55}$/.test(id)?id:'';};
const initialScreen=()=>runFromUrl()?'simulation':window.location.pathname.startsWith('/campaign')||new URLSearchParams(window.location.search).has('demo')?'demo':'studio';
export default function RootApp(){
 const [screen,setScreen]=useState<'studio'|'demo'|'simulation'>(initialScreen);
 const [workspace,setWorkspace]=useState<Workspace>(()=>({schemaVersion:1,draft:createDraft('山河-2026'),runs:[]}));
 const [loaded,setLoaded]=useState(false),[error,setError]=useState<string|null>(null),[saveStatus,setSaveStatus]=useState('正在读取草稿…');
 const [activeRun,setActiveRun]=useState(runFromUrl);
 const [operating,setOperating]=useState(false);const operation=useRef(false),navigation=useRef(0);
 const revision=useRef(0),locked=useRef(false),writing=useRef(false),dirty=useRef(false);
 useEffect(()=>{let stale=false;void loadWorkspace().then(result=>{if(stale)return;revision.current=result.revision;locked.current=false;if(result.data)setWorkspace(result.data);setSaveStatus(result.data?(result.recovered?'已恢复上一份有效草稿':'已恢复工坊草稿'):'新草稿 · 尚未保存');}).catch(err=>{if(!stale){locked.current=true;setError(String(err));setSaveStatus('原草稿已锁定保护，本局仍可导出');}}).finally(()=>{if(!stale)setLoaded(true);});return()=>{stale=true;};},[]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 useEffect(()=>{const navigate=()=>{navigation.current++;setScreen(initialScreen());setActiveRun(runFromUrl());};window.addEventListener('popstate',navigate);return()=>window.removeEventListener('popstate',navigate);},[]);
 const back=()=>{navigation.current++;window.history.pushState(null,'','/');setScreen('studio');};
 const demo=()=>{navigation.current++;window.history.pushState(null,'','/?demo=1');setScreen('demo');};
 async function persist(next:Workspace){
  if(locked.current)throw new Error('原工坊存档无法读取，已锁定写入；请导出当前草稿，并使用兼容版本恢复。');
  if(writing.current)throw new Error('工坊正在保存，请稍候。');writing.current=true;
  try{revision.current=await saveWorkspace(next,revision.current);dirty.current=false;setSaveStatus('草稿已保存');setError(null);}finally{writing.current=false;}
 }
 const begin=()=>{if(!loaded)throw new Error('工坊历史仍在读取，请稍候重试。');if(locked.current){const message='原工坊存档无法读取，已锁定写入；请导出当前草稿，并使用兼容版本恢复。';setError(message);throw new Error(message);}if(operation.current||writing.current)throw new Error('工坊正在处理上一项操作，请稍候。');operation.current=true;setOperating(true);};
 const end=()=>{operation.current=false;setOperating(false);};
 const change=(draft:EditorDraft)=>{if(operation.current)return;setWorkspace(current=>({...current,draft}));dirty.current=true;setSaveStatus('草稿有未保存修改');};
 async function save(){begin();try{await persist(workspace);}catch(err){setError(err instanceof Error?err.message:String(err));throw err;}finally{end();}}
 async function registerRun(candidate:World,draft=workspace.draft){
  if(!candidate.custom||candidate.scenario!=='custom-world')throw new Error('自建世界缺少身份信息');
  if(workspace.runs.length>=100)throw new Error('已经保留100个历史世界。请先导出备份后整理，当前历史未删除。');
  const world=structuredClone(candidate),id=`run-${crypto.randomUUID()}`;world.custom={...world.custom!,id};
  const next:Workspace={...workspace,draft,runs:[{id,name:world.custom.name,createdAt:new Date().toISOString()},...workspace.runs]};
  await writeSave(world,0,`custom-${id}`);await persist(next);setWorkspace(next);setActiveRun(id);window.history.pushState(null,'',`/?world=${id}`);setScreen('simulation');
 }
 async function start(draft:EditorDraft){
  begin();
  try{
   await registerRun(compileWorld(draft),draft);
  }catch(err){setError(err instanceof Error?err.message:String(err));throw err;}finally{end();}
 }
 async function upgrade(world:World){
  begin();
  try{
   if(screen!=='simulation'||runFromUrl()!==activeRun||world.scenario!=='custom-world'||!world.custom||world.custom.id!==activeRun||world.schemaVersion!==1||world.rulesVersion!=='0.1.0')throw new Error('只能为当前旧版自建世界创建经营推演副本，原历史未修改。');
   const copy=prepareManagementCopy(world);
   if(!copy.custom)throw new Error('经营副本缺少世界身份');
   copy.custom={...copy.custom,name:`${copy.custom.name.slice(0,110)} · 经营副本`};
   await registerRun(copy);
  }catch(err){setError(err instanceof Error?err.message:String(err));throw err;}finally{end();}
 }
 async function resume(id=workspace.runs[0]?.id){
  if(!id||operation.current||writing.current)return;
  try{begin();}catch(err){setError(err instanceof Error?err.message:String(err));return;}
  const ticket=++navigation.current;
  try{const present=id.startsWith('run-h-')?(await readHistoryRun(id)).record:(await readSave(`custom-${id}`)).world;if(!present)throw new Error('此推演的存档不在当前浏览器，请导入推演备份。');if(ticket!==navigation.current)return;setActiveRun(id);window.history.pushState(null,'',`/?world=${id}`);setScreen('simulation');setError(null);}catch(err){
   if(ticket!==navigation.current)return;
   setError(err instanceof Error?err.message:String(err));
   // Registered runs remain reachable even if their current format cannot be read.
   // App offers a raw, read-only backup for this exact scope without replacing it.
   if(workspace.runs.some(run=>run.id===id)){setActiveRun(id);window.history.pushState(null,'',`/?world=${id}`);setScreen('simulation');}
  }finally{end();}
 }
 async function registerHistory(candidate:World,parent:HistoryParent|null,engine:EngineFacade,imported?:HistoryLog){
  if(!candidate.custom||candidate.scenario!=='custom-world')throw new Error('只有自建世界可以记录历史');
  if(workspace.runs.length>=100)throw new Error('已经保留100个历史世界，请先导出备份后整理。');
  const sourceUrl=window.location.href,ticket=navigation.current,id=`run-h-${crypto.randomUUID()}`,world=structuredClone(candidate);
  if(!imported)world.custom={...world.custom!,id,name:`${world.custom!.name.slice(0,95)} · ${parent?'分支':'记录'}`};
  if(imported&&imported.engineFingerprint!==engine.fingerprint)throw new Error('导入记录与核验引擎不符，当前世界未修改。');
  const history=imported??await engine.createHistory(world,{runId:id,...(parent?{parent}:{})});
  await writeHistoryRun(id,{world,history,readOnly:!!imported},0);
  const next:Workspace={...workspace,runs:[{id,name:imported?`${world.custom!.name.slice(0,110)} · 历史归档`:world.custom!.name,createdAt:new Date().toISOString()},...workspace.runs]};
  try{await persist(next);}catch(err){throw new Error(`历史已单独保留，但工坊登记失败，未切换原局。恢复编号 ${id}；${err instanceof Error?err.message:String(err)}`,{cause:err});}
  setWorkspace(next);if(window.location.href!==sourceUrl||ticket!==navigation.current)return;
  setActiveRun(id);window.history.pushState(null,'',`/?world=${id}`);setScreen('simulation');
 }
 async function record(world:World){
  begin();try{
   if(screen!=='simulation'||runFromUrl()!==activeRun||world.custom?.id!==activeRun||activeRun.startsWith('run-h-'))throw new Error('只能从当前尚未记录的自建世界建立记录副本。');
   const engine=resolveWorldEngine(world);if(!engine)throw new Error('当前世界的规则引擎尚未注册，不能创建记录；原推演保留。');
   await registerHistory(world,null,engine);
  }catch(err){setError(err instanceof Error?err.message:String(err));throw err;}finally{end();}
 }
 async function branch(point:{world:World;parent:HistoryParent;sourceEngineFingerprint:string}){
  begin();let session:ReplaySession|undefined;const sourceUrl=window.location.href,ticket=navigation.current;try{
   const saved=await readHistoryRun(activeRun);
   if(!saved.record||saved.record.history.runId!==point.parent.runId)throw new Error('源历史已变化，请重新选择分支位置。');
   const engine=resolveHistoryEngine(saved.record.history);
   if(!engine||engine.fingerprint!==point.sourceEngineFingerprint)throw new Error('源历史引擎未注册或已变化，不能创建分支；原记录保留。');
   session=new ReplaySession();
   const verified=await session.init(saved.record.history,point.parent.seq);
   if(await engine.hashWorld(verified.world)!==point.parent.worldHash||await engine.hashWorld(point.world)!==point.parent.worldHash)throw new Error('分支状态与源历史不符，原记录保留。');
   if(window.location.href!==sourceUrl||ticket!==navigation.current)throw new Error('已离开源历史，分支创建已取消。');
   await registerHistory(verified.world,point.parent,engine);
  }catch(err){setError(err instanceof Error?err.message:String(err));throw err;}finally{session?.close();end();}
 }
 async function importHistory(file:File){
  begin();let session:ReplaySession|undefined;const sourceUrl=window.location.href,ticket=navigation.current;try{
   const history=await parseHistoryFile(file),engine=resolveHistoryEngine(history);
   if(!engine)throw new Error('此历史的规则引擎尚未注册，无法核验完整末态，未导入；原文件与当前推演均保留。');
   session=new ReplaySession();
   const verified=await session.init(history);
   if(window.location.href!==sourceUrl||ticket!==navigation.current)throw new Error('已离开当前推演，历史导入已取消。');
   await registerHistory(verified.world,null,engine,history);
  }catch(err){setError(err instanceof Error?err.message:String(err));throw err;}finally{session?.close();end();}
 }
 async function exportDraft(){const data=await encodeWorkspace({...workspace,runs:[]});const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`列国纪-${workspace.draft.name}.world.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function importDraft(file:File){begin();try{
  if(file.size>5*1024*1024)throw new Error('工坊文件超过5MB，未导入。');const raw:unknown=JSON.parse(await file.text());
  if(raw&&typeof raw==='object'&&'format'in raw&&raw.format==='lieguoji-save'){
   const world=await decodeSave(raw);if(!world.custom||world.scenario!=='custom-world')throw new Error('此文件是战役样例存档，请在战役样例中导入。');
   await registerRun(world);return;
  }
  const incoming=await decodeWorkspace(raw);const next={...workspace,draft:{...incoming.draft,id:`world-${crypto.randomUUID()}`}};await persist(next);setWorkspace(next);setError(null);
 }catch(err){setError(err instanceof Error?err.message:String(err));throw err;}finally{end();}}
 if(screen==='demo'||screen==='simulation')return <div inert={operating} aria-busy={operating}><Suspense fallback={<main className="loading-state"><h1>正在打开推演地图…</h1></main>}><Game key={screen==='demo'?'test-continent':activeRun} scope={screen==='demo'?'test-continent':`custom-${activeRun}`} onBack={back} onUpgrade={screen==='simulation'?upgrade:undefined} onRecord={screen==='simulation'?record:undefined} onBranch={branch} onImportHistory={importHistory}/></Suspense></div>;
 if(!loaded)return <main className="loading-state" style={{minHeight:'100dvh'}}><h1>正在打开世界工坊</h1><p>读取地图草稿与历史世界…</p></main>;
 return <div inert={operating} aria-busy={operating}>
  <WorldStudio draft={workspace.draft} onChange={change} onStart={start} onDemo={demo} onSave={save} onExport={exportDraft} onImport={importDraft} saveStatus={saveStatus} error={error} onResume={()=>void resume()} canResume={workspace.runs.length>0} savedRuns={workspace.runs} onResumeRun={id=>{void resume(id);}}/>
 </div>;
}
