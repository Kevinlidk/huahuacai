// 自托管 Docker 部署入口：单进程同时提供静态页面与 /api，
// 数据以 JSON 文件持久化在 DATA_DIR（默认 /opt/huahuacai/results，可被卷挂载持久化）。
// 与 Cloudflare KV / 本地 mock 共享 shared/api.js 同一份业务逻辑，仅存储适配器不同。
import http from 'node:http';
import { promises as fsp } from 'node:fs';
import { dirname, join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureSync, handleApi } from '../shared/api.js';
import { writeJson } from './respond.js';

// 自托管磁盘存储无任何额度约束：实时同步节奏（每笔即时上传、0.3s 轮询、2s 心跳）
configureSync({
  presenceWriteGapMs: 0,
  presenceTtlMs: 6000,
  sync: { pollMs: 300, heartbeatMs: 2000, strokeBatchMs: 0, strokeBatchMax: 1 },
});

const PORT = Number(process.env.PORT || 80);
const DATA_DIR = process.env.DATA_DIR || '/opt/huahuacai/results';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

await fsp.mkdir(DATA_DIR, { recursive: true });

// 磁盘持久化存储适配器：读走内存缓存，写内存 + 原子落盘（临时文件再 rename），
// 进程重启后数据自动从盘上恢复
function fileStorage(dir) {
  const mem = new Map();
  const fileFor = (key) => join(dir, `${key.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
  return {
    async get(key) {
      if (mem.has(key)) return structuredClone(mem.get(key));
      try {
        const v = JSON.parse(await fsp.readFile(fileFor(key), 'utf8'));
        mem.set(key, v);
        return structuredClone(v);
      } catch {
        return null;
      }
    },
    async put(key, value) {
      mem.set(key, structuredClone(value));
      const target = fileFor(key);
      const tmp = `${target}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(value), 'utf8');
      await fsp.rename(tmp, target);
    },
  };
}

const storage = fileStorage(DATA_DIR);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// 静态资源解析：拒绝 dist 目录之外的路径；带扩展名但缺失的文件返回 404；
// 其余路径回退 index.html（SPA 前端路由）
async function resolveStatic(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { file: null, status: 400 };
  }
  const resolved = normalize(join(DIST, decoded));
  if (resolved !== DIST && !resolved.startsWith(DIST + sep)) return { file: null, status: 403 };
  const st = await fsp.stat(resolved).catch(() => null);
  if (st?.isFile()) return { file: resolved };
  if (extname(resolved)) return { file: null, status: 404 };
  return { file: join(DIST, 'index.html') };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://internal.invalid');
    // /api/* → 房间业务逻辑（磁盘持久化存储）
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      const request = new Request(`http://internal.invalid${url.pathname}${url.search}`, {
        method: req.method,
        headers: req.headers,
        body: req.method === 'GET' || req.method === 'HEAD' || raw.length === 0 ? undefined : raw,
      });
      const payload = await handleApi(request, storage);
      const data = await payload.json();
      writeJson(res, payload.status, data);
      return;
    }
    // 其余 → 静态资源（dist）
    const { file, status } = await resolveStatic(url.pathname);
    if (!file) {
      writeJson(res, status, { error: 'not_found', message: '资源不存在' });
      return;
    }
    const body = await fsp.readFile(file);
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader(
      'Cache-Control',
      file.endsWith('index.html') ? 'no-cache' : 'public, max-age=604800'
    );
    res.end(body);
  } catch (e) {
    console.error('[docker-server] request error:', e);
    writeJson(res, 500, { error: 'internal', message: '服务器内部错误' });
  }
});

server.listen(PORT, () => {
  console.log(`[docker-server] 服务已启动: 0.0.0.0:${PORT}，数据目录: ${DATA_DIR}`);
});
