"""认证工具：密码哈希 + JWT Token 生成/验证"""

import hashlib
import json
import base64
import hmac
import time
from config import JWT_SECRET


def hash_password(password: str) -> str:
    """SHA256 密码哈希"""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    """验证密码"""
    return hash_password(password) == hashed


def create_token(user_id: int, role: str, name: str) -> str:
    """生成 JWT-like Token（payload.signature）"""
    payload = {
        "user_id": user_id,
        "role": role,
        "name": name,
        "exp": int(time.time()) + 86400 * 7,  # 7天有效期
    }
    payload_json = json.dumps(payload, ensure_ascii=False)
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).decode()
    signature = hmac.new(JWT_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{signature}"


def verify_token(token: str) -> dict | None:
    """验证 Token，返回 payload 或 None"""
    try:
        if not token or "." not in token:
            return None
        payload_b64, signature = token.rsplit(".", 1)
        expected_sig = hmac.new(JWT_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
        if signature != expected_sig:
            return None
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def get_user_from_token(authorization: str) -> dict | None:
    """从 Authorization header 提取用户信息"""
    if not authorization:
        return None
    # 支持 "Bearer xxx" 和 "xxx" 两种格式
    token = authorization.replace("Bearer ", "").strip()
    return verify_token(token)
