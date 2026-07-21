"""创意闯关路由 - 学生闯关出题、答题、AI批改、引导改错、知识点弹窗
v2: 统一使用 curriculum.py 的 KNOWLEDGE_TREE，符合人教版五上完整课时目录
"""

import json
import uuid
import threading
from fastapi import APIRouter, HTTPException, Form
from database import get_db, add_points, get_daily_points_by_reason_prefix
from auth import get_user_from_token
from curriculum import KNOWLEDGE_TREE, get_all_knowledge_points
from agents.llm import (
    ai_generate_challenge_questions,
    ai_generate_breakthrough_questions,
    ai_analyze_error_knowledge,
    ai_generate_similar_questions,
    ai_guided_correction,
)

router = APIRouter()

# ===== 异步闯关生成任务 =====
_challenge_tasks: dict = {}


def get_student_id(authorization: str) -> int:
    """验证学生身份"""
    payload = get_user_from_token(authorization or "")
    if not payload:
        raise HTTPException(401, "未登录或Token已过期")
    if payload.get("role") != "student":
        raise HTTPException(403, "仅学生可使用闯关功能")
    return payload["user_id"]


# ===== 从知识树转换课程数据 =====

def _curriculum_to_api_format():
    """将 KNOWLEDGE_TREE 转换为前端 API 兼容格式"""
    result = {}
    for unit_code, unit_data in KNOWLEDGE_TREE.items():
        lessons = []
        for lesson_code, lesson_data in unit_data["lessons"].items():
            lessons.append({
                "code": lesson_code,
                "title": lesson_data["title"],
            })
        result[unit_code] = {
            "unit": unit_data["unit_name"],
            "lessons": lessons,
        }
    return result


def _get_knowledge_points_for_lesson(lesson_code: str) -> list:
    """获取某课时的知识点名称列表"""
    kp_names = []
    for unit_data in KNOWLEDGE_TREE.values():
        if lesson_code in unit_data["lessons"]:
            lesson = unit_data["lessons"][lesson_code]
            for kp in lesson["knowledge_points"]:
                kp_names.append(kp["name"])
            break
    return kp_names


def _get_lesson_info(lesson_code: str):
    """从知识树查找课时信息"""
    for unit_code, unit_data in KNOWLEDGE_TREE.items():
        if lesson_code in unit_data["lessons"]:
            lesson = unit_data["lessons"][lesson_code]
            return {
                "code": lesson_code,
                "title": lesson["title"],
                "unit_code": unit_code,
                "unit": unit_data["unit_name"],
            }
    return None


# 兼容旧代码：CURRICULUM 字典由 KNOWLEDGE_TREE 动态生成
CURRICULUM = _curriculum_to_api_format()


@router.get("/curriculum")
def get_curriculum():
    """返回人教版五上课程目录（基于统一知识树）"""
    return {"success": True, "data": CURRICULUM}


@router.post("/start")
def start_challenge(
    unit_code: str = Form(...),
    lesson_code: str = Form(...),
    authorization: str = Form(""),
):
    """开始闯关 - AI基于知识树生成闯关题目"""
    student_id = get_student_id(authorization)

    # 从统一知识树查找课时信息
    lesson_info = _get_lesson_info(lesson_code)
    if not lesson_info:
        raise HTTPException(400, f"未找到课时 {lesson_code}")

    # 获取该课时的实际知识点名称（而非仅课时标题）
    kp_names = _get_knowledge_points_for_lesson(lesson_code)

    # 知识点列表：优先使用树中定义的知识点名称，再补充课时标题
    knowledge_points = kp_names.copy() if kp_names else []
    if lesson_info["title"] not in knowledge_points:
        knowledge_points.insert(0, lesson_info["title"])

    # 查找学生该知识点的历史错题，结合错题出更有针对性的题
    with get_db() as db:
        errors = db.execute(
            "SELECT knowledge_point FROM error_notes WHERE student_id=? AND knowledge_point != '' ORDER BY created_at DESC LIMIT 10",
            (student_id,),
        ).fetchall()
        for e in errors:
            if e["knowledge_point"] not in knowledge_points:
                knowledge_points.append(e["knowledge_point"])

    # 异步生成
    task_id = str(uuid.uuid4())
    _challenge_tasks[task_id] = {
        "status": "generating",
        "student_id": student_id,
        "unit_code": unit_code,
        "lesson_code": lesson_code,
        "lesson_info": lesson_info,
        "result": None,
    }

    def _generate():
        try:
            result = ai_generate_challenge_questions(knowledge_points[:8], count=5)
            _challenge_tasks[task_id]["status"] = "completed"
            _challenge_tasks[task_id]["result"] = result

            # 保存闯关记录到数据库
            with get_db() as db:
                db.execute(
                    "INSERT INTO challenge_sessions (student_id, unit_code, lesson_code, theme, theme_intro, questions_json, status) VALUES (?, ?, ?, ?, ?, ?, 'active')",
                    (student_id, unit_code, lesson_code, result.get("theme", ""), result.get("theme_intro", ""), json.dumps(result.get("levels", []), ensure_ascii=False)),
                )

        except Exception as e:
            _challenge_tasks[task_id]["status"] = "failed"
            _challenge_tasks[task_id]["error"] = str(e)

    t = threading.Thread(target=_generate, daemon=True)
    t.start()

    return {"success": True, "task_id": task_id}


