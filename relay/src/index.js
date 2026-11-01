/* global Response */
// 列国纪远程计算中转（Cloudflare Worker + Durable Object）。
// 电脑上的 LieguojiServer 主动长轮询本中转取任务、回结果；手机把请求发到同一个配对码的房间，
// 中转把请求交给电脑、等结果返回手机。双方都只发出站请求，不需要公网 IP 或局域网。
// 路径：/room/<配对码>/status | call | next | reply/<id>；请求与结果的正文都是 EngineWire 帧。

const ROOM = /^\/room\/([A-Za-z0-9]{6,16})\/(status|call|next|reply)(?:\/(\d+))?$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = ROOM.exec(url.pathname);
    if (!m) return new Response('列国纪远程计算中转', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    const room = env.ROOMS.get(env.ROOMS.idFromName(m[1].toUpperCase()));
    return room.fetch(request);
  },
};

export class Room {
  constructor(state) {
    this.state = state;
    this.queue = [];
    this.pcWaiters = [];
    this.replies = new Map();
    this.nextId = 1;
    this.lastSeen = 0;
  }

  online() { return Date.now() - this.lastSeen < 40000; }

  async fetch(request) {
    const m = ROOM.exec(new URL(request.url).pathname);
    const action = m[2], id = Number(m[3]);
    if (action === 'status') {
      return new Response(JSON.stringify({ online: this.online() }), { headers: { 'content-type': 'application/json' } });
    }
    if (action === 'next') {
      // The computer's long poll: the next request, or 204 after 25 s.
      this.lastSeen = Date.now();
      const job = this.queue.shift() ?? await this.waitJob(25000);
      this.lastSeen = Date.now();
      if (!job) return new Response(null, { status: 204 });
      return new Response(job.body, { headers: { 'x-request-id': String(job.id), 'content-type': 'application/octet-stream' } });
    }
    if (action === 'reply') {
      this.lastSeen = Date.now();
      const resolve = this.replies.get(id);
      if (resolve) { this.replies.delete(id); resolve(await request.arrayBuffer()); }
      return new Response(null, { status: 204 });
    }
    // The phone's request: queued for the computer, answered with its reply.
    if (!this.online()) return new Response('电脑不在线：请在电脑上运行列国纪远程计算', { status: 503 });
    const job = { id: this.nextId++, body: await request.arrayBuffer() };
    const reply = new Promise((resolve) => this.replies.set(job.id, resolve));
    this.push(job);
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), 180000); });
    const out = await Promise.race([reply, timeout]);
    clearTimeout(timer);
    if (!out) { this.replies.delete(job.id); return new Response('电脑没有响应', { status: 504 }); }
    return new Response(out, { headers: { 'content-type': 'application/octet-stream' } });
  }

  push(job) {
    const waiter = this.pcWaiters.shift();
    if (waiter) waiter(job); else this.queue.push(job);
  }

  waitJob(ms) {
    return new Promise((resolve) => {
      const done = (job) => { clearTimeout(timer); resolve(job); };
      const timer = setTimeout(() => { this.pcWaiters = this.pcWaiters.filter((w) => w !== done); resolve(null); }, ms);
      this.pcWaiters.push(done);
    });
  }
}
