"""学情分析 API 路由 — 聚合预习/作业/错题/考试数据 + 考试管理 + 分层周辅导方案"""

import json
import threading
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Header, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from database import get_db
from auth import get_user_from_token
from agents.llm import (
    ai_extract_homework_questions_from_image,
    ai_generate_tiered_weekly_plan,
    ai_analyze_class_common_errors,
)

router = APIRouter()

# ─── 异步考试图片识别任务（复用作业识别模式） ───
_exam_extract_tasks: dict = {}


def _verify_teacher(db, authorization: str):
    """验证教师身份并返回 teacher_id（使用 JWT token）"""
    payload = get_user_from_token(authorization or "")
    if not payload or payload.get("role") != "teacher":
        raise HTTPException(401, "无效教师身份")
    return payload["user_id"]


# ═══════════════════════════════════════════════════
# 1. 学情概览 — 聚合所有维度真实数据
# ═══════════════════════════════════════════════════

@router.get("/{class_id}/overview")
def analytics_overview(class_id: int, authorization: str = Header(None)):
    with get_db() as db:
        _verify_teacher(db, authorization)

        # ── 班级基本信息 ──
        class_info = db.execute("SELECT id, name FROM classes WHERE id=?", (class_id,)).fetchone()
        if not class_info:
            raise HTTPException(404, "班级不存在")

        # ── 学生列表（含分层和积分） ──
        students = db.execute("""
            SELECT u.id, u.name, u.layer, u.points,
                   COALESCE(u.student_no, '') as student_no
            FROM users u WHERE u.class_id=? AND u.role='student' AND u.status='active'
            ORDER BY u.name
        """, (class_id,)).fetchall()

        student_count = len(students)
        layer_dist = {"basic": 0, "advanced": 0, "extension": 0}
        for s in students:
            layer = s[2] or "basic"
            layer_dist[layer] = layer_dist.get(layer, 0) + 1

        # ── 预习统计 ──
        preview_count = db.execute("""
            SELECT COUNT(*) FROM preview_tasks WHERE class_id=? AND status='published'
        """, (class_id,)).fetchone()[0]

        preview_submission_count = db.execute("""
            SELECT COUNT(DISTINCT pa.student_id)
            FROM preview_answers pa
            JOIN preview_tasks pt ON pa.preview_task_id = pt.id
            WHERE pt.class_id=? AND pt.status='published'
        """, (class_id,)).fetchone()[0]

        preview_avg_accuracy = db.execute("""
            SELECT AVG(CAST(pa.is_correct AS FLOAT))
            FROM preview_answers pa
            JOIN preview_tasks pt ON pa.preview_task_id = pt.id
            WHERE pt.class_id=? AND pt.status='published' AND pa.is_correct IS NOT NULL
        """, (class_id,)).fetchone()[0]
        preview_avg_accuracy = round(preview_avg_accuracy * 100, 1) if preview_avg_accuracy else 0

        # ── 作业统计 ──
        assignment_count = db.execute("""
            SELECT COUNT(*) FROM assignments WHERE class_id=? AND status='published'
        """, (class_id,)).fetchone()[0]

        hw_submission_count = db.execute("""
            SELECT COUNT(*) FROM homework_submissions
            WHERE assignment_id IN (SELECT id FROM assignments WHERE class_id=? AND status='published')
            AND status='completed'
        """, (class_id,)).fetchone()[0]

        hw_avg_accuracy = db.execute("""
            SELECT AVG(CAST(hq.is_correct AS FLOAT))
            FROM homework_questions hq
            JOIN homework_submissions hs ON hq.submission_id = hs.id
            WHERE hs.assignment_id IN (SELECT id FROM assignments WHERE class_id=? AND status='published')
            AND hq.is_correct IS NOT NULL
        """, (class_id,)).fetchone()[0]
        hw_avg_accuracy = round(hw_avg_accuracy * 100, 1) if hw_avg_accuracy else 0

        # ── 错题统计 ──
        error_count = db.execute("""
            SELECT COUNT(*) FROM error_notes
            WHERE student_id IN (SELECT id FROM users WHERE class_id=? AND role='student')
        """, (class_id,)).fetchone()[0]

        error_unresolved = db.execute("""
            SELECT COUNT(*) FROM error_notes
            WHERE student_id IN (SELECT id FROM users WHERE class_id=? AND role='student')
            AND status='unresolved'
        """, (class_id,)).fetchone()[0]

        # ── 考试统计 ──
        exam_count = db.execute("SELECT COUNT(*) FROM exams WHERE class_id=?", (class_id,)).fetchone()[0]

        exam_avg = db.execute("""
            SELECT AVG(er.score) FROM exam_results er
            JOIN exams e ON er.exam_id = e.id
            WHERE e.class_id=? AND er.status='completed'
        """, (class_id,)).fetchone()[0]
        exam_avg = round(exam_avg, 1) if exam_avg else 0

        exam_pass_rate = db.execute("""
            SELECT CAST(SUM(CASE WHEN er.score >= 60 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*)
            FROM exam_results er
            JOIN exams e ON er.exam_id = e.id
            WHERE e.class_id=? AND er.status='completed'
        """, (class_id,)).fetchone()[0]
        exam_pass_rate = round(exam_pass_rate * 100, 1) if exam_pass_rate else 0

        exam_excellent_rate = db.execute("""
            SELECT CAST(SUM(CASE WHEN er.score >= 90 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*)
            FROM exam_results er
            JOIN exams e ON er.exam_id = e.id
            WHERE e.class_id=? AND er.status='completed'
        """, (class_id,)).fetchone()[0]
        exam_excellent_rate = round(exam_excellent_rate * 100, 1) if exam_excellent_rate else 0

        # ── 共性错题 Top 知识点 ──
        common_errors = db.execute("""
            SELECT hq.knowledge_point, COUNT(*) as cnt,
                   CAST(SUM(CASE WHEN hq.is_correct=0 THEN 1 ELSE 0 END) AS FLOAT)/COUNT(*) as error_rate
            FROM homework_questions hq
            JOIN homework_submissions hs ON hq.submission_id = hs.id
            JOIN assignments a ON hs.assignment_id = a.id
            WHERE a.class_id=? AND hq.knowledge_point IS NOT NULL AND hq.knowledge_point != ''
            GROUP BY hq.knowledge_point
            ORDER BY error_rate DESC, cnt DESC
            LIMIT 10
        """, (class_id,)).fetchall()

        # ── 学生详细数据 ──
        student_details = []
        for s in students:
            sid = s[0]
            sname = s[1]
            slayer = s[2] or "basic"
            spoints = s[3] or 0

            # 该学生预习提交数
            s_preview_done = db.execute("""
                SELECT COUNT(DISTINCT pa.preview_task_id) FROM preview_answers pa
                JOIN preview_tasks pt ON pa.preview_task_id = pt.id
                WHERE pt.class_id=? AND pa.student_id=?
            """, (class_id, sid)).fetchone()[0]

            # 该学生预习正确率
            s_preview_acc = db.execute("""
                SELECT AVG(CAST(pa.is_correct AS FLOAT))
                FROM preview_answers pa
                JOIN preview_tasks pt ON pa.preview_task_id = pt.id
                WHERE pt.class_id=? AND pa.student_id=? AND pa.is_correct IS NOT NULL
            """, (class_id, sid)).fetchone()[0]
            s_preview_acc = round(s_preview_acc * 100, 1) if s_preview_acc else 0

            # 该学生作业提交数
            s_hw_done = db.execute("""
                SELECT COUNT(*) FROM homework_submissions
                WHERE student_id=? AND assignment_id IN (SELECT id FROM assignments WHERE class_id=?)
                AND status='completed'
            """, (sid, class_id)).fetchone()[0]

            # 该学生作业正确率
            s_hw_acc = db.execute("""
                SELECT AVG(CAST(hq.is_correct AS FLOAT))
                FROM homework_questions hq
                JOIN homework_submissions hs ON hq.submission_id = hs.id
                WHERE hs.student_id=? AND hs.assignment_id IN (SELECT id FROM assignments WHERE class_id=?)
                AND hq.is_correct IS NOT NULL
            """, (sid, class_id)).fetchone()[0]
            s_hw_acc = round(s_hw_acc * 100, 1) if s_hw_acc else 0

            # 该学生最近考试成绩
            s_recent_exam = db.execute("""
                SELECT er.score, e.title FROM exam_results er
                JOIN exams e ON er.exam_id = e.id
                WHERE e.class_id=? AND er.student_id=? AND er.status='completed'
                ORDER BY er.created_at DESC LIMIT 1
            """, (class_id, sid)).fetchone()
            s_exam_score = round(s_recent_exam[0], 1) if s_recent_exam else None
            s_exam_title = s_recent_exam[1] if s_recent_exam else ""

            # 该学生错题数
            s_error_cnt = db.execute("""
                SELECT COUNT(*) FROM error_notes WHERE student_id=?
            """, (sid,)).fetchone()[0]

            # 该学生错题知识点
            s_weak_points = db.execute("""
                SELECT knowledge_point FROM error_notes
                WHERE student_id=? AND status='unresolved' AND knowledge_point IS NOT NULL AND knowledge_point != ''
                GROUP BY knowledge_point ORDER BY COUNT(*) DESC LIMIT 3
            """, (sid,)).fetchall()
            weak_list = [wp[0] for wp in s_weak_points] if s_weak_points else []

            # 综合掌握度：预习+作业+考试加权
            mastery = 0
            if s_preview_acc > 0 or s_hw_acc > 0 or s_exam_score is not None:
                weights = []
                vals = []
                if s_preview_acc > 0: weights.append(0.2); vals.append(s_preview_acc)
                if s_hw_acc > 0: weights.append(0.3); vals.append(s_hw_acc)
                if s_exam_score is not None: weights.append(0.5); vals.append(s_exam_score)
                total_w = sum(weights) or 1
                mastery = round(sum(v * w for v, w in zip(vals, weights)) / total_w, 1)

            student_details.append({
                "id": sid, "name": sname, "layer": slayer, "points": spoints,
                "preview_done": s_preview_done, "preview_accuracy": s_preview_acc,
                "hw_done": s_hw_done, "hw_accuracy": s_hw_acc,
                "exam_score": s_exam_score, "exam_title": s_exam_title,
                "error_count": s_error_cnt, "weak_points": weak_list,
                "mastery": mastery,
            })

        # ── 考试趋势 ──
        exam_trend = db.execute("""
            SELECT e.id, e.title, e.exam_date, AVG(er.score),
                   CAST(SUM(CASE WHEN er.score >= 60 THEN 1 ELSE 0 END) AS FLOAT)/COUNT(*) as pass_rate,
                   CAST(SUM(CASE WHEN er.score >= 90 THEN 1 ELSE 0 END) AS FLOAT)/COUNT(*) as excellent_rate,
                   COUNT(*) as total_students
            FROM exams e
            JOIN exam_results er ON er.exam_id = e.id
            WHERE e.class_id=? AND er.status='completed'
            GROUP BY e.id ORDER BY e.exam_date ASC
        """, (class_id,)).fetchall()

        trend_data = []
        for t in exam_trend:
            trend_data.append({
                "exam_id": t[0], "title": t[1], "date": str(t[2]) if t[2] else "",
                "avg_score": round(t[3], 1) if t[3] else 0,
                "pass_rate": round(t[4] * 100, 1) if t[4] else 0,
                "excellent_rate": round(t[5] * 100, 1) if t[5] else 0,
                "total": t[6],
            })

        return {
            "class_id": class_id,
            "class_name": class_info[1],
            "student_count": student_count,
            "layer_distribution": layer_dist,
            "preview": {
                "total_tasks": preview_count,
                "submission_count": preview_submission_count,
                "submission_rate": round(preview_submission_count / student_count * 100, 1) if student_count else 0,
                "avg_accuracy": preview_avg_accuracy,
            },
            "homework": {
                "total_assignments": assignment_count,
                "submission_count": hw_submission_count,
                "submission_rate": round(hw_submission_count / student_count * 100, 1) if student_count else 0,
                "avg_accuracy": hw_avg_accuracy,
            },
            "errors": {
                "total": error_count,
                "unresolved": error_unresolved,
                "resolved_rate": round((error_count - error_unresolved) / error_count * 100, 1) if error_count else 0,
            },
            "exams": {
                "total": exam_count,
                "avg_score": exam_avg,
                "pass_rate": exam_pass_rate,
                "excellent_rate": exam_excellent_rate,
            },
            "common_errors": [
                {"knowledge_point": ce[0], "count": ce[1], "error_rate": round(ce[2] * 100, 1)}
                for ce in common_errors
            ],
            "students": student_details,
            "exam_trend": trend_data,
        }


