// 房间业务逻辑 + /api 路由：worker（KV 存储）与 server（内存存储）共用同一份实现，
// 保证本地 mock 与线上行为一致。
import {
  CANVAS_IDS,
  MAX_BODY_BYTES,
  MAX_STROKES,
  MAX_STROKES_BATCH,
  PRESENCE_TTL_MS,
  isValidPlayerId,
  isValidRoomId,
  isValidStroke,
  sanitizeName,
} from './validate.js';

// 在场信息写盘节流：间隔内的重复心跳不再写 KV（免费层每天仅 1000 次写）
const PRESENCE_WRITE_GAP_MS = 40_000;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 I/O/0/1
// 房间号是加入房间的唯一凭证，用加密安全随机源生成
export function generateRoomId() {
  let id = '';
  const buf = new Uint32Array(1);
  for (let i = 0; i < 4; i++) {
    // 拒绝采样消除模偏差
    do {
      crypto.getRandomValues(buf);
    } while (buf[0] >= Math.floor(0x100000000 / ROOM_ID_CHARS.length) * ROOM_ID_CHARS.length);
    id += ROOM_ID_CHARS[buf[0] % ROOM_ID_CHARS.length];
  }
  return id;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });

function fail(status, code, message) {
  throw new ApiError(status, code, message);
}

const keyMeta = (roomId) => `room:${roomId}:meta`;
const keyCanvas = (roomId, n) => `room:${roomId}:canvas:${n}`;
const now = () => Date.now();

async function readBody(request) {
  let raw = null;
  try {
    raw = await request.text();
  } catch {
    raw = null;
  }
  if (!raw) return {};
  if (raw.length > MAX_BODY_BYTES) fail(413, 'payload_too_large', '请求体过大');
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'bad_request', '请求体必须是 JSON 对象');
    return body;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    fail(400, 'bad_request', '请求体不是合法 JSON');
  }
}

function activePlayerMap(meta) {
  const out = {};
  const cutoff = now() - PRESENCE_TTL_MS;
  for (const [pid, p] of Object.entries(meta.players || {})) {
    if ((p.lastSeen || 0) >= cutoff) out[pid] = { name: p.name, lastSeen: p.lastSeen };
  }
  return out;
}

async function getRoom(storage, roomId) {
  const meta = await storage.get(keyMeta(roomId));
  if (!meta) fail(404, 'room_not_found', '房间不存在');
  return meta;
}

async function touchPlayer(storage, roomId, playerId, playerName, knownMeta) {
  const meta = knownMeta || (await getRoom(storage, roomId));
  meta.players = meta.players || {};
  const prev = meta.players[playerId];
  const ts = now();
  const nextName = sanitizeName(playerName);
  // 脏检查：只有新玩家、改名或距上次落盘超过写间隔才真正写 KV，
  // 否则只更新本次响应用的内存副本（省写额度）
  const dirty =
    !prev || prev.name !== nextName || ts - (prev.lastSeen || 0) > PRESENCE_WRITE_GAP_MS;
  meta.players[playerId] = { name: nextName, lastSeen: ts };
  if (dirty) {
    meta.updatedAt = ts;
    await storage.put(keyMeta(roomId), meta);
  }
  return meta;
}

async function ensureRoom(storage, roomId) {
  const existing = await storage.get(keyMeta(roomId));
  if (existing) return;
  await storage.put(keyMeta(roomId), {
    status: 'playing',
    createdAt: now(),
    updatedAt: now(),
    players: {},
  });
  for (const n of CANVAS_IDS) {
    await storage.put(keyCanvas(roomId, n), {
      status: 'idle',
      artistId: null,
      artistName: null,
      strokes: [],
      updatedAt: now(),
    });
  }
}

