"""课堂交互式探索提问路由 - AI 设计递进式问题链"""

from fastapi import APIRouter, HTTPException, Form
from database import get_db
from agents.llm import ai_generate_interactive_inquiry
from auth import get_user_from_token

router = APIRouter()


@router.post("/generate")
def generate_inquiry(
    lesson_title: str = Form(...),
    unit_info: str = Form(""),
    difficulty: str = Form("mixed"),
    authorization: str = Form(""),
):
    """AI 生成课堂交互式探索提问问题链"""
    payload = get_user_from_token(authorization or "")
    if not payload or payload.get("role") != "teacher":
        raise HTTPException(401, "请先登录教师账号")

    result = ai_generate_interactive_inquiry(lesson_title, unit_info, difficulty)
    return {"success": True, "data": result}


@router.post("/save")
def save_inquiry(
    lesson_code: str = Form(...),
    lesson_title: str = Form(...),
    unit_code: str = Form(""),
    inquiry_json: str = Form(...),
    authorization: str = Form(""),
):
    """保存生成的探索提问到数据库，下次加载"""
    payload = get_user_from_token(authorization or "")
    if not payload or payload.get("role") != "teacher":
        raise HTTPException(401, "请先登录教师账号")

    teacher_id = payload["user_id"]

    with get_db() as db:
        # 检查是否已有保存
        existing = db.execute(
            "SELECT id FROM teach_inquiries WHERE teacher_id=? AND lesson_code=?",
            (teacher_id, lesson_code),
        ).fetchone()

        if existing:
            db.execute(
                "UPDATE teach_inquiries SET inquiry_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (inquiry_json, existing["id"]),
            )
        else:
            db.execute(
                "INSERT INTO teach_inquiries (teacher_id, lesson_code, lesson_title, unit_code, inquiry_json) VALUES (?, ?, ?, ?, ?)",
                (teacher_id, lesson_code, lesson_title, unit_code, inquiry_json),
            )

    return {"success": True, "message": "已保存"}


@router.get("/load")
def load_inquiry(lesson_code: str, authorization: str = ""):
    """加载已保存的探索提问"""
    payload = get_user_from_token(authorization or "")
    if not payload or payload.get("role") != "teacher":
        raise HTTPException(401, "请先登录教师账号")

    teacher_id = payload["user_id"]

    with get_db() as db:
        row = db.execute(
            "SELECT * FROM teach_inquiries WHERE teacher_id=? AND lesson_code=? ORDER BY updated_at DESC LIMIT 1",
            (teacher_id, lesson_code),
        ).fetchone()

        if not row:
            return {"success": True, "data": None}

        return {"success": True, "data": dict(row)}


@router.get("/history")
def inquiry_history(authorization: str = ""):
    """获取历史生成记录"""
    payload = get_user_from_token(authorization or "")
    if not payload or payload.get("role") != "teacher":
        raise HTTPException(401, "请先登录教师账号")

    teacher_id = payload["user_id"]

    with get_db() as db:
        rows = db.execute(
            "SELECT lesson_code, lesson_title, updated_at FROM teach_inquiries WHERE teacher_id=? ORDER BY updated_at DESC LIMIT 20",
            (teacher_id,),
        ).fetchall()

        return {"success": True, "list": [dict(r) for r in rows]}
