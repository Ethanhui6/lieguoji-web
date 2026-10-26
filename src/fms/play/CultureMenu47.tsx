import {Fragment,useEffect,useState} from 'react';
import {AUTOSAVE_MAX_MINUTES,AUTOSAVE_MIN_MINUTES,clampAutoSaveMinutes,type Culture47Config} from './culture47-config';
import {gameAudio47,useAudio47} from '../audio/audio47';
import {CultureCloud47} from './CultureCloud47';
import type {Culture47Journal} from './culture47-session';
import {defaultSaveName47,deleteCulture47Named,listCulture47Saves,type Culture47SaveInfo} from './culture47-library';
import {DISPLAY_DEFAULTS47,DISPLAY_SCALE_RANGE47,setDisplaySettings47,useDisplaySettings47} from './display-settings47';

/** Original SettingsUIInfo "菜单选项" with LoadSaveDataUI / NewSaveSlot
 * (存档管理), WarningWithAction confirmations, the EditPanelUI autosave panel
 * and the export choice. Texts are the original localization; "New Save" is
 * the original's untranslated button text. */
type View=
  |{kind:'menu'}|{kind:'library';mode:'load'|'save'}|{kind:'new-save';name:string}
  |{kind:'overwrite';name:string}|{kind:'load-or-delete';name:string}|{kind:'delete';name:string}|{kind:'load-confirm';name:string}
  |{kind:'autosave'}|{kind:'cloud'}|{kind:'export'}|{kind:'export-image'}|{kind:'export-history';mobilize:boolean}|{kind:'other'}|{kind:'display'};
