# 拼图绘画 · 多人协作

四人各画一格，全部完成后拼合揭晓的多人协作绘画小游戏。

技术栈：**Vite 7 + React 19 + Tailwind CSS v4 + React Router 7 + Cloudflare Workers KV**（后端逻辑本地与线上共用同一份实现）。

## 玩法

1. 一人创建房间，把 4 位房间号告诉朋友；
2. 每人在 2×2 网格中认领一格，进入全屏画布作画（画笔/橡皮/8 色/4 种粗细/撤销）；
3. 网格页实时显示其他画友的状态与笔迹缩略图（约 1 秒同步一次）；
4. 四格全部完成后任何人可点「揭晓」，信封动画展开完整拼图；
5. 可保存合成图片（PNG），或「再来一局」清空重画。

## 快速开始

```bash
npm install
npm run dev        # 同时启动本地 KV 模拟服务(8788) 和 Vite 开发服务器(5173)
```

打开 http://localhost:5173 。**自测多人协作**：再开一个浏览器窗口（或无痕窗口 + 不同身份），一个窗口点「创建新房间」，另一个输入房间号「加入」，即可模拟两名玩家。

> 无需 Cloudflare 账号：本地开发由 `server/mock-server.js` 提供与线上一致的 API（两者共享 `shared/api.js` 同一份业务逻辑）。

## 自测

```bash
npm run smoke      # API 端到端冒烟：两名玩家完整走通建房→认领→作画→撤销→完成→揭晓→重置（19 项断言）
```

已验证的浏览器双窗口流程：创建/加入房间 → 互见在线名单 → 乙认领第 1 格并作画 → 甲窗口 1~2 秒内看到状态与笔迹 → 四格完成 → 揭晓合成图 → 再来一局双方同步重置。

## 项目结构

```
├─ shared/
│  ├─ api.js          # /api 业务逻辑（worker 与本地 mock 共用，保证行为一致）
│  └─ validate.js     # 输入校验：房间号/玩家ID/笔触结构/上限，防恶意数据注入
├─ worker/index.js    # Cloudflare Worker 入口：/api → KV，其余 → 静态资源
├─ server/
│  ├─ mock-server.js  # 本地 KV 模拟服务（内存 Map，端口 8788）
│  └─ respond.js      # HTTP JSON 编码输出
├─ src/
│  ├─ components/
│  │  ├─ Home.jsx          # 首页：昵称、创建/加入房间
│  │  ├─ Room.jsx          # 房间容器：轮询同步、心跳、路由状态编排
│  │  ├─ GridBoard.jsx     # 2×2 网格：状态徽标、笔迹缩略图、离线接管/释放
│  │  ├─ DrawingCanvas.jsx # 全屏绘画层：画笔/橡皮/颜色/粗细/撤销/保存完成
│  │  └─ ResultReveal.jsx  # 揭晓：信封动画、2×2 合成图、保存 PNG、再来一局
│  ├─ hooks/useRoomSync.js # 1s 轮询同步（页面隐藏自动暂停）
│  └─ lib/                 # api 客户端、笔触渲染、玩家身份
├─ scripts/smoke.mjs  # API 冒烟测试
├─ wrangler.jsonc     # Cloudflare 部署配置
└─ vite.config.js     # Vite + React + Tailwind v4 + /api 代理
```

## 数据与同步

- **存储结构（KV 拆键，规避同键写冲突）**
  - `room:{roomId}:meta` —— 房间状态（playing/revealed）、玩家在场信息（心跳 5s，30s 超时判离线）
  - `room:{roomId}:canvas:{1..4}` —— 每画板一键：status/artistId/strokes，只有画主可写
- **实时同步**：前端每 1s 拉取房间快照。Workers KV 是最终一致的键值存储、无推送能力，因此采用轮询；若需逐笔实时协作可升级 Durable Objects + WebSocket（`shared/api.js` 业务逻辑可复用）
- **安全**：前端永不直连 KV，全部经 `/api/*`；Worker 端做格式校验、笔触白名单校验（工具枚举/颜色 hex/坐标 0–1/数量上限/请求体 ≤256KB）、操作权限校验（画主才能画/撤销/完成；揭晓需四格全完成）

## 部署到 Cloudflare（详细指引）

静态资源与 `/api` 同域部署在 Cloudflare Workers 上，天然无跨域问题。免费版即可运行。

