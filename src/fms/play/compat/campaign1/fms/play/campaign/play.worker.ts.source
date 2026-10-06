import { CampaignSession as EditorSession, type GameCommand as EditorCommand } from '../campaign-session';
const session = new EditorSession();
self.onmessage = (event: MessageEvent<{ id: number; command: EditorCommand }>) => {
  const { id, command } = event.data;
  try {
    const result=session.execute(command),run=result.run;
    if(command.type==='tick'&&run&&'clock'in run)self.postMessage({id,world:result.world,halted:result.halted,update:{id:run.id,world:run.world,clock:run.clock,navy:run.navy,units:run.units,...('battles'in run?{battles:run.battles}:{}),...('occupation'in run?{occupation:run.occupation}:{}),...('transports'in run?{transports:run.transports}:{}),...('maritime'in run?{maritime:run.maritime}:{}),...('tactics'in run?{tactics:run.tactics}:{}),...(run.version===10?{reorganization:run.reorganization}:{})}});
    else self.postMessage({id,...result});
  }
  catch (e) { self.postMessage({ id, error: e instanceof Error ? e.message : '推演失败，保留上一状态。' }); }
};
