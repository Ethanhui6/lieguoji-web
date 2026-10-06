import {assertGameRun as assertOld,presentationOf as oldPresentation,tacticsView as oldTactics,campaignView as oldCampaign,chronicleView as oldChronicle,type GameRun as OldRun,type Chronicle2Run} from './chronicle2-model';
import type {CampaignRun} from './campaign-model';
import type {ChronicleRun} from './chronicle-model';
import {assertTerrainContext,type TerrainContext} from './terrain13-context';
export type Terrain13Run=Omit<Chronicle2Run,'version'|'rules'|'engine'> & {version:13;rules:'fms-terrain-13';engine:string;terrainContext:TerrainContext};
export type GameRun=OldRun|Terrain13Run;
export function chronicle2View(r:Terrain13Run):Chronicle2Run{const {terrainContext,...base}=r;void terrainContext;return {...base,version:12,rules:'fms-chronicle-2',engine:__FMS_CHRONICLE2_ENGINE__};}
export const terrain13Wrap=(r:Chronicle2Run,terrainContext:TerrainContext):Terrain13Run=>({...r,version:13,rules:'fms-terrain-13',engine:__FMS_TERRAIN13_ENGINE__,terrainContext});
export const chronicleView=(r:Chronicle2Run|Terrain13Run)=>oldChronicle(r.version===13?chronicle2View(r):r);
export const campaignView=(r:ChronicleRun|Chronicle2Run|Terrain13Run)=>oldCampaign(r.version===13?chronicle2View(r):r);
export const tacticsView=(r:ChronicleRun|Chronicle2Run|Terrain13Run|CampaignRun)=>oldTactics(r.version===13?chronicle2View(r):r);
export const presentationOf=(r:GameRun)=>oldPresentation(r.version===13?chronicle2View(r):r);
export const gameStamp=(r:GameRun)=>`${r.version}/${r.engine}/${r.id}/${r.world.day}/${r.world.nextEventId}/${'clock'in r?r.clock.tick:0}`;
export function assertTerrain13(r:unknown):asserts r is Terrain13Run{const a=r as Terrain13Run;if(a?.version!==13||a.rules!=='fms-terrain-13'||a.engine!==__FMS_TERRAIN13_ENGINE__)throw Error('世界版本不同，已保留原档。');assertOld(chronicle2View(a));assertTerrainContext(a.terrainContext,a.world,a.terrain.points.length);}
export function assertGameRun(r:unknown):asserts r is GameRun{if((r as GameRun)?.version===13)assertTerrain13(r);else assertOld(r);}
