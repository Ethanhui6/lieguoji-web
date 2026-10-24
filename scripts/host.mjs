// 电脑计算主机：模拟在电脑上运行，手机只负责显示和操作。
// 用法：npm run build（或已有 dist）后 npm run host [-- --tunnel]，或双击仓库根目录的「电脑计算.cmd」。
//   局域网（默认）：手机与电脑连同一个 Wi-Fi，手机浏览器打开屏幕上显示的 http://电脑IP:4180，
//                   网页和计算都由这台电脑提供，不经过任何隧道或代理。
//   --tunnel        用 Cloudflare 免费隧道生成外网地址（需要已安装 cloudflared），在外面也能连。
// 使用的是 dist 里与网页完全相同的模拟引擎文件。
import http from 'node:http';
import crypto from 'node:crypto';
import {Buffer} from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import {spawn,execSync} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {encodeWire47,decodeWire47} from '../src/fms/play/wire47.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const PORT=Number(process.env.HOST_PORT??4180),SITE=process.env.HOST_SITE??'https://lieguoji-web.pages.dev';
// --prepare（电脑计算.cmd 使用）：先更新到正式站同一版本并构建，过程逐步显示。
if(process.argv.includes('--prepare')){
  const run=(title,cmd)=>{console.log(`\n${title}`);try{execSync(cmd,{cwd:root,stdio:'inherit'});return true;}catch{return false;}};
  console.log('列国纪 电脑计算：正在准备，第一次大约需要一两分钟，请不要关闭窗口……');
  if(!run('[1/2] 更新到最新版本（git pull）','git pull --ff-only'))console.log('  更新失败，继续使用本机现有版本。');
  if(!run('[2/2] 构建游戏文件（npm run build）','npm run build')){console.log('\n构建失败，请把这个窗口截图发给 Claude。');process.exit(1);}
}
const build=JSON.parse(fs.readFileSync(path.join(dist,'build.json'),'utf8'));
const bundle=fs.readdirSync(path.join(dist,'assets')).find(n=>/^culture47\.worker-.*\.js$/.test(n));
if(!bundle)throw Error('dist 中没有模拟引擎，请先运行 npm run build。');
const CODE=process.env.HOST_CODE??String(crypto.randomInt(100000,1000000));
const allowedOrigin=(o,host)=>!o||o===new URL(SITE).origin||/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)||!!host&&(o==='http://'+host||o==='https://'+host);

// ---- 最小 WebSocket（RFC 6455，文本帧，无扩展）----
function accept(key){return crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');}
function frame(text){
  const data=Buffer.from(text,'utf8'),n=data.length;
  const head=n<126?Buffer.from([0x81,n]):n<65536?Buffer.from([0x81,126,n>>8,n&255]):Buffer.concat([Buffer.from([0x81,127]),(()=>{const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(n));return b;})()]);
  return Buffer.concat([head,data]);
}
function reader(onText,onClose){
  let buf=Buffer.alloc(0),parts=[];
  return chunk=>{
    buf=Buffer.concat([buf,chunk]);
    for(;;){
      if(buf.length<2)return;
      const fin=buf[0]&0x80,op=buf[0]&0x0f,masked=buf[1]&0x80;let len=buf[1]&0x7f,off=2;
      if(len===126){if(buf.length<4)return;len=buf.readUInt16BE(2);off=4;}
      else if(len===127){if(buf.length<10)return;len=Number(buf.readBigUInt64BE(2));off=10;}
      const mask=masked?buf.subarray(off,off+4):null;if(masked)off+=4;
      if(buf.length<off+len)return;
      const payload=Buffer.from(buf.subarray(off,off+len));buf=buf.subarray(off+len);
      if(mask)for(let i=0;i<payload.length;i++)payload[i]^=mask[i&3];
      if(op===8){onClose();return;}
      if(op===9||op===10)continue;
      parts.push(payload);if(fin){onText(Buffer.concat(parts).toString('utf8'));parts=[];}
    }
  };
}

// ---- 局域网直连：由这台电脑提供整个网页（同源 ws://，无需 https 隧道）----
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2','.wasm':'application/wasm'};
// http:// 局域网页面不是安全上下文，浏览器不提供 crypto.randomUUID；用 getRandomValues 补上。
const UUID_SHIM="if(typeof crypto!=='undefined'&&!crypto.randomUUID)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);};\n";
// 页面打开时自动记住本机计算地址和访问码，无需手动输入。
const REMOTE_SCRIPT=`<script>${UUID_SHIM}try{localStorage.setItem('lieguoji-remote-host-v1',JSON.stringify({url:(location.protocol==='https:'?'wss://':'ws://')+location.host+'/engine',code:${JSON.stringify(CODE)}}));}catch{}</script>`;
function serveStatic(req,res){
  let file;
  try{file=path.normalize(path.join(dist,decodeURIComponent(new URL(req.url??'/','http://x').pathname)));}catch{res.writeHead(400);res.end();return;}
  if(!file.startsWith(dist)){res.writeHead(403);res.end();return;}
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dist,'index.html');
  const ext=path.extname(file);let body=fs.readFileSync(file);
  if(ext==='.html')body=Buffer.from(body.toString('utf8').replace('<head>','<head>'+REMOTE_SCRIPT));
  else if(ext==='.js')body=Buffer.concat([Buffer.from(UUID_SHIM),body]);
  res.writeHead(200,{'content-type':TYPES[ext]??'application/octet-stream','cache-control':ext==='.html'?'no-store':'public, max-age=3600'});
  res.end(body);
}

