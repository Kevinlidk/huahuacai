# 拼图绘画 · 多人协作

四人各画一格，全部完成后拼合揭晓的多人协作绘画小游戏。

技术栈：**Vite 7 + React 19 + Tailwind CSS v4 + React Router 7 + Cloudflare Workers KV**（后端逻辑本地与线上共用同一份实现）。

## 玩法

1. 一人创建房间，把 4 位房间号告诉朋友（首页会记录最近的房间，一键重进）；
2. 每人在 2×2 网格中认领一格，进入全屏画布作画（画笔/橡皮/8 色/4 种粗细/撤销/重做/清空；点自己的昵称芯片可改名）；
3. 网格页实时显示其他画友的状态与笔迹缩略图（约 1 秒同步一次）；
4. 四格全部完成后任何人可点「揭晓」，信封动画展开完整拼图；
5. 可保存合成图片（PNG）、回看网格，或「再来一局」清空重画。

## 快速开始

```bash
npm install
npm run dev        # 同时启动本地 KV 模拟服务(8788) 和 Vite 开发服务器(5173)
```

打开 http://localhost:5173 。**自测多人协作**：再开一个浏览器窗口（或无痕窗口 + 不同身份），一个窗口点「创建新房间」，另一个输入房间号「加入」，即可模拟两名玩家。

> 无需 Cloudflare 账号：本地开发由 `server/mock-server.js` 提供与线上一致的 API（两者共享 `shared/api.js` 同一份业务逻辑）。

## 自测

```bash
npm run smoke       # API 端到端冒烟：两名玩家完整走通建房→认领→作画→撤销→完成→揭晓→重置（19 项断言）
npm run smoke:edge  # API 边界/权限专项：恶意笔触、昵称清洗、清空权限、离线接管、并发认领、心跳过期（25 项断言）
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
│  │  ├─ Home.jsx          # 首页：昵称、创建/加入房间、最近房间快捷入口
│  │  ├─ Room.jsx          # 房间容器：轮询同步、心跳、路由状态编排
│  │  ├─ GridBoard.jsx     # 2×2 网格：状态徽标、笔迹缩略图、离线接管/释放、改名
│  │  ├─ DrawingCanvas.jsx # 全屏绘画层：画笔/橡皮/颜色/粗细/撤销/重做/清空/保存完成
│  │  └─ ResultReveal.jsx  # 揭晓：信封动画、2×2 合成图、保存 PNG、回看网格、再来一局
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

**推荐方式：Dashboard 关联 GitHub 仓库**——push 到 `main` 自动构建部署，无需本地安装 wrangler；命令行方式作为备选。

### 方式 A：Dashboard 关联 GitHub 仓库（推荐）

#### 前置准备

- 一个 Cloudflare 账号（[dash.cloudflare.com](https://dash.cloudflare.com) 免费注册）
- 代码已在 GitHub：本仓库 `Kevinlidk/huahuacai`（`main` 分支）

#### 第 1 步：创建 KV 命名空间

1. Dashboard → 左侧 **存储和数据库（Storage & Databases）** → **KV**；
2. **Create namespace**，名称填 `ROOMS`；
3. 创建后记下它的 **Namespace ID**（32 位十六进制）。

> 也可以用 CLI 创建：`npx wrangler kv namespace create ROOMS`，效果相同。

#### 第 2 步：Dashboard 连接 GitHub 仓库

1. Dashboard → **Workers 和 Pages（Workers & Pages）** → **Create（创建）**；
2. 选择 **Workers** → **Import a repository（导入存储库）**；
3. 首次使用会要求授权 GitHub（安装 Cloudflare GitHub App，可选择只授权 `huahuacai` 这一个仓库）；
4. 选中 `Kevinlidk/huahuacai`，进入构建配置：

| 配置项 | 填写值 |
| --- | --- |
| Project name | `huahuacai`（即访问子域） |
| Production branch | `main` |
| Build command（构建命令） | `npm install` |
| Deploy command（部署命令） | `npm run deploy` |
| Root directory | 默认（仓库根） |

5. 点 **Save and Deploy（保存并部署）**。**首次部署会失败，属预期**——此时还没注入 KV 命名空间 ID，继续第 3 步。

#### 第 3 步：配置 KV_NAMESPACE_ID 构建变量

1. 进入刚创建的 Worker → **Settings（设置）** → **Build（构建）** → **Variables and secrets（变量和密钥）**；
2. 添加变量：
   - **Name**：`KV_NAMESPACE_ID`
   - **Value**：第 1 步记录的 32 位 Namespace ID（类型 Text 或 Secret 均可）

> **原理**：wrangler 配置文件不支持 `${VAR}` 环境变量插值，所以部署命令中的 `npm run deploy` 会先执行 `scripts/build-config.mjs`，读取该环境变量生成带 KV 绑定的 `wrangler.generated.jsonc`（已 gitignore），再 `wrangler deploy --config` 部署。每次部署都会自动重建绑定——不依赖 Dashboard 手工绑定，也就不会被配置文件覆盖丢失，仓库中不落任何环境信息。

#### 第 4 步：重新部署

进入 **Deployments（部署）** → 最近一次构建 → **Retry deployment（重试部署）**（或随意 push 一个提交触发）。构建成功后得到地址 `https://huahuacai.<你的子域>.workers.dev`。

