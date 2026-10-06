import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './campaign-stores';
import {loadChronicle,saveChronicle} from './chronicle-storage';
import type {GameRun} from './chronicle-model';
export type StoreKey=OldStore|13;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===11?13:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=13):Promise<SavedRun|null>=>store===13?loadChronicle(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===11?saveChronicle(r,expected,factory):oldSave(r,expected,factory);
