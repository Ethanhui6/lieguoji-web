import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './naming18-stores';
import {loadRestoration19,saveRestoration19} from './restoration19-storage';
import type {GameRun} from './restoration19-model';
export type StoreKey=OldStore|21;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===19?21:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=21):Promise<SavedRun|null>=>store===21?loadRestoration19(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===19?saveRestoration19(r,expected,factory):oldSave(r,expected,factory);
