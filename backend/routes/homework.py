"""学习作业批改路由 - 学生拍照上传 → AI批改 → 引导改错 → 巩固练习 → 随机考察 → 学习问答"""

import json
import uuid
import base64
import os
import threading
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import APIRouter, HTTPException, Header, UploadFile, File, Form
from database import get_db, add_points
from auth import get_user_from_token, verify_token
from agents.llm import (
    ai_grade_homework,
    ai_guided_correction,
    ai_generate_similar_questions,
    ai_generate_breakthrough_questions,
    ai_generate_random_challenge,
    ai_socratic_qa,
)
from config import UPLOAD_DIR

router = APIRouter()

# ===== 异步批改任务存储（内存） =====
_grading_tasks: dict = {}


def _normalize_q_text(text: str) -> str:
    """归一化题目文本用于相似度匹配：去空白/标点/常见符号，转小写"""
    if not text:
        return ""
    s = str(text).lower()
    # 去常见空白和数学符号
    for ch in [" ", "\t", "\n", "\r", "。", "，", ",", ".", "?", "？", "!", "！",
               ":", "：", ";", "；", "(", ")", "（", "）", "[", "]", "【", "】",
               "{", "}", "×", "x", "÷", "/", "+", "-", "=", "·", "*", "'", '"']:
        s = s.replace(ch, "")
    return s


def get_student_id(authorization: str) -> int:
    """验证学生身份，返回 user_id"""
    payload = get_user_from_token(authorization or "")
    if not payload:
        raise HTTPException(401, "未登录或Token已过期")
    if payload["role"] != "student":
        raise HTTPException(403, "仅学生可操作")
    with get_db() as db:
        user = db.execute("SELECT id FROM users WHERE id=? AND role='student'", (payload["user_id"],)).fetchone()
    if not user:
        raise HTTPException(401, "用户不存在，请重新登录")
    return payload["user_id"]


# ===== 1. 上传作业图片并启动AI批改 =====

