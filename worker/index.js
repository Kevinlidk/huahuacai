// Cloudflare Worker 入口：/api/* 走 KV 业务逻辑，其余走静态资源（dist）
import { handleApi } from '../shared/api.js';

function kvStorage(kv) {
  return {
    async get(key) {
      return kv.get(key, 'json');
    },
    async put(key, value) {
      await kv.put(key, JSON.stringify(value));
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