const server=http.createServer(serveStatic);
server.on('upgrade',(req,socket)=>{
  if(req.url!=='/engine'||!req.headers['sec-websocket-key']||!allowedOrigin(req.headers.origin,req.headers.host)){socket.destroy();return;}
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept(req.headers['sec-websocket-key'])}\r\n\r\n`);
  socket.setNoDelay(true);
  const send=value=>{if(!socket.destroyed)socket.write(frame(typeof value==='string'?value:JSON.stringify(value)));};
  let worker=null,closed=false;
  const close=()=>{if(closed)return;closed=true;worker?.terminate();socket.end();console.log(`[${new Date().toLocaleTimeString()}] 手机已断开`);};
  socket.on('data',reader(text=>{
    if(!worker){
      let hello;try{hello=JSON.parse(text);}catch{return close();}
      if(hello?.type!=='hello'||hello.code!==CODE){send({type:'denied',reason:'访问码不正确。'});return close();}
      if(hello.engine!==build.culture47Fingerprint){send({type:'denied',reason:`电脑端版本（${build.version}）与网页不一致，请在电脑上更新并重新构建后再连接。`});return close();}
      worker=new Worker(path.join(root,'scripts/host-engine.mjs'),{workerData:{bundle:path.join(dist,'assets',bundle)}});
      worker.on('message',m=>{if(m&&m.ready){send({type:'ready',version:build.version});console.log(`[${new Date().toLocaleTimeString()}] 手机已连接，开始在电脑上计算`);return;}send(encodeWire47(m));});
      worker.on('error',e=>{console.error('模拟引擎出错：',e);close();});
      return;
    }
    worker.postMessage(decodeWire47(text));
  },close));
  socket.on('close',close);socket.on('error',close);
});
// 局域网地址：跳过回环、自动分配地址和代理 TUN 的 198.18.0.0/15 假地址。
const lanAddresses=()=>Object.values(os.networkInterfaces()).flat().filter(a=>a&&a.family==='IPv4'&&!a.internal&&!/^198\.1[89]\./.test(a.address)&&!/^169\.254\./.test(a.address)).map(a=>a.address);
server.listen(PORT,'0.0.0.0',()=>{
  console.log(`\n列国纪电脑计算主机 · 版本 ${build.version}`);
  const lan=lanAddresses();
  if(lan.length){
    console.log('\n【手机与电脑连同一个 Wi-Fi】在手机浏览器地址栏输入：');
    for(const a of lan)console.log(`    http://${a}:${PORT}`);
    console.log('  打开后右上角显示「电脑计算中」即成功。第一次运行时如果 Windows 防火墙弹窗，请勾选「专用网络」并点允许。');
  }else console.log('没有找到局域网地址，请确认电脑已连接 Wi-Fi 或网线。');
  console.log(`\n访问码：${CODE}（局域网页面已自动填好）`);
  console.log('关闭这个窗口即停止电脑计算，手机会自动改回本机计算。');
  if(process.argv.includes('--tunnel'))void startTunnel();
  else console.log('（要在外面用手机流量连接，请加 --tunnel 启动外网隧道）');
});
// 本机代理（Clash 等）的 HTTP 端口：申请隧道时经代理发出；隧道主连接需要代理规则把 argotunnel.com 设为直连。
const portOpen=port=>new Promise(resolve=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));s.setTimeout(500,()=>{s.destroy();resolve(false);});});
let tunnelChild=null;
process.on('exit',()=>tunnelChild?.kill());process.on('SIGINT',()=>{tunnelChild?.kill();process.exit(0);});
async function startTunnel(attempt=1){
  const exe=process.env.CLOUDFLARED??['C:/Program Files (x86)/cloudflared/cloudflared.exe','C:/Program Files/cloudflared/cloudflared.exe'].find(f=>fs.existsSync(f))??'cloudflared';
  const env={...process.env};
  if(!env.HTTPS_PROXY)for(const port of [7897,7890]){if(await portOpen(port)){env.HTTPS_PROXY=env.HTTP_PROXY=`http://127.0.0.1:${port}`;if(attempt===1)console.log(`隧道申请经本机代理 127.0.0.1:${port} 发出。`);break;}}
  const child=tunnelChild=spawn(exe,['tunnel','--no-autoupdate','--protocol','http2','--url',`http://localhost:${PORT}`],{stdio:['ignore','pipe','pipe'],env});
  let link=null,warned=false,connected=false,failed=false;
  child.on('error',()=>console.log('\n没有找到 cloudflared。请先安装：winget install --id Cloudflare.cloudflared'));
  const scan=chunk=>{
    const text=chunk.toString();
    // 申请失败（偶发）：退出后重试，最多 5 次。
    if(/failed to request quick Tunnel/.test(text)&&!failed){failed=true;child.kill();if(attempt<5){console.log(`隧道申请失败，第 ${attempt+1} 次重试……`);setTimeout(()=>void startTunnel(attempt+1),3000);}else console.log('隧道申请多次失败，请稍后重新启动。局域网地址仍可使用。');return;}
    const m=/https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/.exec(text);if(m&&!link)link=m[0];
    if(/Registered tunnel connection/.test(text)&&!connected){connected=true;console.log(`\n外网隧道已连通。在外面用手机打开下面的链接（可发到微信再点开）：\n    ${link??'（链接见上方日志）'}\n`);}
    else if(/TLS handshake with edge error/.test(text)&&!warned){warned=true;console.log('隧道连不上 Cloudflare：请在代理软件里把 argotunnel.com 和 198.41.192.0/20 设为直连。');}
  };
  child.stdout.on('data',scan);child.stderr.on('data',scan);
}