const savedAtText=(iso:string)=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
export function CultureMenu47({busy,hasWorld,unsaved,initial,config,onConfig,onSaveNamed,onLoadNamed,onExportImage,onExportHistory,onQuit,onClose,cloudCurrent,onCloudImport}:{
  busy:boolean;hasWorld:boolean;unsaved:boolean;initial?:'load';config:Culture47Config;onConfig:(c:Culture47Config)=>void;
  onSaveNamed:(name:string)=>Promise<boolean>;onLoadNamed:(name:string)=>Promise<boolean>;
  onExportImage:()=>Promise<void>;onExportHistory:(includeEmergencyMobilize:boolean)=>void;onQuit:()=>void;onClose:()=>void;
  cloudCurrent:()=>{journal:Culture47Journal;day:string}|null;onCloudImport:(journal:Culture47Journal,name:string)=>Promise<boolean>;
}){
  const [view,setView]=useState<View>(initial==='load'?{kind:'library',mode:'load'}:{kind:'menu'});
  const [saves,setSaves]=useState<Culture47SaveInfo[]|null>(null),[error,setError]=useState(''),[minutes,setMinutes]=useState(config.autoSaveMinutes);
  const audio=useAudio47(),display=useDisplaySettings47();
  const [fullscreen,setFullscreen]=useState(()=>!!document.fullscreenElement);
  const refresh=()=>{setSaves(null);setError('');listCulture47Saves().then(setSaves,e=>{setSaves([]);setError(e instanceof Error?e.message:'不能读取存档库。');});};
  useEffect(()=>{if(view.kind==='library')refresh();},[view.kind==='library'?view.mode:null]);
  useEffect(()=>{const sync=()=>setFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync);},[]);
  const back=()=>setView({kind:'menu'}),library=(mode:'load'|'save')=>setView({kind:'library',mode});
  const confirm=(text:string,yes:()=>void,no:()=>void)=><div className="c47-menu-confirm" role="alertdialog" aria-label={text}><p>{text}</p><div><button disabled={busy} onClick={yes}>是</button><button disabled={busy} onClick={no}>否</button></div></div>;
  const load=async(name:string)=>{if(await onLoadNamed(name))onClose();else library('load');};
  const save=async(name:string)=>{if(await onSaveNamed(name))onClose();else library('save');};
  let body;
  switch(view.kind){
    case 'menu':body=<div className="c47-menu-list">
      <button disabled={busy} onClick={()=>library('load')}>加载游戏</button>
      <button disabled={busy||!hasWorld} onClick={()=>library('save')}>保存游戏</button>
      <button disabled={busy||!hasWorld} onClick={()=>setView({kind:'export'})}>导出</button>
      <button disabled={busy} onClick={()=>setView({kind:'autosave'})}>自动保存</button>
      <button onClick={()=>setView({kind:'display'})}>地图外观<small>国名、城市与军队的显示</small></button>
      <button disabled={busy} onClick={()=>setView({kind:'cloud'})}>云存档<small>登录后跨设备保存</small></button>
      <button disabled={!document.fullscreenEnabled} onClick={()=>{void (document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()).catch(()=>{});}}>屏幕模式<small>{fullscreen?'全屏':'窗口'}</small></button>
      {/* Original SettingsUIInfo.volumeSlider (RandomMusicPlayer volume); sound effects and vibration are web additions. */}
      <label className="c47-slider">音乐音量<output>{Math.round(audio.music*100)}</output>
        <input type="range" aria-label="音乐音量" min={0} max={100} step={1} value={Math.round(audio.music*100)} onChange={e=>gameAudio47.update({music:Number(e.target.value)/100})}/></label>
      <label className="c47-slider">音效音量<output>{Math.round(audio.sfx*100)}</output>
        <input type="range" aria-label="音效音量" min={0} max={100} step={1} value={Math.round(audio.sfx*100)} onChange={e=>gameAudio47.update({sfx:Number(e.target.value)/100})}/></label>
      {'vibrate' in navigator&&<label className="c47-check"><input type="checkbox" aria-label="触感反馈" checked={audio.haptics} onChange={e=>gameAudio47.update({haptics:e.target.checked})}/>触感反馈</label>}
      <button disabled={busy} onClick={onQuit}>退出游戏<small>返回地图编辑</small></button>
      <button onClick={onClose}>关闭</button>
    </div>;break;
    case 'library':body=<>
      <p className="c47-menu-hint">选择存档</p>
      <div className="c47-save-list" role="list" aria-label="存档列表">
        {view.mode==='save'&&<button role="listitem" disabled={busy} onClick={()=>setView({kind:'new-save',name:defaultSaveName47()})}>New Save</button>}
        {saves===null?<small>正在读取存档…</small>:saves.map(s=><button role="listitem" key={s.name} disabled={busy||!!s.locked} title={s.locked} onClick={()=>setView(view.mode==='save'?{kind:'overwrite',name:s.name}:{kind:'load-or-delete',name:s.name})}><span>{s.name}</span><small>{s.locked??savedAtText(s.savedAt)}</small></button>)}
        {saves?.length===0&&view.mode==='load'&&<small>暂无存档</small>}
      </div>
      {error&&<p className="c47-menu-error">{error}</p>}
      <button className="c47-menu-back" onClick={back}>关闭</button>
    </>;break;
    case 'new-save':body=<form className="c47-new-save" onSubmit={e=>{e.preventDefault();void save(view.name);}}>
      <input aria-label="存档名称" value={view.name} maxLength={120} onChange={e=>setView({kind:'new-save',name:e.target.value})}/>
      <div><button type="submit" disabled={busy}>保存游戏</button><button type="button" onClick={()=>library('save')}>关闭</button></div>
    </form>;break;
    case 'overwrite':body=confirm(`是否覆盖该存档？存档：${view.name}`,()=>void save(view.name),()=>library('save'));break;
    case 'load-or-delete':body=<div className="c47-menu-list" aria-label="加载或删除存档">
      <p className="c47-menu-hint">加载或删除存档 · {view.name}</p>
      <button disabled={busy} onClick={()=>{if(unsaved)setView({kind:'load-confirm',name:view.name});else void load(view.name);}}>加载存档</button>
      <button disabled={busy} onClick={()=>setView({kind:'delete',name:view.name})}>删除存档</button>
      <button onClick={()=>library('load')}>关闭</button>
    </div>;break;
    // Web protection: the original loads at once; here unsaved progress is confirmed first.
    case 'load-confirm':body=confirm('当前世界有未保存的进度，加载存档后将丢失，是否继续？',()=>void load(view.name),()=>setView({kind:'load-or-delete',name:view.name}));break;
    case 'delete':body=confirm('删除当前存档，是否继续？',()=>{void deleteCulture47Named(view.name).then(()=>library('load'),e=>{setError(e instanceof Error?e.message:'删除失败，原存档保留。');library('load');});},()=>setView({kind:'load-or-delete',name:view.name}));break;
    case 'autosave':body=<div className="c47-menu-list" aria-label="自动保存设置">
      <p className="c47-menu-hint">自动保存设置</p>
      <label className="c47-check"><input type="checkbox" aria-label="自动保存开关" checked={config.autoSave} onChange={e=>onConfig({...config,autoSave:e.target.checked})}/>自动保存开关</label>
      <label className="c47-slider">自动保存间隔(分钟)<output>{minutes}</output>
        <input type="range" aria-label="自动保存间隔(分钟)" min={AUTOSAVE_MIN_MINUTES} max={AUTOSAVE_MAX_MINUTES} step={1} value={minutes} onChange={e=>{const m=clampAutoSaveMinutes(Number(e.target.value));setMinutes(m);onConfig({...config,autoSaveMinutes:m});}}/></label>
      <small>推演开始后按真实时间计时；保存前5秒可按 ESC 取消。存为“autosave”。</small>
      <button onClick={back}>关闭</button>
    </div>;break;
    case 'export':body=<div className="c47-menu-list" aria-label="请选择需要导出的内容">
      <p className="c47-menu-hint">请选择需要导出的内容</p>
      <button onClick={()=>setView({kind:'export-image'})}>导出图片</button>
      <button onClick={()=>setView({kind:'export-history',mobilize:false})}>导出历史记录</button>
      <button onClick={back}>关闭</button>
    </div>;break;
    case 'export-image':body=<div className="c47-menu-list" aria-label="导出图片">
      <p className="c47-menu-hint">导出图片</p>
      <label className="c47-check"><input type="checkbox" checked readOnly/>当前视图</label>
      {['植被图','高度图','国家图','宗教图','文化图'].map(t=><label key={t} className="c47-check is-pending"><input type="checkbox" disabled/>{t}<small>尚未还原</small></label>)}
      <button disabled={busy} onClick={()=>{void onExportImage();}}>开始导出</button>
      <button onClick={()=>setView({kind:'export'})}>关闭</button>
    </div>;break;
    case 'export-history':body=<div className="c47-menu-list" aria-label="导出历史记录">
      <p className="c47-menu-hint">导出历史记录</p>
      <label className="c47-check"><input type="checkbox" aria-label="紧急动员" checked={view.mobilize} onChange={e=>setView({kind:'export-history',mobilize:e.target.checked})}/>紧急动员</label>
      <button onClick={()=>onExportHistory(view.mobilize)}>开始导出</button>
      <button onClick={()=>setView({kind:'export'})}>关闭</button>
    </div>;break;
    case 'cloud':body=<CultureCloud47 busy={busy} current={cloudCurrent} onImport={onCloudImport} onBack={back}/>;break;
    case 'display':{const d=display,scale=(label:string,key:'stateNameScale'|'cityScale'|'armyScale')=><label className="c47-slider" key={key}>{label}<output>{d[key].toFixed(2)}</output>
        <input type="range" aria-label={label} min={DISPLAY_SCALE_RANGE47.min} max={DISPLAY_SCALE_RANGE47.max} step={DISPLAY_SCALE_RANGE47.step} value={d[key]} onChange={e=>setDisplaySettings47({[key]:Number(e.target.value)})}/></label>;
      // Original DisplaySettings (地图外观): the settings that only change how the map is drawn.
      body=<div className="c47-menu-list" aria-label="地图外观">
      <p className="c47-menu-hint">地图外观</p>
      {scale('国名缩放','stateNameScale')}
      <label className="c47-slider">国名颜色<input type="color" aria-label="国名颜色" value={d.stateNameColor} onChange={e=>setDisplaySettings47({stateNameColor:e.target.value})}/></label>
      <label className="c47-check"><input type="checkbox" aria-label="显示完整国名" checked={d.fullName} onChange={e=>setDisplaySettings47({fullName:e.target.checked})}/>显示完整国名</label>
      {scale('城市缩放','cityScale')}{scale('军队图标缩放','armyScale')}
      <label className="c47-check"><input type="checkbox" aria-label="时间显示" checked={d.timeDisplay} onChange={e=>setDisplaySettings47({timeDisplay:e.target.checked})}/>时间显示</label>
      <label className="c47-check"><input type="checkbox" aria-label="事件显示" checked={d.eventDisplay} onChange={e=>setDisplaySettings47({eventDisplay:e.target.checked})}/>事件显示</label>
      <small>国家名字后缀由政治体制和复国次数决定；如果想自定义后缀，可以在地图外观中关闭完整国名显示。</small>
      <button onClick={()=>setDisplaySettings47({...DISPLAY_DEFAULTS47})}>恢复默认</button>
      <button onClick={back}>关闭</button>
    </div>;break;}
    case 'other':body=<div className="c47-menu-list" aria-label="其他设置">
      <p className="c47-menu-hint">其他设置</p>
      {['分辨率','音乐音量','镜头缩放速度','显示提示','地图坐标','植被图标'].map(t=><label key={t} className="c47-check is-pending"><input type="checkbox" disabled/>{t}<small>尚未还原</small></label>)}
      <button onClick={back}>关闭</button>
    </div>;break;
  }
  const title=view.kind==='cloud'?'云存档':view.kind==='menu'||view.kind==='autosave'||view.kind==='other'||view.kind==='display'||view.kind.startsWith('export')?'菜单选项':'存档管理';
  return <section className="c47-menu" role="dialog" aria-label={title}>
    <header><strong>{title}</strong><button aria-label="关闭菜单选项" onClick={onClose}>×</button></header>
    <Fragment key={view.kind}>{body}</Fragment>
  </section>;
}
