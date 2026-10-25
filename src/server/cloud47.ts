/** 列国纪 cloud saves (web addition; the original has no online saves). Runs as a Cloudflare
 * Pages Function over a D1 database bound as DB (schema: migrations/0001_cloud.sql).
 *
 * Accounts are a nickname and a password: PBKDF2-SHA256 with a per-user random salt (the
 * iteration count is stored per user so it can be raised later); sessions are random 256-bit
 * tokens of which only the SHA-256 is stored, valid 30 days. A save is the gzip of a world
 * journal, stored in ≤ 1 MB chunks (D1 rows are limited to 2 MB). Limits: 10 saves per
 * account, 8 MB per save; repeated failed logins for a name or address are slowed down.
 *
 * Routes (JSON unless noted):
 *   POST /api/cloud/register {name,password} → {token,name}
 *   POST /api/cloud/login    {name,password} → {token,name}
 *   POST /api/cloud/logout
 *   GET  /api/cloud/me                         → {name}
 *   GET  /api/cloud/saves                      → {saves:[{name,savedAt,size,day}]}
 *   PUT  /api/cloud/saves/:name  body gzip, header X-Save-Day → {name,savedAt,size}
 *   GET  /api/cloud/saves/:name  → gzip bytes
 *   DELETE /api/cloud/saves/:name */
export interface D1Statement47{bind(...values:unknown[]):D1Statement47;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>;run():Promise<unknown>}
export interface D1Like47{prepare(sql:string):D1Statement47;batch(statements:D1Statement47[]):Promise<unknown>}
export type CloudEnv47={DB:D1Like47};

export const CLOUD47={iterations:25000,sessionDays:30,maxSaves:10,maxSaveBytes:8*1024*1024,chunkBytes:1024*1024,failWindowMs:15*60*1000,maxFails:8} as const;
const NAME=/^[\p{L}\p{N}_\-·]{2,20}$/u;
const enc=new TextEncoder();
const hex=(b:ArrayBuffer|Uint8Array)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const unhex=(s:string)=>Uint8Array.from(s.match(/../g)??[],h=>Number.parseInt(h,16));
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const fail=(status:number,message:string)=>json({error:message},status);

