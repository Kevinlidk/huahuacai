// 数据校验：server（本地 mock/docker）与 worker（线上 KV）共用，防止恶意数据注入
export const TOOLS = ['pen', 'eraser'];

// 参与人数（= 画板数）：创建房间时指定，默认 4
export const PLAYER_COUNT_MIN = 2;
export const PLAYER_COUNT_MAX = 12;
export const PLAYER_COUNT_DEFAULT = 4;

export function normalizePlayerCount(v) {
  if (v === undefined || v === null || v === '') return PLAYER_COUNT_DEFAULT;
  const n = Number(v);
  if (!Number.isInteger(n) || n < PLAYER_COUNT_MIN || n > PLAYER_COUNT_MAX) return null;
  return n;
}
export const ROOM_ID_RE = /^[A-Z0-9]{4,6}$/;
export const PLAYER_ID_RE = /^p_[A-Za-z0-9]{6,32}$/;
export const MAX_STROKES = 3000; // 单画板笔触上限
export const MAX_POINTS = 2000; // 单笔触点数上限
export const MAX_STROKES_BATCH = 8; // 批量上传单次笔触数（省 KV 写额度）
export const MAX_BODY_BYTES = 256 * 1024; // 请求体上限
export const PRESENCE_TTL_MS = 75_000; // 玩家心跳过期时间（客户端 20s 心跳 + 服务端 40s 写节流的兜底余量）

export function isValidRoomId(v) {
  return typeof v === 'string' && ROOM_ID_RE.test(v);
}

export function isValidPlayerId(v) {
  return typeof v === 'string' && PLAYER_ID_RE.test(v);
}

export function sanitizeName(v) {
  if (typeof v !== 'string') return '无名画友';
  const trimmed = v.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim();
  return (trimmed || '无名画友').slice(0, 24);
}

// 笔触：坐标归一化到 0..1，线宽为画布宽度的比例，保证任意屏幕渲染一致
export function isValidStroke(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
  if (!TOOLS.includes(s.tool)) return false;
  if (typeof s.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(s.color)) return false;
  const size = Number(s.size);
  if (!Number.isFinite(size) || size < 0.002 || size > 0.08) return false;
  if (!Array.isArray(s.points) || s.points.length < 2 || s.points.length > MAX_POINTS) return false;
  for (const p of s.points) {
    if (!Array.isArray(p) || p.length !== 2) return false;
    const x = p[0];
    const y = p[1];
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return false;
  }
  return true;
}
