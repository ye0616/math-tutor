"""教师作业管理路由 - 教师上传题目/答案 → AI识别 → 生成作业卡片 → 按班级发布 → 查看完成情况"""

import json
import uuid
import base64
import threading
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException, Header, UploadFile, File, Form
from pydantic import BaseModel, Field
from typing import List, Optional
from database import get_db
from auth import get_user_from_token
from config import UPLOAD_DIR
from agents.llm import ai_extract_homework_questions_from_image, ai_analyze_class_common_errors

router = APIRouter()

# ===== 异步提取任务存储（内存） =====
_extract_tasks: dict = {}


def get_teacher_id(authorization: str) -> int:
    """验证教师身份，返回 user_id"""
    payload = get_user_from_token(authorization or "")
    if not payload:
        raise HTTPException(401, "未登录或Token已过期")
    if payload["role"] != "teacher":
        raise HTTPException(403, "仅教师可操作")
    with get_db() as db:
        user = db.execute("SELECT id FROM users WHERE id=? AND role='teacher'", (payload["user_id"],)).fetchone()
    if not user:
        raise HTTPException(401, "用户不存在")
    return payload["user_id"]


def await_safe_read(file: UploadFile) -> bytes:
    """安全读取上传文件"""
    try:
        return file.file.read()
    except Exception as e:
        print(f"[Assignments] 读取上传文件失败: {e}")
        return b""


# ===== 1. 教师上传图片并异步提取题目 =====

@router.post("/extract")
def extract_homework_from_image(
    file: UploadFile = File(...),
    authorization: str = Header(None),
):
    """教师上传纸质/文档题目图片，AI异步识别题目和答案"""
    teacher_id = get_teacher_id(authorization)

    image_bytes = await_safe_read(file)
    if not image_bytes:
        raise HTTPException(400, "上传文件为空")

    # 保存图片
    safe_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_teacher_{teacher_id}_{file.filename or 'homework.jpg'}"
    img_path = UPLOAD_DIR / safe_name
    img_path.write_bytes(image_bytes)

    image_base64 = base64.b64encode(image_bytes).decode("utf-8")

    task_id = uuid.uuid4().hex[:12]
    _extract_tasks[task_id] = {
        "status": "pending",
        "teacher_id": teacher_id,
        "image_path": str(img_path),
    }

    def _run_extract():
        try:
            _extract_tasks[task_id]["status"] = "extracting"
            result = ai_extract_homework_questions_from_image(image_base64)
            _extract_tasks[task_id]["status"] = "completed"
            _extract_tasks[task_id]["result"] = result
            _extract_tasks[task_id]["image_path"] = str(img_path)
        except Exception as e:
            print(f"[Assignments] 提取异常: {e}")
            import traceback
            traceback.print_exc()
            _extract_tasks[task_id]["status"] = "failed"
            _extract_tasks[task_id]["error"] = str(e)

    threading.Thread(target=_run_extract, daemon=True).start()
    return {"task_id": task_id, "image_path": str(img_path)}


# ===== 2. 轮询提取任务状态 =====

@router.get("/extract-task/{task_id}")
def get_extract_task(task_id: str, authorization: str = Header(None)):
    """轮询AI提取任务状态"""
    get_teacher_id(authorization)

    task = _extract_tasks.get(task_id)
    if not task:
        raise HTTPException(404, "任务不存在")

    resp = {"task_id": task_id, "status": task["status"]}
    if task["status"] == "completed":
        resp["result"] = task.get("result", {})
        resp["image_path"] = task.get("image_path", "")
    elif task["status"] == "failed":
        resp["error"] = task.get("error", "识别失败")

    return resp


# ===== 3. 创建作业（保存题目和答案） =====

class CreateAssignmentRequest(BaseModel):
    class_id: int
    title: str
    description: Optional[str] = ""
    unit_code: Optional[str] = ""
    source_image: Optional[str] = ""
    questions: List[dict] = Field(default_factory=list)
    due_date: Optional[str] = None


