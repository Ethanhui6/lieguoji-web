import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './court16-stores';
import {loadCulture17,saveCulture17} from './culture17-storage';
import type {GameRun} from './culture17-model';
export type StoreKey=OldStore|19;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===17?19:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=19):Promise<SavedRun|null>=>store===19?loadCulture17(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===17?saveCulture17(r,expected,factory):oldSave(r,expected,factory);
