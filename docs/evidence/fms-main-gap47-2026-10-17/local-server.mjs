import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('.autopilot/fms-main-gap47-final-checked');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const headers=Object.fromEntries(fs.readFileSync('public/_headers','utf8').split('\n').filter(line=>line.startsWith('  ')).map(line=>{const i=line.indexOf(':');return[line.slice(0,i).trim(),line.slice(i+1).trim()];}));
createServer((req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),target=path.resolve(root,'.'+pathname);
    if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const file=fs.existsSync(target)&&fs.statSync(target).isFile()?target:path.join(root,'index.html');
    res.writeHead(200,{...headers,'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});
    fs.createReadStream(file).pipe(res);
  }catch{res.writeHead(400);res.end();}
}).listen(5336,'127.0.0.1',()=>console.log('FMS checked local preview http://127.0.0.1:5336/?fms=1'));

