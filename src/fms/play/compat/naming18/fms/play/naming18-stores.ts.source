import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './culture17-stores';
import {loadNaming18,saveNaming18} from './naming18-storage';
import type {GameRun} from './naming18-model';
export type StoreKey=OldStore|20;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===18?20:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=20):Promise<SavedRun|null>=>store===20?loadNaming18(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===18?saveNaming18(r,expected,factory):oldSave(r,expected,factory);
