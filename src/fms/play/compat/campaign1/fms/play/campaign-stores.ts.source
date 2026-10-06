import {loadRun as oldLoad,saveRun as oldSave,runStore as oldStore,type StoreKey as OldStore} from './game-storage';
import {loadCampaign,saveCampaign} from './campaign-storage';
import type {GameRun} from './campaign-model';
export type StoreKey=OldStore|12;
export type SavedRun={run:GameRun;revision:number;recovered:boolean};
export const runStore=(r:GameRun):StoreKey=>r.version===10?12:oldStore(r);
export const loadRun=(factory:IDBFactory=indexedDB,store:StoreKey=12):Promise<SavedRun|null>=>store===12?loadCampaign(factory):oldLoad(factory,store);
export const saveRun=(r:GameRun,expected:number|null,factory:IDBFactory=indexedDB)=>r.version===10?saveCampaign(r,expected,factory):oldSave(r,expected,factory);
