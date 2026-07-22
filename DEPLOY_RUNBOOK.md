# Deployment Runbook — math-tutor

> 部署目标：**Vercel（前端）+ Railway（后端）**。本文档是逐步执行手册，按顺序操作即可上线。

## 0. 部署前 checklist（已完成 ✅）

- [x] **代码已 commit**（5 个语义 commit 在 `main` 分支，HEAD `977df95`）
- [x] **.gitignore 已加固**：`.db` / `.db-shm` / `.db-wal` / `.bak.*` / `*.docx` / `outputs/` / `generate_docx.py` 全部排除
- [x] **敏感信息已隔离**：本地 `backend/.env`（含 `ZHIPU_API_KEY`）不被 git 跟踪
- [x] **部署文件就绪**：`vercel.json` / `railway.json` / `backend/Dockerfile` / `_DEPLOY_CHECKLIST.md`
- [ ] **GitHub 仓库已创建并推送**
- [ ] **本地 build 验证通过**（下方 §1）

---

## 1. 本地 build 验证（自动执行中）

| 任务 | 状态 | 备注 |
|------|------|------|
| `next build` | 正在跑（task_id `cFuumM`） | ~1-2 分钟 |
| `docker build`（后端） | 正在跑（task_id `oQuumHG`） | ~2-3 分钟 |

**如果两个都 ✅** → 推 GitHub → 走 §2
**如果任何一个 ❌** → 先修代码，不部署

---

## 2. 推代码到 GitHub

你已经在手动推了，按以下结构推送：

```bash
cd /Users/wind/WorkBuddy/2026-07-10-01-31-04/math-tutor
# 你手动：
git remote add origin https://github.com/<你的用户名>/math-tutor.git
git push -u origin main
```

完成后给我仓库 URL（如 `https://github.com/yourname/math-tutor`），我接着配 Vercel/Railway。

---

## 3. Railway 后端部署

### 3.1 创建项目

1. 打开 https://railway.app/dashboard
2. **New Project** → **Deploy from GitHub repo** → 选 `math-tutor`
3. Railway 检测到 `railway.json`，会读 `backend/Dockerfile`
4. **重要**：Root Directory 设为 `backend`（如未自动）

### 3.2 加 Volume（数据库持久化）

1. 打开新建的 service → **Variables** 标签
2. 切到 **Settings** 标签 → **Volumes** → **New Volume**
3. Mount Path: `/data`
4. 这样 SQLite 文件 `/data/math_tutor.db` 重启不丢

### 3.3 设置环境变量（Settings → Variables）

```env
DATABASE_PATH=/data/math_tutor.db
UPLOAD_DIR=/data/uploads
PYTHONUNBUFFERED=1
ZHIPU_API_KEY=<你给我，我贴>
JWT_SECRET=<随机 32 字节 hex，见下方生成命令>
BAIDU_OCR_API_KEY=<留空或贴值>
BAIDU_OCR_SECRET_KEY=<留空或贴值>
ALLOWED_ORIGINS=<下一步拿到 Vercel URL 后回填>
```

**生成 JWT_SECRET**（在终端跑）：
```bash
openssl rand -hex 32
```

### 3.4 拿到后端 URL

部署成功后，**Settings → Networking → Generate Domain**，会得到：
```
https://math-tutor-backend-production.up.railway.app
```

记录这个 URL，下一步 Vercel 要用。

---

## 4. Vercel 前端部署

### 4.1 创建项目

1. 打开 https://vercel.com/dashboard
2. **Add New…** → **Project** → 选 `math-tutor` 仓库 → **Import**
3. **Framework Preset**: Next.js（自动检测）
4. **Root Directory**: 点 **Edit** → 选 `frontend`
5. **Build Command**: 留默认 `next build`
6. **Output Directory**: 留默认 `.next`

### 4.2 设置环境变量

```env
NEXT_PUBLIC_API_BASE_URL=https://math-tutor-backend-production.up.railway.app
```

**不要**设 `NEXT_PUBLIC_*` 以外的敏感变量在这里 — Vercel 前端代码会暴露给浏览器。

### 4.3 部署

点 **Deploy**，等 1-2 分钟。完成后会得到：
```
https://math-tutor-<hash>.vercel.app
```

记录这个 URL。

---

## 5. 回填 CORS

回到 **Railway 后端 service → Variables**，把 `ALLOWED_ORIGINS` 改成：
```
https://math-tutor-<hash>.vercel.app
```

Railway 会自动重启。等 30 秒后端起来。

---

## 6. Smoke Test（部署后必做）

依次访问以下 URL 验证：

| 测试 | URL | 预期 |
|------|-----|------|
| 后端健康 | `https://<railway>.up.railway.app/api/health` | `{"status":"ok"}` |
| 前端首页 | `https://<vercel>.vercel.app/` | 显示三角色入口 |
| 教师登录 | `https://<vercel>.vercel.app/` → 教师入口 → 输 `13800000002 / 123456` | 进入工作台 |
| 学生登录 | `https://<vercel>.vercel.app/` → 学生入口 → 输 `13800000011 / 123456` | 进入学生首页 |
| 拍照出题 | 学生首页 → 拍照出题 | 调通 OCR（若 key 为空会走 mock） |

如果任一步 ❌，回到 §3.3 检查环境变量。

---

## 7. 常见问题

### Q1: Railway 部署后报 `CORS error` ？
检查 `ALLOWED_ORIGINS` 是否等于 Vercel URL（**包括 https://，不带尾部斜杠**）。

### Q2: Vercel 报 `Module not found: Can't resolve '@/lib/api'` ？
确认 Root Directory = `frontend`，且 `frontend/tsconfig.json` 里 `paths: { "@/*": ["./src/*"] }` 存在。

### Q3: 数据库初始化失败？
Railway Volume 挂载到 `/data` 后，第一次启动 backend 会调用 `init_db()` 建表。如果失败：
```bash
railway run python -c "from database import init_db; init_db()"
```

### Q4: 智谱 API 调用 401？
检查 `ZHIPU_API_KEY` 是否在 Railway 变量里复制完整（不含空格），重启服务。

### Q5: 上传文件丢失？
Railway 默认 `/app/uploads` 是临时目录。已在 §3.2 把 Volume 挂到 `/data`，需要把后端代码里的上传路径从 `uploads/` 改成 `/data/uploads`，或在启动脚本里加 `mkdir -p /data/uploads && ln -sf /data/uploads uploads`。
> 注：本项目 `backend/config.py` 用 `UPLOAD_DIR` 环境变量，已在 §3.3 设为 `/data/uploads`，**已自动生效**。

---

## 8. 回滚方案

- **Vercel**：Dashboard → Deployments → 选历史 deployment → **Promote to Production**
- **Railway**：Service → Deployments → 选历史 deployment → **Redeploy**
- **数据库回滚**：本地有 `backend/math_tutor.db.bak.20260722-215318`（五年级四班删除前的快照）；生产库丢失则需用 `pg_dump` 类似的 sqlite 工具

---

## 9. 部署成功后告诉我

✅ Vercel URL
✅ Railway URL
✅ 任一 smoke test 失败的具体步骤

我会帮你诊断 + 修。