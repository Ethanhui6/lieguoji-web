import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './destiny20-stores';
import {loadMuster21,saveMuster21} from './muster21-storage';
import type {GameRun} from './muster21-model';
export type StoreKey=OldStore|23;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===21?23:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=23):Promise<SavedRun|null>=>store===23?loadMuster21(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===21?saveMuster21(r,expected,factory):oldSave(r,expected,factory);
