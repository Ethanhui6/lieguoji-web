/* global Response, WebSocketPair, CompressionStream, DecompressionStream, crypto */
// 列国纪在线计算与云端存档服务（Cloudflare Worker + SQLite Durable Object）。
// 1. 远程计算中转：支持手机端持久 WebSocket（/ws?role=phone）与 HTTP 降级（/call），
//    电脑端 LieguojiServer 支持持久 WebSocket（/ws?role=pc）及双路预热长轮询（/next + /reply），
//    双向零轮询间隔、自动 gzip 压缩与心跳保活，退后台重进秒级无感重连。
// 2. 云端存档卷宗（Durable Object SQLite 持久存储，分片 512KB）：
//    GET    /room/<配对码>/saves         列表
//    PUT    /room/<配对码>/saves/<id>    上传/覆盖（支持 zlib/gzip/raw）
//    GET    /room/<配对码>/saves/<id>    下载
//    DELETE /room/<配对码>/saves/<id>    删除
// 3. 实时探针：GET /room/<配对码>/ping 与 /status 返回在线态、局域网地址、WS 状态与云存档数。

const ROUTE = /^\/room\/([A-Za-z0-9]{6,16})\/(status|ping|ws|call|next|reply|saves)(?:\/([A-Za-z0-9._-]{1,64}))?$/;
const CHUNK_SIZE = 512 * 1024;
const MAX_SAVE_BYTES = 32 * 1024 * 1024;
const MAX_SAVES_PER_ROOM = 16;

// Binary WebSocket envelope message types
const MSG_REQ = 1;    // phone -> pc: [1][u32 id][EngineWire request]
const MSG_REPLY = 2;  // pc -> phone: [2][u32 id][EngineWire reply]
const MSG_PUSH = 3;   // pc -> phone: [3][u32 seq][state payload]
const MSG_PING = 4;   // either -> relay: [4][payload] -> echoed as [5][payload]
const MSG_PONG = 5;   // relay -> sender
const MSG_CTRL = 6;   // phone -> pc: [6][json bytes]

