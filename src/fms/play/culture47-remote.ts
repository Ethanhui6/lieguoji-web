import {encodeWire47,decodeWire47} from './wire47';

/** 电脑计算（scripts/host.mjs）：the page keeps its display and saves; the
 * simulation runs on the user's PC behind a WebSocket that looks like the
 * local Worker. Opened once with ?host=wss://…/engine&code=123456, then
 * remembered in this browser until 断开. */
const KEY='lieguoji-remote-host-v1';
export type RemoteHost47={url:string;code:string};
export type RemoteState47={kind:'off'}|{kind:'connecting'}|{kind:'connected';version:string}|{kind:'failed';reason:string};
let state:RemoteState47={kind:'off'};const listeners=new Set<(s:RemoteState47)=>void>();
const setState=(s:RemoteState47)=>{state=s;for(const f of listeners)f(s);};
export const remoteState47=()=>state;
export function onRemoteState47(f:(s:RemoteState47)=>void){listeners.add(f);return()=>{listeners.delete(f);};}

export function remoteHost47():RemoteHost47|null{
  try{
    const q=new URLSearchParams(location.search),url=q.get('host'),code=q.get('code');
    if(url&&code&&/^wss?:\/\//.test(url)){localStorage.setItem(KEY,JSON.stringify({url,code}));
      // Keep the address bar clean (the code is remembered locally).
      q.delete('host');q.delete('code');history.replaceState(null,'',location.pathname+(q.size?'?'+q:'')+location.hash);}
    const v=JSON.parse(localStorage.getItem(KEY)??'null') as RemoteHost47|null;
    return v&&typeof v.url==='string'&&typeof v.code==='string'?v:null;
  }catch{return null;}
}
export function disconnectRemote47(){try{localStorage.removeItem(KEY);}catch{/* storage unavailable */}setState({kind:'off'});}

/** A Worker-shaped connection to the PC host. */
class RemoteWorker47 {
  onmessage:((e:MessageEvent)=>void)|null=null;onerror:(()=>void)|null=null;onmessageerror:(()=>void)|null=null;
  constructor(private socket:WebSocket){
    socket.onmessage=e=>{try{this.onmessage?.({data:decodeWire47(String(e.data))} as MessageEvent);}catch{this.onmessageerror?.();}};
    socket.onclose=socket.onerror=()=>{setState({kind:'failed',reason:'与电脑的连接已断开，已切回手机计算。'});this.onerror?.();};
  }
  postMessage(message:unknown){this.socket.send(encodeWire47(message));}
  terminate(){this.socket.onclose=this.socket.onerror=null;this.socket.close();}
}
export function connectRemote47(host:RemoteHost47,engine:string,signal:AbortSignal):Promise<Worker>{
  setState({kind:'connecting'});
  return new Promise((resolve,reject)=>{
    const socket=new WebSocket(host.url);let done=false;
    const fail=(reason:string)=>{if(done)return;done=true;clearTimeout(timer);socket.onopen=socket.onmessage=socket.onclose=socket.onerror=null;try{socket.close();}catch{/* closed */}setState({kind:'failed',reason});reject(Error(reason));};
    const timer=setTimeout(()=>fail('连接电脑超时，已改用手机计算。'),8000);
    signal.addEventListener('abort',()=>fail('已取消。'),{once:true});
    socket.onopen=()=>socket.send(JSON.stringify({type:'hello',code:host.code,engine}));
    socket.onerror=socket.onclose=()=>fail('连不上电脑计算主机，已改用手机计算。');
    socket.onmessage=e=>{
      let m:{type?:string;version?:string;reason?:string};try{m=JSON.parse(String(e.data));}catch{return fail('电脑返回的数据无效。');}
      if(m.type==='denied')return fail(m.reason??'电脑拒绝了连接。');
      if(m.type==='ready'&&!done){done=true;clearTimeout(timer);setState({kind:'connected',version:m.version??''});resolve(new RemoteWorker47(socket) as unknown as Worker);}
    };
  });
}
