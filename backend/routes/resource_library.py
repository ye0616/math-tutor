"""教师个人资源库 API — 上传管理本地文件（历年真题、地区习题等）"""

import os, time, shutil
from pathlib import Path
from fastapi import APIRouter, Header, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from database import get_db
from auth import get_user_from_token
from config import UPLOAD_DIR

router = APIRouter()

RESOURCE_DIR = UPLOAD_DIR / "resources"
RESOURCE_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".gif", ".txt", ".zip"}

CATEGORIES = ["历年真题", "地区习题", "教学素材", "试卷", "教案", "其他"]

def _get_user(db, authorization: str):
    """用 JWT token 解析用户身份"""
    payload = get_user_from_token(authorization or "")
    if not payload:
        raise HTTPException(401, "未登录或Token已过期")
    uid = payload["user_id"]
    row = db.execute("SELECT id, role, name FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        raise HTTPException(401, "用户不存在")
    return {"id": row[0], "role": row[1], "name": row[2]}


@router.post("/upload")
def upload_resource(
    title: str = Form(...),
    category: str = Form("其他"),
    grade: str = Form("五年级"),
    semester: str = Form(""),
    description: str = Form(""),
    tags: str = Form(""),
    file: UploadFile = File(...),
    authorization: str = Header(None),
):
    ext = Path(file.filename or "unknown").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"不支持的文件格式: {ext}")

    # 读取文件内容
    content = file.file.read()
    file_size = len(content)
    file_type = file.content_type or ""

    with get_db() as db:
        u = _get_user(db, authorization)
        if u["role"] != "teacher":
            raise HTTPException(403, "仅教师可操作")

        # 保存文件
        safe_name = f"{u['id']}_{int(time.time() * 1000)}{ext}"
        dest = RESOURCE_DIR / safe_name
        with open(dest, "wb") as f:
            f.write(content)

        db.execute(
            """INSERT INTO resource_library (teacher_id,title,category,grade,semester,description,file_path,file_name,file_type,file_size,tags)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (u["id"], title.strip(), category, grade, semester, description.strip(),
             str(dest.relative_to(UPLOAD_DIR)), file.filename or "", file_type, file_size, tags.strip()),
        )
        res_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        return {"ok": True, "id": res_id}


@router.get("/list")
def list_resources(
    authorization: str = Header(None),
    category: str = "",
    grade: str = "",
    q: str = "",
    page: int = 1,
    limit: int = 50,
):
    with get_db() as db:
        u = _get_user(db, authorization)
        if u["role"] != "teacher":
            raise HTTPException(403, "仅教师可操作")

        conditions = ["teacher_id = ?"]
        params = [u["id"]]

        if category:
            conditions.append("category = ?")
            params.append(category)
        if grade:
            conditions.append("grade = ?")
            params.append(grade)
        if q:
            conditions.append("(title LIKE ? OR description LIKE ? OR tags LIKE ?)")
            params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])

        where = " AND ".join(conditions)
        count = db.execute(f"SELECT COUNT(*) FROM resource_library WHERE {where}", params).fetchone()[0]
        offset = (page - 1) * limit
        rows = db.execute(
            f"SELECT id,title,category,grade,semester,description,file_path,file_name,file_type,file_size,tags,created_at FROM resource_library WHERE {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()

        return {
            "resources": [
                {"id": r[0], "title": r[1], "category": r[2], "grade": r[3], "semester": r[4],
                 "description": r[5], "file_path": r[6], "file_name": r[7], "file_type": r[8],
                 "file_size": r[9], "tags": r[10], "created_at": str(r[11])}
                for r in rows
            ],
            "total": count,
            "page": page,
            "limit": limit,
        }


@router.put("/{resource_id}")
def update_resource(resource_id: int, req: dict, authorization: str = Header(None)):
    with get_db() as db:
        u = _get_user(db, authorization)
        r = db.execute("SELECT id FROM resource_library WHERE id=? AND teacher_id=?", (resource_id, u["id"])).fetchone()
        if not r:
            raise HTTPException(404, "资源不存在")

        allowed = ["title", "category", "grade", "semester", "description", "tags"]
        sets = [f"{k} = ?" for k in allowed if k in req]
        vals = [req[k] for k in allowed if k in req]
        if not sets:
            return {"ok": True}
        vals.append(resource_id)
        db.execute(f"UPDATE resource_library SET {', '.join(sets)} WHERE id = ?", vals)
        return {"ok": True}


@router.delete("/{resource_id}")
def delete_resource(resource_id: int, authorization: str = Header(None)):
    with get_db() as db:
        u = _get_user(db, authorization)
        r = db.execute("SELECT id, file_path FROM resource_library WHERE id=? AND teacher_id=?", (resource_id, u["id"])).fetchone()
        if not r:
            raise HTTPException(404, "资源不存在")

        # 删除物理文件
        fp = UPLOAD_DIR / r[1]
        if fp.exists():
            fp.unlink()

        db.execute("DELETE FROM resource_library WHERE id=?", (resource_id,))
        return {"ok": True}


@router.get("/categories")
def list_categories():
    return {"categories": CATEGORIES}
