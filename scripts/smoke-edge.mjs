// API 边界与权限专项测试：补充 smoke.mjs 未覆盖的恶意输入、竞态、超时接管等场景
// 用法：先启动 npm run dev:api，再运行 node scripts/smoke-edge.mjs
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8788/api';

let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

async function call(path, body, { raw = false } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, data };
}

const stroke = (over = {}) => ({
  tool: 'pen',
  color: '#3b82f6',
  size: 0.01,
  points: [
    [0.1, 0.1],
    [0.9, 0.9],
  ],
  ...over,
});

console.log(`边界测试目标: ${BASE}`);

// ===== 0. 准备两个房间 =====
const A = { playerId: 'p_edgeaaaaaa', playerName: '边界甲' };
const B = { playerId: 'p_edgebbbbbb', playerName: '边界乙' };
let roomId;
{
  const { status, data } = await call('/rooms', { ...A });
  check('创建测试房间', status === 200 && !!data?.room?.roomId);
  roomId = data?.room?.roomId;
  await call('/rooms', { roomId, ...B });
}

// ===== 1. 恶意/非法输入 =====
{
  const { status } = await call('/rooms', { roomId: '!!无效!!', ...A });
  check('非法字符房间号被拒(400)', status === 400);
}
{
  // 缺 content-type 的原始字符串 → 应 400 而非 500
  const { status } = await call(`/rooms/${roomId}/claim`, 'not-json', { raw: true });
  check('非 JSON 请求体被拒(400)而非500', status === 400);
}
{
  const { status } = await call(`/rooms/${roomId}/claim`, { canvasId: 0, ...A });
  check('canvasId=0 被拒(400)', status === 400);
}
{
  const { status } = await call(`/rooms/${roomId}/claim`, { canvasId: 5, ...A });
  check('canvasId=5 被拒(400)', status === 400);
}
{
  const { status } = await call(`/rooms/${roomId}/claim`, { canvasId: 1, playerId: 'bad id!', playerName: 'x' });
  check('非法 playerId 被拒(400)', status === 400);
}
{
  await call(`/rooms/${roomId}/claim`, { canvasId: 1, ...A });
  const cases = [
    ['tool 非法', stroke({ tool: 'marker' })],
    ['color 非法', stroke({ color: 'red' })],
    ['size 过大', stroke({ size: 0.5 })],
    ['size 过小', stroke({ size: 0.0001 })],
    ['points 空', stroke({ points: [] })],
    ['单点', stroke({ points: [[0.5, 0.5]] })],
    ['坐标越界', stroke({ points: [[1.5, 0.5], [0.2, 0.2]] })],
    ['坐标为字符串', stroke({ points: [['0.5', 0.5], [0.2, 0.2]] })],
    ['points 超上限', stroke({ points: Array.from({ length: 2001 }, (_, i) => [i / 2001, 0.5]) })],
    ['stroke 缺失', undefined],
  ];
  let allRejected = true;
  for (const [name, s] of cases) {
    const { status } = await call(`/rooms/${roomId}/strokes`, { canvasId: 1, playerId: A.playerId, stroke: s });
    if (status !== 400) {
      allRejected = false;
      console.error(`    ↳ ${name} 返回 ${status}`);
    }
  }
  check('10 种非法笔触全部被拒(400)', allRejected);
}

// ===== 2. 昵称清洗 =====
{
  await call(`/rooms/${roomId}/heartbeat`, { playerId: A.playerId, playerName: '<script>alert(1)</script>' });
  const { data } = await call(`/rooms/${roomId}`);
  const name = data?.players?.[A.playerId]?.name || '';
  const hasSpecial = /[<>/()]/.test(name);
  check('昵称特殊字符被清洗', !hasSpecial, `实际: ${name}`);
  const { status } = await call(`/rooms/${roomId}/heartbeat`, {
    playerId: A.playerId,
    playerName: 'x'.repeat(100),
  });
  const { data: d2 } = await call(`/rooms/${roomId}`);
  check('昵称超长被截断到24', status === 200 && (d2?.players?.[A.playerId]?.name || '').length <= 24);
}

