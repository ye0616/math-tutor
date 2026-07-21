FROM python:3.12-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制项目文件
COPY . .

# 创建数据目录
RUN mkdir -p /app/data /app/uploads

# 设置环境变量
ENV DATABASE_PATH=/app/data/math_tutor.db
ENV UPLOAD_DIR=/app/uploads
ENV PORT=8000

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
