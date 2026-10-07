import {Voyage24Session,type GameCommand as OldCommand} from './voyage24-session';
import {voyage24Wrap,type Voyage24Run} from './voyage24-model';
import {dynasty23Wrap} from './dynasty23-model';
import {initialKin} from './dynasty23-family';
import {initialVoyages} from './voyage24-state';
import {createSettlement25Life} from './settlement25-create';
import {assertGameRun,settlement25Wrap,voyage24View,type GameRun,type SettlementGeneration} from './settlement25-model';
import type {World,GameEvent} from '../../sim/types';
export type GameCommand=Exclude<OldCommand,{type:'load'|'copy'|'create'}>|{type:'load';run:GameRun}|{type:'copy';run:GameRun}|(Extract<OldCommand,{type:'create'}>&{cityCount:number});
export class Settlement25Session{
 private old=new Voyage24Session();private generation?:SettlementGeneration;
 execute(c:GameCommand):{run:GameRun;world:World;halted?:GameEvent}{
  if(c.type==='load'){assertGameRun(c.run);const out=this.old.execute({type:'load',run:c.run.version===25?voyage24View(c.run):c.run});this.generation=c.run.version===25?structuredClone(c.run.generation):undefined;return this.wrap(out);}
  if(c.type==='create'){
   const r=createSettlement25Life(c.terrain,c.count,c.cityCount,c.relations,c.cultures),v=voyage24Wrap(dynasty23Wrap(r,initialKin(r)),initialVoyages(r.world));
   const generation:SettlementGeneration={version:1,method:'terrain-connected-unions-v1',cityCount:c.cityCount,countryCount:c.count};assertGameRun(settlement25Wrap(v,generation));
   const out=this.old.execute({type:'load',run:v});this.generation=generation;return this.wrap(out);
  }
  if(c.type==='copy'){
   assertGameRun(c.run);if(c.run.version===25)throw Error('已经是当前新版，无需复制。');
   let v:Voyage24Run;if(c.run.version===24){v=structuredClone(c.run);v.id='fms-'+crypto.randomUUID();v.world.custom!.id=v.id;}else v=new Voyage24Session().execute({type:'copy',run:c.run}).run as Voyage24Run;
   const generation:SettlementGeneration={version:1,method:'preserved-world',cityCount:v.world.cities.length,countryCount:v.world.nations.length};assertGameRun(settlement25Wrap(v,generation));
   const out=this.old.execute({type:'load',run:v});this.generation=generation;return this.wrap(out);
  }
  return this.wrap(this.old.execute(c));
 }
 private wrap(out:ReturnType<Voyage24Session['execute']>){const run=this.generation&&out.run.version===24?settlement25Wrap(out.run,structuredClone(this.generation)):out.run;assertGameRun(run);return {...out,run};}
}
