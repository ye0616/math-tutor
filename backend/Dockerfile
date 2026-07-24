# 数学智教后端 - CloudBase 云托管容器镜像
FROM python:3.12-slim

WORKDIR /app

# 系统依赖（如需处理图片可在此安装，本项目 base64 直传无需）
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 先装依赖，利用 Docker 层缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制源码
COPY . .

# 持久化目录：云托管需挂载文件存储卷到 /data，
# 否则容器重启/扩缩容时 SQLite 与上传文件会丢失
ENV DATABASE_PATH=/data/math_tutor.db \
    UPLOAD_DIR=/data/uploads

# 预创建上传目录（即使未挂载卷也不致启动失败）
RUN mkdir -p /data/uploads

EXPOSE 8000

# main.py 内部已读取 PORT 环境变量（云托管注入）
CMD ["python", "main.py"]
