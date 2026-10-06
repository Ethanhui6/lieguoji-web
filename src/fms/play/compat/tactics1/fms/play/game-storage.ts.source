import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './storage';
import {loadTactics,saveTactics} from './tactics-storage';
import type {GameRun} from './tactics-model';
export type StoreKey=OldStore|11;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===9?11:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=11):Promise<SavedRun|null>=>store===11?loadTactics(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===9?saveTactics(r,expected,factory):oldSave(r,expected,factory);
