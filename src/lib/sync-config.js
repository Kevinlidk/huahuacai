// 同步节奏配置：启动时向后端 /api/health 询问一次本部署的节奏，
// 并以订阅方式广播给 useRoomSync / 心跳 / 笔触上传等消费方。
// 健康检查返回前使用保守默认（= Cloudflare KV 节奏），获取失败则沿用默认。
const DEFAULT_SYNC = {
  pollMs: 2000,
  heartbeatMs: 20_000,
  strokeBatchMs: 2500,
  strokeBatchMax: 8,
};

let current = { ...DEFAULT_SYNC };
const subscribers = new Set();

export function getSyncConfig() {
  return current;
}

export function onSyncConfigChange(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

(async () => {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return;
    const data = await res.json();
    if (data?.sync && typeof data.sync === 'object') {
      current = { ...DEFAULT_SYNC, ...data.sync };
      subscribers.forEach((fn) => {
        try {
          fn(current);
        } catch {
          /* 订阅者异常不影响其他订阅者 */
        }
      });
    }
  } catch {
    /* 网络不通：沿用保守默认 */
  }
})();
