import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './chronicle-stores';
import {loadChronicle2,saveChronicle2} from './chronicle2-storage';
import type {GameRun} from './chronicle2-model';
export type StoreKey=OldStore|14;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===12?14:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=14):Promise<SavedRun|null>=>store===14?loadChronicle2(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===12?saveChronicle2(r,expected,factory):oldSave(r,expected,factory);
