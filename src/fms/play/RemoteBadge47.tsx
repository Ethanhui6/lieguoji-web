import {useEffect,useState} from 'react';
import {disconnectRemote47,onRemoteState47,remoteState47} from './culture47-remote';

/** Shows whether the simulation runs on the user's PC (电脑计算). */
export function RemoteBadge47(){
  const [state,setState]=useState(remoteState47);
  useEffect(()=>onRemoteState47(setState),[]);
  if(state.kind==='off')return null;
  const text=state.kind==='connected'?'电脑计算中':state.kind==='connecting'?'正在连接电脑…':state.reason;
  return <div className={'c47-remote is-'+state.kind} role="status">
    <span>{text}</span>
    <button onClick={()=>{disconnectRemote47();location.reload();}}>{state.kind==='failed'?'不再连接':'断开'}</button>
  </div>;
}