async function snapshot(storage, roomId) {
  const meta = await getRoom(storage, roomId);
  const canvasObjs = await Promise.all(CANVAS_IDS.map((n) => storage.get(keyCanvas(roomId, n))));
  const players = activePlayerMap(meta);
  const canvases = {};
  CANVAS_IDS.forEach((n, i) => {
    const c = canvasObjs[i] || {};
    canvases[String(n)] = {
      status: c.status || 'idle',
      artistId: c.artistId ?? null,
      artistName: c.artistName ?? null,
      strokes: Array.isArray(c.strokes) ? c.strokes : [],
      updatedAt: c.updatedAt || 0,
      artistOnline: c.artistId ? Boolean(players[c.artistId]) : false,
    };
  });
  return {
    roomId,
    status: meta.status,
    updatedAt: meta.updatedAt || 0,
    players,
    canvases,
  };
}

function freshCanvas() {
  return { status: 'idle', artistId: null, artistName: null, strokes: [], updatedAt: now() };
}

// 读取画板并做通用校验：画板存在、请求者是画主、处于绘画中、本局未揭晓
async function getOwnedDrawingCanvas(storage, roomId, canvasId, playerId) {
  const meta = await getRoom(storage, roomId);
  if (meta.status !== 'playing') fail(409, 'room_revealed', '本局已揭晓，不能再操作画板');
  const canvas = await storage.get(keyCanvas(roomId, canvasId));
  if (!canvas) fail(404, 'canvas_not_found', '画板不存在');
  if (canvas.status !== 'drawing') fail(409, 'canvas_not_drawing', '画板不在绘画状态');
  if (canvas.artistId !== playerId) fail(403, 'not_artist', '只有认领者可以操作该画板');
  return canvas;
}

