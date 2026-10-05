import { EditorSession, type EditorCommand } from './editor-session';
const session = new EditorSession();
self.onmessage = (event: MessageEvent<{ id: number; command: EditorCommand }>) => {
  const { id, command } = event.data;
  try {
    const result=session.execute(command),run=result.run;
    if(command.type==='tick'&&(run?.version===4||(run?.version===5||(run?.version===6||run?.version===7))))self.postMessage({id,world:result.world,halted:result.halted,update:{id:run.id,world:run.world,clock:run.clock,navy:run.navy,units:run.units,...((run.version===5||(run.version===6||run.version===7))?{battles:run.battles}:{}),...((run.version===6||run.version===7)?{occupation:run.occupation}:{}),...(run.version===7?{transports:run.transports}:{})}});
    else self.postMessage({id,...result});
  }
  catch (e) { self.postMessage({ id, error: e instanceof Error ? e.message : '推演失败，保留上一状态。' }); }
};
