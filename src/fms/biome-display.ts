import { FmsBiomeClient, type FmsBiomeComputer, type FmsBiomeResult } from './biome-client';
import type { FmsBiomeSurface } from './biome-surface';
import type { FmsDocument } from './model';
import type { FmsTerrainDisplay } from './height-palette';

export interface FmsBiomeDisplayState {requested:FmsTerrainDisplay;display:FmsTerrainDisplay;pending:boolean;surface?:FmsBiomeSurface;error?:string}
export const sameFmsClimateInput=(a:FmsDocument,b:FmsDocument)=>a.elevations===b.elevations&&a.points===b.points&&a.triangles===b.triangles&&a.neighbors===b.neighbors&&a.width===b.width&&a.height===b.height;
/** Latest desired document/view wins. Cached fields never own or modify the document. */
export class FmsBiomeDisplay {
  private entries:{doc:FmsDocument;result:FmsBiomeResult}[]=[];
  private pending?:{doc:FmsDocument;abort:AbortController};
  private closed=false;
  private builds=0;
  private elapsed=0;
  private state:FmsBiomeDisplayState={requested:'height',display:'height',pending:false};
  constructor(private changed:(state:FmsBiomeDisplayState)=>void,private computer:FmsBiomeComputer=new FmsBiomeClient()){}
  private emit(state:FmsBiomeDisplayState){this.state=state;this.changed(state);}
  select(doc:FmsDocument,requested:FmsTerrainDisplay):void {
    if(this.closed)return;
    if(requested==='biome'&&this.pending&&sameFmsClimateInput(this.pending.doc,doc))return;
    this.cancel();
    if(requested!=='biome'){this.emit({requested,display:requested,pending:false});return;}
    const index=this.entries.findIndex(entry=>sameFmsClimateInput(entry.doc,doc));
    if(index>=0){const [entry]=this.entries.splice(index,1);this.entries.unshift(entry);this.emit({requested,display:'biome',pending:false,surface:entry.result.surface});return;}
    const pending={doc,abort:new AbortController()};this.pending=pending;
    this.emit({requested,display:'height',pending:true});
    void this.computer.compute(doc,pending.abort.signal).then(result=>{
      if(this.closed||this.pending!==pending)return;
      this.pending=undefined;this.builds++;this.elapsed=result.elapsedMs;
      this.entries.unshift({doc,result});if(this.entries.length>3)this.entries.pop();
      this.emit({requested:'biome',display:'biome',pending:false,surface:result.surface});
    },error=>{
      if(this.closed||this.pending!==pending)return;
      this.pending=undefined;this.emit({requested:'height',display:'height',pending:false,error:error instanceof Error?error.message:'气候计算未完成。'});
    });
  }
  snapshot(){return this.state;}
  metrics(){return {builds:this.builds,elapsedMs:this.elapsed,entries:this.entries.length,bytes:this.entries.reduce((n,e)=>n+e.result.surface.stats.bytes,0)};}
  private cancel(){const old=this.pending;this.pending=undefined;old?.abort.abort();}
  close(){if(this.closed)return;this.closed=true;this.cancel();this.computer.close();this.entries=[];}
}
