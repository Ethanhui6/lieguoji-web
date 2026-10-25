import {describe,expect,it} from 'vitest';
import {gzipSync,gunzipSync} from 'node:zlib';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {CLOUD47,handleCloud47,type D1Like47,type D1Statement47} from './cloud47';

/** D1's statement API over node:sqlite, enough for the cloud routes. */
function fakeD1():D1Like47{
  const db=new DatabaseSync(':memory:');
  const statement=(sql:string,values:unknown[]=[]):D1Statement47=>{
    const args=()=>values.map(v=>v instanceof Uint8Array?Buffer.from(v):v) as never[];
    return {bind:(...v)=>statement(sql,v),first:async<T>()=>(db.prepare(sql).get(...args()) as T)??null,all:async<T>()=>({results:db.prepare(sql).all(...args()) as T[]}),run:async()=>db.prepare(sql).run(...args())};
  };
  return {prepare:sql=>statement(sql),batch:async list=>{db.exec('BEGIN');try{for(const s of list)await s.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};
}
const env={DB:fakeD1()};
let clock=1_800_000_000_000;
const call=async(method:string,path:string,{token,body,headers}:{token?:string;body?:BodyInit;headers?:Record<string,string>}={})=>
  handleCloud47(new Request('https://x.test/api/cloud/'+path,{method,body,headers:{...(token?{authorization:'Bearer '+token}:{}),...headers}}),env,clock);
const post=(path:string,data:unknown,token?:string)=>call('POST',path,{token,body:JSON.stringify(data),headers:{'content-type':'application/json'}});

describe('cloud saves (web addition)',()=>{
  it('registers, logs in, stores a chunked gzip save, lists, downloads and deletes it',async()=>{
    expect((await post('register',{name:'x',password:'12345678'})).status).toBe(400);
    expect((await post('register',{name:'史官',password:'short'})).status).toBe(400);
    const reg=await post('register',{name:'史官',password:'correct horse'});expect(reg.status).toBe(200);
    expect((await post('register',{name:'史官',password:'another one'})).status).toBe(409);
    const {token}=await (await post('login',{name:'史官',password:'correct horse'})).json() as {token:string};
    expect((await post('login',{name:'史官',password:'wrong password'})).status).toBe(401);
    expect((await call('GET','me',{token})).status).toBe(200);
    expect((await call('GET','saves')).status).toBe(401);
    // A journal larger than one chunk.
    const journal=JSON.stringify({opening:{terrain:randomBytes(1_200_000).toString('base64')},actions:[]});
    const gz=gzipSync(journal);expect(gz.length).toBeGreaterThan(CLOUD47.chunkBytes);
    const put=await call('PUT','saves/'+encodeURIComponent('我的世界'),{token,body:gz,headers:{'x-save-day':encodeURIComponent('公元3年5月1日')}});
    expect(put.status).toBe(200);
    const list=await (await call('GET','saves',{token})).json() as {saves:{name:string;size:number;day:string}[]};
    expect(list.saves).toEqual([expect.objectContaining({name:'我的世界',size:gz.length,day:'公元3年5月1日'})]);
    const got=await call('GET','saves/'+encodeURIComponent('我的世界'),{token});
    expect(gunzipSync(Buffer.from(await got.arrayBuffer())).toString()).toBe(journal);
    expect((await call('PUT','saves/bad',{token,body:'not gzip'})).status).toBe(400);
    expect((await call('DELETE','saves/'+encodeURIComponent('我的世界'),{token})).status).toBe(200);
    expect((await call('GET','saves/'+encodeURIComponent('我的世界'),{token})).status).toBe(404);
    expect((await post('logout',{},token)).status).toBe(200);
    expect((await call('GET','me',{token})).status).toBe(401);
  },60000);
  it('limits saves per account and slows down repeated failed logins',async()=>{
    await post('register',{name:'旅人',password:'password-1'});
    const {token}=await (await post('login',{name:'旅人',password:'password-1'})).json() as {token:string};
    for(let i=0;i<CLOUD47.maxSaves;i++)expect((await call('PUT','saves/s'+i,{token,body:gzipSync('x')})).status).toBe(200);
    expect((await call('PUT','saves/one-more',{token,body:gzipSync('x')})).status).toBe(409);
    expect((await call('PUT','saves/s0',{token,body:gzipSync('y')})).status).toBe(200);
    for(let i=0;i<CLOUD47.maxFails;i++)await post('login',{name:'旅人',password:'wrong-wrong'});
    expect((await post('login',{name:'旅人',password:'password-1'})).status).toBe(429);
    clock+=CLOUD47.failWindowMs+1;
    expect((await post('login',{name:'旅人',password:'password-1'})).status).toBe(200);
  },60000);
  it('without a database binding the service reports it is not open yet',async()=>{
    const r=await handleCloud47(new Request('https://x.test/api/cloud/me'),{} as never);expect(r.status).toBe(503);
  });
});
describe('cloud schema',()=>{
  it('the migration file and the built-in schema are the same statements',async()=>{
    const {readFileSync}=await import('node:fs');const {CLOUD_SCHEMA47}=await import('./cloud47');
    const file=readFileSync('migrations/0001_cloud.sql','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('--')).map(l=>l.replace(/;$/,''));
    expect(file).toEqual(CLOUD_SCHEMA47);
  });
});