@router.post("/upload")
def upload_homework(
    file: UploadFile = File(...),
    lesson_title: str = Form(default=""),
    assignment_id: int = Form(default=0),
    authorization: str = Header(None),
):
    """学生上传作业图片，启动AI异步批改任务"""
    student_id = get_student_id(authorization)

    # 读取上传文件
    image_bytes = await_safe_read(file)
    if not image_bytes:
        raise HTTPException(400, "上传文件为空")

    # 保存图片到 uploads 目录
    safe_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{student_id}_{file.filename or 'homework.jpg'}"
    img_path = UPLOAD_DIR / safe_name
    img_path.write_bytes(image_bytes)

    # base64 编码
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")

    # 创建数据库提交记录
    with get_db() as db:
        cursor = db.execute(
            "INSERT INTO homework_submissions (student_id, lesson_title, image_path, status, assignment_id) VALUES (?, ?, ?, ?, ?)",
            (student_id, lesson_title, str(img_path), "pending", assignment_id),
        )
        submission_id = cursor.lastrowid

    # 启动异步批改任务
    task_id = uuid.uuid4().hex[:12]
    _grading_tasks[task_id] = {
        "status": "pending",
        "submission_id": submission_id,
        "student_id": student_id,
    }

    def _run_grading():
        try:
            _grading_tasks[task_id]["status"] = "grading"

            # 调用AI多模态批改
            result = ai_grade_homework(image_base64, lesson_title or "小学数学")

            if not result.get("success"):
                _grading_tasks[task_id]["status"] = "failed"
                _grading_tasks[task_id]["error"] = result.get("summary", "批改失败")
                # 更新数据库
                with get_db() as db:
                    db.execute(
                        "UPDATE homework_submissions SET status='failed', summary=? WHERE id=?",
                        (result.get("summary", "批改失败"), submission_id),
                    )
                return

            # 批改成功：保存结果到数据库
            questions = result.get("questions", [])
            summary = result.get("summary", "")
            correct_count = sum(1 for q in questions if q.get("is_correct"))
            total_count = len(questions)

            # ===== 题目对齐校验：识别出的题是否与老师布置的题一致 =====
            aligned_questions = questions
            if assignment_id and total_count > 0:
                with get_db() as db:
                    row = db.execute(
                        "SELECT questions_json, title FROM assignments WHERE id=?",
                        (assignment_id,),
                    ).fetchone()
                if row and row["questions_json"]:
                    try:
                        assigned = json.loads(row["questions_json"])
                    except Exception:
                        assigned = []
                    assigned_texts: list[str] = []
                    for item in assigned:
                        if isinstance(item, dict):
                            txt = (
                                item.get("q")
                                or item.get("question_text")
                                or item.get("question")
                                or ""
                            )
                            if txt:
                                assigned_texts.append(_normalize_q_text(str(txt)))

                    if assigned_texts:
                        # 校验：识别出的题必须至少有一道与布置题匹配
                        def _matches_any(norm: str) -> bool:
                            return any(
                                (norm and (a in norm or norm in a))
                                for a in assigned_texts
                            )

                        aligned_questions = [
                            q for q in questions
                            if _matches_any(_normalize_q_text(str(q.get("question_text", ""))))
                        ]

                        # 完全对不上 → 整批拦截
                        if not aligned_questions:
                            _grading_tasks[task_id]["status"] = "failed"
                            _grading_tasks[task_id]["error"] = (
                                f"识别出的题目不在「{row['title']}」布置范围内，"
                                f"请重新拍照或与老师确认作业内容"
                            )
                            with get_db() as db:
                                db.execute(
                                    "UPDATE homework_submissions SET status='failed', summary=? WHERE id=?",
                                    (_grading_tasks[task_id]["error"], submission_id),
                                )
                            return

                        # 部分对齐，丢弃未匹配的题
                        if len(aligned_questions) < total_count:
                            questions = aligned_questions
                            total_count = len(questions)
                            correct_count = sum(1 for q in questions if q.get("is_correct"))
                            summary = (
                                f"已剔除 {total_count - len(aligned_questions)} 张识别错误的题目，"
                                f"本次共批改 {len(aligned_questions)} 道"
                            )

            grading_json = json.dumps({"questions": questions, "summary": summary, "success": True}, ensure_ascii=False)

            # 逐题保存到 homework_questions 表 + 错题自动入错题本 + 完成加积分
            # 全部放在同一个 db 会话里，确保 commit 后再关闭
            # error_note_ids 按 question 列表的循环顺序对齐：每个位置要么是错题 ID 要么是 None
            error_note_ids: list[int | None] = [None] * len(questions)
            with get_db() as db:
                db.execute(
                    "UPDATE homework_submissions SET status='completed', grading_json=?, summary=?, "
                    "total_questions=?, correct_count=?, completed_at=? WHERE id=?",
                    (grading_json, summary, total_count, correct_count,
                     datetime.now().strftime("%Y-%m-%d %H:%M:%S"), submission_id),
                )

                for qi, q in enumerate(questions):
                    cursor = db.execute(
                        "INSERT INTO homework_questions "
                        "(submission_id, student_id, question_index, question_text, student_answer, "
                        "correct_answer, is_correct, analysis, error_type, correction_hint, knowledge_point) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (submission_id, student_id, q.get("index", 0),
                         q.get("question_text", ""), q.get("student_answer", ""),
                         q.get("correct_answer", ""), int(q.get("is_correct", False)),
                         q.get("analysis", ""), q.get("error_type", ""),
                         q.get("correction_hint", ""), q.get("knowledge_point", "")),
                    )
                    question_id = cursor.lastrowid

                    # 错题自动加入错题本（记录 error_note_id 用于弹小聪）
                    if not q.get("is_correct"):
                        en_cursor = db.execute(
                            "INSERT INTO error_notes "
                            "(student_id, question_id, question_text, student_answer, correct_answer, "
                            "analysis, knowledge_point, error_type, source, homework_question_id, status) "
                            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (student_id, None,  # question_id=NULL 因为不来自 questions 表
                             q.get("question_text", ""),
                             q.get("student_answer", ""),
                             q.get("correct_answer", ""),
                             q.get("analysis", ""),
                             q.get("knowledge_point", ""),
                             q.get("error_type", ""),
                             "homework",  # source 标记为作业来源
                             question_id,
                             "unresolved"),
                        )
                        # 用循环索引 qi 而非 q.get('index')，确保与前端 questions 数组索引一致
                        error_note_ids[qi] = en_cursor.lastrowid

                # 完成当天复习任务 +0.5分
                add_points(db, student_id, 0.5, "完成学习作业")

            # 把 error_note_ids 回传给前端（按 questions 数组索引顺序）
            _grading_tasks[task_id]["error_note_ids"] = error_note_ids

            _grading_tasks[task_id]["status"] = "completed"
            _grading_tasks[task_id]["submission_id"] = submission_id

        except Exception as e:
            print(f"[Homework] 批改异常: {e}")
            import traceback
            traceback.print_exc()
            _grading_tasks[task_id]["status"] = "failed"
            _grading_tasks[task_id]["error"] = str(e)
            with get_db() as db:
                db.execute(
                    "UPDATE homework_submissions SET status='failed', summary=? WHERE id=?",
                    (str(e), submission_id),
                )

    threading.Thread(target=_run_grading, daemon=True).start()
    return {"task_id": task_id, "submission_id": submission_id}


