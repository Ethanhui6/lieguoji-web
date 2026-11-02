/* global Response, CompressionStream */
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
    this.lan = [];
  }

  online() { return Date.now() - this.lastSeen < 40000; }

  async fetch(request) {
    const url = new URL(request.url);
    const m = ROOM.exec(url.pathname);
    const action = m[2], id = Number(m[3]);
    if (action === 'status') {
      return new Response(JSON.stringify({ online: this.online(), lan: this.online() ? this.lan : [] }), { headers: { 'content-type': 'application/json' } });
    }
    if (action === 'next') {
      // The computer's long poll: the next request, or 204 after 25 s. It also reports its local
      // addresses, so a phone on the same network can connect directly.
      const lan = url.searchParams.get('lan');
      if (lan) this.lan = lan.split(',').filter((a) => /^[0-9.]+:\d+$/.test(a)).slice(0, 4);
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
    // A phone that hangs up (or waits too long) withdraws its request, so the computer never runs
    // a stale one later (a step nobody waits for would advance the world twice).
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), 180000);
      request.signal?.addEventListener?.('abort', () => resolve(null));
    });
    const out = await Promise.race([reply, timeout]);
    clearTimeout(timer);
    if (!out) {
      this.replies.delete(job.id);
      this.queue = this.queue.filter((j) => j.id !== job.id);
      return new Response('电脑没有响应', { status: 504 });
    }
    // Compressed for the phone (states are repetitive JSON); URLSession inflates gzip by itself.
    const body = new Response(out).body.pipeThrough(new CompressionStream('gzip'));
    return new Response(body, { headers: { 'content-type': 'application/octet-stream', 'content-encoding': 'gzip' }, encodeBody: 'manual' });
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