function readU32BE(bytes, offset) {
  return (
    ((bytes[offset] << 24) >>> 0) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function writeU32BE(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function makeEnvelope(type, id, payloadBytes) {
  const out = new Uint8Array(5 + payloadBytes.byteLength);
  out[0] = type;
  writeU32BE(out, 1, id >>> 0);
  out.set(payloadBytes, 5);
  return out;
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function gunzipBuffer(buf) {
  const stream = new Response(buf).body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = ROUTE.exec(url.pathname);
    if (!m) {
      return new Response('列国纪远程计算与云端存档中转 v5', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
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
    this.serverVersion = '';
    this.pcWs = null;
    this.phoneWs = null;
    this.schemaReady = false;

    state.blockConcurrencyWhile(async () => {
      this.ensureSchema();
    });
  }

  ensureSchema() {
    if (this.schemaReady) return;
    const sql = this.state?.storage?.sql;
    if (!sql) return;
    sql.exec(`
      CREATE TABLE IF NOT EXISTS cloud_saves (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date_text TEXT NOT NULL,
        nations INTEGER NOT NULL DEFAULT 0,
        provinces INTEGER NOT NULL DEFAULT 0,
        day INTEGER NOT NULL DEFAULT 0,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        device TEXT NOT NULL DEFAULT '',
        encoding TEXT NOT NULL DEFAULT 'raw'
      )
    `);
    sql.exec(`
      CREATE TABLE IF NOT EXISTS cloud_save_chunks (
        save_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        chunk BLOB NOT NULL,
        PRIMARY KEY (save_id, idx)
      )
    `);
    this.schemaReady = true;
  }

  wsOnline() {
    return this.pcWs !== null && this.pcWs.readyState === 1;
  }

  online() {
    return this.wsOnline() || Date.now() - this.lastSeen < 65000;
  }

  savesCount() {
    this.ensureSchema();
    const sql = this.state?.storage?.sql;
    if (!sql) return 0;
    try {
      const rows = sql.exec('SELECT COUNT(*) AS cnt FROM cloud_saves').toArray();
      return Number(rows[0]?.cnt ?? 0);
    } catch {
      return 0;
    }
  }

  recordLan(param) {
    if (!param) return;
    const parsed = param.split(',').filter((a) => /^[0-9.]+:\d+$/.test(a)).slice(0, 4);
    if (parsed.length > 0) this.lan = parsed;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const m = ROUTE.exec(url.pathname);
    if (!m) return new Response('无效路径', { status: 404 });
    const action = m[2];
    const subId = m[3] || '';

    if (action === 'ping' || action === 'status') {
      return jsonResponse({
        ok: true,
        t: Date.now(),
        online: this.online(),
        wsOnline: this.wsOnline(),
        lan: this.online() ? this.lan : [],
        protocol: 5,
        serverVersion: this.serverVersion || undefined,
        savesCount: this.savesCount(),
      });
    }

    if (action === 'saves') {
      return this.handleSaves(request, subId);
    }

    if (action === 'ws') {
      return this.handleWebSocket(request, url);
    }

    if (action === 'reply') {
      const id = Number(subId);
      this.lastSeen = Date.now();
      let buf = await request.arrayBuffer();
      if ((request.headers.get('content-encoding') || '').toLowerCase() === 'gzip') {
        try { buf = await gunzipBuffer(buf); } catch { /* pass raw if already decoded */ }
      }
      this.completeReply(id, buf);
      if (url.searchParams.get('next') !== '1') return new Response(null, { status: 204 });
    }

    if (action === 'next' || action === 'reply') {
      this.recordLan(url.searchParams.get('lan'));
      const ver = url.searchParams.get('v');
      if (ver) this.serverVersion = ver.slice(0, 32);
      this.lastSeen = Date.now();
      const job = this.queue.shift() ?? await this.waitJob(25000);
      this.lastSeen = Date.now();
      if (!job) return new Response(null, { status: 204 });
      return new Response(job.body, {
        headers: {
          'x-request-id': String(job.id),
          'content-type': 'application/octet-stream',
          'cache-control': 'no-store',
        },
      });
    }

    // HTTP /call fallback (and primary for non-WS clients)
    if (!this.online()) {
      return new Response('电脑不在线：请在电脑上运行列国纪远程计算', { status: 503 });
    }
    let body = await request.arrayBuffer();
    if ((request.headers.get('content-encoding') || '').toLowerCase() === 'gzip') {
      try { body = await gunzipBuffer(body); } catch { /* keep raw */ }
    }
    const out = await this.dispatchToPC(body, request.signal, 180000);
    if (!out) {
      return new Response('电脑没有响应', { status: 504 });
    }
    const gz = new Response(out).body.pipeThrough(new CompressionStream('gzip'));
    return new Response(gz, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-encoding': 'gzip',
        'cache-control': 'no-store',
      },
      encodeBody: 'manual',
    });
  }

  handleWebSocket(request, url) {
    if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket Upgrade', { status: 426 });
    }
    const role = (url.searchParams.get('role') || 'phone').toLowerCase();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    if (role === 'pc') {
      this.recordLan(url.searchParams.get('lan'));
      const ver = url.searchParams.get('v');
      if (ver) this.serverVersion = ver.slice(0, 32);
      if (this.pcWs && this.pcWs !== server) {
        try { this.pcWs.close(1000, 'replaced'); } catch { /* ignore */ }
      }
      this.pcWs = server;
      this.lastSeen = Date.now();
      // Immediately drain any queued jobs waiting for the PC
      while (this.queue.length > 0 && this.pcWs === server && server.readyState === 1) {
        const job = this.queue.shift();
        try {
          server.send(makeEnvelope(MSG_REQ, job.id, new Uint8Array(job.body)));
        } catch {
          this.queue.unshift(job);
          break;
        }
      }
      server.addEventListener('message', (event) => {
        this.lastSeen = Date.now();
        const bytes = event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : (typeof event.data === 'string' ? new TextEncoder().encode(event.data) : null);
        if (!bytes || bytes.byteLength < 1) return;
        const type = bytes[0];
        if (type === MSG_PING) {
          const pong = new Uint8Array(bytes.byteLength);
          pong.set(bytes);
          pong[0] = MSG_PONG;
          try { server.send(pong); } catch { /* ignore */ }
          return;
        }
        if (type === MSG_REPLY && bytes.byteLength >= 5) {
          const id = readU32BE(bytes, 1);
          const payload = bytes.slice(5).buffer;
          this.completeReply(id, payload);
          return;
        }
        if (type === MSG_PUSH && this.phoneWs && this.phoneWs.readyState === 1) {
          try { this.phoneWs.send(bytes); } catch { /* ignore */ }
        }
      });
      const cleanupPC = () => {
        if (this.pcWs === server) this.pcWs = null;
      };
      server.addEventListener('close', cleanupPC);
      server.addEventListener('error', cleanupPC);
    } else {
      if (this.phoneWs && this.phoneWs !== server) {
        try { this.phoneWs.close(1000, 'replaced'); } catch { /* ignore */ }
      }
      this.phoneWs = server;
      server.addEventListener('message', async (event) => {
        const bytes = event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : (typeof event.data === 'string' ? new TextEncoder().encode(event.data) : null);
        if (!bytes || bytes.byteLength < 1) return;
        const type = bytes[0];
        if (type === MSG_PING) {
          const pong = new Uint8Array(bytes.byteLength);
          pong.set(bytes);
          pong[0] = MSG_PONG;
          try { server.send(pong); } catch { /* ignore */ }
          return;
        }
        if (type === MSG_CTRL) {
          if (this.pcWs && this.pcWs.readyState === 1) {
            try { this.pcWs.send(bytes); } catch { /* ignore */ }
          }
          return;
        }
        if (type === MSG_REQ && bytes.byteLength >= 5) {
          const clientReqId = readU32BE(bytes, 1);
          const body = bytes.slice(5).buffer;
          if (!this.online()) {
            const errHeader = new TextEncoder().encode(JSON.stringify({ ok: false, reason: '电脑不在线：请在电脑上运行列国纪远程计算' }));
            const errFrame = new Uint8Array(12 + errHeader.byteLength);
            writeU32BE(errFrame, 0, errHeader.byteLength);
            errFrame.set(errHeader, 4);
            writeU32BE(errFrame, 4 + errHeader.byteLength, 0);
            writeU32BE(errFrame, 8 + errHeader.byteLength, 0);
            try { server.send(makeEnvelope(MSG_REPLY, clientReqId, errFrame)); } catch { /* ignore */ }
            return;
          }
          const out = await this.dispatchToPC(body, null, 120000);
          if (this.phoneWs !== server || server.readyState !== 1) return;
          if (!out) {
            const errHeader = new TextEncoder().encode(JSON.stringify({ ok: false, reason: '电脑响应超时' }));
            const errFrame = new Uint8Array(12 + errHeader.byteLength);
            writeU32BE(errFrame, 0, errHeader.byteLength);
            errFrame.set(errHeader, 4);
            writeU32BE(errFrame, 4 + errHeader.byteLength, 0);
            writeU32BE(errFrame, 8 + errHeader.byteLength, 0);
            try { server.send(makeEnvelope(MSG_REPLY, clientReqId, errFrame)); } catch { /* ignore */ }
            return;
          }
          try { server.send(makeEnvelope(MSG_REPLY, clientReqId, new Uint8Array(out))); } catch { /* ignore */ }
        }
      });
      const cleanupPhone = () => {
        if (this.phoneWs === server) this.phoneWs = null;
      };
      server.addEventListener('close', cleanupPhone);
      server.addEventListener('error', cleanupPhone);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  completeReply(id, arrayBuffer) {
    const resolve = this.replies.get(id);
    if (resolve) {
      this.replies.delete(id);
      resolve(arrayBuffer);
    }
  }

  async dispatchToPC(bodyArrayBuffer, signal, timeoutMs) {
    const job = { id: this.nextId++, body: bodyArrayBuffer };
    const reply = new Promise((resolve) => this.replies.set(job.id, resolve));
    if (this.pcWs && this.pcWs.readyState === 1) {
      try {
        this.pcWs.send(makeEnvelope(MSG_REQ, job.id, new Uint8Array(job.body)));
      } catch {
        this.push(job);
      }
    } else {
      this.push(job);
    }
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
      signal?.addEventListener?.('abort', () => resolve(null));
    });
    const out = await Promise.race([reply, timeout]);
    clearTimeout(timer);
    if (!out) {
      this.replies.delete(job.id);
      this.queue = this.queue.filter((j) => j.id !== job.id);
    }
    return out;
  }

  push(job) {
    const waiter = this.pcWaiters.shift();
    if (waiter) waiter(job);
    else this.queue.push(job);
  }

  waitJob(ms) {
    return new Promise((resolve) => {
      const done = (job) => {
        clearTimeout(timer);
        resolve(job);
      };
      const timer = setTimeout(() => {
        this.pcWaiters = this.pcWaiters.filter((w) => w !== done);
        resolve(null);
      }, ms);
      this.pcWaiters.push(done);
    });
  }

  // MARK: - SQLite Cloud Save Vault

  async handleSaves(request, saveId) {
    this.ensureSchema();
    const sql = this.state?.storage?.sql;
    if (!sql) return jsonResponse({ ok: false, reason: '云端存档存储未就绪' }, 503);

    const method = request.method.toUpperCase();

    // List cloud saves
    if (method === 'GET' && !saveId) {
      const rows = sql.exec(
        'SELECT id, title, date_text, nations, provinces, day, size_bytes, updated_at, device, encoding FROM cloud_saves ORDER BY updated_at DESC'
      ).toArray();
      return jsonResponse({
        ok: true,
        saves: rows.map((r) => ({
          id: String(r.id),
          title: String(r.title),
          date: String(r.date_text),
          nations: Number(r.nations),
          provinces: Number(r.provinces),
          day: Number(r.day),
          sizeBytes: Number(r.size_bytes),
          updatedAt: Number(r.updated_at),
          device: String(r.device),
          encoding: String(r.encoding || 'raw'),
        })),
      });
    }

    // Download a cloud save
    if (method === 'GET' && saveId) {
      const metaRows = sql.exec(
        'SELECT id, title, date_text, nations, provinces, day, size_bytes, updated_at, device, encoding FROM cloud_saves WHERE id = ?',
        saveId
      ).toArray();
      if (metaRows.length === 0) return jsonResponse({ ok: false, reason: '云端找不到这卷存档' }, 404);
      const meta = metaRows[0];
      const chunks = sql.exec(
        'SELECT chunk FROM cloud_save_chunks WHERE save_id = ? ORDER BY idx ASC',
        saveId
      ).toArray();
      let total = 0;
      const parts = chunks.map((row) => {
        const u8 = row.chunk instanceof Uint8Array ? row.chunk : new Uint8Array(row.chunk);
        total += u8.byteLength;
        return u8;
      });
      const merged = new Uint8Array(total);
      let pos = 0;
      for (const p of parts) {
        merged.set(p, pos);
        pos += p.byteLength;
      }
      return new Response(merged, {
        status: 200,
        headers: {
          'content-type': 'application/octet-stream',
          'x-save-encoding': String(meta.encoding || 'raw'),
          'x-save-title': encodeURIComponent(String(meta.title || '')),
          'x-save-day': String(meta.day || 0),
          'cache-control': 'no-store',
        },
      });
    }

    // Upload or overwrite a cloud save
    if ((method === 'PUT' || method === 'POST') && (saveId || method === 'POST')) {
      const id = saveId || crypto.randomUUID();
      const rawBuf = await request.arrayBuffer();
      const bytes = new Uint8Array(rawBuf);
      if (bytes.byteLength === 0) return jsonResponse({ ok: false, reason: '存档内容为空' }, 400);
      if (bytes.byteLength > MAX_SAVE_BYTES) return jsonResponse({ ok: false, reason: '存档体积超出 32MB 上限' }, 413);

      const decodeHeader = (name, fallback) => {
        const v = request.headers.get(name);
        if (!v) return fallback;
        try { return decodeURIComponent(v); } catch { return v; }
      };
      const title = decodeHeader('x-save-title', '云端世界').slice(0, 80);
      const dateText = decodeHeader('x-save-date', '').slice(0, 64);
      const nations = Math.max(0, parseInt(request.headers.get('x-save-nations') || '0', 10) || 0);
      const provinces = Math.max(0, parseInt(request.headers.get('x-save-provinces') || '0', 10) || 0);
      const day = Math.max(0, parseInt(request.headers.get('x-save-day') || '0', 10) || 0);
      const device = decodeHeader('x-save-device', 'iPhone').slice(0, 48);
      const encoding = (request.headers.get('x-save-encoding') || 'raw').slice(0, 16);
      const now = Date.now();

      sql.exec('DELETE FROM cloud_save_chunks WHERE save_id = ?', id);
      let idx = 0;
      for (let off = 0; off < bytes.byteLength; off += CHUNK_SIZE) {
        const slice = bytes.subarray(off, Math.min(bytes.byteLength, off + CHUNK_SIZE));
        sql.exec('INSERT INTO cloud_save_chunks (save_id, idx, chunk) VALUES (?, ?, ?)', id, idx++, slice);
      }
      sql.exec(
        `INSERT INTO cloud_saves (id, title, date_text, nations, provinces, day, size_bytes, updated_at, device, encoding)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           date_text = excluded.date_text,
           nations = excluded.nations,
           provinces = excluded.provinces,
           day = excluded.day,
           size_bytes = excluded.size_bytes,
           updated_at = excluded.updated_at,
           device = excluded.device,
           encoding = excluded.encoding`,
        id, title, dateText, nations, provinces, day, bytes.byteLength, now, device, encoding
      );

      // Keep storage bounded to newest MAX_SAVES_PER_ROOM saves
      const stale = sql.exec(
        'SELECT id FROM cloud_saves ORDER BY updated_at DESC LIMIT -1 OFFSET ?',
        MAX_SAVES_PER_ROOM
      ).toArray();
      for (const row of stale) {
        sql.exec('DELETE FROM cloud_save_chunks WHERE save_id = ?', String(row.id));
        sql.exec('DELETE FROM cloud_saves WHERE id = ?', String(row.id));
      }

      return jsonResponse({
        ok: true,
        save: {
          id,
          title,
          date: dateText,
          nations,
          provinces,
          day,
          sizeBytes: bytes.byteLength,
          updatedAt: now,
          device,
          encoding,
        },
      });
    }

    // Delete a cloud save
    if (method === 'DELETE' && saveId) {
      sql.exec('DELETE FROM cloud_save_chunks WHERE save_id = ?', saveId);
      sql.exec('DELETE FROM cloud_saves WHERE id = ?', saveId);
      return jsonResponse({ ok: true, id: saveId });
    }

    return jsonResponse({ ok: false, reason: '不支持的存档操作' }, 405);
  }
}