def await_safe_read(file: UploadFile) -> bytes:
    """安全读取上传文件"""
    try:
        return file.file.read()
    except Exception as e:
        print(f"[Homework] 读取上传文件失败: {e}")
        return b""


# ===== 2. 轮询批改任务状态 =====

@router.get("/task/{task_id}")
def get_grading_task(task_id: str, authorization: str = Header(None)):
    """轮询批改任务状态，完成后返回批改结果"""
    student_id = get_student_id(authorization)

    task = _grading_tasks.get(task_id)
    if not task:
        raise HTTPException(404, "任务不存在")

    resp = {"task_id": task_id, "status": task["status"]}
    if task["status"] == "completed":
        submission_id = task["submission_id"]
        with get_db() as db:
            sub = db.execute(
                "SELECT id, lesson_title, image_path, status, summary, "
                "total_questions, correct_count, created_at, completed_at "
                "FROM homework_submissions WHERE id=?",
                (submission_id,),
            ).fetchone()
            if not sub:
                return resp

            # 获取每题的批改结果
            questions = db.execute(
                "SELECT id, question_index, question_text, student_answer, correct_answer, "
                "is_correct, analysis, error_type, correction_hint, knowledge_point "
                "FROM homework_questions WHERE submission_id=? ORDER BY question_index",
                (submission_id,),
            ).fetchall()

            resp["submission"] = dict(sub)
            resp["questions"] = [dict(q) for q in questions]
            # 构建批改结果概览
            correct = sum(1 for q in questions if q["is_correct"])
            total = len(questions)
            resp["accuracy"] = round(correct / max(1, total) * 100, 1)
            # 返回错题 error_note_id 列表（按 question_index 顺序对齐）
            resp["error_note_ids"] = task.get("error_note_ids", [])

    elif task["status"] == "failed":
        resp["error"] = task.get("error", "批改失败")

    return resp


# ===== 3. 引导改错 =====

@router.post("/question/{question_id}/guided-correction")
def get_guided_correction(question_id: int, authorization: str = Header(None)):
    """对错题进行AI分步引导改错"""
    student_id = get_student_id(authorization)

    with get_db() as db:
        q = db.execute(
            "SELECT * FROM homework_questions WHERE id=? AND student_id=?",
            (question_id, student_id),
        ).fetchone()
        if not q:
            raise HTTPException(404, "题目不存在")
        if q["is_correct"]:
            raise HTTPException(400, "此题已正确，无需改错引导")

    # 调用AI引导改错
    result = ai_guided_correction(
        question_text=q["question_text"],
        student_answer=q["student_answer"],
        correct_answer=q["correct_answer"],
        knowledge_point=q["knowledge_point"],
    )

    # 保存引导改错结果
    with get_db() as db:
        db.execute(
            "UPDATE homework_questions SET guided_correction_json=? WHERE id=?",
            (json.dumps(result, ensure_ascii=False), question_id),
        )

    return result


# ===== 4. 错题巩固 - 生成类似题目 =====

@router.post("/question/{question_id}/similar-questions")
def get_similar_questions(question_id: int, authorization: str = Header(None)):
    """基于错题生成类似题目供巩固练习"""
    student_id = get_student_id(authorization)

    with get_db() as db:
        q = db.execute(
            "SELECT * FROM homework_questions WHERE id=? AND student_id=?",
            (question_id, student_id),
        ).fetchone()
        if not q:
            raise HTTPException(404, "题目不存在")

    # 调用AI生成类似题
    result = ai_generate_similar_questions(
        question_text=q["question_text"],
        correct_answer=q["correct_answer"],
        knowledge_point=q["knowledge_point"],
        count=3,
    )

    # 保存类似题结果
    with get_db() as db:
        db.execute(
            "UPDATE homework_questions SET similar_questions_json=? WHERE id=?",
            (json.dumps(result, ensure_ascii=False), question_id),
        )

    return result


# ===== 5. 作业历史 =====

