import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './war43-stores';
import {loadWar44,saveWar44} from './war44-storage';
import type {GameRun} from './war44-model';
export type StoreKey=OldStore|46;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===44?46:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=46):Promise<SavedRun|null>=>store===46?loadWar44(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===44?saveWar44(r,expected,factory):oldSave(r,expected,factory);
