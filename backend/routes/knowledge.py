"""个人知识图谱 + 班级共性错题路由

知识图谱基于人教版五上完整课程目录构建，
叠加学生真实学习数据计算掌握状态。
"""

import json
import base64
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Form, UploadFile, File, Header, Query
from database import get_db
from auth import get_user_from_token
from agents.llm import ai_generate_knowledge_graph, ai_analyze_class_common_errors, ai_ocr_question
from curriculum import KNOWLEDGE_TREE, get_all_knowledge_points, match_knowledge_point

router = APIRouter()


# ===== 学生知识图谱（基于课程树 + 学生数据） =====

@router.get("/student/{student_id}")
def student_knowledge_graph(student_id: int):
    """获取学生个人知识图谱数据——基于人教版五上完整课程目录"""
    with get_db() as db:
        # 学生信息
        student = db.execute("SELECT name, points, layer FROM users WHERE id=?", (student_id,)).fetchone()
        if not student:
            raise HTTPException(404, "学生不存在")

        # 收集各维度数据
        # 1. 错题数据
        errors = db.execute(
            "SELECT knowledge_point, knowledge_gap, question_text, source, status FROM error_notes WHERE student_id=? ORDER BY created_at DESC LIMIT 100",
            (student_id,),
        ).fetchall()
        error_list = [dict(r) for r in errors]

        # 2. 预习答题数据
        preview_answers = db.execute(
            """SELECT pq.knowledge_point, pq.question_text, pt.lesson_code, pa.is_correct
               FROM preview_answers pa
               JOIN preview_questions pq ON pa.preview_question_id=pq.id
               JOIN preview_tasks pt ON pq.preview_task_id=pt.id
               WHERE pa.student_id=? ORDER BY pa.submitted_at DESC LIMIT 50""",
            (student_id,),
        ).fetchall()
        preview_list = [dict(r) for r in preview_answers]

        # 3. 作业批改数据
        hw_questions = db.execute(
            "SELECT question_text, knowledge_point, is_correct FROM homework_questions WHERE student_id=? ORDER BY created_at DESC LIMIT 30",
            (student_id,),
        ).fetchall()
        hw_list = [dict(r) for r in hw_questions]

        # 4. 闯关答题数据
        challenges = db.execute(
            "SELECT questions_json, total_correct, total_questions, unit_code, lesson_code FROM challenge_sessions WHERE student_id=? AND status='completed' ORDER BY created_at DESC LIMIT 10",
            (student_id,),
        ).fetchall()
        challenge_list = [dict(r) for r in challenges]

        # 5. 随机考察数据
        random_challenges = db.execute(
            "SELECT questions_json, correct_count, total_questions FROM random_challenges WHERE student_id=? AND status='completed' ORDER BY created_at DESC LIMIT 5",
            (student_id,),
        ).fetchall()
        random_list = [dict(r) for r in random_challenges]

        # 6. 预习观看记录（标记哪些课时已经接触过）
        watch_logs = db.execute(
            """SELECT pt.lesson_code FROM preview_watch_logs pw
               JOIN preview_tasks pt ON pw.preview_task_id=pt.id
               WHERE pw.student_id=?""",
            (student_id,),
        ).fetchall()
        watched_lessons = set(r["lesson_code"] for r in watch_logs if r["lesson_code"])

        # 7. 学习问答数据
        qa_sessions = db.execute(
            "SELECT conversation_json, is_solved FROM study_qa_sessions WHERE student_id=? ORDER BY created_at DESC LIMIT 10",
            (student_id,),
        ).fetchall()

    # ===== 构建知识图谱 =====
    all_kps = get_all_knowledge_points()

    # 为每个知识点计算掌握状态
    nodes = []
    unit_nodes = {}  # unit_code -> unit summary data

    for kp in all_kps:
        kp_id = kp["id"]
        unit_code = kp["unit_code"]
        lesson_code = kp["lesson_code"]

        # 初始化统计
        total_attempts = 0
        correct_count = 0
        error_count = 0
        has_practice = False
        has_error = False
        is_resolved = False

        # 匹配预习数据
        for p in preview_list:
            kp_field = p.get("knowledge_point", "") or ""
            q_text = p.get("question_text", "") or ""
            p_lesson = p.get("lesson_code", "") or ""
            if p_lesson == lesson_code or match_knowledge_point(kp_field, kp) or match_knowledge_point(q_text, kp):
                total_attempts += 1
                has_practice = True
                if p.get("is_correct"):
                    correct_count += 1
                else:
                    error_count += 1

        # 匹配作业数据
        for h in hw_list:
            kp_field = h.get("knowledge_point", "") or ""
            q_text = h.get("question_text", "") or ""
            if match_knowledge_point(kp_field, kp) or match_knowledge_point(q_text, kp):
                total_attempts += 1
                has_practice = True
                if h.get("is_correct"):
                    correct_count += 1
                else:
                    error_count += 1

        # 匹配错题数据
        for e in error_list:
            kp_field = e.get("knowledge_point", "") or e.get("knowledge_gap", "") or ""
            q_text = e.get("question_text", "") or ""
            if match_knowledge_point(kp_field, kp) or match_knowledge_point(q_text, kp):
                has_error = True
                if e.get("status") == "resolved":
                    is_resolved = True
                else:
                    error_count += 1

        # 匹配闯关数据（按 unit_code/lesson_code 匹配）
        for c in challenge_list:
            c_unit = c.get("unit_code", "") or ""
            c_lesson = c.get("lesson_code", "") or ""
            if c_unit == unit_code or c_lesson == lesson_code:
                has_practice = True
                total_attempts += c.get("total_questions", 0) or 0
                correct_count += c.get("total_correct", 0) or 0

        # 匹配随机考察数据（含 questions_json，检查知识点）
        for rc in random_list:
            try:
                qs = json.loads(rc.get("questions_json", "[]"))
                for q in qs:
                    q_kp = q.get("knowledge_point", "") or q.get("question", "") or ""
                    if match_knowledge_point(q_kp, kp):
                        has_practice = True
                        total_attempts += 1
            except:
                pass

        # 检查预习观看记录
        if lesson_code in watched_lessons:
            has_practice = True

        # 计算掌握状态
        if total_attempts > 0 and error_count == 0:
            # 全对 → mastered
            mastery = 100
            status = "mastered"
        elif total_attempts > 0 and correct_count >= total_attempts * 0.8:
            # 80%以上正确 → mastered
            mastery = 80 + int(20 * correct_count / total_attempts)
            status = "mastered"
        elif total_attempts > 0 and correct_count >= total_attempts * 0.5:
            # 50%-80% → learning
            mastery = 50 + int(30 * correct_count / total_attempts)
            status = "learning"
        elif has_practice and total_attempts > 0:
            # 低于50% → weak
            mastery = max(10, int(50 * correct_count / total_attempts))
            status = "weak"
        elif has_error and not has_practice:
            # 仅有错题，没有正确记录 → weak
            mastery = 20
            status = "weak"
        elif has_practice and total_attempts == 0:
            # 只看了视频/做了预习但没答题 → learning
            mastery = 30
            status = "learning"
        else:
            # 没有任何数据 → not_started
            mastery = 0
            status = "not_started"

        # 已解决的错题提升掌握度
        if is_resolved and status in ["learning", "weak"]:
            mastery = min(mastery + 15, 80)
            if mastery >= 70:
                status = "learning"

        node = {
            "id": kp_id,
            "name": kp["name"],
            "mastery": mastery,
            "category": kp["category"],
            "status": status,
            "error_count": error_count,
            "unit_code": unit_code,
            "unit_name": kp["unit_name"],
            "lesson_code": lesson_code,
            "lesson_title": kp["lesson_title"],
            "keywords": kp["keywords"],
        }
        nodes.append(node)

        # 单元汇总
        if unit_code not in unit_nodes:
            unit_nodes[unit_code] = {
                "unit_code": unit_code,
                "unit_name": kp["unit_name"],
                "category": kp["category"],
                "lesson_count": 0,
                "kp_count": 0,
                "mastered_count": 0,
                "learning_count": 0,
                "weak_count": 0,
                "not_started_count": 0,
                "avg_mastery": 0,
                "mastery_sum": 0,
            }
        unit_nodes[unit_code]["kp_count"] += 1
        unit_nodes[unit_code]["mastery_sum"] += mastery
        if status == "mastered":
            unit_nodes[unit_code]["mastered_count"] += 1
        elif status == "learning":
            unit_nodes[unit_code]["learning_count"] += 1
        elif status == "weak":
            unit_nodes[unit_code]["weak_count"] += 1
        else:
            unit_nodes[unit_code]["not_started_count"] += 1

    # 计算单元平均掌握度
    for uc in unit_nodes.values():
        uc["avg_mastery"] = round(uc["mastery_sum"] / uc["kp_count"]) if uc["kp_count"] > 0 else 0

    # 统计不同 lesson_code 数量
    lesson_codes_in_unit = {}
    for kp_data in all_kps:
        uc = kp_data["unit_code"]
        lc = kp_data["lesson_code"]
        if uc not in lesson_codes_in_unit:
            lesson_codes_in_unit[uc] = set()
        lesson_codes_in_unit[uc].add(lc)
    for uc, lcs in lesson_codes_in_unit.items():
        if uc in unit_nodes:
            unit_nodes[uc]["lesson_count"] = len(lcs)

    # 识别薄弱和优势领域
    weak_areas = []
    strength_areas = []
    for uc, data in unit_nodes.items():
        if data["weak_count"] > 0 or data["avg_mastery"] < 40:
            weak_areas.append(data["unit_name"])
        elif data["avg_mastery"] >= 70 and data["not_started_count"] == 0:
            strength_areas.append(data["unit_name"])

    # 生成学习建议（不用AI，直接基于数据规则）
    suggestions = []
    for uc, data in unit_nodes.items():
        if data["not_started_count"] > 0 and data["not_started_count"] == data["kp_count"]:
            suggestions.append(f"📖 {data['unit_name']}：还没开始学习，建议先预习基础知识")
        elif data["weak_count"] > data["kp_count"] * 0.3:
            suggestions.append(f"⚠️ {data['unit_name']}：薄弱知识点较多，建议重点复习错题")
        elif data["not_started_count"] > 0 and data["mastered_count"] > 0:
            suggestions.append(f"📚 {data['unit_name']}：部分知识点未接触，建议继续学习新课时")

    # 整体评价
    total_mastered = sum(d["mastered_count"] for d in unit_nodes.values())
    total_kps = len(nodes)
    mastery_rate = round(total_mastered / total_kps * 100) if total_kps > 0 else 0
    if mastery_rate >= 70:
        summary = f"你已掌握了{mastery_rate}%的知识点，学习进展良好！继续保持，争取全面掌握。"
    elif mastery_rate >= 40:
        summary = f"你已掌握了{mastery_rate}%的知识点，部分领域还需要加强练习。关注薄弱知识点，及时复习错题。"
    elif mastery_rate > 0:
        summary = f"你刚开始学习，目前掌握了{mastery_rate}%的知识点。继续坚持预习和练习，每天进步一点点！"
    else:
        summary = "欢迎来到五年级上册数学！开始预习第一课，开启你的知识探索之旅吧！"

    # 构建完整图谱数据
    graph = {
        "summary": summary,
        "nodes": nodes,
        "unit_nodes": list(unit_nodes.values()),
        "weak_areas": weak_areas,
        "strength_areas": strength_areas,
        "suggestions": suggestions,
    }

    return {
        "success": True,
        "data": {
            "student": dict(student),
            "graph": graph,
            "total_errors": len(error_list),
            "total_practices": len(preview_list) + len(hw_list),
        }
    }


