// Cloudflare Worker 入口：/api/* 走 KV 业务逻辑，其余走静态资源（dist）
import { ApiError, configureSync, handleApi } from '../shared/api.js';

// Cloudflare 免费层有每日写额度：使用保守同步节奏（详见 README「免费额度参考」）
configureSync({
  presenceWriteGapMs: 40_000,
  presenceTtlMs: 75_000,
  sync: { pollMs: 2000, heartbeatMs: 20_000, strokeBatchMs: 2500, strokeBatchMax: 8 },
});

// 免费层 KV 每日额度（写 1000/读 10 万）用尽时会抛 429，
// 把底层报错翻译成可读的业务错误，前端显示友好提示而非「服务器内部错误」
function asQuotaError(e) {
  const msg = String((e && e.message) || e);
  if (/429|too many|rate.?limit|exceed|quota|daily/i.test(msg)) {
    return new ApiError(429, 'quota_exceeded', '今日免费额度已用尽（UTC 0 点重置），写入暂时不可用');
  }
  return null;
}

function kvStorage(kv) {
  return {
    async get(key) {
      try {
        return await kv.get(key, 'json');
      } catch (e) {
        throw asQuotaError(e) || e;
      }
    },
    async put(key, value) {
      try {
        await kv.put(key, JSON.stringify(value));
      } catch (e) {
        throw asQuotaError(e) || e;
      }
    },
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return handleApi(request, kvStorage(env.ROOMS));
    }
    return env.ASSETS.fetch(request);
  },
};