// ===== 3. 状态机与权限 =====
{
  const { status, data } = await call(`/rooms/${roomId}/undo`, { canvasId: 1, playerId: A.playerId });
  check('空画板撤销被拒(409)', status === 409 && data?.error === 'nothing_to_undo');
}
{
  // 乙对甲的画板撤销/完成 → 403
  const u = await call(`/rooms/${roomId}/undo`, { canvasId: 1, playerId: B.playerId });
  const f = await call(`/rooms/${roomId}/finish`, { canvasId: 1, playerId: B.playerId });
  check('非画主撤销/完成均被拒(403)', u.status === 403 && f.status === 403);
}
{
  // 完成后不能再画
  await call(`/rooms/${roomId}/finish`, { canvasId: 1, playerId: A.playerId });
  const { status } = await call(`/rooms/${roomId}/strokes`, {
    canvasId: 1,
    playerId: A.playerId,
    stroke: stroke(),
  });
  check('已完成画板不能再画(409)', status === 409);
}
{
  // 未全部完成时揭晓
  const { status, data } = await call(`/rooms/${roomId}/reveal`, {});
  check('未全部完成揭晓被拒(409)', status === 409 && data?.error === 'not_all_done');
}
{
  // 心跳不存在的房间
  const { status } = await call('/rooms/ZZZZ/heartbeat', { ...A });
  check('心跳不存在房间返回404', status === 404);
}

// ===== 3.5 清空画板 =====
{
  await call(`/rooms/${roomId}/claim`, { canvasId: 2, ...A });
  await call(`/rooms/${roomId}/strokes`, { canvasId: 2, playerId: A.playerId, stroke: stroke() });
  await call(`/rooms/${roomId}/strokes`, { canvasId: 2, playerId: A.playerId, stroke: stroke() });
  const { status, data } = await call(`/rooms/${roomId}/clear`, { canvasId: 2, playerId: A.playerId });
  check('画主清空→笔数0', status === 200 && data?.count === 0);
  const u = await call(`/rooms/${roomId}/undo`, { canvasId: 2, playerId: A.playerId });
  check('清空后撤销被拒(409)', u.status === 409);
  const c = await call(`/rooms/${roomId}/clear`, { canvasId: 2, playerId: B.playerId });
  check('非画主清空被拒(403)', c.status === 403);
  await call(`/rooms/${roomId}/release`, { canvasId: 2, playerId: A.playerId });
}

// ===== 4. 释放/接管 =====
{
  // 甲认领 2 并画一笔后自己释放 → 清空
  await call(`/rooms/${roomId}/claim`, { canvasId: 2, ...A });
  await call(`/rooms/${roomId}/strokes`, { canvasId: 2, playerId: A.playerId, stroke: stroke() });
  const { status, data } = await call(`/rooms/${roomId}/release`, { canvasId: 2, playerId: A.playerId });
  const c2 = data?.room?.canvases?.['2'];
  check('画主自释放→idle且清空', status === 200 && c2?.status === 'idle' && c2?.strokes?.length === 0);
}
{
  // 乙在线时甲不能释放乙的画板
  await call(`/rooms/${roomId}/claim`, { canvasId: 2, ...B });
  await call(`/rooms/${roomId}/heartbeat`, { ...B });
  const { status } = await call(`/rooms/${roomId}/release`, { canvasId: 2, playerId: A.playerId });
  check('他人在线时释放被拒(403)', status === 403);
  // 乙自己放弃
  await call(`/rooms/${roomId}/release`, { canvasId: 2, playerId: B.playerId });
}

// ===== 5. 心跳过期接管（等 80s，在场 TTL 75s）=====
{
  await call(`/rooms/${roomId}/claim`, { canvasId: 3, ...A });
  await call(`/rooms/${roomId}/strokes`, { canvasId: 3, playerId: A.playerId, stroke: stroke() });
  console.log('  … 等待 80s 让甲心跳过期');
  await new Promise((r) => setTimeout(r, 80_000));
  const { status, data } = await call(`/rooms/${roomId}/claim`, { canvasId: 3, ...B });
  const c3 = data?.room?.canvases?.['3'];
  check('离线画板可被接管且保留笔迹', status === 200 && c3?.artistId === B.playerId && c3?.strokes?.length === 1);
  // 乙继续在接管的画板上画
  const s = await call(`/rooms/${roomId}/strokes`, { canvasId: 3, playerId: B.playerId, stroke: stroke() });
  check('接管者可以继续作画', s.status === 200);
  // 原画主回来操作 → 403
  const stale = await call(`/rooms/${roomId}/strokes`, { canvasId: 3, playerId: A.playerId, stroke: stroke() });
  check('原画主被接管后写入被拒(403)', stale.status === 403);
  await call(`/rooms/${roomId}/finish`, { canvasId: 3, playerId: B.playerId });
}