@router.get("/history/{student_id}")
def homework_history(student_id: int, authorization: str = Header(None)):
    """获取学生的作业批改历史"""
    with get_db() as db:
        submissions = db.execute(
            "SELECT id, lesson_title, image_path, status, summary, "
            "total_questions, correct_count, created_at, completed_at "
            "FROM homework_submissions WHERE student_id=? ORDER BY created_at DESC",
            (student_id,),
        ).fetchall()

        result = []
        for sub in submissions:
            d = dict(sub)
            # 图片URL转为可访问路径
            if d.get("image_path"):
                d["image_url"] = f"/uploads/{Path(d['image_path']).name}"
            else:
                d["image_url"] = ""
            d.pop("image_path", None)  # 不返回绝对路径

            questions = db.execute(
                "SELECT id, question_index, question_text, student_answer, correct_answer, "
                "is_correct, analysis, error_type, correction_hint, knowledge_point "
                "FROM homework_questions WHERE submission_id=? ORDER BY question_index",
                (d["id"],),
            ).fetchall()
            d["questions"] = [dict(q) for q in questions]
            result.append(d)

        return {"submissions": result}


# ===== 6. 错题突破 =====

@router.post("/mistake-book/breakthrough")
def mistake_breakthrough(authorization: str = Header(None)):
    """错题突破：根据学生错题记录，AI智能生成针对性练习题"""
    student_id = get_student_id(authorization)

    # 获取学生所有未解决的错题
    with get_db() as db:
        errors = db.execute(
            "SELECT question_text, student_answer, correct_answer, "
            "knowledge_point, analysis, error_type, source "
            "FROM error_notes WHERE student_id=? AND status='unresolved' "
            "ORDER BY created_at DESC LIMIT 10",
            (student_id,),
        ).fetchall()

    if not errors:
        return {
            "knowledge_tag": "暂无错题",
            "questions": [],
            "message": "你目前没有需要突破的错题，继续保持！",
        }

    error_list = [dict(e) for e in errors]

    # 调用AI生成突破题目
    result = ai_generate_breakthrough_questions(error_list, count=5)
    return result


# ===== 7. 错题突破答题提交 =====

class BreakthroughAnswerRequest:
    """错题突破答题提交"""
    student_id: int
    question_index: int
    student_answer: str
    correct_answer: str


from pydantic import BaseModel


class BreakthroughAnswer(BaseModel):
    student_id: int
    question_index: int
    student_answer: str
    correct_answer: str


@router.post("/mistake-book/breakthrough/answer")
def submit_breakthrough_answer(req: BreakthroughAnswer, authorization: str = Header(None)):
    """提交错题突破的答题结果"""
    student_id = get_student_id(authorization)

    is_correct = req.student_answer.strip() == req.correct_answer.strip()

    # 完成错题巩固练习 +0.5分
    points = 0.5
    with get_db() as db:
        add_points(db, student_id, points, f"错题巩固练习-{('正确' if is_correct else '继续加油')}")

    return {"is_correct": is_correct, "points": points}


# ===== 8. 标记错题已解决 =====

@router.post("/error-note/{note_id}/resolve")
def resolve_error_note(note_id: int, authorization: str = Header(None)):
    """标记错题为已解决（已康复）"""
    student_id = get_student_id(authorization)

    with get_db() as db:
        note = db.execute(
            "SELECT * FROM error_notes WHERE id=? AND student_id=?",
            (note_id, student_id),
        ).fetchone()
        if not note:
            raise HTTPException(404, "错题记录不存在")

        reheat_due = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        db.execute(
            "UPDATE error_notes SET status='resolved', resolved_at=CURRENT_TIMESTAMP, "
            "reheat_status='pending', reheat_due=? WHERE id=?",
            (reheat_due, note_id),
        )
        # 加积分：错题康复 +0.5
        add_points(db, student_id, 0.5, "错题康复")

    return {"message": "错题已标记为康复，7天后需要回炉复习", "points": 0.5, "reheat_due": reheat_due}


# ===== 9. 随机考察："再考考你" =====

# 异步随机考察题生成任务
_random_challenge_tasks: dict = {}


def _run_random_challenge(task_id: str, lesson_title: str, knowledge_points: str, student_id: int):
    try:
        result = ai_generate_random_challenge(lesson_title, knowledge_points, count=5)
        _random_challenge_tasks[task_id] = {"status": "done", "result": result}
    except Exception as e:
        _random_challenge_tasks[task_id] = {"status": "error", "error": str(e)}