export async function handleApi(request, storage) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') return json({ ok: true });

  try {
    // GET /api/health —— 健康检查
    if (method === 'GET' && path === '/api/health') {
      return json({ ok: true, ts: now() });
    }

    // POST /api/rooms —— 创建或加入房间（幂等）
    if (method === 'POST' && path === '/api/rooms') {
      const body = await readBody(request);
      let roomId = typeof body.roomId === 'string' ? body.roomId.toUpperCase().trim() : '';
      if (roomId) {
        if (!isValidRoomId(roomId)) fail(400, 'bad_room_id', '房间号需为 4-6 位大写字母或数字');
      } else {
        for (let i = 0; i < 10; i++) {
          const candidate = generateRoomId();
          if (!(await storage.get(keyMeta(candidate)))) {
            roomId = candidate;
            break;
          }
        }
        if (!roomId) fail(500, 'room_id_exhausted', '房间号生成失败，请重试');
      }
      await ensureRoom(storage, roomId);
      if (isValidPlayerId(body.playerId)) {
        await touchPlayer(storage, roomId, body.playerId, body.playerName);
      }
      return json({ ok: true, room: await snapshot(storage, roomId) });
    }

    // GET /api/rooms/:id —— 房间快照（轮询端点）
    const mRoom = path.match(/^\/api\/rooms\/([A-Za-z0-9]{4,6})$/);
    if (mRoom) {
      const roomId = mRoom[1].toUpperCase();
      if (method === 'GET') return json(await snapshot(storage, roomId));
      fail(405, 'method_not_allowed', '不支持的方法');
    }

    // /api/rooms/:id/<action>
    const mAction = path.match(/^\/api\/rooms\/([A-Za-z0-9]{4,6})\/(claim|strokes|batch|undo|finish|release|reveal|reset|clear|heartbeat)$/);
    if (mAction && method === 'POST') {
      const roomId = mAction[1].toUpperCase();
      const action = mAction[2];
      const body = await readBody(request);
      const playerId = body.playerId;

      // 认领画板：仅 idle 可认领；原画主离线超时后可接管（保留其笔迹）
      if (action === 'claim') {
        const canvasId = Number(body.canvasId);
        if (!CANVAS_IDS.includes(canvasId)) fail(400, 'bad_canvas', '画板编号需为 1-4');
        if (!isValidPlayerId(playerId)) fail(400, 'bad_player', '玩家 ID 不合法');
        const meta = await getRoom(storage, roomId);
        if (meta.status !== 'playing') fail(409, 'room_revealed', '本局已揭晓，不能再认领');
        const key = keyCanvas(roomId, canvasId);
        const canvas = (await storage.get(key)) || freshCanvas();
        if (canvas.status === 'done') fail(409, 'canvas_done', '该画板已完成');
        if (canvas.artistId && canvas.artistId !== playerId) {
          const active = activePlayerMap(meta);
          if (active[canvas.artistId]) fail(409, 'canvas_taken', '该画板已被其他画友认领');
        }
        canvas.status = 'drawing';
        canvas.artistId = playerId;
        canvas.artistName = sanitizeName(body.playerName);
        canvas.updatedAt = now();
        await storage.put(key, canvas);
        await touchPlayer(storage, roomId, playerId, body.playerName, meta);
        return json({ ok: true, room: await snapshot(storage, roomId) });
      }

      // 上传一笔笔触
      if (action === 'strokes') {
        if (!isValidPlayerId(playerId)) fail(400, 'bad_player', '玩家 ID 不合法');
        const canvasId = Number(body.canvasId);
        if (!CANVAS_IDS.includes(canvasId)) fail(400, 'bad_canvas', '画板编号需为 1-4');
        const canvas = await getOwnedDrawingCanvas(storage, roomId, canvasId, playerId);
        if (!isValidStroke(body.stroke)) fail(400, 'bad_stroke', '笔触数据不合法');
        if (canvas.strokes.length >= MAX_STROKES) fail(409, 'too_many_strokes', '笔触数量已达上限');
        canvas.strokes.push({ ...body.stroke, by: playerId, at: now() });
        canvas.updatedAt = now();
        await storage.put(keyCanvas(roomId, canvasId), canvas);
        return json({ ok: true, count: canvas.strokes.length });
      }

      // 批量上传笔触：一次 KV 写入提交多笔（客户端约 2.5s 或攒满 8 笔刷一次）
      if (action === 'batch') {
        if (!isValidPlayerId(playerId)) fail(400, 'bad_player', '玩家 ID 不合法');
        const canvasId = Number(body.canvasId);
        if (!CANVAS_IDS.includes(canvasId)) fail(400, 'bad_canvas', '画板编号需为 1-4');
        const list = body.strokes;
        if (!Array.isArray(list) || list.length === 0 || list.length > MAX_STROKES_BATCH) {
          fail(400, 'bad_batch', `批量笔触需为 1-${MAX_STROKES_BATCH} 条`);
        }
        for (const s of list) {
          if (!isValidStroke(s)) fail(400, 'bad_stroke', '笔触数据不合法');
        }
        const canvas = await getOwnedDrawingCanvas(storage, roomId, canvasId, playerId);
        if (canvas.strokes.length + list.length > MAX_STROKES) {
          fail(409, 'too_many_strokes', '笔触数量已达上限');
        }
        const ts = now();
        canvas.strokes.push(...list.map((s) => ({ ...s, by: playerId, at: ts })));
        canvas.updatedAt = ts;
        await storage.put(keyCanvas(roomId, canvasId), canvas);
        return json({ ok: true, count: canvas.strokes.length });
      }

      // 撤销自己的最后一笔
      if (action === 'undo') {
        if (!isValidPlayerId(playerId)) fail(400, 'bad_player', '玩家 ID 不合法');
        const canvasId = Number(body.canvasId);
        if (!CANVAS_IDS.includes(canvasId)) fail(400, 'bad_canvas', '画板编号需为 1-4');
        const canvas = await getOwnedDrawingCanvas(storage, roomId, canvasId, playerId);
        let idx = -1;
        for (let i = canvas.strokes.length - 1; i >= 0; i--) {
          if (canvas.strokes[i].by === playerId) {
            idx = i;
            break;
          }
        }
        if (idx === -1) fail(409, 'nothing_to_undo', '没有可撤销的笔触');
        canvas.strokes.splice(idx, 1);
        canvas.updatedAt = now();
        await storage.put(keyCanvas(roomId, canvasId), canvas);
        return json({ ok: true, count: canvas.strokes.length });
      }

      // 清空自己画板的全部笔迹（保留认领状态，与「撤销」逐笔回退互补）
      if (action === 'clear') {
        if (!isValidPlayerId(playerId)) fail(400, 'bad_player', '玩家 ID 不合法');
        const canvasId = Number(body.canvasId);
        if (!CANVAS_IDS.includes(canvasId)) fail(400, 'bad_canvas', '画板编号需为 1-4');
        const canvas = await getOwnedDrawingCanvas(storage, roomId, canvasId, playerId);
        canvas.strokes = [];
        canvas.updatedAt = now();
        await storage.put(keyCanvas(roomId, canvasId), canvas);
        return json({ ok: true, count: 0 });
      }

      // 完成画板
      if (action === 'finish') {
        if (!isValidPlayerId(playerId)) fail(400, 'bad_player', '玩家 ID 不合法');
        const canvasId = Number(body.canvasId);
        if (!CANVAS_IDS.includes(canvasId)) fail(400, 'bad_canvas', '画板编号需为 1-4');
        const canvas = await getOwnedDrawingCanvas(storage, roomId, canvasId, playerId);
        canvas.status = 'done';
        canvas.updatedAt = now();
        await storage.put(keyCanvas(roomId, canvasId), canvas);
        return json({ ok: true, room: await snapshot(storage, roomId) });
      }

      // 释放画板：画主本人可随时放弃；他人只能释放「画主已离线」的画板
      if (action === 'release') {
        if (!isValidPlayerId(playerId)) fail(400, 'bad_player', '玩家 ID 不合法');
        const canvasId = Number(body.canvasId);
        if (!CANVAS_IDS.includes(canvasId)) fail(400, 'bad_canvas', '画板编号需为 1-4');
        const meta = await getRoom(storage, roomId);
        const key = keyCanvas(roomId, canvasId);
        const canvas = await storage.get(key);
        if (!canvas || canvas.status === 'idle') return json({ ok: true, room: await snapshot(storage, roomId) });
        if (canvas.status !== 'drawing') fail(409, 'canvas_not_drawing', '只能释放绘画中的画板');
        if (canvas.artistId !== playerId) {
          const active = activePlayerMap(meta);
          if (canvas.artistId && active[canvas.artistId]) fail(403, 'artist_online', '绘画中的画板不能被他人释放');
        }
        await storage.put(key, freshCanvas());
        return json({ ok: true, room: await snapshot(storage, roomId) });
      }

      // 揭晓：4 格全部完成后任何人可触发
      if (action === 'reveal') {
        const meta = await getRoom(storage, roomId);
        if (meta.status === 'revealed') return json({ ok: true, room: await snapshot(storage, roomId) });
        if (meta.status !== 'playing') fail(409, 'bad_state', '当前状态不能揭晓');
        const canvases = await Promise.all(CANVAS_IDS.map((n) => storage.get(keyCanvas(roomId, n))));
        if (!canvases.every((c) => c && c.status === 'done')) fail(409, 'not_all_done', '还有画板未完成');
        meta.status = 'revealed';
        meta.updatedAt = now();
        await storage.put(keyMeta(roomId), meta);
        return json({ ok: true, room: await snapshot(storage, roomId) });
      }

      // 再来一局：清空全部画板，回到进行中
      if (action === 'reset') {
        const meta = await getRoom(storage, roomId);
        meta.status = 'playing';
        meta.updatedAt = now();
        await storage.put(keyMeta(roomId), meta);
        for (const n of CANVAS_IDS) {
          await storage.put(keyCanvas(roomId, n), freshCanvas());
        }
        return json({ ok: true, room: await snapshot(storage, roomId) });
      }

      // 心跳：维持在场状态（30s 无心跳视为离线）
      if (action === 'heartbeat') {
        if (!isValidPlayerId(playerId)) fail(400, 'bad_player', '玩家 ID 不合法');
        await touchPlayer(storage, roomId, playerId, body.playerName);
        return json({ ok: true, room: await snapshot(storage, roomId) });
      }
    }

    return json({ error: 'not_found', message: '接口不存在' }, 404);
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.code, message: e.message }, e.status);
    console.error('[api] internal error:', e);
    return json({ error: 'internal', message: '服务器内部错误' }, 500);
  }
}