# ═══════════════════════════════════════════════════
# 2. AI 共性错题分析（深度）
# ═══════════════════════════════════════════════════

@router.post("/{class_id}/analyze-errors")
def analyze_class_errors(class_id: int, authorization: str = Header(None)):
    with get_db() as db:
        _verify_teacher(db, authorization)

        # 收集该班级所有错题
        errors = db.execute("""
            SELECT hq.knowledge_point, hq.question_text, hq.student_answer, hq.correct_answer,
                   hq.error_type, u.name
            FROM homework_questions hq
            JOIN homework_submissions hs ON hq.submission_id = hs.id
            JOIN assignments a ON hs.assignment_id = a.id
            JOIN users u ON hq.student_id = u.id
            WHERE a.class_id=? AND hq.is_correct=0 AND hq.knowledge_point IS NOT NULL AND hq.knowledge_point != ''
        """, (class_id,)).fetchall()

        # 补充 error_notes 中的错题
        en_errors = db.execute("""
            SELECT en.knowledge_point, en.question_text, en.student_answer, en.correct_answer,
                   en.error_type, u.name
            FROM error_notes en
            JOIN users u ON en.student_id = u.id
            WHERE u.class_id=? AND en.status='unresolved' AND en.knowledge_point IS NOT NULL AND en.knowledge_point != ''
        """, (class_id,)).fetchall()

        all_errors = [
            {"knowledge_point": e[0], "question": e[1], "student_answer": e[2],
             "correct_answer": e[3], "error_type": e[4] or "", "student_name": e[5]}
            for e in errors + en_errors
        ]

        if not all_errors:
            return {"analysis": {"summary": "暂无错题数据，无法分析", "weak_points": [], "suggestions": []}}

        result = ai_analyze_class_common_errors(all_errors)
        return {"analysis": result}