#### 第 5 步：日常更新 = git push

之后的任何改动只需：

```bash
git push
```

Cloudflare 会自动拉取 `main` 最新代码 → 安装依赖 → `npm run deploy`（生成配置 + 构建 + 部署），全程无需本地操作。Dashboard 的部署历史里每次构建都可查看日志、一键回滚。

#### 第 6 步：线上验证

1. 打开 workers.dev 地址 → 输入昵称 →「创建新房间」；
2. 另开一个无痕窗口 → 输入同一房间号「加入」；
3. 确认两窗口互见在线名单、笔迹约 1 秒同步、四格完成后可揭晓。

### 方式 B：命令行部署（备选）

适合不想走 Git 集成、或需要本地快速验证的场景：

```bash
# 1. 登录（会开浏览器授权；网络不通先设代理 export HTTPS_PROXY=http://127.0.0.1:7890）
npx wrangler login
npx wrangler whoami           # 验证登录

# 2. 创建 KV 命名空间（若已在方式 A 第 1 步做过则跳过）
npx wrangler kv namespace create ROOMS

# 3. 注入 KV ID 环境变量后构建部署（无需改任何配置文件）
export KV_NAMESPACE_ID=<32位id>        # Windows CMD: set KV_NAMESPACE_ID=<32位id>
npm run deploy                          # = 生成部署配置 + vite build + wrangler deploy
```

### 自定义域名 / 国内加速（可选）

- **自定义域名**：Cloudflare 控制台 → Workers 和 Pages → `huahuacai` → Settings → Domains & Routes → Add → Custom domain（前提：域名已用 NS 方式托管在同一 Cloudflare 账号）；
- **国内加速**：`*.workers.dev` 在国内时常被阻断，建议绑定自定义域名，并可在前面加腾讯 EdgeOne（源站指向该域名）做国内链路加速。

### 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 构建日志报「未设置或格式错误的 KV_NAMESPACE_ID」 | 按方式 A 第 3 步：Worker → 设置 → 构建 → 变量和密钥 添加变量后 Retry deployment |
| Git 构建失败 | 查看 Dashboard 部署日志：多为依赖安装失败（重试即可）或 Node 版本（构建镜像默认满足 ≥20） |
| 部署成功但接口报错 | KV 绑定名必须是 `ROOMS`（`worker/index.js` 读取 `env.ROOMS`）；在 Worker → Settings → Bindings 里核对 |
| `wrangler` 命令超时/连不上 | 终端设置 `HTTPS_PROXY=http://127.0.0.1:7890` 后重试 |
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