@router.post("")
def create_assignment(req: CreateAssignmentRequest, authorization: str = Header(None)):
    """教师创建作业卡片（保存AI识别或手动录入的题目和答案）"""
    teacher_id = get_teacher_id(authorization)

    if not req.title or not req.class_id:
        raise HTTPException(400, "标题和班级不能为空")

    # 验证班级归属
    with get_db() as db:
        cls = db.execute(
            "SELECT id FROM classes WHERE id=? AND teacher_id=?",
            (req.class_id, teacher_id),
        ).fetchone()
        if not cls:
            raise HTTPException(403, "班级不存在或不属于您")

        # 保存作业
        questions_json = json.dumps(req.questions, ensure_ascii=False)
        answers = [
            {
                "index": q.get("index", i + 1),
                "correct_answer": q.get("correct_answer", ""),
                "analysis": q.get("analysis", ""),
                "knowledge_point": q.get("knowledge_point", ""),
            }
            for i, q in enumerate(req.questions)
        ]
        answers_json = json.dumps(answers, ensure_ascii=False)

        cursor = db.execute(
            """INSERT INTO assignments
            (class_id, teacher_id, title, description, unit_code, type, source_image,
             questions_json, answers_json, status, due_date, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                req.class_id,
                teacher_id,
                req.title,
                req.description,
                req.unit_code,
                "photo",
                req.source_image,
                questions_json,
                answers_json,
                "draft",
                req.due_date,
                teacher_id,
            ),
        )
        assignment_id = cursor.lastrowid

    return {"id": assignment_id, "message": "作业创建成功"}


# ===== 4. 获取作业列表 =====

@router.get("")
def list_assignments(authorization: str = Header(None)):
    """获取教师创建的所有作业列表"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        rows = db.execute(
            """SELECT a.id, a.class_id, a.title, a.description, a.unit_code, a.type,
            a.status, a.due_date, a.created_at, a.questions_json, c.name as class_name
            FROM assignments a
            LEFT JOIN classes c ON a.class_id = c.id
            WHERE a.teacher_id=?
            ORDER BY a.created_at DESC""",
            (teacher_id,),
        ).fetchall()

        result = []
        for r in rows:
            d = dict(r)
            d["question_count"] = 0
            if d.get("questions_json"):
                try:
                    d["question_count"] = len(json.loads(d["questions_json"]))
                except:
                    pass
            result.append(d)

    return {"assignments": result}


# ===== 5. 获取作业详情 =====

@router.get("/{assignment_id}")
def get_assignment_detail(assignment_id: int, authorization: str = Header(None)):
    """获取作业详情（含题目列表和班级提交统计）"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        row = db.execute(
            """SELECT a.*, c.name as class_name
            FROM assignments a
            LEFT JOIN classes c ON a.class_id = c.id
            WHERE a.id=? AND a.teacher_id=?""",
            (assignment_id, teacher_id),
        ).fetchone()

        if not row:
            raise HTTPException(404, "作业不存在")

        detail = dict(row)
        try:
            detail["questions"] = json.loads(detail.get("questions_json", "[]") or "[]")
        except:
            detail["questions"] = []
        try:
            detail["answers"] = json.loads(detail.get("answers_json", "[]") or "[]")
        except:
            detail["answers"] = []

        # 提交统计
        total_students = db.execute(
            "SELECT COUNT(*) as c FROM users WHERE class_id=? AND role='student'",
            (detail["class_id"],),
        ).fetchone()["c"]

        submitted = db.execute(
            "SELECT COUNT(DISTINCT student_id) as c FROM homework_submissions WHERE assignment_id=?",
            (assignment_id,),
        ).fetchone()["c"]

        unsubmitted = max(0, total_students - submitted)
        avg_correct = 0
        if submitted > 0:
            row = db.execute(
                """SELECT AVG(CAST(correct_count AS REAL) / MAX(total_questions, 1)) as avg
                FROM homework_submissions WHERE assignment_id=?""",
                (assignment_id,),
            ).fetchone()
            if row and row["avg"]:
                avg_correct = round(row["avg"] * 100, 1)

        detail["stats"] = {
            "total_students": total_students,
            "submitted": submitted,
            "unsubmitted": unsubmitted,
            "submission_rate": round(submitted / max(1, total_students) * 100, 1),
            "avg_correct_rate": avg_correct,
        }

    return detail


# ===== 6. 发布作业 =====

@router.post("/{assignment_id}/publish")
def publish_assignment(assignment_id: int, authorization: str = Header(None)):
    """将草稿状态的作业发布给学生"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        row = db.execute(
            "SELECT id, status FROM assignments WHERE id=? AND teacher_id=?",
            (assignment_id, teacher_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "作业不存在")

        db.execute(
            "UPDATE assignments SET status='published' WHERE id=?",
            (assignment_id,),
        )

    return {"message": "作业已发布"}


# ===== 7. 获取作业提交情况（谁做了谁没做） =====

