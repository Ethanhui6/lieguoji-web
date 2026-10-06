import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './fiscal15-stores';
import {loadCourt16,saveCourt16} from './court16-storage';
import type {GameRun} from './court16-model';
export type StoreKey=OldStore|18;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===16?18:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=18):Promise<SavedRun|null>=>store===18?loadCourt16(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===16?saveCourt16(r,expected,factory):oldSave(r,expected,factory);