@router.get("/student-raw/{student_id}")
def student_raw_data(student_id: int):
    """获取学生原始错题/练习数据（不经过AI，快速返回）"""
    with get_db() as db:
        errors = db.execute(
            "SELECT knowledge_point, question_text, student_answer, correct_answer, source, status FROM error_notes WHERE student_id=? ORDER BY created_at DESC",
            (student_id,),
        ).fetchall()

        # 统计每个知识点的错误次数
        kp_stats = {}
        for e in errors:
            kp = e["knowledge_point"] or e["question_text"][:20]
            if kp not in kp_stats:
                kp_stats[kp] = {"total": 0, "resolved": 0, "unresolved": 0}
            kp_stats[kp]["total"] += 1
            if e["status"] == "resolved":
                kp_stats[kp]["resolved"] += 1
            else:
                kp_stats[kp]["unresolved"] += 1

        student = db.execute("SELECT name, points, layer FROM users WHERE id=?", (student_id,)).fetchone()

    return {
        "success": True,
        "student": dict(student) if student else {},
        "kp_stats": kp_stats,
        "total_errors": len(errors),
    }


# ===== 班级共性错题 =====

@router.get("/class/{class_id}")
def class_common_errors(class_id: int, assignment_ids: Optional[List[int]] = Query(None)):
    """获取班级共性错题数据；可指定一个或多个作业ID，仅分析这些作业产生的错题"""
    with get_db() as db:
        # 获取班级所有学生
        students = db.execute(
            "SELECT id, name, layer FROM users WHERE class_id=? AND role='student'",
            (class_id,),
        ).fetchall()

        if not students:
            return {"success": True, "data": {"common_weak_points": [], "overall_analysis": "班级暂无学生数据"}, "student_count": 0}

        student_ids = [s["id"] for s in students]
        id_str = ",".join(str(sid) for sid in student_ids)

        # 构建过滤条件
        where_clauses = [f"e.student_id IN ({id_str})", "e.status='unresolved'"]
        params: List = []

        if assignment_ids:
            # 通过 submission_id 关联到 homework_submissions.assignment_id
            sub_ids = db.execute(
                "SELECT id FROM homework_submissions WHERE assignment_id IN ({})".format(",".join("?" * len(assignment_ids))),
                assignment_ids,
            ).fetchall()
            if sub_ids:
                sub_id_str = ",".join(str(r["id"]) for r in sub_ids)
                hq_ids = db.execute(
                    "SELECT id FROM homework_questions WHERE submission_id IN ({})".format(sub_id_str),
                ).fetchall()
                if hq_ids:
                    hq_id_str = ",".join(str(r["id"]) for r in hq_ids)
                    where_clauses.append(f"e.homework_question_id IN ({hq_id_str})")
                else:
                    return {
                        "success": True,
                        "data": {
                            "student_count": len(students),
                            "total_errors": 0,
                            "kp_stats": {},
                            "ai_analysis": {
                                "common_weak_points": [],
                                "overall_analysis": "选中的作业暂无未解决错题。",
                                "urgent_actions": [],
                                "recommended_exercises": [],
                            },
                        }
                    }
            else:
                return {
                    "success": True,
                    "data": {
                        "student_count": len(students),
                        "total_errors": 0,
                        "kp_stats": {},
                        "ai_analysis": {
                            "common_weak_points": [],
                            "overall_analysis": "选中的作业暂无未解决错题。",
                            "urgent_actions": [],
                            "recommended_exercises": [],
                        },
                    }
                }

        where_sql = " AND ".join(where_clauses)

        # 汇总所有错题（来自预习、闯关、作业）
        all_errors = db.execute(
            f"""SELECT e.*, u.name as student_name
               FROM error_notes e
               JOIN users u ON e.student_id=u.id
               WHERE {where_sql}
               ORDER BY e.created_at DESC LIMIT 100""",
            params,
        ).fetchall()

        error_list = [dict(r) for r in all_errors]

        # 统计知识点错误人次
        kp_stats = {}
        for e in error_list:
            kp = e.get("knowledge_point") or ""
            if kp:
                if kp not in kp_stats:
                    kp_stats[kp] = {"count": 0, "students": [], "examples": []}
                kp_stats[kp]["count"] += 1
                kp_stats[kp]["students"].append(e.get("student_name", ""))
                if len(kp_stats[kp]["examples"]) < 3:
                    kp_stats[kp]["examples"].append({
                        "question": e.get("question_text", ""),
                        "student_answer": e.get("student_answer", ""),
                        "correct_answer": e.get("correct_answer", ""),
                    })

        # 排序：错误人次最多的知识点排在前面
        sorted_kps = sorted(kp_stats.items(), key=lambda x: -x[1]["count"])

        # AI分析
        analysis = ai_analyze_class_common_errors(error_list)

    return {
        "success": True,
        "data": {
            "student_count": len(students),
            "total_errors": len(error_list),
            "kp_stats": {k: v for k, v in sorted_kps},
            "ai_analysis": analysis,
        }
    }


