# 数学智教 - 上线部署 Checklist

> 目标平台：Vercel（前端）+ Railway（后端 + SQLite 持久化）
> 文件：`vercel.json` / `railway.json` / `backend/Dockerfile` / `部署指南.md` 已就绪

---

## A. 当前项目状态（已就绪）

- [x] `vercel.json` — 前端构建配置（rootDirectory: frontend）
- [x] `railway.json` — 后端构建配置（Dockerfile 模式）
- [x] `backend/Dockerfile` — Python 3.12 + uvicorn
- [x] `backend/main.py` — FastAPI 入口，所有路由已注册
- [x] `backend/requirements.txt` — 11 个依赖齐全
- [x] `backend/config.py` — 全部用 `os.getenv(...)` 读环境变量（ZHIPU_API_KEY / DATABASE_PATH / CORS_ORIGINS / JWT_SECRET / TEACHER_INVITE_CODE / BAIDU_OCR_* / UPLOAD_DIR）
- [x] `.gitignore` — `.db` / `.venv` / `uploads/` / `__pycache__` / `.env` 全部排除（密钥不会上 GitHub）
- [x] `next.config.ts` — `NEXT_PUBLIC_API_BASE` 设了则前端直连后端，没设则用 `/api/*` rewrite

## B. 需要你手动做的事

1. **推到 GitHub**（你已确认自己手动推）
   - 仓库路径建议：`https://github.com/<your-user>/math-tutor`
   - 推完后把 URL 发给我

2. **告诉我 4 个环境变量的值**（部署前给我，我帮你列好粘贴位）
   - `ZHIPU_API_KEY=...`（你已有，参考本地 `backend/.env`）
   - `JWT_SECRET=...`（建议生成新的随机串，32+ 字符）
   - `BAIDU_OCR_API_KEY=...`（没有就空，走 OCR 占位）
   - `BAIDU_OCR_SECRET_KEY=...`（没有就空）
   - 注：`DATABASE_PATH` / `CORS_ORIGINS` / `UPLOAD_DIR` 由部署流程自动填

## C. 部署步骤（按顺序）

### 第 1 步：部署后端到 Railway
1. https://railway.app → GitHub 登录 → **New Project** → **Deploy from GitHub repo** → 选 `math-tutor`
2. **Settings → General → Root Directory**: 设为 `backend`
3. **Variables** 添加：
   - `DATABASE_PATH=/data/math_tutor.db`
   - `CORS_ORIGINS=` （先空着，第 4 步回填）
   - `UPLOAD_DIR=/app/uploads`
   - `ZHIPU_API_KEY=<你给的>`
   - `JWT_SECRET=<你给的>`
   - `BAIDU_OCR_API_KEY=<你给的 / 空>`
   - `BAIDU_OCR_SECRET_KEY=<你给的 / 空>`
4. **Settings → Volumes**：Mount Path `/data`（持久化 SQLite）
5. 部署完 Railway 会给域名，记下来：`https://xxx.up.railway.app`
6. 验证：`curl https://xxx.up.railway.app/` → 返回 `{"name":"数学智教..."}`

### 第 2 步：部署前端到 Vercel
1. https://vercel.com → GitHub 登录 → **Add New Project** → 选 `math-tutor`
2. **Root Directory**: `frontend`
3. **Environment Variables**：
   - `NEXT_PUBLIC_API_BASE=https://<Railway域名>.up.railway.app/api`
4. 点 Deploy，等待构建
5. 拿到 Vercel 域名：`https://math-tutor-xxx.vercel.app`

### 第 3 步：回填 CORS
1. 回到 Railway → Variables → `CORS_ORIGINS` = `https://math-tutor-xxx.vercel.app`
2. Railway 自动重新部署

### 第 4 步：验证
- 打开 Vercel 域名 → 三角色登录正常
- 登录教师 → 创建班级 → 录入学生 → 模拟答题流
- 看 Railway logs 无报错

## D. 已知风险 / 需要注意

| 风险 | 影响 | 缓解 |
|---|---|---|
| Railway 免费额度 $5/月，可能被 SQLite 文件 I/O 拖慢 | 后端响应变慢 | 上线后看用量，超了再考虑迁移 Postgres |
| `uploads/` 目录存在 Railway 容器内非 Volume 路径，重启会丢 | 上传图片丢失 | 已用 `/app/uploads` 在容器内（Dockerfile 创建），但**没挂 Volume**——上传的图片会丢。如要保留图片，加 Volume mount `/app/uploads` |
| SQLite + Railway Volume：单副本 OK，多副本会写冲突 | 数据损坏 | `numReplicas: 1` 已写死 |
| 工作树有 16 个未提交修改 | 推上去的代码可能含未验证改动 | 推前先 `git add . && git commit -m "..."` |
| 智谱 API key 是按调用计费 | 上线后若被刷会扣费 | 上线后监控用量；或先空 key 跑 Mock 上线 |

## E. 我会帮你做的事（拿到 GitHub 仓库 URL 后）

1. 提交本地 16 个改动（一条 commit）
2. 验证 `tsc --noEmit` + 后端能 `import main` 不报 import 错
3. 给你一个精炼的「在 Vercel / Railway 控制台点哪些按钮」的图文步骤
4. 上线后用 curl 帮你 spot-check 几个核心 API

---

**等你做：推 GitHub + 给我仓库 URL + 4 个环境变量的值。**