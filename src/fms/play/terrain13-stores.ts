import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './chronicle2-stores';
import {loadTerrain13,saveTerrain13} from './terrain13-storage';
import type {GameRun} from './terrain13-model';
export type StoreKey=OldStore|15;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===13?15:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=15):Promise<SavedRun|null>=>store===15?loadTerrain13(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===13?saveTerrain13(r,expected,factory):oldSave(r,expected,factory);
