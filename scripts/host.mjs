// 电脑计算主机：手机打开正式站并连接到这里，模拟在电脑上运行，手机只负责显示和操作。
// 用法：npm run build（或已有 dist）后 npm run host [-- --tunnel]
//   --tunnel  用 Cloudflare 免费隧道生成外网地址（需要已安装 cloudflared），在外面也能连。
// 使用的是 dist 里与网页完全相同的模拟引擎文件，存档互通。
import http from 'node:http';
import crypto from 'node:crypto';
import {Buffer} from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {encodeWire47,decodeWire47} from '../src/fms/play/wire47.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PORT=Number(process.env.HOST_PORT??4180),SITE=process.env.HOST_SITE??'https://lieguoji-web.pages.dev';
const build=JSON.parse(fs.readFileSync(path.join(root,'dist/build.json'),'utf8'));
const bundle=fs.readdirSync(path.join(root,'dist/assets')).find(n=>/^culture47\.worker-.*\.js$/.test(n));
if(!bundle)throw Error('dist 中没有模拟引擎，请先运行 npm run build。');
const CODE=process.env.HOST_CODE??String(crypto.randomInt(100000,1000000));
const allowedOrigin=o=>!o||o===new URL(SITE).origin||/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

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

const server=http.createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/plain; charset=utf-8','access-control-allow-origin':'*'});
  res.end(`列国纪电脑计算主机运行中\n版本 ${build.version} · 引擎 ${build.culture47Fingerprint.slice(0,8)}\n`);
});
server.on('upgrade',(req,socket)=>{
  if(req.url!=='/engine'||!req.headers['sec-websocket-key']||!allowedOrigin(req.headers.origin)){socket.destroy();return;}
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
      worker=new Worker(path.join(root,'scripts/host-engine.mjs'),{workerData:{bundle:path.join(root,'dist/assets',bundle)}});
      worker.on('message',m=>{if(m&&m.ready){send({type:'ready',version:build.version});console.log(`[${new Date().toLocaleTimeString()}] 手机已连接，开始在电脑上计算`);return;}send(encodeWire47(m));});
      worker.on('error',e=>{console.error('模拟引擎出错：',e);close();});
      return;
    }
    worker.postMessage(decodeWire47(text));
  },close));
  socket.on('close',close);socket.on('error',close);
});
server.listen(PORT,'127.0.0.1',()=>{
  console.log(`\n列国纪电脑计算主机 · 版本 ${build.version}`);
  console.log(`访问码：${CODE}`);
  console.log(`本机测试：${SITE}/?host=${encodeURIComponent(`ws://localhost:${PORT}/engine`)}&code=${CODE}`);
  if(process.argv.includes('--tunnel'))startTunnel();
  else console.log('（要在手机上使用，请加 --tunnel 启动外网隧道）');
});
function startTunnel(){
  const exe=process.env.CLOUDFLARED??['C:/Program Files (x86)/cloudflared/cloudflared.exe','C:/Program Files/cloudflared/cloudflared.exe'].find(f=>fs.existsSync(f))??'cloudflared';
  const child=spawn(exe,['tunnel','--no-autoupdate','--url',`http://localhost:${PORT}`],{stdio:['ignore','pipe','pipe']});
  child.on('error',()=>console.log('\n没有找到 cloudflared。请先安装：winget install --id Cloudflare.cloudflared'));
  let shown=false;
  const scan=chunk=>{const m=/https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString());if(m&&!shown){shown=true;
    const link=`${SITE}/?host=${encodeURIComponent(m[0].replace('https://','wss://')+'/engine')}&code=${CODE}`;
    console.log(`\n外网隧道已就绪。在手机上打开下面的链接（可发到微信再点开）：\n${link}\n`);}};
  child.stdout.on('data',scan);child.stderr.on('data',scan);
  process.on('exit',()=>child.kill());process.on('SIGINT',()=>{child.kill();process.exit(0);});
}
