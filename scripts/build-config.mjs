// 部署前生成 wrangler.generated.jsonc：
// wrangler 配置不支持 ${VAR} 环境变量插值，因此由本脚本读取 KV_NAMESPACE_ID
// 环境变量，注入 KV 绑定后生成独立配置文件，供 `wrangler deploy --config` 使用。
// 每次部署都会重新生成绑定，不依赖 Dashboard 手工绑定，仓库中不落任何环境信息。
// 用法：KV_NAMESPACE_ID=<32位id> node scripts/build-config.mjs （已内置在 npm run deploy）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ID_RE = /^[0-9a-fA-F]{32}$/;

// 本项目 wrangler.jsonc 只使用整行 // 注释：逐行剥离后再去掉尾逗号
function parseJsonc(text) {
  const noComments = text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  return JSON.parse(noComments.replace(/,\s*([}\]])/g, '$1'));
}

const id = (process.env.KV_NAMESPACE_ID || '').trim();
if (!ID_RE.test(id)) {
  console.error(
    '[build-config] 未设置或格式错误的 KV_NAMESPACE_ID（应为 32 位十六进制）。\n' +
      '  - Cloudflare Git 构建：Worker → 设置 → 构建 → 变量和密钥，添加 KV_NAMESPACE_ID\n' +
      '  - 本地命令行：export KV_NAMESPACE_ID=<你的 namespace id>'
  );
  process.exit(1);
}

const base = parseJsonc(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'));
base.kv_namespaces = [{ binding: 'ROOMS', id }];

const outPath = join(root, 'wrangler.generated.jsonc');
writeFileSync(outPath, JSON.stringify(base, null, 2) + '\n');
console.log(`[build-config] 已生成 wrangler.generated.jsonc（KV 绑定 ROOMS → ${id.slice(0, 6)}…）`);
