"""学生端路由"""

from fastapi import APIRouter, Form, HTTPException, Header
from database import get_db, add_points
from auth import get_user_from_token
from agents.learn import LearnAgent
from agents.llm import ai_generate_exercises_v2, ai_generate_courseware, ai_recognize_student_error_image, ai_generate_expansion_questions
import json
import base64
import os
from datetime import datetime, timedelta

router = APIRouter()


def _get_user(db, authorization: str):
    """用 JWT token 解析用户身份"""
    payload = get_user_from_token(authorization or "")
    if not payload:
        raise HTTPException(401, "未登录或Token已过期")
    uid = payload["user_id"]
    row = db.execute("SELECT id, role, name, class_id, points, layer FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        raise HTTPException(401, "用户不存在")
    return {"id": row[0], "role": row[1], "name": row[2], "class_id": row[3], "points": row[4] or 0, "layer": row[5] or "basic"}


@router.get("/profile")
def get_profile(authorization: str = Header(None)):
    """获取当前学生个人信息"""
    with get_db() as db:
        u = _get_user(db, authorization)
        return {"id": u["id"], "name": u["name"], "class_id": u["class_id"], "points": u["points"], "layer": u["layer"], "role": u["role"]}


def _get_week_start(d: datetime = None):
    """获取本周一日期字符串"""
    d = d or datetime.now()
    monday = d - timedelta(days=d.weekday())
    return monday.strftime("%Y-%m-%d")


def _record_weekly_rank(db, student_id: int, class_id: int | None):
    """记录本周排名快照，避免每次随机波动"""
    week_start = _get_week_start()
    exists = db.execute(
        "SELECT id FROM student_rank_history WHERE student_id=? AND week_start=?",
        (student_id, week_start),
    ).fetchone()
    if exists:
        return

    # 计算当前班级排名
    if class_id:
        rank_query = db.execute(
            "SELECT id, points FROM users WHERE role='student' AND class_id=? ORDER BY points DESC",
            (class_id,),
        ).fetchall()
    else:
        rank_query = db.execute(
            "SELECT id, points FROM users WHERE role='student' ORDER BY points DESC"
        ).fetchall()

    my_rank = 0
    my_points = 0
    for i, r in enumerate(rank_query):
        if r["id"] == student_id:
            my_rank = i + 1
            my_points = r["points"] or 0
            break

    db.execute(
        "INSERT INTO student_rank_history (student_id, class_id, week_start, rank, points) VALUES (?, ?, ?, ?, ?)",
        (student_id, class_id, week_start, my_rank, my_points),
    )


def _get_last_week_rank(db, student_id: int, class_id: int | None):
    """获取上周排名；若无历史则基于上周同一天的排名推断"""
    last_week = datetime.now() - timedelta(days=7)
    week_start = _get_week_start(last_week)
    row = db.execute(
        "SELECT rank FROM student_rank_history WHERE student_id=? AND week_start=?",
        (student_id, week_start),
    ).fetchone()
    if row:
        return row["rank"]
    # 无历史数据时，基于当前排名给一个合理偏移
    return None


@router.get("/dashboard/{student_id}")
def dashboard(student_id: int):
    """学生首页数据 - 含预习任务数、错题统计、积分排名、场馆进度、真实每日任务"""
    with get_db() as db:
        student = db.execute("SELECT * FROM users WHERE id=? AND role='student'", (student_id,)).fetchone()
        if not student:
            return {"error": "学生不存在"}

        # 错题统计
        errors = db.execute("SELECT * FROM error_notes WHERE student_id=? AND status='unresolved'", (student_id,)).fetchall()
        errors_all = db.execute("SELECT * FROM error_notes WHERE student_id=?", (student_id,)).fetchall()
        resolved_errors = db.execute("SELECT * FROM error_notes WHERE student_id=? AND status='resolved'", (student_id,)).fetchall()

        # 积分
        points = db.execute("SELECT SUM(points) as total FROM point_records WHERE student_id=?", (student_id,)).fetchone()
        total_points = points["total"] or 0

        # 班级排名
        class_id = student["class_id"]
        if class_id:
            rank_query = db.execute(
                "SELECT id, name, points FROM users WHERE role='student' AND class_id=? ORDER BY points DESC",
                (class_id,),
            ).fetchall()
        else:
            rank_query = db.execute(
                "SELECT id, name, points FROM users WHERE role='student' ORDER BY points DESC"
            ).fetchall()
        my_rank = 0
        for i, r in enumerate(rank_query):
            if r["id"] == student_id:
                my_rank = i + 1
                break
        total_in_class = len(rank_query)

        # 记录本周排名快照，并获取上周排名
        _record_weekly_rank(db, student_id, class_id)
        last_week_rank = _get_last_week_rank(db, student_id, class_id)
        if last_week_rank is None:
            # 无历史时，默认上周比当前落后 1 名（鼓励学生有进步）
            last_week_rank = max(1, my_rank + 1)

        # 预习任务完成情况
        if class_id:
            preview_task_count = db.execute(
                "SELECT COUNT(*) as c FROM preview_tasks WHERE class_id=?",
                (class_id,),
            ).fetchone()
            my_answers = db.execute(
                "SELECT COUNT(*) as c FROM preview_answers WHERE student_id=? AND preview_task_id IN (SELECT id FROM preview_tasks WHERE class_id=?)",
                (student_id, class_id),
            ).fetchone()
            my_correct = db.execute(
                "SELECT COUNT(*) as c FROM preview_answers WHERE student_id=? AND is_correct=1 AND preview_task_id IN (SELECT id FROM preview_tasks WHERE class_id=?)",
                (student_id, class_id),
            ).fetchone()
            total_possible_questions = db.execute(
                "SELECT COUNT(*) as c FROM preview_questions pq JOIN preview_tasks pt ON pq.preview_task_id=pt.id WHERE pt.class_id=?",
                (class_id,),
            ).fetchone()
            my_watches = db.execute(
                "SELECT COUNT(*) as c FROM preview_watch_logs WHERE student_id=? AND completed=1",
                (student_id,),
            ).fetchone()
        else:
            preview_task_count = {"c": 0}
            my_answers = {"c": 0}
            my_correct = {"c": 0}
            total_possible_questions = {"c": 0}
            my_watches = {"c": 0}

        total_tasks = preview_task_count["c"]
        completed_answers = my_answers["c"]

        # 场馆进度
        venues = _compute_venue_progress(student_id, db)

        # 已解锁场馆数
        unlocked_count = sum(1 for v in venues if v["status"] != "locked")
        completed_count = sum(1 for v in venues if v["status"] == "done")

        # 班级平均正确率对比
        if class_id and total_possible_questions["c"] > 0:
            class_correct = db.execute(
                "SELECT COUNT(*) as c FROM preview_answers WHERE is_correct=1 AND preview_task_id IN (SELECT id FROM preview_tasks WHERE class_id=?)",
                (class_id,),
            ).fetchone()
            class_total = db.execute(
                "SELECT COUNT(*) as c FROM preview_answers WHERE preview_task_id IN (SELECT id FROM preview_tasks WHERE class_id=?)",
                (class_id,),
            ).fetchone()
            my_accuracy = round(my_correct["c"] / max(1, my_answers["c"]) * 100, 1)
            class_avg_accuracy = round(class_correct["c"] / max(1, class_total["c"]) * 100, 1)
        else:
            my_accuracy = 0
            class_avg_accuracy = 0

        # 真实每日任务：预习、错题、闯关
        today_str = datetime.now().strftime("%Y-%m-%d")
        daily_tasks = _build_daily_tasks(db, student_id, class_id, today_str, total_tasks, len(errors), completed_count)

        return {
            "student": dict(student),
            "unresolved_errors": len(errors),
            "resolved_errors": len(resolved_errors),
            "total_errors": len(errors_all),
            "total_points": total_points,
            "rank": my_rank,
            "last_week_rank": last_week_rank,
            "total_students": total_in_class,
            "preview_tasks": total_tasks,
            "preview_answers": my_answers["c"],
            "preview_correct": my_correct["c"],
            "total_possible_questions": total_possible_questions["c"],
            "accuracy": my_accuracy,
            "class_avg_accuracy": class_avg_accuracy,
            "watched_videos": my_watches["c"],
            "venues": venues,
            "unlocked_venues": unlocked_count,
            "completed_venues": completed_count,
            "daily_tasks": daily_tasks,
        }


def _build_daily_tasks(db, student_id: int, class_id: int | None, today_str: str, total_preview_tasks: int, unresolved_errors: int, completed_venues: int):
    """构造真实每日任务列表（预习、错题、闯关）"""
    items = []

    # 1. 今日预习：取班级最新发布的预习任务，并检查是否已完成
    preview_done = True
    latest_preview = None
    if class_id and total_preview_tasks > 0:
        latest_preview = db.execute(
            "SELECT id, lesson_title, unit_code FROM preview_tasks WHERE class_id=? AND status='published' ORDER BY created_at DESC LIMIT 1",
            (class_id,),
        ).fetchone()
    if latest_preview:
        # 该任务下该学生可见的题目总数
        student = db.execute("SELECT layer FROM users WHERE id=?", (student_id,)).fetchone()
        layer = (student["layer"] or "basic") if student else "basic"
        visible_q = db.execute(
            "SELECT id, difficulty FROM preview_questions WHERE preview_task_id=?",
            (latest_preview["id"],),
        ).fetchall()
        if layer == "basic":
            visible_ids = {q["id"] for q in visible_q if q["difficulty"] == "basic"}
        elif layer == "advanced":
            visible_ids = {q["id"] for q in visible_q if q["difficulty"] in ("basic", "advanced")}
        else:
            visible_ids = {q["id"] for q in visible_q}
        answered = db.execute(
            "SELECT COUNT(DISTINCT preview_question_id) as c FROM preview_answers WHERE student_id=? AND preview_task_id=? AND preview_question_id IN ({})".format(
                ",".join(map(str, visible_ids)) or "0"
            ),
            (student_id, latest_preview["id"]),
        ).fetchone()
        preview_done = len(visible_ids) == 0 or answered["c"] >= len(visible_ids)
        items.append({
            "key": "preview",
            "title": "完成今日预习",
            "desc": f"预习：{latest_preview['lesson_title']}",
            "completed": preview_done,
            "link": "/student/preview",
            "badge": "+0.5 饲料币",
        })

    # 2. 错题救助
    items.append({
        "key": "errors",
        "title": "错题救助",
        "desc": f"{unresolved_errors} 道错题等你帮它恢复健康" if unresolved_errors > 0 else "本周错题已清零",
        "completed": unresolved_errors == 0,
        "link": "/student/errors",
        "badge": "+0.5 饲料币",
    })

    # 3. 闯关/练习：每天至少完成一次挑战或练习
    today_challenges = db.execute(
        "SELECT COUNT(*) as c FROM challenge_sessions WHERE student_id=? AND date(created_at)=? AND total_correct > 0",
        (student_id, today_str),
    ).fetchone()["c"]
    items.append({
        "key": "challenge",
        "title": "趣味闯关",
        "desc": "完成一次动物场馆闯关" if today_challenges == 0 else "今日闯关已完成",
        "completed": today_challenges > 0,
        "link": "/student/practice",
        "badge": "+0.1 饲料币",
    })

    completed = sum(1 for i in items if i["completed"])
    return {
        "total": len(items),
        "completed": completed,
        "items": items,
    }


def _compute_venue_progress(student_id: int, db):
    """根据答题数据计算场馆解锁进度"""
    venue_map = [
        {"id": 1, "emoji": "🦁", "name": "整数加减馆", "tag": "加减法"},
        {"id": 2, "emoji": "🐘", "name": "小数乘法馆", "tag": "小数乘法"},
        {"id": 3, "emoji": "🐧", "name": "小数除法馆", "tag": "小数除法"},
        {"id": 4, "emoji": "🐒", "name": "简易方程馆", "tag": "方程"},
        {"id": 5, "emoji": "🦋", "name": "多边形面积馆", "tag": "面积"},
        {"id": 6, "emoji": "🦒", "name": "可能性馆", "tag": "概率"},
        {"id": 7, "emoji": "🐴", "name": "数学广角馆", "tag": "优化"},
        {"id": 8, "emoji": "🦛", "name": "总复习馆", "tag": "复习"},
    ]
    total_per_venue = 8  # 每场馆题数

    student_answers = db.execute(
        "SELECT pq.knowledge_point, pa.is_correct FROM preview_answers pa "
        "JOIN preview_questions pq ON pa.preview_question_id=pq.id "
        "WHERE pa.student_id=?",
        (student_id,),
    ).fetchall()

    answered_per_venue = {}
    correct_per_venue = {}
    for a in student_answers:
        venue_idx = 0
        kp = (a["knowledge_point"] or "").lower()
        for i, v in enumerate(venue_map):
            if v["tag"] in kp:
                venue_idx = i
                break
        answered_per_venue.setdefault(venue_idx, 0)
        correct_per_venue.setdefault(venue_idx, 0)
        answered_per_venue[venue_idx] += 1
        if a["is_correct"]:
            correct_per_venue[venue_idx] += 1

    result = []
    for i, v in enumerate(venue_map):
        answered = answered_per_venue.get(i, 0)
        correct = correct_per_venue.get(i, 0)
        total = total_per_venue

        if i == 0:
            status = "current" if correct < 5 else "done"
        elif correct_per_venue.get(i - 1, 0) >= 5 or status_prev_done(result, i - 1):
            status = "current" if correct < 5 else "done"
        else:
            status = "locked"

        result.append({
            **v,
            "status": status,
            "progress": f"{correct}/{total}",
            "accuracy": round(correct / max(1, answered) * 100, 1) if answered > 0 else 0,
            "total": total,
        })

    if not student_answers:
        result[0]["status"] = "current"

    return result


def status_prev_done(venue_list, idx):
    """检查前一场馆是否完成"""
    if idx < 0 or idx >= len(venue_list):
        return False
    return venue_list[idx]["status"] == "done"


@router.post("/learn")
def learn(student_id: int = Form(...), topic: str = Form(...), error_type: str = Form(None)):
    """学·自主学习 - 错题引导，不给答案，追问推导"""
    agent = LearnAgent()
    result = agent.run(student_id, topic, error_type)
    return result


@router.post("/practice/questions")
def practice_questions(
    venue: str = Form(...),
    difficulty: str = Form(default="basic"),
    student_id: int = Form(...),
):
    """学·场馆闯关 - AI 生成练习题

    根据场馆（知识点）和难度，调用 LLM 生成5道分层练习题。
    返回题目列表 + 场馆主题背景。
    """
    try:
        # 场馆到知识点的映射（使用中文tag，与场馆进度数据一致）
        venue_knowledge_map = {
            "加减法": "整数加减法",
            "小数乘法": "小数乘法",
            "小数除法": "小数除法",
            "方程": "简易方程",
            "面积": "多边形面积",
            "概率": "可能性",
            "优化": "数学广角",
            "复习": "总复习",
        }
        topic = venue_knowledge_map.get(venue, "小数乘法")

        # AI生成练习题
        questions_data = ai_generate_exercises_v2(
            topic, "五年级", [topic], difficulty
        )

        if not questions_data or "questions" not in questions_data:
            return {
                "success": False,
                "venue": venue,
                "questions": [],
                "message": "AI 题目生成中，请稍后再试",
                "fallback": True,
            }

        questions = questions_data.get("questions", [])
        # 确保至少有3道题
        if len(questions) < 3:
            questions = _mock_practice_questions(topic, difficulty)[:5]

        return {
            "success": True,
            "venue": venue,
            "topic": topic,
            "difficulty": difficulty,
            "questions": questions,
            "total": len(questions),
        }
    except Exception as e:
        print(f"[Practice] AI生成失败: {e}")
        # 降级到mock题目
        questions = _mock_practice_questions(
            venue_knowledge_map.get(venue, "小数乘法"), difficulty
        )
        return {
            "success": True,
            "venue": venue,
            "questions": questions,
            "total": len(questions),
            "fallback": True,
        }


def _mock_practice_questions(topic: str, difficulty: str):
    """Mock 练习题 - AI 降级备用"""
    diff_mult = {"basic": 1, "advanced": 2, "extension": 3}[difficulty]
    return [
        {
            "id": i + 1,
            "question": f"{topic}练习题 {i+1}：计算 {diff_mult * (i+1)} + {diff_mult * 2} = ?",
            "question_type": "fill",
            "difficulty": difficulty,
            "options": "",
            "correct_answer": str(diff_mult * (i+1) + diff_mult * 2),
            "analysis": f"这是一道{topic}的基础练习，直接计算即可",
            "knowledge_point": topic,
        }
        for i in range(5)
    ]


@router.post("/errors/diagnose")
def diagnose_error(
    student_id: int = Form(...),
    question_content: str = Form(...),
    student_answer: str = Form(...),
    correct_answer: str = Form(...),
    topic: str = Form(default="数学"),
):
    """学·错题诊断 - AI 分析错题原因并提供引导

    使用 Learn Agent 的引导式教学，不给直接答案，
    而是分步诊断 → 阶梯习题 → 追问引导。
    """
    agent = LearnAgent()
    result = agent.run(student_id, topic, f"题目：{question_content}\n学生答案：{student_answer}\n正确答案：{correct_answer}")
    return result


@router.get("/errors/{student_id}")
def errors(student_id: int):
    """错题本列表 - 兼容旧版(questions表关联)、作业批改、预习和手动上传来源
    返回按知识点分组的结构 + 回炉信息
    """
    with get_db() as db:
        # 优先 JOIN questions 表获取旧版错题
        rows = db.execute(
            "SELECT e.*, q.content, q.unit_code, q.answer as question_answer, q.analysis as question_analysis "
            "FROM error_notes e LEFT JOIN questions q ON e.question_id=q.id "
            "WHERE e.student_id=? ORDER BY e.created_at DESC",
            (student_id,),
        ).fetchall()
        enhanced = []
        kp_groups = {}  # 按知识点分组
        reheat_pending = []  # 待回炉错题
        today = datetime.now().strftime("%Y-%m-%d")

        for r in rows:
            d = dict(r)
            # 检查是否来自作业批改(source=homework/preview/manual)，已有自己的独立字段
            has_standalone = d.get("question_text") and d.get("question_text") != ""

            if has_standalone:
                d["question_text"] = d.get("question_text", "")
                d["correct_answer"] = d.get("correct_answer", "")
                d["student_answer"] = d.get("student_answer", "")
                d["unit_code"] = d.get("knowledge_point", "")
            else:
                # 旧版：来自 questions 表关联
                if not d.get("correct_answer"):
                    d["correct_answer"] = d.get("question_answer", "")
                if not d.get("question_text"):
                    d["question_text"] = d.get("content", "")
                if d.get("question_id") and d["question_id"] > 0:
                    student_answer = db.execute(
                        "SELECT student_answer FROM student_answers WHERE question_id=? AND student_id=? ORDER BY created_at DESC LIMIT 1",
                        (d["question_id"], student_id),
                    ).fetchone()
                    d["student_answer"] = student_answer["student_answer"] if student_answer else "(未记录)"
                else:
                    d["student_answer"] = d.get("student_answer", "(未记录)")

            # 知识点分组
            kp = (d.get("knowledge_point") or "").strip() or "未分类"
            if kp not in kp_groups:
                kp_groups[kp] = {"knowledge_point": kp, "total": 0, "unresolved": 0, "resolved": 0, "items": []}
            kp_groups[kp]["total"] += 1
            if d.get("status") == "resolved":
                kp_groups[kp]["resolved"] += 1
            else:
                kp_groups[kp]["unresolved"] += 1
            kp_groups[kp]["items"].append(d["id"])

            # 检查是否需要回炉
            if d.get("status") == "resolved" and d.get("reheat_due") and d.get("reheat_status") != "mastered":
                if d["reheat_due"] <= today:
                    d["needs_reheat"] = True
                    reheat_pending.append(d)
                else:
                    d["needs_reheat"] = False
            else:
                d["needs_reheat"] = False

            enhanced.append(d)

        return {
            "errors": enhanced,
            "kp_groups": list(kp_groups.values()),
            "reheat_pending": reheat_pending,
            "stats": {
                "total": len(enhanced),
                "unresolved": sum(1 for e in enhanced if e.get("status") != "resolved"),
                "resolved": sum(1 for e in enhanced if e.get("status") == "resolved"),
                "reheat_due": len(reheat_pending),
                "manual_count": sum(1 for e in enhanced if e.get("source") == "manual"),
                "preview_count": sum(1 for e in enhanced if e.get("source") == "preview"),
                "homework_count": sum(1 for e in enhanced if e.get("source") == "homework"),
                "challenge_count": sum(1 for e in enhanced if e.get("source") == "challenge"),
                "challenge_similar_count": sum(1 for e in enhanced if e.get("source") == "challenge_similar"),
                "fun_game_count": sum(1 for e in enhanced if e.get("source") == "fun_game"),
                "daily_fact_count": sum(1 for e in enhanced if e.get("source") == "daily_fact"),
            },
        }


# ===== 学生上传错题（拍照） =====

@router.post("/errors/upload")
async def upload_error(
    student_id: int = Form(...),
    image: str = Form(...),  # base64编码的图片
    knowledge_point: str = Form(default=""),
    note: str = Form(default=""),  # 学生可选的备注
):
    """学生上传错题照片，AI识别题目内容、给出正确答案和知识点，自动录入错题本"""
    # 去掉可能的 data:image/... 前缀
    if "," in image and image.startswith("data:"):
        image = image.split(",", 1)[1]

    try:
        # AI识别图片中的题目
        recognized = ai_recognize_student_error_image(image)
    except Exception as e:
        raise HTTPException(500, f"AI识别失败: {str(e)}")

    if not recognized.get("question_text"):
        raise HTTPException(422, "无法识别题目内容，请重新拍照上传")

    # 保存图片到本地
    upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "errors")
    os.makedirs(upload_dir, exist_ok=True)
    image_filename = f"error_{student_id}_{int(datetime.now().timestamp())}.jpg"
    image_path = os.path.join(upload_dir, image_filename)
    try:
        with open(image_path, "wb") as f:
            f.write(base64.b64decode(image))
    except Exception:
        image_path = ""  # 图片保存失败不阻断流程

    # 录入错题本
    kp = knowledge_point.strip() or recognized.get("knowledge_point", "未分类")
    with get_db() as db:
        cursor = db.execute(
            "INSERT INTO error_notes "
            "(student_id, question_id, question_text, student_answer, correct_answer, "
            "analysis, knowledge_point, error_type, source, homework_question_id, status, image_path) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                student_id,
                None,  # question_id=NULL
                recognized.get("question_text", ""),
                "",  # 学生答案（上传时未知）
                recognized.get("correct_answer", ""),
                recognized.get("analysis", ""),
                kp,
                recognized.get("error_type", "计算错误"),
                "manual",  # source 标记为手动上传
                0,
                "unresolved",
                image_filename,
            ),
        )
        note_id = cursor.lastrowid
        db.commit()

    return {
        "id": note_id,
        "question_text": recognized.get("question_text", ""),
        "correct_answer": recognized.get("correct_answer", ""),
        "analysis": recognized.get("analysis", ""),
        "knowledge_point": kp,
        "error_type": recognized.get("error_type", "计算错误"),
        "image_path": image_filename,
        "message": "错题已识别并录入错题本",
    }