// ===== 5.5 批量笔触 =====
{
  await call(`/rooms/${roomId}/claim`, { canvasId: 2, ...B });
  const list = [
    stroke({ color: '#22c55e' }),
    stroke({ color: '#ef4444' }),
    stroke({ color: '#3b82f6' }),
  ];
  const { status, data } = await call(`/rooms/${roomId}/batch`, { canvasId: 2, playerId: B.playerId, strokes: list });
  check('批量3笔一次提交', status === 200 && data?.count === 3, `status=${status} count=${data?.count}`);
  const bad = await call(`/rooms/${roomId}/batch`, {
    canvasId: 2,
    playerId: B.playerId,
    strokes: [stroke(), stroke({ color: 'red' })],
  });
  check('批量含非法笔触整体拒绝(400)', bad.status === 400);
  const tooMany = await call(`/rooms/${roomId}/batch`, {
    canvasId: 2,
    playerId: B.playerId,
    strokes: Array.from({ length: 9 }, () => stroke()),
  });
  check('批量超过8条拒绝(400)', tooMany.status === 400);
  await call(`/rooms/${roomId}/release`, { canvasId: 2, playerId: B.playerId });
}

// ===== 6. 并发认领竞态 =====
{
  const [r1, r2] = await Promise.all([
    call(`/rooms/${roomId}/claim`, { canvasId: 4, ...A }),
    call(`/rooms/${roomId}/claim`, { canvasId: 4, ...B }),
  ]);
  const statuses = [r1.status, r2.status].sort();
  check('并发认领同一画板：恰好一人成功', statuses[0] === 200 && statuses[1] === 409, `${r1.status}/${r2.status}`);
  await call(`/rooms/${roomId}/release`, { canvasId: 4, playerId: r1.status === 200 ? A.playerId : B.playerId });
}

// ===== 7. 大请求体 =====
{
  // 在空闲画板上验证「恰好 2000 点」的合法边界笔触
  await call(`/rooms/${roomId}/claim`, { canvasId: 2, playerId: A.playerId, playerName: A.playerName });
  const bigPoints = Array.from({ length: 2000 }, (_, i) => [i / 2000, 0.5]);
  const s = stroke({ points: bigPoints });
  const { status } = await call(`/rooms/${roomId}/strokes`, { canvasId: 2, playerId: A.playerId, stroke: s });
  check('恰好2000点合法笔触通过', status === 200, `status=${status}`);
  await call(`/rooms/${roomId}/release`, { canvasId: 2, playerId: A.playerId });
}

// ===== 8. 再来一局后可重新认领 =====
{
  await call(`/rooms/${roomId}/reveal`, {});
  await call(`/rooms/${roomId}/reset`, {});
  const { status, data } = await call(`/rooms/${roomId}/claim`, { canvasId: 1, ...A });
  check('reset 后可重新认领', status === 200 && data?.room?.canvases?.['1']?.status === 'drawing');
}

// ===== 9. 心跳写盘节流（直连业务层，用计数存储验证）=====
{
  const { handleApi } = await import('../shared/api.js');
  const mem = new Map();
  let putCount = 0;
  const countingStorage = {
    async get(key) {
      const v = mem.get(key);
      return v === undefined ? null : structuredClone(v);
    },
    async put(key, value) {
      putCount++;
      mem.set(key, structuredClone(value));
    },
  };
  const req = (p, body) =>
    new Request(`http://test.local/api${p}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const player = { playerId: 'p_throttle01', playerName: '节流' };
  await handleApi(req('/rooms', { roomId: 'THRT', ...player }), countingStorage);
  const afterJoin = putCount;
  for (let i = 0; i < 3; i++) {
    await handleApi(req('/rooms/THRT/heartbeat', { ...player }), countingStorage);
  }
  check('40s 内连续三次心跳零写盘', putCount === afterJoin, `join后=${afterJoin} 现在=${putCount}`);
  await handleApi(req('/rooms/THRT/heartbeat', { playerId: player.playerId, playerName: '新名字' }), countingStorage);
  check('改名触发立即写盘', putCount === afterJoin + 1, `now=${putCount}`);
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exitCode = failed > 0 ? 1 : 0;