@router.post("/random-challenge")
def generate_random_challenge(
    lesson_title: str = Form(default=""),
    submission_id: int = Form(default=0),
    lesson_code: str = Form(default=""),
    authorization: str = Header(None),
):
    """作业全对后生成5道随机考察题（优先从课时题库出题，不足时AI补充）

    前提：仅当该次作业 submission 的 correct_count == total_questions 时允许生成。
    """
    student_id = get_student_id(authorization)

    # 验证该次作业确实是全对
    if submission_id:
        with get_db() as db:
            sub = db.execute(
                "SELECT total_questions, correct_count, lesson_title, assignment_id FROM homework_submissions WHERE id=? AND student_id=?",
                (submission_id, student_id),
            ).fetchone()
            if not sub:
                raise HTTPException(404, "作业记录不存在")
            if sub["total_questions"] == 0 or sub["correct_count"] != sub["total_questions"]:
                raise HTTPException(403, "只有作业全对时才能触发随机考察")
            if not lesson_title:
                lesson_title = sub["lesson_title"] or ""
            # 从 assignment 获取 lesson_code
            if not lesson_code and sub["assignment_id"]:
                a = db.execute(
                    "SELECT unit_code FROM assignments WHERE id=?",
                    (sub["assignment_id"],),
                ).fetchone()
                if a and a["unit_code"]:
                    lesson_code = a["unit_code"]

    # ===== 优先从课时题库获取题目 =====
    db_questions = []
    if lesson_code:
        with get_db() as db:
            qs = db.execute(
                "SELECT content, answer, analysis, type, difficulty, knowledge_point FROM questions "
                "WHERE lesson_code=? ORDER BY RANDOM() LIMIT 5",
                (lesson_code,),
            ).fetchall()
            if len(qs) >= 5:
                # 题库足够，直接返回
                task_id = f"random_{student_id}_{int(datetime.now().timestamp())}"
                questions = []
                for i, q in enumerate(qs):
                    questions.append({
                        "index": i + 1,
                        "question": q["content"],
                        "answer": q["answer"],
                        "knowledge_point": q["knowledge_point"] or "",
                        "explanation": q["analysis"] or "",
                    })
                _random_challenge_tasks[task_id] = {
                    "status": "done",
                    "result": {
                        "challenge_title": "再考考你",
                        "questions": questions,
                        "source": "题库",
                    },
                }
                return {"task_id": task_id, "message": "正在生成随机考察题..."}
            elif len(qs) > 0:
                # 题库不够5道，先记录已有
                db_questions = [dict(q) for q in qs]

    # 提取知识点（从该课题的错题/作业题中获取）
    knowledge_points = ""
    with get_db() as db:
        kps = db.execute(
            "SELECT DISTINCT knowledge_point FROM homework_questions WHERE student_id=? AND knowledge_point != '' ORDER BY id DESC LIMIT 5",
            (student_id,),
        ).fetchall()
        knowledge_points = "、".join([r["knowledge_point"] for r in kps if r["knowledge_point"]])

    task_id = f"random_{student_id}_{int(datetime.now().timestamp())}"
    _random_challenge_tasks[task_id] = {"status": "running"}

    thread = threading.Thread(
        target=_run_random_challenge_with_db,
        args=(task_id, lesson_title, knowledge_points, student_id, lesson_code, db_questions),
    )
    thread.daemon = True
    thread.start()

    return {"task_id": task_id, "message": "正在生成随机考察题..."}


def _run_random_challenge_with_db(
    task_id: str,
    lesson_title: str,
    knowledge_points: str,
    student_id: int,
    lesson_code: str,
    db_questions: list,
):
    """随机考察题生成（题库优先 + AI补充）"""
    try:
        ai_needed = 5 - len(db_questions)
        result = ai_generate_random_challenge(lesson_title, knowledge_points, count=ai_needed if ai_needed > 0 else 5)

        # 合并已有题库题 + AI生成题
        questions = []
        j = 1
        for q in db_questions:
            questions.append({
                "index": j,
                "question": q.get("content", ""),
                "answer": q.get("answer", ""),
                "knowledge_point": q.get("knowledge_point", ""),
                "explanation": q.get("analysis", ""),
            })
            j += 1

        ai_questions = (result or {}).get("questions", [])
        for q in ai_questions:
            q["index"] = j
            questions.append(q)
            j += 1
            # AI生成的题目也保存到题库
            if lesson_code:
                with get_db() as db:
                    kp = q.get("knowledge_point", "")
                    db.execute(
                        "INSERT INTO questions (unit_code, type, difficulty, content, answer, analysis, lesson_code, knowledge_point, created_by) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (lesson_code[:2], "random", "advanced", q.get("question", ""),
                         q.get("answer", ""), q.get("explanation", ""), lesson_code, kp, "ai_random"),
                    )

        # 限制最多5道
        questions = questions[:5]

        _random_challenge_tasks[task_id] = {
            "status": "done",
            "result": {
                "challenge_title": "再考考你",
                "questions": questions,
                "source": f"题库{len(db_questions)}+AI{len(ai_questions[:5-len(db_questions)])}",
            },
        }
    except Exception as e:
        _random_challenge_tasks[task_id] = {"status": "error", "error": str(e)}