### 前置准备

- 一个 Cloudflare 账号（[dash.cloudflare.com](https://dash.cloudflare.com) 免费注册）
- 本机 Node.js ≥ 20.19，且已执行 `npm install`

### 第 1 步：登录 Cloudflare

```bash
npx wrangler login      # 会打开浏览器完成授权
npx wrangler whoami     # 验证登录成功
```

> 网络不通时先给终端设置代理再执行：`export HTTPS_PROXY=http://127.0.0.1:7890`（Windows CMD：`set HTTPS_PROXY=http://127.0.0.1:7890`）。

### 第 2 步：创建 KV 命名空间

```bash
npx wrangler kv namespace create ROOMS
```

命令会输出类似：

```text
[[kv_namespaces]]
binding = "ROOMS"
id = "0a1b2c3d4e5f..."
```

把 `id` 填入 [wrangler.jsonc](./wrangler.jsonc) 的 `kv_namespaces[0].id`，替换占位符 `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`。

### 第 3 步：构建并部署

```bash
npm run deploy          # 等价于 vite build + wrangler deploy
```

部署成功会输出访问地址，形如 `https://huahuacai.<你的子域>.workers.dev`。

### 第 4 步：线上验证

1. 打开该地址 → 输入昵称 →「创建新房间」；
2. 另开一个无痕窗口 → 输入同一房间号「加入」；
3. 确认两窗口互见在线名单、笔迹约 1 秒同步、四格完成后可揭晓。

### 第 5 步（可选）：绑定自定义域名 / 国内加速

- **自定义域名**：Cloudflare 控制台 → Workers & Pages → `huahuacai` → Settings → Domains & Routes → Add → Custom domain（前提：域名已用 NS 方式托管在同一 Cloudflare 账号）；
- **国内加速**：`*.workers.dev` 在国内时常被阻断，建议用自定义域名，并可在前面加腾讯 EdgeOne（源站指向该域名）做国内链路加速。

### 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 部署报错提到 KV namespace id | `wrangler.jsonc` 里还是占位符，回到第 2 步填入真实 id |
| `wrangler` 命令超时/连不上 | 终端设置 `HTTPS_PROXY=http://127.0.0.1:7890` 后重试 |
| 页面能打开但接口报错 | 检查 KV 绑定名必须是 `ROOMS`（`worker/index.js` 读取 `env.ROOMS`），且部署前已 `npm run build` |
| 房间数据偶尔读不到旧值 | KV 最终一致性所致（同区域通常立即可见，跨区域有秒级延迟），轮询机制会自动补上 |

### 免费额度参考

| 资源 | 免费限额 | 本游戏消耗 |
| --- | --- | --- |
| KV 读 | 10 万次/天 | 一局 10 分钟 × 4 人 ≈ 1.2 万次 |
| KV 写 | 1 千次/天 | 每笔触 1 次 + 状态变更，一局数百次 |
| KV 存储 | 1 GB | 每房间数十 KB |
| Workers 请求 | 10 万次/天 | 含静态资源与 API |

休闲使用规模下余量充足；超出可升级 Workers Paid（$5/月）。

## 技术决策记录

| 决策 | 常见替代方案 | 实际采用 | 理由 |
| --- | --- | --- | --- |
| 后端 | Firebase / Supabase | Cloudflare Workers KV | 数据模型与部署链路统一在 Cloudflare；Firebase 国内不可达 |
| 实时同步 | WebSocket / Durable Objects | 1s 轮询 + 页面隐藏暂停 | KV 无推送能力；MVP 复杂度最低，DO 留作升级路径 |
| 数据结构 | 单键存整房 | meta + 每画板一键 | 规避 KV 每键 1 写/秒限制与读改写竞争 |
| 安全模型 | 前端直连 KV | 全部经 Worker API + 服务端校验 | KV 无安全规则机制，直连等于裸奔 |
| 笔触存储 | 位图上传 | 归一化矢量笔触（0–1 坐标） | 体积小、任意屏幕渲染一致、便于增量同步 |

## 已知限制与升级路径

- 笔触同步延迟 ≈1s（轮询）；逐笔实时协作需迁移 Durable Objects + WebSocket；
- 房间号即加入凭证，无用户体系（MVP 定位）；
- KV 免费写额度 1 千次/天，若用户量增长需升级付费或改造为批量上传笔触。