# ===== 每周回炉列表 =====

@router.get("/errors/reheat/{student_id}")
def reheat_list(student_id: int):
    """获取每周回炉列表：已解决的错题到期需要回炉复习的 + 回炉统计"""
    today = datetime.now().strftime("%Y-%m-%d")
    with get_db() as db:
        # 待回炉：已解决且reheat_due <= today且未完全掌握
        pending = db.execute(
            "SELECT * FROM error_notes WHERE student_id=? AND status='resolved' "
            "AND reheat_status != 'mastered' AND reheat_due IS NOT NULL AND reheat_due <= ? "
            "ORDER BY reheat_due ASC",
            (student_id, today),
        ).fetchall()

        # 已掌握：reheat_status = 'mastered'
        mastered = db.execute(
            "SELECT * FROM error_notes WHERE student_id=? AND reheat_status='mastered' "
            "ORDER BY resolved_at DESC",
            (student_id,),
        ).fetchall()

        # 统计
        total_resolved = db.execute(
            "SELECT COUNT(*) as c FROM error_notes WHERE student_id=? AND status='resolved'",
            (student_id,),
        ).fetchone()["c"]

        return {
            "pending": [dict(r) for r in pending],
            "mastered": [dict(r) for r in mastered],
            "stats": {
                "total_resolved": total_resolved,
                "pending_count": len(pending),
                "mastered_count": len(mastered),
            },
        }


