"""FastAPI 主入口"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 加载.env文件
from pathlib import Path
_env_file = Path(__file__).parent / ".env"
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from config import UPLOAD_DIR, CORS_ORIGINS
from database import init_db, seed_mock_data
from routes.teacher import router as teacher_router
from routes.student import router as student_router
from routes.agent import router as agent_router
from routes.auth import router as auth_router
from routes.classes import router as classes_router
from routes.preview import router as preview_router
from routes.homework import router as homework_router
from routes.assignments import router as assignments_router
from routes.inquiry import router as inquiry_router
from routes.challenge import router as challenge_router
from routes.knowledge import router as knowledge_router
from routes.analytics import router as analytics_router
from routes.store import router as store_router
from routes.resource_library import router as resource_library_router
from routes.daily_fact import router as daily_fact_router
from routes.fun_games import router as fun_games_router

app = FastAPI(title="数学智教 - AI教育智能体", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理：防止未捕获异常导致500错误。
    关键：手动注入 CORS 头，否则浏览器会把 5xx 误判为 CORS 拦截（fetch 网络层 fail）"""
    import traceback
    print(f"[GLOBAL EXCEPTION] {request.method} {request.url.path}: {exc}")
    traceback.print_exc()

    # 取请求 Origin（Vercel 域名），回显成 Access-Control-Allow-Origin
    origin = request.headers.get("origin", "")
    allowed_origins = [o.strip() for o in CORS_ORIGINS.split(",")]
    cors_origin = origin if origin in allowed_origins else (allowed_origins[0] if allowed_origins else "*")

    return JSONResponse(
        status_code=500,
        content={"detail": f"服务器内部错误，请稍后重试。错误: {str(exc)[:200]}"},
        headers={
            "Access-Control-Allow-Origin": cors_origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        },
    )


@app.on_event("startup")
def startup():
    init_db()
    seed_mock_data()
    print("数据库初始化完成")


@app.get("/")
def root():
    return {"name": "数学智教 - AI教育智能体", "version": "1.0.0", "status": "running"}


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(teacher_router, prefix="/api/teacher", tags=["教师端"])
app.include_router(student_router, prefix="/api/student", tags=["学生端"])
app.include_router(agent_router, prefix="/api/agent", tags=["AI智能体"])
app.include_router(auth_router, prefix="/api/auth", tags=["认证与用户管理"])
app.include_router(classes_router, prefix="/api/classes", tags=["班级管理"])
app.include_router(preview_router, prefix="/api", tags=["预习任务"])
app.include_router(homework_router, prefix="/api/homework", tags=["复习作业批改"])
app.include_router(assignments_router, prefix="/api/teacher/homework", tags=["教师作业管理"])
app.include_router(inquiry_router, prefix="/api/inquiry", tags=["课堂交互提问"])
app.include_router(challenge_router, prefix="/api/challenge", tags=["创意闯关"])
app.include_router(knowledge_router, prefix="/api/knowledge", tags=["知识图谱+共性错题"])
app.include_router(analytics_router, prefix="/api/analytics", tags=["学情分析"])
app.include_router(store_router, prefix="/api/store", tags=["积分商城"])
app.include_router(resource_library_router, prefix="/api/resource-library", tags=["个人资源库"])
app.include_router(daily_fact_router, prefix="/api/daily-fact", tags=["每日科普"])
app.include_router(fun_games_router, prefix="/api/fun-games", tags=["趣味小游戏"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