@router.get("/task/{task_id}")
def get_challenge_task(task_id: str):
    """轮询闯关生成状态"""
    if task_id not in _challenge_tasks:
        raise HTTPException(404, "任务不存在")

    task = _challenge_tasks[task_id]
    if task["status"] == "completed":
        result = task["result"]
        return {"success": True, "status": "completed", "data": result}
    elif task["status"] == "failed":
        return {"success": False, "status": "failed", "error": task.get("error", "生成失败")}
    else:
        return {"success": True, "status": "generating"}


@router.post("/answer")
def submit_challenge_answer(
    lesson_code: str = Form(...),
    level_index: int = Form(...),
    question: str = Form(...),
    student_answer: str = Form(...),
    correct_answer: str = Form(...),
    knowledge_point: str = Form(""),
    authorization: str = Form(""),
):
    """闯关答题 - 学生提交答案，AI判断正误+反馈"""
    student_id = get_student_id(authorization)

    # 简单判断正误（数值型可以精确比对）
    is_correct = False
    try:
        sa = float(student_answer.strip().replace("元", "").replace("平方米", "").replace("千克", "").replace("米", ""))
        ca = float(correct_answer.strip().replace("元", "").replace("平方米", "").replace("千克", "").replace("米", ""))
        is_correct = abs(sa - ca) < 0.01
    except:
        is_correct = student_answer.strip() == correct_answer.strip()

    # 积分：闯关 +0.1，每日累计最多 +1
    with get_db() as db:
        daily_earned = get_daily_points_by_reason_prefix(db, student_id, "闯关")
        points = 0.0
        if daily_earned < 1.0:
            points = min(0.1, 1.0 - daily_earned)
            if points > 0:
                add_points(db, student_id, points, f"闯关答题{('正确' if is_correct else '错误')}")

        # 错题入错题本
        if not is_correct:
            db.execute(
                "INSERT INTO error_notes (student_id, question_id, question_text, student_answer, correct_answer, knowledge_point, source, status) VALUES (?, NULL, ?, ?, ?, ?, 'challenge', 'unresolved')",
                (student_id, question, student_answer, correct_answer, knowledge_point),
            )

    result = {
        "is_correct": is_correct,
        "points_earned": points,
        "correct_answer": correct_answer,
    }

    if not is_correct:
        analysis = ai_analyze_error_knowledge(question, student_answer, correct_answer, knowledge_point)
        result["error_analysis"] = analysis
        similar = ai_generate_similar_questions(question, correct_answer, knowledge_point, count=3)
        result["similar_questions"] = similar
        correction = ai_guided_correction(question, student_answer, correct_answer, knowledge_point)
        result["guided_correction"] = correction

    return {"success": True, "data": result}


@router.post("/similar-answer")
def submit_similar_answer(
    question: str = Form(...),
    student_answer: str = Form(...),
    correct_answer: str = Form(...),
    knowledge_point: str = Form(""),
    authorization: str = Form(""),
):
    """闯关巩固题答题"""
    student_id = get_student_id(authorization)

    is_correct = False
    try:
        sa = float(student_answer.strip().replace("元", "").replace("平方米", "").replace("千克", "").replace("米", ""))
        ca = float(correct_answer.strip().replace("元", "").replace("平方米", "").replace("千克", "").replace("米", ""))
        is_correct = abs(sa - ca) < 0.01
    except:
        is_correct = student_answer.strip() == correct_answer.strip()

    # 积分：闯关巩固 +0.1，每日累计最多 +1
    with get_db() as db:
        daily_earned = get_daily_points_by_reason_prefix(db, student_id, "闯关")
        points = 0.0
        if daily_earned < 1.0:
            points = min(0.1, 1.0 - daily_earned)
            if points > 0:
                add_points(db, student_id, points, f"闯关巩固{('正确' if is_correct else '错误')}")

        if not is_correct:
            db.execute(
                "INSERT INTO error_notes (student_id, question_id, question_text, student_answer, correct_answer, knowledge_point, source, status) VALUES (?, NULL, ?, ?, ?, ?, 'challenge_similar', 'unresolved')",
                (student_id, question, student_answer, correct_answer, knowledge_point),
            )

    return {"success": True, "data": {"is_correct": is_correct, "points_earned": points, "correct_answer": correct_answer}}


@router.get("/history/{student_id}")
def challenge_history(student_id: int):
    """闯关历史"""
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM challenge_sessions WHERE student_id=? ORDER BY created_at DESC LIMIT 20",
            (student_id,),
        ).fetchall()
        return {"success": True, "list": [dict(r) for r in rows]}
