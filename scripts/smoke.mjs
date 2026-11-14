// API 端到端冒烟测试：模拟两名玩家完整走通「建房 → 认领 → 作画 → 完成 → 揭晓 → 再来一局」
// 用法：先启动 npm run dev:api，再运行 npm run smoke
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

async function call(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, data };
}

const A = { playerId: 'p_smokeaaaa', playerName: '冒烟甲' };
const B = { playerId: 'p_smokebbbb', playerName: '冒烟乙' };

const strokeOf = (x1, y1, x2, y2) => ({
  tool: 'pen',
  color: '#ef4444',
  size: 0.01,
  points: [
    [x1, y1],
    [(x1 + x2) / 2, (y1 + y2) / 2],
    [x2, y2],
  ],
});

console.log(`冒烟测试目标: ${BASE}`);

// 健康检查
{
  const { status, data } = await call('/health');
  check('健康检查', status === 200 && data?.ok === true);
}

// 甲创建房间
let roomId;
{
  const { status, data } = await call('/rooms', { ...A });
  check('甲创建房间', status === 200 && data?.room?.status === 'playing');
  roomId = data?.room?.roomId;
  check('返回 4 位房间号', /^[A-Z0-9]{4}$/.test(roomId || ''));
}

// 非法房间号被拒
{
  const { status } = await call('/rooms', { roomId: 'BAD!ID', ...A });
  check('非法房间号被拒绝(400)', status === 400);
}

// 乙加入同一房间
{
  const { status, data } = await call('/rooms', { roomId, ...B });
  check('乙加入房间', status === 200 && data?.room?.roomId === roomId);
}

// 甲认领画板 1
{
  const { status, data } = await call(`/rooms/${roomId}/claim`, { canvasId: 1, ...A });
  check('甲认领画板1', status === 200 && data?.room?.canvases?.['1']?.status === 'drawing');
}

// 乙抢画板 1 应被拒
{
  const { status, data } = await call(`/rooms/${roomId}/claim`, { canvasId: 1, ...B });
  check('乙认领已被占画板被拒(409)', status === 409 && data?.error === 'canvas_taken');
}

// 甲上传笔触
{
  const { status, data } = await call(`/rooms/${roomId}/strokes`, {
    canvasId: 1,
    playerId: A.playerId,
    stroke: strokeOf(0.1, 0.1, 0.9, 0.9),
  });
  check('甲上传笔触', status === 200 && data?.count === 1);
}

// 非画主上传应被拒
{
  const { status } = await call(`/rooms/${roomId}/strokes`, {
    canvasId: 1,
    playerId: B.playerId,
    stroke: strokeOf(0.1, 0.1, 0.2, 0.2),
  });
  check('非画主上传笔触被拒(403)', status === 403);
}

// 恶意笔触数据被拒（坐标越界）
{
  const { status } = await call(`/rooms/${roomId}/strokes`, {
    canvasId: 1,
    playerId: A.playerId,
    stroke: { tool: 'pen', color: '#ef4444', size: 0.01, points: [[5, 0.1], [0.2, 0.2]] },
  });
  check('越界坐标笔触被拒(400)', status === 400);
}

// 甲撤销
{
  const { status, data } = await call(`/rooms/${roomId}/undo`, { canvasId: 1, playerId: A.playerId });
  check('甲撤销一笔', status === 200 && data?.count === 0);
}

// 四块画板被四人(甲乙各画两块模拟)依次完成
for (const [canvasId, who] of [[1, A], [2, B], [3, A], [4, B]]) {
  await call(`/rooms/${roomId}/claim`, { canvasId, ...who });
  await call(`/rooms/${roomId}/strokes`, {
    canvasId,
    playerId: who.playerId,
    stroke: strokeOf(0.1, 0.9, 0.9, 0.1),
  });
  const { status, data } = await call(`/rooms/${roomId}/finish`, { canvasId, playerId: who.playerId });
  check(`画板${canvasId}完成`, status === 200 && data?.room?.canvases?.[String(canvasId)]?.status === 'done');
}

// 未全部完成时揭晓应被拒（先 reset 再验证）——此处已全部完成，直接揭晓
{
  const { status, data } = await call(`/rooms/${roomId}/reveal`, {});
  check('揭晓成功', status === 200 && data?.room?.status === 'revealed');
}

// 揭晓后不能再认领
{
  const { status } = await call(`/rooms/${roomId}/claim`, { canvasId: 1, ...A });
  check('揭晓后认领被拒(409)', status === 409);
}

// 再来一局
{
  const { status, data } = await call(`/rooms/${roomId}/reset`, {});
  const c1 = data?.room?.canvases?.['1'];
  check('再来一局重置成功', status === 200 && data?.room?.status === 'playing' && c1?.status === 'idle' && c1?.strokes?.length === 0);
}

// 未知接口
{
  const { status } = await call('/nope');
  check('未知接口返回404', status === 404);
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
// 用 exitCode 而非 process.exit，避免 Windows 下 libuv 关闭断言噪音
process.exitCode = failed > 0 ? 1 : 0;
