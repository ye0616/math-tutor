"""每日科普小知识路由

功能：
1. GET /today - 获取今日科普（若当天无科普则AI生成一条并入库）
2. POST /read - 学生阅读完成并回答互动问题，+0.1分（每日封顶0.1）
3. GET /history - 历史科普列表
4. GET /random - 随机一条科普
"""

import json
import random
from datetime import datetime
from fastapi import APIRouter, HTTPException, Form, Query
from pydantic import BaseModel
from database import get_db, add_points, get_daily_points_by_reason_prefix
from auth import get_user_from_token
from agents.llm import ai_generate_daily_fact

router = APIRouter()


def get_student_id(authorization: str) -> int:
    """验证学生身份"""
    payload = get_user_from_token(authorization or "")
    if not payload:
        raise HTTPException(401, "未登录或Token已过期")
    if payload.get("role") != "student":
        raise HTTPException(403, "仅学生可使用科普功能")
    return payload["user_id"]


@router.get("/today")
def get_today_fact(authorization: str = Query("")):
    """获取今日科普小知识（若当天无科普则AI生成一条并入库）"""
    student_id = get_student_id(authorization)
    today = datetime.now().strftime("%Y-%m-%d")

    with get_db() as db:
        # 查找今日科普
        row = db.execute(
            "SELECT * FROM daily_facts WHERE fact_date=? ORDER BY created_at DESC LIMIT 1",
            (today,),
        ).fetchone()

        if not row:
            # AI生成新科普
            fact = ai_generate_daily_fact()
            db.execute(
                "INSERT INTO daily_facts (title, content, fun_fact, category, question, options_json, answer, explanation, fact_date) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    fact.get("title", ""),
                    fact.get("content", ""),
                    fact.get("fun_fact", ""),
                    fact.get("category", ""),
                    fact.get("question", ""),
                    json.dumps(fact.get("options", []), ensure_ascii=False),
                    fact.get("answer", ""),
                    fact.get("explanation", ""),
                    today,
                ),
            )
            row = db.execute(
                "SELECT * FROM daily_facts WHERE fact_date=? ORDER BY created_at DESC LIMIT 1",
                (today,),
            ).fetchone()

        fact_data = dict(row)
        fact_data["options"] = json.loads(fact_data.get("options_json") or "[]")

        # 检查学生是否已阅读
        read_record = db.execute(
            "SELECT * FROM daily_fact_reads WHERE fact_id=? AND student_id=?",
            (fact_data["id"], student_id),
        ).fetchone()
        fact_data["has_read"] = bool(read_record)
        fact_data["answered_correctly"] = read_record["answered_correctly"] if read_record else 0

    return {"success": True, "data": fact_data}


@router.post("/read")
def submit_fact_read(
    fact_id: int = Form(...),
    student_answer: str = Form(""),
    authorization: str = Form(""),
):
    """学生阅读完成并回答互动问题

    积分规则：完成每日科普 +0.1 分（每日封顶 0.1）
    """
    student_id = get_student_id(authorization)

    with get_db() as db:
        # 查找科普
        fact = db.execute("SELECT * FROM daily_facts WHERE id=?", (fact_id,)).fetchone()
        if not fact:
            raise HTTPException(404, "科普内容不存在")

        # 检查是否已阅读
        existing = db.execute(
            "SELECT * FROM daily_fact_reads WHERE fact_id=? AND student_id=?",
            (fact_id, student_id),
        ).fetchone()
        if existing:
            return {
                "success": True,
                "data": {
                    "already_read": True,
                    "points_earned": 0,
                    "is_correct": existing["answered_correctly"] == 1,
                    "correct_answer": fact["answer"],
                },
            }

        # 判断互动问题是否正确
        is_correct = False
        if student_answer and fact["answer"]:
            is_correct = student_answer.strip().upper() == fact["answer"].strip().upper()

        # 积分：每日科普 +0.1，每日封顶 0.1
        daily_earned = get_daily_points_by_reason_prefix(db, student_id, "每日科普")
        points = 0.0
        if daily_earned < 0.1:
            points = min(0.1, 0.1 - daily_earned)
            if points > 0:
                add_points(db, student_id, points, "每日科普阅读")

        # 记录阅读
        db.execute(
            "INSERT INTO daily_fact_reads (fact_id, student_id, answered_correctly, points_earned) VALUES (?, ?, ?, ?)",
            (fact_id, student_id, 1 if is_correct else 0, points),
        )

        # 答错时同步到错题本
        if not is_correct and student_answer:
            db.execute(
                "INSERT INTO error_notes (student_id, question_id, question_text, student_answer, correct_answer, knowledge_point, source, status) "
                "VALUES (?, NULL, ?, ?, ?, ?, 'daily_fact', 'unresolved')",
                (
                    student_id,
                    fact["question"] or fact["title"],
                    student_answer,
                    fact["answer"],
                    "数学科普",
                ),
            )

    return {
        "success": True,
        "data": {
            "already_read": False,
            "points_earned": points,
            "is_correct": is_correct,
            "correct_answer": fact["answer"],
            "explanation": fact["explanation"],
        },
    }


@router.get("/history")
def get_fact_history(
    page: int = Query(1),
    page_size: int = Query(10),
    authorization: str = Query(""),
):
    """获取历史科普列表"""
    student_id = get_student_id(authorization)
    offset = (page - 1) * page_size

    with get_db() as db:
        total = db.execute("SELECT COUNT(*) as cnt FROM daily_facts").fetchone()["cnt"]
        rows = db.execute(
            "SELECT * FROM daily_facts ORDER BY fact_date DESC LIMIT ? OFFSET ?",
            (page_size, offset),
        ).fetchall()

        fact_list = []
        for r in rows:
            d = dict(r)
            d["options"] = json.loads(d.get("options_json") or "[]")
            # 检查是否已阅读
            read = db.execute(
                "SELECT answered_correctly FROM daily_fact_reads WHERE fact_id=? AND student_id=?",
                (d["id"], student_id),
            ).fetchone()
            d["has_read"] = bool(read)
            d["answered_correctly"] = read["answered_correctly"] if read else 0
            fact_list.append(d)

    return {"success": True, "data": {"list": fact_list, "total": total, "page": page, "page_size": page_size}}


@router.get("/random")
def get_random_fact(authorization: str = Query("")):
    """随机获取一条科普"""
    student_id = get_student_id(authorization)

    with get_db() as db:
        total = db.execute("SELECT COUNT(*) as cnt FROM daily_facts").fetchone()["cnt"]
        if total == 0:
            # 无数据，生成一条
            fact = ai_generate_daily_fact()
            today = datetime.now().strftime("%Y-%m-%d")
            db.execute(
                "INSERT INTO daily_facts (title, content, fun_fact, category, question, options_json, answer, explanation, fact_date) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    fact.get("title", ""),
                    fact.get("content", ""),
                    fact.get("fun_fact", ""),
                    fact.get("category", ""),
                    fact.get("question", ""),
                    json.dumps(fact.get("options", []), ensure_ascii=False),
                    fact.get("answer", ""),
                    fact.get("explanation", ""),
                    today,
                ),
            )
            row = db.execute(
                "SELECT * FROM daily_facts ORDER BY created_at DESC LIMIT 1"
            ).fetchone()
        else:
            offset = random.randint(0, total - 1)
            row = db.execute(
                "SELECT * FROM daily_facts LIMIT 1 OFFSET ?", (offset,)
            ).fetchone()

        fact_data = dict(row)
        fact_data["options"] = json.loads(fact_data.get("options_json") or "[]")

    return {"success": True, "data": fact_data}