# ===== 教师上传题目 =====

@router.post("/upload-question")
async def upload_teacher_question(
    unit_code: str = Form(...),
    question_type: str = Form("fill"),
    difficulty: str = Form("basic"),
    content: str = Form(...),
    answer: str = Form(...),
    analysis: str = Form(""),
    knowledge_point: str = Form(""),
    authorization: str = Form(""),
):
    """教师上传题目和标准答案"""
    payload = get_user_from_token(authorization or "")
    if not payload or payload.get("role") != "teacher":
        raise HTTPException(401, "请先登录教师账号")

    teacher_id = payload["user_id"]

    with get_db() as db:
        # 写入questions表
        db.execute(
            "INSERT INTO questions (unit_code, type, difficulty, content, answer, analysis, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (unit_code, question_type, difficulty, content, answer, analysis, str(teacher_id)),
        )

        # 如果有知识点标注，更新
        if knowledge_point:
            q_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
            # questions表没有knowledge_point字段，通过analysis补充
            updated_analysis = f"{analysis}\n【知识点】{knowledge_point}" if analysis else f"【知识点】{knowledge_point}"
            db.execute(
                "UPDATE questions SET analysis=? WHERE id=?",
                (updated_analysis, q_id),
            )

    return {"success": True, "message": "题目已上传"}