@router.get("/random-challenge/task/{task_id}")
def get_random_challenge_task(task_id: str, authorization: str = Header(None)):
    """轮询随机考察题生成状态"""
    get_student_id(authorization)
    task = _random_challenge_tasks.get(task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    return task


@router.post("/random-challenge/submit")
def submit_random_challenge(
    student_id: int = Form(...),
    submission_id: int = Form(default=0),
    lesson_title: str = Form(default=""),
    questions_json: str = Form(...),
    answers_json: str = Form(...),
    authorization: str = Header(None),
):
    """提交随机考察答题结果，错误时上报老师端

    questions_json: AI生成的5道题JSON
    answers_json: 学生的答案JSON [{index, question, student_answer, correct_answer, is_correct}]
    """
    sid = get_student_id(authorization)

    try:
        answers = json.loads(answers_json)
    except json.JSONDecodeError:
        raise HTTPException(400, "答案格式错误")

    total = len(answers)
    correct = sum(1 for a in answers if a.get("is_correct"))

    # 获取 class_id
    class_id = 0
    with get_db() as db:
        user = db.execute("SELECT class_id FROM users WHERE id=?", (sid,)).fetchone()
        if user:
            class_id = user["class_id"] or 0

    has_errors = correct < total
    reported = 1 if has_errors else 0

    # 保存随机考察记录
    with get_db() as db:
        cursor = db.execute(
            "INSERT INTO random_challenges "
            "(student_id, class_id, submission_id, lesson_title, questions_json, answers_json, "
            "total_questions, correct_count, status, reported_to_teacher) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                sid,
                class_id,
                submission_id,
                lesson_title,
                questions_json,
                answers_json,
                total,
                correct,
                "completed" if not has_errors else "has_errors",
                reported,
            ),
        )
        challenge_id = cursor.lastrowid

        # 全对额外加1分（通过考察）
        if not has_errors:
            add_points(db, sid, 1, "全对并通过考察")

        # 有错误时：每道错题录入错题本
        if has_errors:
            for a in answers:
                if not a.get("is_correct"):
                    db.execute(
                        "INSERT INTO error_notes "
                        "(student_id, question_text, student_answer, correct_answer, "
                        "knowledge_point, source, status, error_type) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            sid,
                            a.get("question", ""),
                            a.get("student_answer", ""),
                            a.get("correct_answer", ""),
                            a.get("knowledge_point", ""),
                            "challenge",
                            "unresolved",
                            "随机考察错误",
                        ),
                    )

        db.commit()

    return {
        "challenge_id": challenge_id,
        "total": total,
        "correct": correct,
        "has_errors": has_errors,
        "reported": reported,
        "message": "随机考察完成！全对通过考察+1分" if not has_errors else f"随机考察有{total - correct}道错误，已上报老师",
    }


# ===== 10. 学习问答：苏格拉底式引导 =====

_qa_tasks: dict = {}


def _run_qa(task_id: str, question: str, image_base64: str, history: list):
    try:
        result = ai_socratic_qa(question, image_base64, history)
        _qa_tasks[task_id] = {"status": "done", "result": result}
    except Exception as e:
        _qa_tasks[task_id] = {"status": "error", "error": str(e)}


@router.post("/qa/ask")
def qa_ask(
    question: str = Form(default=""),
    image: str = Form(default=""),
    conversation_history: str = Form(default=""),
    authorization: str = Header(None),
):
    """学生提问（文字或图片），AI苏格拉底式引导（异步任务）"""
    student_id = get_student_id(authorization)

    if not question and not image:
        raise HTTPException(400, "请输入问题或上传题目图片")

    # 解析对话历史
    history = []
    if conversation_history:
        try:
            history = json.loads(conversation_history)
        except json.JSONDecodeError:
            history = []

    # 去掉图片前缀
    img_b64 = image
    if img_b64 and "," in img_b64 and img_b64.startswith("data:"):
        img_b64 = img_b64.split(",", 1)[1]

    task_id = f"qa_{student_id}_{int(datetime.now().timestamp())}"
    _qa_tasks[task_id] = {"status": "running"}

    thread = threading.Thread(target=_run_qa, args=(task_id, question, img_b64, history))
    thread.daemon = True
    thread.start()

    return {"task_id": task_id, "message": "AI正在思考..."}