@router.get("/{assignment_id}/submissions")
def get_assignment_submissions(assignment_id: int, authorization: str = Header(None)):
    """获取作业的学生提交明细：谁已完成、谁未完成、完成率、正确率"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        assignment = db.execute(
            "SELECT * FROM assignments WHERE id=? AND teacher_id=?",
            (assignment_id, teacher_id),
        ).fetchone()
        if not assignment:
            raise HTTPException(404, "作业不存在")

        assignment = dict(assignment)
        class_id = assignment["class_id"]

        students = db.execute(
            """SELECT id, name, student_no, layer, points
            FROM users WHERE class_id=? AND role='student' ORDER BY name""",
            (class_id,),
        ).fetchall()

        submissions = db.execute(
            """SELECT id, student_id, status, summary, total_questions, correct_count,
            created_at, completed_at
            FROM homework_submissions WHERE assignment_id=?""",
            (assignment_id,),
        ).fetchall()

        submission_map = {s["student_id"]: dict(s) for s in submissions}

        student_list = []
        for stu in students:
            d = dict(stu)
            sub = submission_map.get(d["id"])
            if sub:
                d["status"] = sub.get("status", "pending")
                d["submitted_at"] = sub.get("completed_at") or sub.get("created_at")
                d["correct_count"] = sub.get("correct_count", 0)
                d["total_questions"] = sub.get("total_questions", 0)
                d["accuracy"] = round(
                    d["correct_count"] / max(1, d["total_questions"]) * 100, 1
                )
                d["submission_id"] = sub.get("id")
                d["done"] = True
            else:
                d["status"] = "not_submitted"
                d["done"] = False
                d["accuracy"] = 0
            student_list.append(d)

        return {
            "assignment_id": assignment_id,
            "class_id": class_id,
            "students": student_list,
        }


# ===== 8. AI 分析作业完成情况 =====

@router.post("/{assignment_id}/analyze")
def analyze_assignment(assignment_id: int, authorization: str = Header(None)):
    """AI 分析本次作业完成情况，输出共性问题、薄弱知识点和教学建议"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        assignment = db.execute(
            "SELECT * FROM assignments WHERE id=? AND teacher_id=?",
            (assignment_id, teacher_id),
        ).fetchone()
        if not assignment:
            raise HTTPException(404, "作业不存在")

        assignment = dict(assignment)

        # 收集本次作业的所有错题
        errors = db.execute(
            """SELECT hq.question_text, hq.student_answer, hq.correct_answer,
            hq.knowledge_point, hq.error_type, u.name as student_name
            FROM homework_questions hq
            JOIN homework_submissions hs ON hq.submission_id = hs.id
            JOIN users u ON hq.student_id = u.id
            WHERE hs.assignment_id=? AND hq.is_correct=0""",
            (assignment_id,),
        ).fetchall()

        error_list = [dict(e) for e in errors]

        if not error_list:
            return {
                "assignment_id": assignment_id,
                "overall_analysis": "本次作业完成质量较高，暂无错题。",
                "common_weak_points": [],
                "urgent_actions": [],
                "recommended_exercises": [],
            }

        ai_result = ai_analyze_class_common_errors(error_list)
        ai_result["assignment_id"] = assignment_id
        return ai_result


# ===== 9. 删除作业（仅草稿可删除） =====

@router.delete("/{assignment_id}")
def delete_assignment(assignment_id: int, authorization: str = Header(None)):
    """删除草稿或已撤回的作业（已发布的不可删除）"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        row = db.execute(
            "SELECT status FROM assignments WHERE id=? AND teacher_id=?",
            (assignment_id, teacher_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "作业不存在")
        if row["status"] == "published":
            raise HTTPException(400, "已发布作业不能删除，请先关闭")

        db.execute("DELETE FROM assignments WHERE id=?", (assignment_id,))

    return {"message": "作业已删除"}


# ===== 10. 查看学生随机考察预警（作业全对但考察出错的学生） =====

@router.get("/random-challenges/{class_id}")
def get_random_challenge_alerts(class_id: int, authorization: str = Header(None)):
    """获取班级中随机考察有错误的学生列表（上报老师端）"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        # 验证班级属于该教师
        cls = db.execute("SELECT id FROM classes WHERE id=? AND teacher_id=?", (class_id, teacher_id)).fetchone()
        if not cls:
            raise HTTPException(403, "无权访问该班级")

        challenges = db.execute(
            "SELECT rc.id, rc.student_id, rc.lesson_title, rc.total_questions, rc.correct_count, "
            "rc.answers_json, rc.created_at, u.name as student_name, u.student_no "
            "FROM random_challenges rc "
            "JOIN users u ON rc.student_id = u.id "
            "WHERE rc.class_id=? AND rc.reported_to_teacher=1 "
            "ORDER BY rc.created_at DESC",
            (class_id,),
        ).fetchall()

    result = []
    for c in challenges:
        answers = []
        try:
            answers = json.loads(c["answers_json"]) if c["answers_json"] else []
        except json.JSONDecodeError:
            pass
        wrong_answers = [a for a in answers if not a.get("is_correct")]
        result.append({
            "id": c["id"],
            "student_id": c["student_id"],
            "student_name": c["student_name"],
            "student_no": c["student_no"],
            "lesson_title": c["lesson_title"],
            "total_questions": c["total_questions"],
            "correct_count": c["correct_count"],
            "wrong_count": c["total_questions"] - c["correct_count"],
            "wrong_answers": wrong_answers,
            "created_at": c["created_at"],
        })

    return {"alerts": result, "total": len(result)}
