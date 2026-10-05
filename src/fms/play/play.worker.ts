import { PlaySession, type PlayCommand } from './session';
const session = new PlaySession();
self.onmessage = (event: MessageEvent<{ id: number; command: PlayCommand }>) => {
  const { id, command } = event.data;
  try { self.postMessage({ id, ...session.execute(command) }); }
  catch (e) { self.postMessage({ id, error: e instanceof Error ? e.message : '推演失败，保留上一状态。' }); }
};