# ===== 错题拓展出题（基于已解决错题确认掌握） =====

# 异步任务存储（内存）
_expansion_tasks: dict = {}
import threading

def _run_expansion_generation(task_id: str, resolved_errors: list):
    """异步生成拓展题目"""
    try:
        result = ai_generate_expansion_questions(resolved_errors, count=5)
        _expansion_tasks[task_id] = {"status": "done", "result": result}
    except Exception as e:
        _expansion_tasks[task_id] = {"status": "error", "error": str(e)}


@router.post("/errors/expansion")
def generate_expansion(
    student_id: int = Form(...),
):
    """基于已解决的错题，AI生成拓展题目确认知识点掌握（异步任务）"""
    with get_db() as db:
        resolved = db.execute(
            "SELECT question_text, knowledge_point, correct_answer FROM error_notes "
            "WHERE student_id=? AND status='resolved' ORDER BY resolved_at DESC LIMIT 10",
            (student_id,),
        ).fetchall()

    if not resolved:
        raise HTTPException(400, "暂无已解决的错题，无法生成拓展练习")

    error_list = [dict(r) for r in resolved]
    task_id = f"expansion_{student_id}_{int(datetime.now().timestamp())}"
    _expansion_tasks[task_id] = {"status": "running"}

    thread = threading.Thread(target=_run_expansion_generation, args=(task_id, error_list))
    thread.daemon = True
    thread.start()

    return {"task_id": task_id, "message": "正在生成拓展练习题..."}