export async function hashPassword47(password:string,salt:Uint8Array,iterations:number):Promise<string>{
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:salt as BufferSource,iterations},key,256));
}
const sha256=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
/** Constant-time comparison of two hex strings. */
function same(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
export const validName47=(name:unknown):name is string=>typeof name==='string'&&NAME.test(name);
export const validPassword47=(p:unknown):p is string=>typeof p==='string'&&p.length>=8&&p.length<=128;
export const validSaveName47=(n:string)=>n.length>=1&&n.length<=60&&![...n].some(c=>c.charCodeAt(0)<32||c==='/'||c==='\\');

async function body(request:Request):Promise<Record<string,unknown>|null>{try{const v=await request.json();return v&&typeof v==='object'?v as Record<string,unknown>:null;}catch{return null;}}
async function issue(db:D1Like47,userId:number,now:number){
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha256(token),userId,now+CLOUD47.sessionDays*864e5).run();
  return token;
}
async function user(db:D1Like47,request:Request,now:number):Promise<{id:number;name:string}|null>{
  const m=/^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization')??'');if(!m)return null;
  return db.prepare('SELECT u.id AS id,u.name AS name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await sha256(m[1]),now).first<{id:number;name:string}>();
}
async function throttled(db:D1Like47,key:string,now:number){
  const row=await db.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE key=? AND at>?').bind(key,now-CLOUD47.failWindowMs).first<{n:number}>();
  return (row?.n??0)>=CLOUD47.maxFails;
}

/** migrations/0001_cloud.sql, applied idempotently on an instance's first request so a fresh
 * D1 database needs no manual migration step. */
export const CLOUD_SCHEMA47=[
  'CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE COLLATE NOCASE,salt TEXT NOT NULL,hash TEXT NOT NULL,iterations INTEGER NOT NULL,created_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)',
  "CREATE TABLE IF NOT EXISTS saves(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,saved_at INTEGER NOT NULL,size INTEGER NOT NULL,day TEXT NOT NULL DEFAULT '',PRIMARY KEY(user_id,name))",
  'CREATE TABLE IF NOT EXISTS save_chunks(user_id INTEGER NOT NULL,name TEXT NOT NULL,idx INTEGER NOT NULL,data BLOB NOT NULL,PRIMARY KEY(user_id,name,idx))',
  'CREATE TABLE IF NOT EXISTS login_failures(key TEXT NOT NULL,at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS login_failures_key ON login_failures(key,at)',
];
const ready=new WeakSet<D1Like47>();
export async function handleCloud47(request:Request,env:CloudEnv47,now=Date.now()):Promise<Response>{
  const db=env.DB;if(!db)return fail(503,'云存档服务尚未开通。');
  if(!ready.has(db)){try{await db.batch(CLOUD_SCHEMA47.map(sql=>db.prepare(sql)));ready.add(db);}catch(error){console.error('cloud47 schema',error);return fail(503,'云存档服务暂不可用。');}}
  const path=new URL(request.url).pathname.replace(/^\/api\/cloud\/?/,''),method=request.method;
  const ip=request.headers.get('cf-connecting-ip')??'local';
  try{
    if(method==='POST'&&(path==='register'||path==='login')){
      const b=await body(request);const name=b?.name,password=b?.password;
      if(!validName47(name))return fail(400,'昵称需为 2–20 个字（中文、字母、数字、_ - ·）。');
      if(!validPassword47(password))return fail(400,'密码需为 8–128 个字符。');
      if(path==='register'){
        if(await db.prepare('SELECT id FROM users WHERE name=?').bind(name).first())return fail(409,'这个昵称已被使用。');
        const salt=crypto.getRandomValues(new Uint8Array(16));
        await db.prepare('INSERT INTO users(name,salt,hash,iterations,created_at) VALUES(?,?,?,?,?)').bind(name,hex(salt),await hashPassword47(password,salt,CLOUD47.iterations),CLOUD47.iterations,now).run();
      }else{
        if(await throttled(db,'name:'+name.toLowerCase(),now)||await throttled(db,'ip:'+ip,now))return fail(429,'尝试次数过多，请 15 分钟后再试。');
        const row=await db.prepare('SELECT id,salt,hash,iterations FROM users WHERE name=?').bind(name).first<{id:number;salt:string;hash:string;iterations:number}>();
        const ok=row&&same(await hashPassword47(password,unhex(row.salt),row.iterations),row.hash);
        if(!ok){await db.batch([db.prepare('INSERT INTO login_failures(key,at) VALUES(?,?)').bind('name:'+name.toLowerCase(),now),db.prepare('INSERT INTO login_failures(key,at) VALUES(?,?)').bind('ip:'+ip,now)]);return fail(401,'昵称或密码不正确。');}
      }
      const row=(await db.prepare('SELECT id,name FROM users WHERE name=?').bind(name).first<{id:number;name:string}>())!;
      return json({token:await issue(db,row.id,now),name:row.name});
    }
    const me=await user(db,request,now);
    if(!me)return fail(401,'请先登录。');
    if(method==='POST'&&path==='logout'){const m=/^Bearer (.+)$/.exec(request.headers.get('authorization')??'')!;await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(m[1])).run();return json({ok:true});}
    if(method==='GET'&&path==='me')return json({name:me.name});
    if(method==='GET'&&path==='saves'){
      const {results}=await db.prepare('SELECT name,saved_at AS savedAt,size,day FROM saves WHERE user_id=? ORDER BY saved_at DESC').bind(me.id).all<{name:string;savedAt:number;size:number;day:string}>();
      return json({saves:results.map(r=>({...r,savedAt:new Date(r.savedAt).toISOString()}))});
    }
    const m=/^saves\/(.+)$/.exec(path);
    if(m){
      let name:string;try{name=decodeURIComponent(m[1]);}catch{return fail(400,'存档名无效。');}
      if(!validSaveName47(name))return fail(400,'存档名需为 1–60 个字。');
      if(method==='GET'){
        const {results}=await db.prepare('SELECT data FROM save_chunks WHERE user_id=? AND name=? ORDER BY idx').bind(me.id,name).all<{data:ArrayBuffer|Uint8Array|number[]}>();
        if(!results.length)return fail(404,'没有这个云存档。');
        const parts=results.map(r=>r.data instanceof Uint8Array?r.data:new Uint8Array(r.data as ArrayBuffer));
        const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){out.set(p,o);o+=p.length;}
        return new Response(out,{headers:{'content-type':'application/gzip','cache-control':'no-store'}});
      }
      if(method==='DELETE'){await db.batch([db.prepare('DELETE FROM save_chunks WHERE user_id=? AND name=?').bind(me.id,name),db.prepare('DELETE FROM saves WHERE user_id=? AND name=?').bind(me.id,name)]);return json({ok:true});}
      if(method==='PUT'){
        const data=new Uint8Array(await request.arrayBuffer());
        if(!data.length||data[0]!==0x1f||data[1]!==0x8b)return fail(400,'存档数据无效。');
        if(data.length>CLOUD47.maxSaveBytes)return fail(413,'存档过大（上限 8 MB）。');
        const exists=await db.prepare('SELECT 1 AS x FROM saves WHERE user_id=? AND name=?').bind(me.id,name).first();
        const count=await db.prepare('SELECT COUNT(*) AS n FROM saves WHERE user_id=?').bind(me.id).first<{n:number}>();
        if(!exists&&(count?.n??0)>=CLOUD47.maxSaves)return fail(409,`每个账号最多 ${CLOUD47.maxSaves} 个云存档，请先删除旧的。`);
        let day='';try{day=decodeURIComponent(request.headers.get('x-save-day')??'').slice(0,40);}catch{/* optional label */}
        const statements=[db.prepare('DELETE FROM save_chunks WHERE user_id=? AND name=?').bind(me.id,name),
          db.prepare('INSERT OR REPLACE INTO saves(user_id,name,saved_at,size,day) VALUES(?,?,?,?,?)').bind(me.id,name,now,data.length,day)];
        for(let i=0,k=0;i<data.length;i+=CLOUD47.chunkBytes,k++)statements.push(db.prepare('INSERT INTO save_chunks(user_id,name,idx,data) VALUES(?,?,?,?)').bind(me.id,name,k,data.slice(i,i+CLOUD47.chunkBytes)));
        await db.batch(statements);
        return json({name,savedAt:new Date(now).toISOString(),size:data.length});
      }
    }
    return fail(404,'未知请求。');
  }catch(error){console.error('cloud47',error);return fail(500,'云存档服务出错，请稍后再试。');}
}