# ═══════════════════════════════════════════════════
# 3. 考试管理 — 创建考试 + 上传试卷图片识别 + 录入成绩
# ═══════════════════════════════════════════════════

class ExamCreateRequest(BaseModel):
    title: str
    description: str = ""
    unit_code: str = ""
    max_score: float = 100
    exam_date: Optional[str] = None

@router.post("/{class_id}/exam")
def create_exam(class_id: int, req: ExamCreateRequest, authorization: str = Header(None)):
    with get_db() as db:
        teacher_id = _verify_teacher(db, authorization)

        exam_date = req.exam_date or datetime.now().strftime("%Y-%m-%d")
        cursor = db.execute("""
            INSERT INTO exams (class_id, teacher_id, title, description, unit_code, max_score, exam_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (class_id, teacher_id, req.title, req.description, req.unit_code, req.max_score, exam_date))
        return {"id": cursor.lastrowid, "title": req.title}


@router.post("/{class_id}/exam-upload")
async def exam_upload_image(class_id: int, authorization: str = Header(None),
                             file: UploadFile = File(...)):
    """上传试卷图片，AI异步识别题目"""
    with get_db() as db:
        teacher_id = _verify_teacher(db, authorization)
    import base64, os
    from config import UPLOAD_DIR

    content = await file.read()
    filename = f"exam_{class_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{file.filename}"
    filepath = os.path.join(str(UPLOAD_DIR), filename)
    with open(filepath, "wb") as f:
        f.write(content)

    image_base64 = base64.b64encode(content).decode()

    task_id = f"exam_extract_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    _exam_extract_tasks[task_id] = {"status": "processing", "image_path": filepath}

    def _run():
        try:
            result = ai_extract_homework_questions_from_image(image_base64)
            _exam_extract_tasks[task_id] = {"status": "completed", "result": result, "image_path": filepath}
        except Exception as e:
            _exam_extract_tasks[task_id] = {"status": "failed", "error": str(e)}

    threading.Thread(target=_run, daemon=True).start()
    return {"task_id": task_id}


@router.get("/exam-extract-task/{task_id}")
def poll_exam_extract(task_id: str):
    task = _exam_extract_tasks.get(task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    return task


@router.get("/{class_id}/exams")
def list_exams(class_id: int, authorization: str = Header(None)):
    with get_db() as db:
        _verify_teacher(db, authorization)

        exams = db.execute("""
            SELECT e.id, e.title, e.description, e.unit_code, e.max_score, e.exam_date,
                   e.source_image, e.questions_json,
                   COUNT(er.id) as result_count,
                   AVG(er.score) as avg_score
            FROM exams e
            LEFT JOIN exam_results er ON er.exam_id = e.id AND er.status='completed'
            WHERE e.class_id=?
            GROUP BY e.id ORDER BY e.exam_date DESC
        """, (class_id,)).fetchall()

        return {
            "exams": [
                {
                    "id": e[0], "title": e[1], "description": e[2], "unit_code": e[3],
                    "max_score": e[4], "exam_date": str(e[5]) if e[5] else "",
                    "source_image": e[6], "questions_json": e[7],
                    "result_count": e[8], "avg_score": round(e[9], 1) if e[9] else None,
                }
                for e in exams
            ]
        }


class ExamScoreInput(BaseModel):
    student_id: int
    score: float
    correct_count: int = 0
    total_count: int = 0

@router.post("/{class_id}/exam/{exam_id}/scores")
def input_exam_scores(class_id: int, exam_id: int, scores: list[ExamScoreInput],
                      authorization: str = Header(None)):
    with get_db() as db:
        _verify_teacher(db, authorization)

        exam = db.execute("SELECT id, max_score FROM exams WHERE id=? AND class_id=?", (exam_id, class_id)).fetchone()
        if not exam:
            raise HTTPException(404, "考试不存在")

        inserted = 0
        for s in scores:
            existing = db.execute(
                "SELECT id FROM exam_results WHERE exam_id=? AND student_id=?",
                (exam_id, s.student_id)
            ).fetchone()
            if existing:
                db.execute("""
                    UPDATE exam_results SET score=?, correct_count=?, total_count=?, status='completed'
                    WHERE id=?
                """, (s.score, s.correct_count, s.total_count, existing[0]))
            else:
                db.execute("""
                    INSERT INTO exam_results (exam_id, student_id, score, correct_count, total_count, status)
                    VALUES (?, ?, ?, ?, ?, 'completed')
                """, (exam_id, s.student_id, s.score, s.correct_count, s.total_count))
            inserted += 1

        return {"exam_id": exam_id, "inserted": inserted}


@router.get("/{class_id}/exam/{exam_id}/scores")
def get_exam_scores(class_id: int, exam_id: int, authorization: str = Header(None)):
    with get_db() as db:
        _verify_teacher(db, authorization)

        results = db.execute("""
            SELECT er.id, er.student_id, u.name, u.student_no, er.score,
                   er.correct_count, er.total_count, er.status
            FROM exam_results er
            JOIN users u ON er.student_id = u.id
            WHERE er.exam_id=?
            ORDER BY er.score DESC
        """, (exam_id,)).fetchall()

        return {
            "scores": [
                {
                    "id": r[0], "student_id": r[1], "name": r[2], "student_no": r[3],
                    "score": r[4], "correct_count": r[5], "total_count": r[6], "status": r[7],
                }
                for r in results
            ]
        }


@router.delete("/{class_id}/exam/{exam_id}")
def delete_exam(class_id: int, exam_id: int, authorization: str = Header(None)):
    with get_db() as db:
        _verify_teacher(db, authorization)
        db.execute("DELETE FROM exam_results WHERE exam_id=?", (exam_id,))
        db.execute("DELETE FROM exams WHERE id=? AND class_id=?", (exam_id, class_id))
        return {"deleted": True}


# ═══════════════════════════════════════════════════
# 4. AI 分层周辅导方案生成
# ═══════════════════════════════════════════════════

class WeeklyPlanRequest(BaseModel):
    tier: str  # basic / advanced / extension

@router.post("/{class_id}/weekly-plan")
def generate_weekly_plan(class_id: int, req: WeeklyPlanRequest, authorization: str = Header(None)):
    with get_db() as db:
        _verify_teacher(db, authorization)

        if req.tier not in ("basic", "advanced", "extension"):
            raise HTTPException(400, "tier 必须为 basic/advanced/extension")

        class_info = db.execute("SELECT id, name FROM classes WHERE id=?", (class_id,)).fetchone()
        if not class_info:
            raise HTTPException(404, "班级不存在")

        # 获取该分层的薄弱知识点
        student_ids = db.execute("""
            SELECT id FROM users WHERE class_id=? AND role='student' AND layer=? AND status='active'
        """, (class_id, req.tier)).fetchall()
        sid_list = [s[0] for s in student_ids]

        weak_points = db.execute("""
            SELECT knowledge_point, COUNT(*) as cnt FROM error_notes
            WHERE student_id IN ({}) AND status='unresolved'
            AND knowledge_point IS NOT NULL AND knowledge_point != ''
            GROUP BY knowledge_point ORDER BY cnt DESC LIMIT 5
        """.format(",".join(str(sid) for sid in sid_list) if sid_list else "0")).fetchall()

        weak_list = [wp[0] for wp in weak_points] if weak_points else ["暂无明确薄弱点"]

        # 最近考试成绩
        recent_avg = db.execute("""
            SELECT AVG(er.score) FROM exam_results er
            JOIN exams e ON er.exam_id = e.id
            WHERE e.class_id=? AND er.student_id IN ({}) AND er.status='completed'
            ORDER BY e.exam_date DESC LIMIT 1
        """.format(",".join(str(sid) for sid in sid_list) if sid_list else "0"), (class_id,)).fetchone()[0]

        plan = ai_generate_tiered_weekly_plan(
            class_name=class_info[1],
            tier=req.tier,
            weak_areas=weak_list,
            recent_exam_score=round(recent_avg, 1) if recent_avg else None,
        )

        return {"tier": req.tier, "plan": plan}


# ═══════════════════════════════════════════════════
# 5. 每周自动调整学生分层
# ═══════════════════════════════════════════════════

@router.post("/{class_id}/auto-layer")
def weekly_auto_layer(class_id: int, authorization: str = Header(None)):
    """基于近期表现自动调整学生分层"""
    with get_db() as db:
        _verify_teacher(db, authorization)

        students = db.execute("""
            SELECT u.id, u.name, u.layer
            FROM users u WHERE u.class_id=? AND u.role='student' AND u.status='active'
        """, (class_id,)).fetchall()

        if not students:
            raise HTTPException(404, "班级无学生")

        # 计算每个学生的综合得分
        scores = []
        for s in students:
            sid = s[0]
            # 作业正确率
            hw_acc = db.execute("""
                SELECT AVG(CAST(hq.is_correct AS FLOAT))
                FROM homework_questions hq
                JOIN homework_submissions hs ON hq.submission_id = hs.id
                WHERE hs.student_id=? AND hq.is_correct IS NOT NULL
            """, (sid,)).fetchone()[0] or 0

            # 预习正确率
            pv_acc = db.execute("""
                SELECT AVG(CAST(pa.is_correct AS FLOAT))
                FROM preview_answers pa WHERE pa.student_id=? AND pa.is_correct IS NOT NULL
            """, (sid,)).fetchone()[0] or 0

            # 最近考试成绩
            exam_score = db.execute("""
                SELECT er.score FROM exam_results er
                JOIN exams e ON er.exam_id = e.id
                WHERE e.class_id=? AND er.student_id=? AND er.status='completed'
                ORDER BY e.exam_date DESC LIMIT 1
            """, (class_id, sid)).fetchone()
            exam_score = exam_score[0] if exam_score else 0

            # 综合加权: 作业30% + 预习20% + 考试50%
            composite = hw_acc * 30 + pv_acc * 20 + (exam_score / 100 if exam_score else 0) * 50
            scores.append((sid, s[1], s[2] or "basic", composite))

        # 按综合得分排序
        scores.sort(key=lambda x: x[3])

        total = len(scores)
        thresholds = {
            "basic": int(total * 0.3) if total >= 3 else 0,
            "extension": int(total * 0.3) if total >= 3 else 0,
        }

        adjustments = []
        for i, (sid, name, old_layer, comp) in enumerate(scores):
            if i < thresholds["basic"]:
                new_layer = "basic"
            elif i >= total - thresholds["extension"]:
                new_layer = "extension"
            else:
                new_layer = "advanced"

            if new_layer != old_layer:
                db.execute("UPDATE users SET layer=? WHERE id=?", (new_layer, sid))
                db.execute("""
                    INSERT INTO student_layer_history (student_id, class_id, old_layer, new_layer, reason)
                    VALUES (?, ?, ?, ?, 'AI每周自动调整')
                """, (sid, class_id, old_layer, new_layer))
                adjustments.append({"student_id": sid, "name": name, "old_layer": old_layer, "new_layer": new_layer, "composite_score": round(comp, 1)})
            else:
                adjustments.append({"student_id": sid, "name": name, "old_layer": old_layer, "new_layer": new_layer, "composite_score": round(comp, 1), "changed": False})

        return {"class_id": class_id, "total_students": total, "adjustments": adjustments}