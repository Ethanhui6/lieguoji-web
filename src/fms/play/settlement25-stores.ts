import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './voyage24-stores';
import {loadSettlement25,saveSettlement25} from './settlement25-storage';
import type {GameRun} from './settlement25-model';
export type StoreKey=OldStore|27;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===25?27:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=27):Promise<SavedRun|null>=>store===27?loadSettlement25(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===25?saveSettlement25(r,expected,factory):oldSave(r,expected,factory);
