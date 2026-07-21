"""教师端路由"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from database import get_db
from agents.teach import TeachAgent
from agents.evaluate import EvaluateAgent
from agents.research import ResearchAgent
from agents.manage import ManageAgent
from agents.cultivate import CultivateAgent
from agents.build import BuildAgent
from agents.llm import ai_generate_exercises_v2, _call_llm
import json
from datetime import datetime, timedelta

router = APIRouter()


@router.get("/dashboard")
def dashboard(teacher_id: int = None):
    """教师首页仪表盘数据 - 含真实班级统计、待批改、最近动态、作业/错题/闯关/商城综合数据"""
    with get_db() as db:
        # 班级统计
        if teacher_id:
            classes = db.execute(
                "SELECT c.*, (SELECT COUNT(*) FROM users u WHERE u.class_id=c.id AND u.role='student') as student_count FROM classes c WHERE c.teacher_id=?",
                (teacher_id,),
            ).fetchall()
        else:
            classes = db.execute(
                "SELECT c.*, (SELECT COUNT(*) FROM users u WHERE u.class_id=c.id AND u.role='student') as student_count FROM classes c"
            ).fetchall()

        class_list = []
        total_students = 0
        for c in classes:
            cd = dict(c)
            cd["student_count"] = cd.get("student_count", 0) or 0
            total_students += cd["student_count"]

            # 预习完成率
            task_count = db.execute(
                "SELECT COUNT(DISTINCT id) as c FROM preview_tasks WHERE class_id=?",
                (c["id"],),
            ).fetchone()
            student_count_val = cd["student_count"]
            answer_count = db.execute(
                "SELECT COUNT(*) as c FROM preview_answers pa JOIN preview_tasks pt ON pa.preview_task_id=pt.id WHERE pt.class_id=?",
                (c["id"],),
            ).fetchone()
            if task_count["c"] and student_count_val and student_count_val > 0:
                total_possible = task_count["c"] * student_count_val * 3
                cd["preview_rate"] = min(100, int((answer_count["c"] / max(1, total_possible)) * 100))
            else:
                cd["preview_rate"] = 0

            # 本周平均正确率
            week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
            total_answers_week = db.execute(
                "SELECT COUNT(*) as c FROM preview_answers WHERE preview_task_id IN (SELECT id FROM preview_tasks WHERE class_id=?) AND submitted_at >= ?",
                (c["id"], week_ago),
            ).fetchone()
            correct_week = db.execute(
                "SELECT COUNT(*) as c FROM preview_answers WHERE is_correct=1 AND preview_task_id IN (SELECT id FROM preview_tasks WHERE class_id=?) AND submitted_at >= ?",
                (c["id"], week_ago),
            ).fetchone()
            if total_answers_week["c"] > 0:
                cd["accuracy"] = round(correct_week["c"] / total_answers_week["c"] * 100, 1)
            else:
                cd["accuracy"] = 0

            # 真实趋势：上周 vs 本周对比
            two_weeks_ago = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d")
            prev_answers = db.execute(
                "SELECT COUNT(*) as c FROM preview_answers WHERE preview_task_id IN (SELECT id FROM preview_tasks WHERE class_id=?) AND submitted_at >= ? AND submitted_at < ?",
                (c["id"], two_weeks_ago, week_ago),
            ).fetchone()
            prev_correct = db.execute(
                "SELECT COUNT(*) as c FROM preview_answers WHERE is_correct=1 AND preview_task_id IN (SELECT id FROM preview_tasks WHERE class_id=?) AND submitted_at >= ? AND submitted_at < ?",
                (c["id"], two_weeks_ago, week_ago),
            ).fetchone()
            if prev_answers["c"] > 0:
                cd["accuracy_trend"] = round(prev_correct["c"] / prev_answers["c"] * 100, 1)
            else:
                cd["accuracy_trend"] = cd["accuracy"]  # 无历史数据时持平

            class_list.append(cd)

        # 综合待处理：预习答题 + 作业提交 + 商城兑换
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        pending_preview = db.execute(
            "SELECT COUNT(*) as c FROM preview_answers WHERE submitted_at >= ?",
            (week_ago,),
        ).fetchone()
        pending_homework = db.execute(
            "SELECT COUNT(*) as c FROM homework_submissions WHERE created_at >= ?",
            (week_ago,),
        ).fetchone()
        total_pending = (pending_preview["c"] if pending_preview else 0) + (pending_homework["c"] if pending_homework else 0)

        # 商城待处理兑换
        if teacher_id:
            class_ids = [c["id"] for c in class_list]
            if class_ids:
                placeholders = ",".join("?" * len(class_ids))
                pending_redemptions = db.execute(
                    f"SELECT COUNT(*) as c FROM redemptions WHERE class_id IN ({placeholders}) AND status='pending'",
                    class_ids,
                ).fetchone()
            else:
                pending_redemptions = {"c": 0}
        else:
            pending_redemptions = {"c": 0}

        # 错题本总数
        error_total = db.execute("SELECT COUNT(*) as c FROM error_notes").fetchone()
        # 本周新增错题
        error_week = db.execute(
            "SELECT COUNT(*) as c FROM error_notes WHERE created_at >= ?",
            (week_ago,),
        ).fetchone()

        # 创意闯关统计
        challenge_total = db.execute("SELECT COUNT(*) as c FROM challenge_sessions").fetchone()
        challenge_completed = db.execute(
            "SELECT COUNT(*) as c FROM challenge_sessions WHERE status='completed'",
        ).fetchone()

        # 作业统计
        homework_submitted = db.execute(
            "SELECT COUNT(*) as c FROM homework_submissions WHERE created_at >= ?",
            (week_ago,),
        ).fetchone()
        homework_questions = db.execute(
            "SELECT COUNT(*) as c FROM homework_questions WHERE is_correct=1 AND created_at >= ?",
            (week_ago,),
        ).fetchone()

        # 高频错题预警 - 从error_notes和preview_answers综合
        error_topics = db.execute(
            """SELECT q.unit_code, COUNT(*) as err_count
               FROM preview_answers pa
               JOIN preview_questions pq ON pa.preview_question_id=pq.id
               LEFT JOIN questions q ON q.content LIKE '%' || pq.knowledge_point || '%'
               WHERE pa.is_correct=0 AND pa.submitted_at >= ?
               GROUP BY q.unit_code
               ORDER BY err_count DESC LIMIT 5""",
            (week_ago,),
        ).fetchall()
        error_warnings = [{"unit": r["unit_code"] or "知识点", "count": r["err_count"]} for r in error_topics]

        # 最近动态
        recent = _get_recent_activities(db, teacher_id, class_list)

        # 题库总数
        questions = db.execute("SELECT COUNT(*) as c FROM questions").fetchone()

        # 学生分层分布
        layer_stats = {}
        if class_list:
            layer_basic = db.execute(
                "SELECT COUNT(*) as c FROM users WHERE role='student' AND layer='basic' AND class_id IN (SELECT id FROM classes WHERE teacher_id=?)",
                (teacher_id,) if teacher_id else (),
            ).fetchall() if teacher_id else db.execute("SELECT COUNT(*) as c FROM users WHERE role='student' AND layer='basic'").fetchall()
            # Simplified: just count layers across all teacher's classes
            layer_counts = db.execute(
                """SELECT layer, COUNT(*) as c FROM users WHERE role='student'
                   AND class_id IN (SELECT id FROM classes WHERE teacher_id=?)
                   GROUP BY layer""",
                (teacher_id,),
            ).fetchall() if teacher_id else db.execute(
                "SELECT layer, COUNT(*) as c FROM users WHERE role='student' GROUP BY layer"
            ).fetchall()
            for r in layer_counts:
                layer_stats[r["layer"]] = r["c"]

        return {
            "class_count": len(class_list),
            "student_count": total_students,
            "question_count": questions["c"],
            "pending_count": total_pending,
            "pending_redemptions": pending_redemptions["c"] if pending_redemptions else 0,
            "error_total": error_total["c"] if error_total else 0,
            "error_week": error_week["c"] if error_week else 0,
            "challenge_total": challenge_total["c"] if challenge_total else 0,
            "challenge_completed": challenge_completed["c"] if challenge_completed else 0,
            "homework_week": homework_submitted["c"] if homework_submitted else 0,
            "homework_correct": homework_questions["c"] if homework_questions else 0,
            "layer_stats": layer_stats,
            "classes": class_list,
            "error_warnings": error_warnings,
            "recent_activities": recent,
        }


def _get_recent_activities(db, teacher_id, class_list):
    """获取最近7天的活动时间线"""
    week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    activities = []

    # 新建预习任务
    if teacher_id:
        tasks = db.execute(
            "SELECT lesson_title, created_at FROM preview_tasks WHERE teacher_id=? AND created_at >= ? ORDER BY created_at DESC LIMIT 5",
            (teacher_id, week_ago),
        ).fetchall()
        for t in tasks:
            activities.append({
                "type": "preview",
                "icon": "BookOpen",
                "text": f"发布了预习任务：{t['lesson_title']}",
                "time": t["created_at"],
            })

    # 学生答题活跃度
    answers_recent = db.execute(
        "SELECT COUNT(*) as c FROM preview_answers WHERE submitted_at >= ?",
        (week_ago,),
    ).fetchone()
    if answers_recent["c"] > 0:
        activities.append({
            "type": "submission",
            "icon": "CheckCircle",
            "text": f"本周学生提交了 {answers_recent['c']} 次预习答题",
            "time": datetime.now().strftime("%Y-%m-%d"),
        })

    # 错题预警
    error_count = db.execute(
        "SELECT COUNT(*) as c FROM preview_answers WHERE is_correct=0 AND submitted_at >= ?",
        (week_ago,),
    ).fetchone()
    if error_count["c"] > 0:
        class_names = ", ".join([c.get("name", "") for c in class_list[:2] if c.get("name")])
        activities.append({
            "type": "warning",
            "icon": "AlertTriangle",
            "text": f"错题预警：本周共 {error_count['c']} 道错题{'，涉及' + class_names if class_names else ''}",
            "time": datetime.now().strftime("%Y-%m-%d %H:%M"),
        })

    # 最近保存的教学结果
    if teacher_id:
        saved = db.execute(
            "SELECT lesson_title, created_at FROM teach_results WHERE teacher_id=? ORDER BY created_at DESC LIMIT 3",
            (teacher_id,),
        ).fetchall()
        for s in saved:
            activities.append({
                "type": "teach",
                "icon": "FileText",
                "text": f"完成AI智能备课：{s['lesson_title']}",
                "time": s["created_at"],
            })

    # 作业提交动态
    hw_recent = db.execute(
        "SELECT COUNT(*) as c FROM homework_submissions WHERE created_at >= ?",
        (week_ago,),
    ).fetchone()
    if hw_recent and hw_recent["c"] > 0:
        activities.append({
            "type": "submission",
            "icon": "ClipboardCheck",
            "text": f"本周学生提交了 {hw_recent['c']} 份复习作业",
            "time": datetime.now().strftime("%Y-%m-%d"),
        })

    # 创意闯关动态
    challenge_recent = db.execute(
        "SELECT COUNT(*) as c FROM challenge_sessions WHERE created_at >= ?",
        (week_ago,),
    ).fetchone()
    if challenge_recent and challenge_recent["c"] > 0:
        activities.append({
            "type": "submission",
            "icon": "CheckCircle",
            "text": f"本周学生发起了 {challenge_recent['c']} 次创意闯关挑战",
            "time": datetime.now().strftime("%Y-%m-%d"),
        })

    # 商城兑换动态
    if class_list:
        class_ids = [c["id"] for c in class_list]
        placeholders = ",".join("?" * len(class_ids))
        redeem_recent = db.execute(
            f"SELECT si.name, r.student_id, r.created_at FROM redemptions r JOIN store_items si ON r.item_id=si.id WHERE r.class_id IN ({placeholders}) AND r.created_at >= ? ORDER BY r.created_at DESC LIMIT 3",
            class_ids + [week_ago],
        ).fetchall()
        for r in redeem_recent:
            student = db.execute("SELECT name FROM users WHERE id=?", (r["student_id"],)).fetchone()
            sname = student["name"] if student else "学生"
            activities.append({
                "type": "submission",
                "icon": "CheckCircle",
                "text": f"{sname} 兑换了「{r['name']}」",
                "time": str(r["created_at"]),
            })

    # 按时间排序，取最近8条
    activities.sort(key=lambda x: x["time"], reverse=True)
    return activities[:8]


@router.post("/teach")
def teach(lesson_topic: str = Form(...)):
    """教·课堂教学 - 输入课题，生成分层预习+课堂探究+板书设计"""
    agent = TeachAgent()
    result = agent.run(lesson_topic)
    return result


@router.post("/grade")
async def grade(file: UploadFile = File(...)):
    """评·学情评价 - 上传作业照片，OCR识别+AI批改"""
    contents = await file.read()
    agent = EvaluateAgent()
    result = agent.run(contents, file.filename)
    return result


@router.get("/class-report/{class_id}")
def class_report(class_id: int):
    """班级学情报告"""
    agent = EvaluateAgent()
    return agent.get_class_report(class_id)


@router.get("/student-report/{student_id}")
def student_report(student_id: int):
    """单人学情报告"""
    agent = EvaluateAgent()
    return agent.get_student_report(student_id)


@router.post("/research")
def research(unit_code: str = Form(...)):
    """研·教研备课"""
    agent = ResearchAgent()
    result = agent.run(unit_code)
    return result


@router.get("/class-management/{class_id}")
def class_management(class_id: int):
    """管·班级管理 - 学生分层名单+培优补差方案"""
    agent = ManageAgent()
    result = agent.run(class_id)
    return result


@router.post("/cultivate")
def cultivate(unit_code: str = Form(...)):
    """育·素养培育 - 生活化实践活动设计"""
    agent = CultivateAgent()
    result = agent.run(unit_code)
    return result


@router.post("/resource/build")
def resource_build(unit_code: str = Form(...)):
    """建·资源建设 - 整理结构化校本资源"""
    agent = BuildAgent()
    result = agent.run(unit_code)
    return result


@router.get("/resources")
def resources():
    """资源库列表"""
    with get_db() as db:
        rows = db.execute("SELECT * FROM resources ORDER BY created_at DESC").fetchall()
        return {"resources": [dict(r) for r in rows]}


@router.get("/questions")
def questions(unit_code: str = None, difficulty: str = None):
    """题库列表"""
    query = "SELECT * FROM questions"
    params = []
    conditions = []
    if unit_code:
        conditions.append("unit_code = ?")
        params.append(unit_code)
    if difficulty:
        conditions.append("difficulty = ?")
        params.append(difficulty)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY id"
    with get_db() as db:
        rows = db.execute(query, params).fetchall()
        return {"questions": [dict(r) for r in rows]}
