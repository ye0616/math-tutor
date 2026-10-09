# 数学智教 · AI 教育智能体

> 面向小学五年级数学的「教—学—评—研—管—育—建」全链路 AI 教学平台。
> 教师端负责备课、布置作业、批改与学情分析；学生端负责预习、闯关练习、错题订正与积分成长。
> 核心 AI 能力全部由大模型驱动：联网检索备课资源、OCR 拍照批改、苏格拉底式引导改错。

`Next.js 16` · `React 19` · `TypeScript 5` · `Tailwind v4` · `FastAPI 0.115` · `SQLite` · `智谱 GLM-4-Flash`

---

## 目录

- [核心特性](#核心特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [AI 智能体一览](#ai-智能体一览)
- [API 概览](#api-概览)
- [部署](#部署)
- [常见问题](#常见问题)

---

## 核心特性

### 三种角色

| 角色 | 入口 | 主要能力 |
| --- | --- | --- |
| 教师 | `/teacher/*` | 备课教研、AI 生成教案与资源、作业布置与批改、学情分析、班级管理、个人资源库 |
| 学生 | `/student/*` | 预习任务、闯关练习、错题本与订正、拍照出题、知识图谱、排行榜、积分商城、每日科普、趣味小游戏 |
| 管理员 | `/admin` | 教师注册审核、平台基础管理 |

### 七大 AI 场景（对应后端 `agents/`）

| 代号 | 名称 | 说明 |
| --- | --- | --- |
| `teach` | 教 · 课堂教学 | 真实联网检索（百度 + B 站）教学资源，GLM-4-Flash 做分层分析与教案生成 |
| `learn` | 学 · 自主学习 | 针对错题/薄弱点生成引导式学习路径，**硬约束：不直接给答案** |
| `evaluate` | 评 · 学情评价 | OCR 拍照批改 + 自动生成学情报告 |
| `research` | 研 · 教研备课 | 汇总班级共性错题，输出教研建议 |
| `manage` | 管 · 班级管理 | 基于全班学情数据的班级管理建议 |
| `cultivate` | 育 · 素养培育 | 按单元知识点生成素养培育方案 |
| `build` | 建 · 资源建设 | 由习题/教案/错题案例沉淀题库与资源库 |

### 亮点能力

- **「小聪」AI 助教**（`agents/xiaocong.py`）：支架式苏格拉底引导改错。先区分错误类型（思路/公式/审题错 → 走 5 步阶梯；抄写/口算/进退位/小数点粗心 → 简短验算提示），每轮只抛 1 个问题，同一节点连错 2 次给知识点小支架、累计 3 次才点拨突破口，全程禁用打压话术，订正完成后引导反思并生成 3 道同类题巩固。
- **拍照即批改**：图片 base64 直传，走 GLM-4V-Flash 多模态批改，百度手写 OCR 作为备用通道。
- **真实联网备课**：`agents/web_search.py` 走百度搜索 + B 站 API 实时抓取微课视频与课件资源，再用大模型分类为基础/提升/拓展三层。
- **课件视频映射**：`agents/lesson_knowledge.py` 内置人教版五年级上/下册真实课时与 B 站微课 BV 号映射。
- **游戏化成长**：积分、排行榜、徽章、积分商城、每日科普、趣味小游戏。
- **Mock 兜底**：未配置任何 API Key 时自动进入 Mock 模式（`MOCK_MODE`），全站功能仍可点通演示。

---

## 技术栈

**前端**

| 项 | 版本 / 说明 |
| --- | --- |
| 框架 | Next.js 16.1.1（App Router） |
| UI | React 19.2 + TypeScript 5 |
| 样式 | Tailwind CSS v4 + `tw-animate-css` |
| 组件库 | shadcn/ui（Radix UI 全套）+ lucide-react |
| 表单校验 | react-hook-form + zod |
| 图表 | Recharts 2.15 |
| 动画 | framer-motion |
| 其他 | sonner（Toast）、vaul（Drawer）、next-themes |

**后端**

| 项 | 版本 / 说明 |
| --- | --- |
| 框架 | FastAPI 0.115 + Uvicorn 0.30 |
| 运行时 | Python 3.12（Docker 镜像 `python:3.12-slim`） |
| 数据库 | SQLite（WAL 模式，33 张表，路径可配） |
| HTTP 客户端 | httpx |
| Excel | openpyxl |
| 解析 | beautifulsoup4 |
| 搜索 | duckduckgo_search + 百度 + B 站 API |
| 认证 | 自实现 HMAC-SHA256 签名 Token（类 JWT，7 天有效期）+ SHA256 密码哈希 |

**外部服务**

- 大模型：智谱 GLM-4-Flash（文本）/ GLM-4V-Flash（多模态批改）
- OCR：百度手写识别（可选）

---

## 项目结构

```
math-tutor/
├── backend/                        # FastAPI 后端
│   ├── main.py                     # 入口：挂载 16 个路由、CORS、全局异常处理
│   ├── config.py                   # 配置中心（API Key / 路径 / CORS / 邀请码）
│   ├── auth.py                     # 密码哈希 + Token 签发校验
│   ├── database.py                 # 建表、连接管理、种子数据、积分统一函数
│   ├── curriculum.py               # 课程体系（单元/课时）
│   ├── agents/                     # AI 智能体
│   │   ├── base.py                 # 公共基类
│   │   ├── teach.py / learn.py / evaluate.py / research.py
│   │   ├── manage.py / cultivate.py / build.py      # 七大场景 Agent
│   │   ├── xiaocong.py             # 「小聪」错题订正引导（核心）
│   │   ├── resource.py             # 备课资源整合
│   │   ├── preview_material.py     # 预习单生成
│   │   ├── lesson_knowledge.py     # 课时知识库 + B 站视频映射
│   │   ├── web_search.py           # 联网检索
│   │   └── llm.py                  # GLM-4 调用封装（含批量并发/重试）
│   ├── routes/                     # 16 个路由模块，共 159 个接口
│   ├── prompts/                    # 各 Agent 的 Prompt 模板（.txt）
│   ├── knowledge/                  # 教材知识库（grade5a.json / grade5b.json）
│   ├── Dockerfile                  # 云托管镜像
│   ├── Procfile                    # Railway/Heroku 启动项
│   └── .env.example
│
├── frontend/                       # Next.js 前端
│   ├── src/app/
│   │   ├── page.tsx                # 三角色入口页
│   │   ├── admin/                  # 管理端
│   │   ├── student/                # 学生端 13 个页面
│   │   └── teacher/                # 教师端 9 个页面
│   ├── src/components/             # 业务组件 + shadcn/ui 全套
│   ├── src/lib/api.ts              # API 封装（统一鉴权/错误处理）
│   ├── src/lib/curriculum.ts       # 前端课程数据
│   ├── public/student-bg/          # 学生端场景背景图
│   ├── next.config.ts              # dev 代理 rewrites + 静态导出开关
│   └── .env.example
│
├── vercel.json                     # Vercel 前端部署配置
├── railway.json                    # Railway 后端部署配置
├── DEPLOY_RUNBOOK.md               # 逐步部署手册（Vercel + Railway）
├── 部署指南.md                      # 云端部署指南（CloudBase 方向）
└── _DEPLOY_CHECKLIST.md            # 部署前检查清单
```

---

## 快速开始

### 环境要求

- Node.js ≥ 20（推荐 20 LTS 或更高）
- Python ≥ 3.10（推荐 3.12）
- 无需 Docker 即可本地开发

### 1. 启动后端

```bash
cd backend

# 创建虚拟环境
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量（可选，不配则走 Mock 模式）
cp .env.example .env
# 编辑 .env，填入 ZHIPU_API_KEY

# 启动（默认 8000 端口）
python main.py
# 或：uvicorn main:app --reload --port 8000
```

启动时会自动建表并写入演示数据。验证：

```bash
curl http://127.0.0.1:8000/api/health     # => {"status":"ok"}
```

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

打开 <http://localhost:3000>。

> 前端开发模式默认通过 `next.config.ts` 的 `rewrites` 把 `/api/*` 代理到 `http://127.0.0.1:8000`，因此**本地开发无需配置 `NEXT_PUBLIC_API_BASE`**。

### 3. 默认演示账号

首次启动后端会自动写入以下账号（仅在数据库为空时写入）：

| 角色 | 手机号 | 密码 |
| --- | --- | --- |
| 管理员 | `13800000001` | `admin123` |
| 教师 | `13800000002` | `123456` |

学生账号**不支持自助注册**，需由教师登录后创建班级、批量导入学生名单。
教师注册需要邀请码，默认 `MATH2026`（可用 `TEACHER_INVITE_CODE` 覆盖）。

---

## 环境变量

### 后端 `backend/.env`

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `ZHIPU_API_KEY` | 否 | 空 | 智谱 API Key。**为空则进入 Mock 模式**，AI 功能返回演示数据 |
| `DATABASE_PATH` | 否 | `backend/math_tutor.db` | SQLite 文件路径，云端建议 `/data/math_tutor.db` |
| `UPLOAD_DIR` | 否 | `backend/uploads` | 上传目录，云端建议 `/data/uploads` |
| `CORS_ORIGINS` | 否 | `http://localhost:3000,http://127.0.0.1:3000` | 允许的前端源，逗号分隔。**部署后必须改成前端真实域名** |
| `JWT_SECRET` | 否 | `math-tutor-secret-key-2026` | Token 签名密钥，**生产环境务必改掉**：`openssl rand -hex 32` |
| `TEACHER_INVITE_CODE` | 否 | `MATH2026` | 教师注册邀请码 |
| `BAIDU_OCR_API_KEY` | 否 | 空 | 百度 OCR Key（错题识别备用通道） |
| `BAIDU_OCR_SECRET_KEY` | 否 | 空 | 百度 OCR Secret |
| `PORT` | 否 | `8000` | 监听端口，云托管平台会自动注入 |

### 前端 `frontend/.env`

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE` | 空 | 留空则走 Next dev 代理（`/api`）；部署时设为后端完整地址，前端直连 |
| `BACKEND_URL` | `http://127.0.0.1:8000` | 开发代理目标地址 |
| `NEXT_EXPORT` | — | 设为 `1` 时启用静态导出（`output: 'export'`） |

---

## AI 智能体一览

统一调用入口：

```http
POST /api/agent/invoke
Content-Type: application/json

{
  "scenario": "teach",              // teach|learn|evaluate|research|manage|cultivate|build
  "input": { "lesson_topic": "小数乘法" },
  "context": {}
}
```

查询所有可用场景：`GET /api/agent/scenarios`

各场景 Prompt 模板位于 `backend/prompts/*.txt`，可直接编辑调整 AI 行为，无需改代码。

---

## API 概览

统一前缀 `/api`，共 **159 个接口**，按模块划分：

| 模块 | 前缀 | 接口数 | 说明 |
| --- | --- | --- | --- |
| 教师端 | `/api/teacher` | 11 | 工作台、资源、班级 |
| 学生端 | `/api/student` | 29 | 首页、练习、错题、成长 |
| AI 智能体 | `/api/agent` | 2 | 统一 invoke / scenarios |
| 认证与用户 | `/api/auth` | 10 | 注册、登录、审核、改密 |
| 班级管理 | `/api/classes` | 10 | 班级 CRUD、学生导入、分层 |
| 预习任务 | `/api` | 23 | 预习单、答题、观看记录 |
| 复习作业批改 | `/api/homework` | 17 | 布置、提交、OCR 批改 |
| 教师作业管理 | `/api/teacher/homework` | 10 | 作业统计与管理 |
| 课堂交互提问 | `/api/inquiry` | 4 | 课堂实时问答 |
| 创意闯关 | `/api/challenge` | 9 | 闯关会话与作答 |
| 知识图谱 · 共性错题 | `/api/knowledge` | 6 | 图谱数据、高频错题 |
| 学情分析 | `/api/analytics` | 11 | 班级/个人报告 |
| 积分商城 | `/api/store` | 10 | 商品、兑换、积分记录 |
| 个人资源库 | `/api/resource-library` | 5 | 教师私有资源 |
| 每日科普 | `/api/daily-fact` | 4 | 每日推送与阅读记录 |
| 趣味小游戏 | `/api/fun-games` | 7 | 游戏记录与排行 |

健康检查：`GET /api/health` · 服务信息：`GET /`

---

## 部署

推荐架构：**Vercel（前端）+ Railway（后端）+ Volume（SQLite 持久化）**&#8203;

```
浏览器 → Vercel (Next.js) → Railway (FastAPI) → /data/math_tutor.db (Volume)
```

### 关键步骤

1. **推代码到 GitHub**
2. **Railway 部署后端**
   - Root Directory 设为 `backend`（Railway 会读 `backend/Dockerfile`）
   - 挂载 **Volume** 到 `/data`
   - 配置环境变量：`DATABASE_PATH=/data/math_tutor.db`、`UPLOAD_DIR=/data/uploads`、`ZHIPU_API_KEY`、`JWT_SECRET`、`CORS_ORIGINS`
   - Networking → Generate Domain 拿到后端 URL
3. **Vercel 部署前端**
   - Root Directory 设为 `frontend`
   - 环境变量：`NEXT_PUBLIC_API_BASE=https://<你的后端域名>`（**不要**在前端放任何私密 Key）
4. **回填 CORS**：把 Railway 的 `CORS_ORIGINS` 改成 Vercel 域名，服务会自动重启
5. **Smoke Test**：`/api/health` → 首页三角色入口 → 教师/学生登录 → 拍照出题

完整逐步手册见 `DEPLOY_RUNBOOK.md`；CloudBase 云托管方案见 `部署指南.md`。

### 注意事项

- **SQLite 必须挂持久卷**：容器重启/扩缩容会丢数据。Dockerfile 已默认 `DATABASE_PATH=/data/math_tutor.db`、`UPLOAD_DIR=/data/uploads`。
- **上传目录同理**：Railway 默认 `/app/uploads` 是临时目录，务必走 `UPLOAD_DIR` 指向持久卷。
- **后端路由已内置 CORS 兜底**：全局异常处理会手动注入 CORS 头，避免浏览器把 5xx 误判为跨域失败。

---

## 常见问题

**Q：`unzip` 解压后中文文件名乱码？**
压缩包内文件名是 GBK 编码。macOS/Linux 可用 `ditto -x -k` 或 Python `zipfile` 按 `cp437 → gbk` 转码后解压。

**Q：不配 API Key 能跑起来吗？**
能。`MOCK_MODE` 会在 `ZHIPU_API_KEY` 为空时自动开启，全站功能均可点通，AI 返回演示数据。

**Q：跨域报 CORS error？**
检查 `CORS_ORIGINS` 是否**完整包含 https:// 且不带尾部斜杠**，并已重启服务。

**Q：前端报 `Module not found: Can't resolve '@/lib/api'`？**
确认 Vercel 的 Root Directory 设为 `frontend`，且 `frontend/tsconfig.json` 中 `paths` 含 `"@/*": ["./src/*"]`。

**Q：智谱接口返回 401？**
检查 `ZHIPU_API_KEY` 是否复制完整（无多余空格/换行），改完重启服务。

**Q：密码哈希安全吗？**
当前用的是**无盐 SHA256**，仅适合教学演示。若用于真实生产环境，请替换为 bcrypt / argon2。

---

## 许可

未附带 LICENSE 文件。若需开源请补充；商用前请自行确认第三方服务（智谱、百度 OCR）的授权与配额。