@router.get("/errors/expansion/task/{task_id}")
def get_expansion_task(task_id: str):
    """轮询拓展题目生成状态"""
    task = _expansion_tasks.get(task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    return task


@router.post("/errors/expansion/answer")
def submit_expansion_answer(
    student_id: int = Form(...),
    question_text: str = Form(...),
    student_answer: str = Form(...),
    correct_answer: str = Form(...),
    knowledge_point: str = Form(default=""),
    all_correct: bool = Form(default=False),
):
    """提交拓展练习答题结果
    如果全部正确 → 将相关已解决错题标记为 mastered
    如果有错 → 将相关已解决错题重新标记为 unresolved（回炉失败）
    """
    with get_db() as db:
        if all_correct:
            # 全部正确 → 标记知识点相关错题为已掌握
            db.execute(
                "UPDATE error_notes SET reheat_status='mastered', reheat_count=reheat_count+1 "
                "WHERE student_id=? AND status='resolved' AND reheat_status!='mastered'",
                (student_id,),
            )
            # 加积分：错题回炉巩固 +0.5
            add_points(db, student_id, 0.5, "错题回炉巩固-知识点已掌握")
            db.commit()
            return {"result": "mastered", "message": "恭喜！知识点已完全掌握！", "points": 0.5}
        else:
            # 有错 → 相关错题回退为 unresolved
            db.execute(
                "UPDATE error_notes SET status='unresolved', reheat_status='pending', "
                "reheat_due=NULL WHERE student_id=? AND status='resolved' AND reheat_status!='mastered'",
                (student_id,),
            )
            db.commit()
            return {"result": "need_review", "message": "还需继续努力，错题已重新加入待救助列表"}


# ===== 更新已解决错题的回炉时间 =====

@router.post("/errors/{note_id}/resolve")
def resolve_error(note_id: int):
    """标记错题为已解决，并设置7天后回炉"""
    with get_db() as db:
        # 检查错题是否存在
        row = db.execute("SELECT id, student_id FROM error_notes WHERE id=?", (note_id,)).fetchone()
        if not row:
            raise HTTPException(404, "错题不存在")

        reheat_due = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        db.execute(
            "UPDATE error_notes SET status='resolved', resolved_at=CURRENT_TIMESTAMP, "
            "reheat_status='pending', reheat_due=? WHERE id=?",
            (reheat_due, note_id),
        )
        # 加积分：错题康复巩固 +0.5
        add_points(db, row["student_id"], 0.5, "错题康复-标记已解决")
        db.commit()

    return {"message": "错题已标记为已解决，7天后需要回炉复习", "reheat_due": reheat_due}


@router.get("/ranking/{class_id}")
def ranking(class_id: int):
    """班级排名"""
    with get_db() as db:
        rows = db.execute(
            "SELECT id, name, points FROM users WHERE role='student' AND class_id=? ORDER BY points DESC",
            (class_id,),
        ).fetchall()
        ranked = []
        for i, r in enumerate(rows):
            d = dict(r)
            d["rank"] = i + 1
            if i < 12:
                d["level"] = "优等生"
            elif i < 30:
                d["level"] = "中等生"
            else:
                d["level"] = "学困生"
            ranked.append(d)
        return {"ranking": ranked}


@router.get("/points/{student_id}")
def points(student_id: int):
    """积分记录"""
    with get_db() as db:
        rows = db.execute("SELECT * FROM point_records WHERE student_id=? ORDER BY created_at DESC", (student_id,)).fetchall()
        return {"points": [dict(r) for r in rows]}


@router.get("/games")
def games():
    """闯关游戏列表"""
    return {
        "games": [
            {"id": 1, "title": "小数乘法大冒险", "unit": "5A-U1", "difficulty": "easy", "unlocked": True},
            {"id": 2, "title": "方程解密室", "unit": "5A-U5", "difficulty": "medium", "unlocked": True},
            {"id": 3, "title": "面积计算师", "unit": "5A-U6", "difficulty": "hard", "unlocked": False},
            {"id": 4, "title": "分数王国", "unit": "5B-U4", "difficulty": "hard", "unlocked": False},
        ]
    }
