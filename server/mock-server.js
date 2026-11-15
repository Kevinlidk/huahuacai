// 本地 KV 模拟服务：用内存 Map 实现 storage 接口，
// 与 worker 共享 shared/api.js 里的同一份业务逻辑，保证本地与线上行为一致。
// 启动：npm run dev:api （默认端口 8788，可用 PORT 环境变量覆盖）
import http from 'node:http';
import { configureSync, handleApi } from '../shared/api.js';
import { writeJson } from './respond.js';

// 本地内存存储无任何额度约束：实时同步节奏
configureSync({
  presenceWriteGapMs: 0,
  presenceTtlMs: 15_000,
  sync: { pollMs: 500, heartbeatMs: 5000, strokeBatchMs: 0, strokeBatchMax: 1 },
});

const PORT = Number(process.env.PORT || 8788);

const mem = new Map();
const storage = {
  async get(key) {
    const v = mem.get(key);
    return v === undefined ? null : structuredClone(v);
  },
  async put(key, value) {
    mem.set(key, structuredClone(value));
  },
};

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    const hasBody = raw.length > 0 && req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(`http://127.0.0.1:${PORT}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: hasBody ? raw : undefined,
    });
    const payload = await handleApi(request, storage);
    const data = await payload.json();
    writeJson(res, payload.status, data);
  } catch (e) {
    writeJson(res, 500, { error: 'internal', message: '服务器内部错误' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[mock-kv] 本地 KV 模拟服务已启动: http://127.0.0.1:8788');
});
