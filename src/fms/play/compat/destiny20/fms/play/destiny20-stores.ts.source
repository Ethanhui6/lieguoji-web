import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './restoration19-stores';
import {loadDestiny20,saveDestiny20} from './destiny20-storage';
import type {GameRun} from './destiny20-model';
export type StoreKey=OldStore|22;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===20?22:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=22):Promise<SavedRun|null>=>store===22?loadDestiny20(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===20?saveDestiny20(r,expected,factory):oldSave(r,expected,factory);