@router.post("/batch-upload")
async def batch_upload_questions(
    unit_code: str = Form(...),
    questions_json: str = Form(...),
    authorization: str = Form(""),
):
    """教师批量上传题目"""
    payload = get_user_from_token(authorization or "")
    if not payload or payload.get("role") != "teacher":
        raise HTTPException(401, "请先登录教师账号")

    teacher_id = payload["user_id"]

    try:
        questions = json.loads(questions_json)
    except:
        raise HTTPException(400, "题目JSON格式错误")

    count = 0
    with get_db() as db:
        for q in questions:
            db.execute(
                "INSERT INTO questions (unit_code, type, difficulty, content, answer, analysis, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (unit_code, q.get("type", "fill"), q.get("difficulty", "basic"),
                 q.get("content", ""), q.get("answer", ""), q.get("analysis", ""), str(teacher_id)),
            )
            count += 1

    return {"success": True, "count": count, "message": f"成功上传{count}道题目"}


# ===== 拍照出题 AI OCR 识别 =====

@router.post("/ocr-question")
async def ocr_teacher_question(
    file: UploadFile = File(...),
    authorization: str = Header(None),
):
    """教师拍照出题 - AI识别图片中的数学题目"""
    payload = get_user_from_token(authorization or "")
    if not payload or payload.get("role") != "teacher":
        raise HTTPException(401, "请先登录教师账号")

    # 读取图片
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(400, "上传文件为空")

    # base64 编码
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")

    # 调用AI识别
    result = ai_ocr_question(image_base64)
    return {"success": True, "data": result}
