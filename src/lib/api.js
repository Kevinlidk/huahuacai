// /api 客户端：所有后端交互集中在这里
async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // 网络层失败（服务未启动/断网），给出可行动的提示
    throw new Error('无法连接服务器：本地请先运行 npm run dev，线上请检查网络');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* 非 JSON 响应按 null 处理 */
  }
  if (!res.ok) {
    const err = new Error(data?.message || `请求失败 (${res.status})`);
    err.code = data?.error;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  createOrJoinRoom: (body) => request('/api/rooms', { method: 'POST', body }),
  getRoom: (roomId) => request(`/api/rooms/${roomId}`),
  claim: (roomId, canvasId, playerId, playerName) =>
    request(`/api/rooms/${roomId}/claim`, { method: 'POST', body: { canvasId, playerId, playerName } }),
  addStroke: (roomId, canvasId, playerId, stroke) =>
    request(`/api/rooms/${roomId}/strokes`, { method: 'POST', body: { canvasId, playerId, stroke } }),
  undo: (roomId, canvasId, playerId) =>
    request(`/api/rooms/${roomId}/undo`, { method: 'POST', body: { canvasId, playerId } }),
  clear: (roomId, canvasId, playerId) =>
    request(`/api/rooms/${roomId}/clear`, { method: 'POST', body: { canvasId, playerId } }),
  finish: (roomId, canvasId, playerId) =>
    request(`/api/rooms/${roomId}/finish`, { method: 'POST', body: { canvasId, playerId } }),
  release: (roomId, canvasId, playerId) =>
    request(`/api/rooms/${roomId}/release`, { method: 'POST', body: { canvasId, playerId } }),
  reveal: (roomId) => request(`/api/rooms/${roomId}/reveal`, { method: 'POST', body: {} }),
  reset: (roomId) => request(`/api/rooms/${roomId}/reset`, { method: 'POST', body: {} }),
  heartbeat: (roomId, playerId, playerName) =>
    request(`/api/rooms/${roomId}/heartbeat`, { method: 'POST', body: { playerId, playerName } }),
};