@router.get("/qa/task/{task_id}")
def get_qa_task(task_id: str, authorization: str = Header(None)):
    """轮询学习问答结果"""
    get_student_id(authorization)
    task = _qa_tasks.get(task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    return task


@router.post("/qa/save")
def qa_save(
    student_id: int = Form(...),
    question_text: str = Form(default=""),
    conversation_json: str = Form(default="[]"),
    is_solved: bool = Form(default=False),
    similar_question: str = Form(default=""),
    similar_answer: str = Form(default=""),
    image: str = Form(default=""),
    authorization: str = Header(None),
):
    """保存学习问答会话记录（当问题解决后调用）"""
    sid = get_student_id(authorization)

    # 保存图片
    image_path = ""
    if image:
        img_b64 = image
        if "," in img_b64 and img_b64.startswith("data:"):
            img_b64 = img_b64.split(",", 1)[1]
        upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "qa")
        os.makedirs(upload_dir, exist_ok=True)
        image_filename = f"qa_{sid}_{int(datetime.now().timestamp())}.jpg"
        try:
            with open(os.path.join(upload_dir, image_filename), "wb") as f:
                f.write(base64.b64decode(img_b64))
            image_path = image_filename
        except Exception:
            pass

    class_id = 0
    with get_db() as db:
        user = db.execute("SELECT class_id FROM users WHERE id=?", (sid,)).fetchone()
        if user:
            class_id = user["class_id"] or 0

        cursor = db.execute(
            "INSERT INTO study_qa_sessions "
            "(student_id, class_id, question_text, image_path, conversation_json, is_solved, similar_question, similar_answer) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (sid, class_id, question_text, image_path, conversation_json, 1 if is_solved else 0, similar_question, similar_answer),
        )
        qa_id = cursor.lastrowid

        # 解决问题加0.5分（错题巩固）
        if is_solved:
            add_points(db, sid, 0.5, "学习问答解决问题")

    return {"qa_id": qa_id, "message": "学习问答记录已保存"}


@router.post("/qa/similar")
def qa_similar(
    question_text: str = Form(...),
    correct_answer: str = Form(...),
    knowledge_point: str = Form(default=""),
    authorization: str = Header(None),
):
    """学习问答解决后生成类似巩固题"""
    get_student_id(authorization)

    result = ai_generate_similar_questions(question_text, correct_answer, knowledge_point, count=3)
    return result


# ===== 学生获取已发布作业列表 =====

@router.get("/published-assignments")
def get_published_assignments(authorization: str = Header(None)):
    """学生获取本班已发布的作业列表（下拉框选择用）"""
    student_id = get_student_id(authorization)

    with get_db() as db:
        # 获取学生班级
        student = db.execute(
            "SELECT class_id FROM users WHERE id=? AND role='student'",
            (student_id,),
        ).fetchone()
        if not student or not student["class_id"]:
            return {"assignments": []}

        class_id = student["class_id"]

        # 查询已发布作业
        rows = db.execute(
            """SELECT a.id, a.title, a.description, a.unit_code, a.due_date, a.created_at,
            a.questions_json
            FROM assignments a
            WHERE a.class_id=? AND a.status='published'
            ORDER BY a.created_at DESC""",
            (class_id,),
        ).fetchall()

        result = []
        for r in rows:
            d = dict(r)
            # 计算题目数量 + 解析题目列表（学生端选课题后直接展示）
            q_list = []
            q_count = 0
            if d.get("questions_json"):
                try:
                    q_list = json.loads(d["questions_json"])
                    q_count = len(q_list)
                except:
                    pass
            d["question_count"] = q_count
            d["questions"] = q_list  # 学生端作业卡片直接展示用
            # 检查该学生是否已提交
            sub = db.execute(
                "SELECT id, status, correct_count, total_questions FROM homework_submissions "
                "WHERE assignment_id=? AND student_id=? ORDER BY created_at DESC LIMIT 1",
                (d["id"], student_id),
            ).fetchone()
            if sub:
                d["submitted"] = True
                d["submission_status"] = sub["status"]
                d["correct_count"] = sub["correct_count"]
                d["total_questions"] = sub["total_questions"]
            else:
                d["submitted"] = False
                d["submission_status"] = "not_submitted"
            # 删除大字段（questions 已转 q_list）
            del d["questions_json"]
            result.append(d)

    return {"assignments": result}


# ===== 学生提交作业答案（老师已出题场景） =====


