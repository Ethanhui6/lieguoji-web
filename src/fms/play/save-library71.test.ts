import {describe,expect,it,beforeAll} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {grid} from './fixture.test-support';
import {Culture47Session,type Culture47Journal} from './culture47-session';
import {CULTURE47_AUTOSAVE,CULTURE47_LIBRARY_DATABASE,culture47ScopeOf,deleteCulture47Named,listCulture47Saves,loadCulture47Named,sanitizeSaveName47,saveCulture47Named,defaultSaveName47,culture47SlotRevision} from './culture47-library';
import {CULTURE47_FRESH_DATABASE,CULTURE47_GENERATIONS_DATABASE,saveCulture47} from './culture47-storage';
import {advanceAutoSave47,canCancelAutoSave47,clampAutoSaveMinutes,DEFAULT_CULTURE47_CONFIG} from './culture47-config';
import {exportHistoryText47} from './culture47-export';

let journal:Culture47Journal;
beforeAll(()=>{journal=new Culture47Session().create({terrain:grid((x,y)=>x>20&&x<230&&y>20&&y<230?45:0),count:2,cityCount:6,relations:'peace',setup:{mode:'culture-generated',enabled:['chinese','japanese']}}).journal;},30000);
const verify=(j:Culture47Journal)=>{new Culture47Session().load(j);};
const at=(s:string)=>new Date(s);

describe('original SaveSystem names',()=>{
  it('SanitizeSaveName: timestamp for blanks, strips .save and invalid characters, reserved names, 80 characters',()=>{
    const now=new Date(2026,9,21,8,5,9);
    expect(defaultSaveName47(now)).toBe('20261021080509');
    expect(sanitizeSaveName47('   ',now)).toBe('20261021080509');
    expect(sanitizeSaveName47(' 我的世界.save ',now)).toBe('我的世界');
    expect(sanitizeSaveName47('a<b>:c"d/e\\f|g?h*i\u0001',now)).toBe('abcdefghi');
    expect(sanitizeSaveName47('con',now)).toBe('con_save');
    expect(sanitizeSaveName47('x'.repeat(100),now)).toHaveLength(80);
    expect(sanitizeSaveName47('???',now)).toBe('20261021080509');
  });
});
describe('original LoadSaveDataUI library',()=>{
  it('saves, lists newest first, overwrites by name, loads exactly and deletes',async()=>{
    const f=new IDBFactory();
    expect(await listCulture47Saves(f)).toEqual([]);
    expect(await saveCulture47Named(journal,'第一局',verify,f,at('2026-10-21T01:00:00Z'))).toBe('第一局');
    expect(await saveCulture47Named(journal,CULTURE47_AUTOSAVE,verify,f,at('2026-10-21T02:00:00Z'))).toBe('autosave');
    expect((await listCulture47Saves(f)).map(s=>s.name)).toEqual(['autosave','第一局']);
    await saveCulture47Named(journal,'第一局',verify,f,at('2026-10-21T03:00:00Z'));
    expect((await listCulture47Saves(f)).map(s=>s.name)).toEqual(['第一局','autosave']);
    expect(await loadCulture47Named('第一局',f)).toEqual(journal);
    await deleteCulture47Named('第一局',f);
    expect((await listCulture47Saves(f)).map(s=>s.name)).toEqual(['autosave']);
    await expect(loadCulture47Named('第一局',f)).rejects.toThrow('找不到');
  });
  it('a failed verification writes nothing; corrupt and unknown records stay locked',async()=>{
    const f=new IDBFactory();
    await expect(saveCulture47Named(journal,'坏档',()=>{throw Error('replay failed');},f)).rejects.toThrow('replay failed');
    expect(await listCulture47Saves(f)).toEqual([]);
    await saveCulture47Named(journal,'正常',verify,f);
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=f.open(CULTURE47_LIBRARY_DATABASE,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise<void>((resolve,reject)=>{const tx=db.transaction('saves','readwrite'),s=tx.objectStore('saves'),g=s.get('正常');g.onsuccess=()=>{s.put({...g.result,checksum:'0'.repeat(64)},'正常');s.put({format:'future',version:9},'未来');};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
    await expect(loadCulture47Named('正常',f)).rejects.toThrow('损坏');
    expect((await listCulture47Saves(f)).find(s=>s.name==='未来')?.locked).toContain('不兼容');
    await expect(saveCulture47Named(journal,'未来',verify,f)).rejects.toThrow('不兼容');
  });
  it('a loaded save maps to its continue slot and that slot revision',async()=>{
    const f=new IDBFactory();
    expect(culture47ScopeOf(journal)).toBe(CULTURE47_FRESH_DATABASE);
    expect(culture47ScopeOf({...journal,actions:[{kind:'enable-generations'} as never]})).toBe(CULTURE47_GENERATIONS_DATABASE);
    expect(await culture47SlotRevision(CULTURE47_FRESH_DATABASE,f)).toBeNull();
    await saveCulture47(journal,null,f,undefined,verify,CULTURE47_FRESH_DATABASE);
    expect(await culture47SlotRevision(CULTURE47_FRESH_DATABASE,f)).toBe(1);
  });
});
describe('original AutoSaveManager',()=>{
  it('on by default on the web (5 minutes), 5–60, five-second countdown then due',()=>{
    expect(DEFAULT_CULTURE47_CONFIG).toEqual({autoSave:true,autoSaveMinutes:5});
    expect(clampAutoSaveMinutes(1)).toBe(5);expect(clampAutoSaveMinutes(99)).toBe(60);
    expect(advanceAutoSave47(0,294,5)).toEqual({elapsed:294,countdown:null,due:false});
    expect(advanceAutoSave47(294,1.5,5)).toEqual({elapsed:295.5,countdown:5,due:false});
    expect(advanceAutoSave47(295.5,4,5)).toEqual({elapsed:299.5,countdown:1,due:false});
    expect(advanceAutoSave47(299.5,.6,5)).toEqual({elapsed:0,countdown:null,due:true});
    expect(canCancelAutoSave47(295.5,5,false)).toBe(true);
    expect(canCancelAutoSave47(294,5,false)).toBe(false);
    expect(canCancelAutoSave47(299.5,5,true)).toBe(false);
    expect(canCancelAutoSave47(0,5,false)).toBe(false);
  });
});
describe('original HistoryManager.ExportHistoryEvents',()=>{
  it('years ascending with the original header, month.day lines, emergency mobilize optional',()=>{
    const e=(id:number,day:number,text:string,kind='diplomacy')=>({id,day,tick:day*120,kind,text}) as never;
    const text=exportHistoryText47([e(2,400,'乙国<b>宣战</b>'),e(1,3,'甲国建立','founding'),e(3,401,'甲国紧急动员，征召2支军队')],{year:100,month:1,day:1});
    expect(text.split('\r\n')).toEqual(['========== 100年 ==========','1.4 甲国建立','','========== 101年 ==========','2.5 乙国宣战','']);
    expect(exportHistoryText47([e(3,401,'甲国紧急动员，征召2支军队')],{year:100,month:1,day:1},true)).toContain('2.6 甲国紧急动员');
  });
});
