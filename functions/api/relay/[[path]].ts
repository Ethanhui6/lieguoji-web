// 远程计算中转入口：/api/relay/room/<配对码>/… 转给 lieguoji-relay Worker 的 Room（Durable Object）。
// workers.dev 在国内连不上，所以手机与电脑都经由本站（pages.dev）进出；房间逻辑见 relay/src/index.js。
type RoomStub={fetch(request:Request):Promise<Response>};
type Rooms={idFromName(name:string):unknown;get(id:unknown):RoomStub};

export const onRequest=async(context:{request:Request;env:{ROOMS?:Rooms}})=>{
  const {request,env}=context;
  const url=new URL(request.url);
  const m=/^\/api\/relay(\/room\/([A-Za-z0-9]{6,16})\/[a-z]+(?:\/\d+)?)$/.exec(url.pathname);
  if(!m)return new Response('列国纪远程计算中转',{headers:{'content-type':'text/plain; charset=utf-8'}});
  if(!env.ROOMS)return new Response('中转未配置',{status:503});
  const room=env.ROOMS.get(env.ROOMS.idFromName(m[2].toUpperCase()));
  const forwarded=new URL(m[1],url.origin);
  return room.fetch(new Request(forwarded.toString(),request));
};