def _normalize_answer(s: str) -> str:
    """归一化字符串用于判等：去空格/全角转半角/小写"""
    if s is None:
        return ""
    s = str(s).strip().lower()
    s = s.replace(" ", "").replace("　", "")
    # 全角数字 → 半角
    trans = str.maketrans("０１２３４５６７８９", "0123456789")
    s = s.translate(trans)
    return s


def _is_equivalent(user_ans: str, correct_ans: str) -> bool:
    """数字等价判定：归一化后相等，或小数/分数等价值"""
    u = _normalize_answer(user_ans)
    c = _normalize_answer(correct_ans)
    if u == c:
        return True
    if not u or not c:
        return False
    # 数字等价
    try:
        return abs(float(u) - float(c)) < 1e-6
    except (ValueError, TypeError):
        pass
    # 分数形式
    try:
        def _to_float(s):
            if "/" in s:
                n, d = s.split("/", 1)
                return float(n) / float(d)
            return float(s)
        return abs(_to_float(u) - _to_float(c)) < 1e-6
    except Exception:
        pass
    return False


class AssignmentSubmitRequest(BaseModel):
    assignment_id: int
    answers: object  # str(JSON) 或 list


@router.post("/assignment-submit")
def submit_assignment_answer(req: AssignmentSubmitRequest, authorization: str = Header(None)):
    """学生提交老师已布置作业的文字答案（不走拍照批改）。
    逻辑：
      1. 校验 assignment 存在且属于该学生班级
      2. 比对每题答案，统计正确/总数
      3. 写入 homework_submissions（assignment_id 关联）
      4. 错题写入 error_notes
    """
    student_id = get_student_id(authorization)
    assignment_id = req.assignment_id
    # answers 字段可能是 str（前端 JSON.stringify）或 list
    raw = req.answers
    if isinstance(raw, str):
        try:
            answers_list = json.loads(raw)
        except Exception:
            raise HTTPException(400, "answers 字段格式错误")
    else:
        answers_list = raw or []

    if not isinstance(answers_list, list):
        raise HTTPException(400, "answers 必须是列表")

    with get_db() as db:
        # 校验作业
        a = db.execute(
            "SELECT id, class_id, title, questions_json FROM assignments WHERE id=? AND status='published'",
            (assignment_id,),
        ).fetchone()
        if not a:
            raise HTTPException(404, "作业不存在或未发布")
        # 学生必须在该班级
        stu = db.execute("SELECT class_id FROM users WHERE id=? AND role='student'", (student_id,)).fetchone()
        if not stu or stu["class_id"] != a["class_id"]:
            raise HTTPException(403, "该作业不属于你的班级")

        # 解析作业题目
        try:
            questions = json.loads(a["questions_json"]) if a["questions_json"] else []
        except Exception:
            questions = []

        # 判分
        correct = 0
        error_note_ids = []
        for idx, q in enumerate(questions):
            payload = next((p for p in answers_list if p.get("index") == (q.get("index") or idx + 1)), None)
            if not payload:
                # 也按顺序匹配兜底
                payload = answers_list[idx] if idx < len(answers_list) else None
            user_ans = (payload or {}).get("student_answer", "")
            ca = q.get("correct_answer", "")
            is_ok = _is_equivalent(user_ans, ca)
            if is_ok:
                correct += 1
            else:
                # 写错题
                cur = db.execute(
                    """INSERT INTO error_notes
                    (student_id, question_text, student_answer, correct_answer,
                     analysis, knowledge_point, source, status, error_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'unresolved', 'assignment')""",
                    (
                        student_id,
                        q.get("question_text", ""),
                        user_ans,
                        ca,
                        q.get("analysis", ""),
                        q.get("knowledge_point", ""),
                        f"assignment:{assignment_id}",
                    ),
                )
                error_note_ids.append(cur.lastrowid)

        total = len(questions)
        accuracy = round((correct / total) * 100, 1) if total > 0 else 0.0

        # 写 submission（assignment_id 关联，老师端能查到）
        sub = db.execute(
            """INSERT INTO homework_submissions
            (student_id, lesson_title, image_path, status, assignment_id,
             total_questions, correct_count, summary, completed_at)
            VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            (
                student_id,
                a["title"],
                "",
                assignment_id,
                total,
                correct,
                f"在线作答 正确 {correct}/{total}",
            ),
        )
        submission_id = sub.lastrowid

    return {
        "success": True,
        "submission_id": submission_id,
        "total_questions": total,
        "correct_count": correct,
        "accuracy": accuracy,
        "error_note_ids": error_note_ids,
        "error_count": len(error_note_ids),
    }
