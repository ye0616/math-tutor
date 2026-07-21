"""配置文件 - API密钥和环境变量"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# LLM配置 - 智谱GLM-4
ZHIPU_API_KEY = os.getenv("ZHIPU_API_KEY", "")
ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
ZHIPU_MODEL = "glm-4-flash"

# OCR配置 - 百度OCR
BAIDU_OCR_API_KEY = os.getenv("BAIDU_OCR_API_KEY", "")
BAIDU_OCR_SECRET_KEY = os.getenv("BAIDU_OCR_SECRET_KEY", "")
BAIDU_OCR_URL = "https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting"

# 数据库 - 支持环境变量配置（云端部署用）
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(BASE_DIR / "math_tutor.db")))

# CORS 允许的前端地址（逗号分隔）
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")

# Mock模式 - 没有API Key时使用Mock数据
MOCK_MODE = not bool(ZHIPU_API_KEY)

# 知识库路径
KNOWLEDGE_DIR = BASE_DIR / "knowledge"

# Prompt模板路径
PROMPTS_DIR = BASE_DIR / "prompts"

# 文件上传目录
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# JWT 密钥（认证用）
JWT_SECRET = os.getenv("JWT_SECRET", "math-tutor-secret-key-2026")

# 教师注册推荐码（防止学生冒充教师注册）
TEACHER_INVITE_CODE = os.getenv("TEACHER_INVITE_CODE", "MATH2026")
