import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './dynasty23-stores';
import {loadVoyage24,saveVoyage24} from './voyage24-storage';
import type {GameRun} from './voyage24-model';
export type StoreKey=OldStore|26;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===24?26:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=26):Promise<SavedRun|null>=>store===26?loadVoyage24(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===24?saveVoyage24(r,expected,factory):oldSave(r,expected,factory);
