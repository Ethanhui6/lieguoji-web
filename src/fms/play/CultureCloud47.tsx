import {useEffect,useState} from 'react';
import type {Culture47Journal} from './culture47-session';
import {defaultSaveName47,listCulture47Saves,loadCulture47Named,type Culture47SaveInfo} from './culture47-library';
import {deleteCloud47,downloadCloud47,listCloudSaves47,loginCloud47,logoutCloud47,readCloudSession47,registerCloud47,uploadCloud47,type CloudSave47,type CloudSession47} from './cloud-client47';

/** 菜单 → 云存档 (web addition): sign in with a nickname and password, upload the current
 * world or a local save, download a cloud save into the local library. */
const size=(n:number)=>n<1024*1024?`${Math.max(1,Math.round(n/1024))} KB`:`${(n/1024/1024).toFixed(1)} MB`;
const when=(iso:string)=>{const d=new Date(iso);return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
export function CultureCloud47({busy,current,onImport,onBack}:{
  busy:boolean;current:()=>{journal:Culture47Journal;day:string}|null;
  onImport:(journal:Culture47Journal,name:string)=>Promise<boolean>;onBack:()=>void;
}){
  const [session,setSession]=useState<CloudSession47|null>(()=>readCloudSession47());
  const [mode,setMode]=useState<'login'|'register'>('login'),[name,setName]=useState(''),[password,setPassword]=useState(''),[again,setAgain]=useState('');
  const [saves,setSaves]=useState<CloudSave47[]|null>(null),[local,setLocal]=useState<Culture47SaveInfo[]>([]);
  const [message,setMessage]=useState(''),[working,setWorking]=useState(false),[uploadName,setUploadName]=useState(()=>defaultSaveName47()),[confirm,setConfirm]=useState<string|null>(null);
  const run=async(task:()=>Promise<string|void>)=>{setWorking(true);setMessage('');try{const m=await task();if(m)setMessage(m);}catch(e){setMessage(e instanceof Error?e.message:'操作失败。');if(!readCloudSession47())setSession(null);}finally{setWorking(false);}};
  const refresh=(s:CloudSession47)=>run(async()=>{setSaves(await listCloudSaves47(s));});
  useEffect(()=>{if(session)void refresh(session);void listCulture47Saves().then(setLocal,()=>setLocal([]));},[session?.token]);
  const disabled=busy||working;
  if(!session)return <div className="c47-menu-list c47-cloud" aria-label="云存档登录">
    <div className="c47-segment" role="tablist" aria-label="登录或注册">{(['login','register'] as const).map(m=><button key={m} role="tab" aria-selected={mode===m} onClick={()=>{setMode(m);setMessage('');}}>{m==='login'?'登录':'注册'}</button>)}</div>
    <form className="c47-cloud-form" onSubmit={e=>{e.preventDefault();if(mode==='register'&&password!==again){setMessage('两次输入的密码不一致。');return;}void run(async()=>{const s=mode==='login'?await loginCloud47(name.trim(),password):await registerCloud47(name.trim(),password);setPassword('');setAgain('');setSession(s);return mode==='login'?`欢迎回来，${s.name}`:`注册成功，欢迎 ${s.name}`;});}}>
      <label>昵称<input aria-label="昵称" autoComplete="username" value={name} maxLength={20} onChange={e=>setName(e.target.value)}/></label>
      <label>密码<input aria-label="密码" type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} maxLength={128} onChange={e=>setPassword(e.target.value)}/></label>
      {mode==='register'&&<label>确认密码<input aria-label="确认密码" type="password" autoComplete="new-password" value={again} maxLength={128} onChange={e=>setAgain(e.target.value)}/></label>}
      <button type="submit" className="c47-primary" disabled={disabled||!name.trim()||!password}>{working?'请稍候…':mode==='login'?'登录':'注册并登录'}</button>
    </form>
    <small>存档保存在列国纪服务器上，换手机或电脑登录同一个账号即可下载。昵称 2–20 个字，密码至少 8 位；请不要使用其他网站的密码。</small>
    {message&&<p className="c47-menu-hint" role="status">{message}</p>}
    <button onClick={onBack}>关闭</button>
  </div>;
  const now=current();
  return <div className="c47-menu-list c47-cloud" aria-label="云存档">
    <div className="c47-cloud-account"><span>已登录 · <b>{session.name}</b></span><button disabled={disabled} onClick={()=>void run(async()=>{await logoutCloud47(session);setSession(null);setSaves(null);return '已退出登录。';})}>退出</button></div>
    {now&&<form className="c47-cloud-upload" onSubmit={e=>{e.preventDefault();void run(async()=>{const s=await uploadCloud47(session,uploadName.trim(),now.journal,now.day);setSaves(await listCloudSaves47(session));return `已上传：${s.name}（${size(s.size)}）`;});}}>
      <input aria-label="云存档名称" value={uploadName} maxLength={60} onChange={e=>setUploadName(e.target.value)}/>
      <button type="submit" className="c47-primary" disabled={disabled||!uploadName.trim()}>上传当前世界</button>
    </form>}
    <p className="c47-menu-hint">云端存档{saves?` · ${saves.length}/10`:''}</p>
    <div className="c47-save-list" role="list" aria-label="云存档列表">
      {saves===null?<small>正在读取…</small>:saves.length===0?<small>还没有云存档</small>:saves.map(s=><div role="listitem" key={s.name} className="c47-cloud-row">
        <span><b>{s.name}</b><small>{[s.day,when(s.savedAt),size(s.size)].filter(Boolean).join(' · ')}</small></span>
        {confirm===s.name?<><button disabled={disabled} onClick={()=>{setConfirm(null);void run(async()=>{await deleteCloud47(session,s.name);setSaves(await listCloudSaves47(session));return `已删除云存档：${s.name}`;});}}>确认删除</button><button onClick={()=>setConfirm(null)}>取消</button></>
          :<><button disabled={disabled} onClick={()=>void run(async()=>{setMessage('正在下载并校验存档…');const j=await downloadCloud47(session,s.name);if(!await onImport(j,s.name))return '下载的存档未能写入本地。';setLocal(await listCulture47Saves());return `已下载到本地存档：${s.name}，可在「加载游戏」中打开。`;})}>下载</button><button disabled={disabled} onClick={()=>setConfirm(s.name)}>删除</button></>}
      </div>)}
    </div>
    {local.length>0&&<><p className="c47-menu-hint">本地存档 · 上传到云端</p>
      <div className="c47-save-list" role="list" aria-label="本地存档上传">{local.filter(l=>!l.locked).map(l=><div role="listitem" key={l.name} className="c47-cloud-row"><span><b>{l.name}</b></span><button disabled={disabled} onClick={()=>void run(async()=>{const j=await loadCulture47Named(l.name);const s=await uploadCloud47(session,l.name,j,'');setSaves(await listCloudSaves47(session));return `已上传：${s.name}（${size(s.size)}）`;})}>上传</button></div>)}</div></>}
    {message&&<p className="c47-menu-hint" role="status">{message}</p>}
    <button onClick={onBack}>关闭</button>
  </div>;
}
