import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './terrain13-stores';
import {loadUpper14,saveUpper14} from './upper14-storage';
import type {GameRun} from './upper14-model';
export type StoreKey=OldStore|16;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===14?16:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=16):Promise<SavedRun|null>=>store===16?loadUpper14(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===14?saveUpper14(r,expected,factory):oldSave(r,expected,factory);
