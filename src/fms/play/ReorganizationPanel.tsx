import type {CampaignRun} from './campaign-model';
import {reorganizationStrength} from './reorganization';
export function ReorganizationPanel({run,nationId,armyId,selectArmy}:{run:CampaignRun;nationId:string;armyId:string|null;selectArmy:(id:string)=>void}){
 const selected=run.world.armies.find(a=>a.id===armyId),active=run.world.armies.filter(a=>a.nationId===nationId&&run.reorganization.active[a.id]);
 if(!active.length&&!(selected&&run.reorganization.completed[selected.id]))return null;
 return <section className="play-reorganization" aria-label="军团重编">
  <h3>故乡重编 <small>{active.length} 支正在集结</small></h3>
  <p>被击溃的常备军，在故乡仍属本国且编制有空位时，以一成兵力重建。补员期间可以移动和交战。</p>
  {active.map(a=>{const full=reorganizationStrength(run,run.tactics.forces[a.id].homeId);return <button key={a.id} className="play-reorganization-row" onClick={()=>selectArmy(a.id)} aria-pressed={a.id===armyId}><span>{a.name}<strong>{Math.round(a.troops)} / {full}</strong></span><progress aria-label={`${a.name}重编兵力`} value={a.troops} max={full}/></button>;})}
  {selected&&run.reorganization.completed[selected.id]&&<p className="play-muted">这支军团已完成 {run.reorganization.completed[selected.id]} 次重编，保留原军团番号。</p>}
 </section>;
}
