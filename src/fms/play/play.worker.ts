import { PlaySession, type PlayCommand } from './session';
const session = new PlaySession();
self.onmessage = (event: MessageEvent<{ id: number; command: PlayCommand }>) => {
  const { id, command } = event.data;
  try {
    const result=session.execute(command),run=result.run;
    if(command.type==='tick'&&run?.version===4)self.postMessage({id,world:result.world,halted:result.halted,update:{id:run.id,world:run.world,clock:run.clock,navy:run.navy,units:run.units}});
    else self.postMessage({id,...result});
  }
  catch (e) { self.postMessage({ id, error: e instanceof Error ? e.message : '推演失败，保留上一状态。' }); }
};
