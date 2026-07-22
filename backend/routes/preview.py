"""预习任务路由 - 教师发布 + 学生答题 + 统计 + AI学情报告 + 资源整合"""

import json
import re
import uuid
import threading
import httpx
from datetime import datetime
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from database import get_db, add_points
from auth import get_user_from_token
from agents.teach import TeachAgent
from agents.resource import ResourceAgent
from agents.web_search import search_all_resources
from agents.llm import ai_curate_resources, ai_generate_blackboard_design, ai_judge_preview_answer
from agents.preview_material import generate_preview_material

router = APIRouter()

# ===== 异步任务存储（内存） =====
_teach_tasks: dict = {}


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
        raise HTTPException(401, "用户不存在，请重新登录")
    return payload["user_id"]


# ===== 请求模型 =====

class GenerateRequest(BaseModel):
    lesson_code: str
    lesson_title: str
    unit_code: str


class PreviewQuestionItem(BaseModel):
    question: str
    type: str = "fill"
    difficulty: str = "basic"
    answer: str
    analysis: str = ""
    knowledge_point: str = ""


class LayerVideoItem(BaseModel):
    title: str = ""
    url: str = ""
    platform: str = ""
    duration: int = 0
    description: str = ""


class PublishPreviewRequest(BaseModel):
    class_id: int
    lesson_code: str
    lesson_title: str
    unit_code: str
    preview_content: str
    inquiry_content: str = ""
    board_content: str = ""
    video_url: str = ""
    layer_videos: str = ""
    questions: List[PreviewQuestionItem] = []
    material_json: str = ""


class GenerateMaterialRequest(BaseModel):
    lesson_code: str
    lesson_title: str
    unit_code: str = ""
    resource_folders: Dict[str, Any] = {}
    layer_videos: Dict[str, Any] = {}
    knowledge_points: List[str] = []
    preview_questions: List[Dict[str, Any]] = []


class GenerateBlackboardRequest(BaseModel):
    lesson_title: str
    knowledge_points: List[str] = []
    preview_content: str = ""


class SubmitAnswerRequest(BaseModel):
    student_id: int
    question_id: int
    answer: str


class WatchLogRequest(BaseModel):
    student_id: int
    task_id: int
    layer: str
    watch_duration: int = 0
    total_duration: int = 0
    completed: bool = False


class ResourceSearchRequest(BaseModel):
    grade: str = "五年级"
    subject: str = "数学"
    lesson_title: str = ""
    textbook_version: str = "人教版"


# ===== 教师生成教学内容（异步任务模式） =====

@router.post("/teach/generate")
def generate_teach_content(req: GenerateRequest, authorization: str = Header(None)):
    """启动AI生成任务，立即返回task_id（不阻塞HTTP请求）"""
    teacher_id = get_teacher_id(authorization)

    task_id = uuid.uuid4().hex[:12]
    _teach_tasks[task_id] = {
        "status": "processing",
        "created_at": datetime.now().isoformat(),
        "lesson_title": req.lesson_title,
        "result": None,
        "error": None,
    }

    def _run():
        try:
            agent = TeachAgent()
            result = agent.run(req.lesson_title, req.lesson_code, req.unit_code)

            # ===== AI审查：对资源做去劣+重点标注 =====
            output = result.get("output", {})
            if output.get("resource_folders"):
                output = _enhance_with_curation(output, req.lesson_title)
                result["output"] = output

            # ===== 持久化到 teach_results =====
            try:
                _save_teach_result(teacher_id, req, result)
            except Exception as e:
                print(f"[teach/generate] 持久化失败(非致命): {e}")

            _teach_tasks[task_id]["status"] = "completed"
            _teach_tasks[task_id]["result"] = result
        except Exception as e:
            import traceback
            traceback.print_exc()
            _teach_tasks[task_id]["status"] = "failed"
            _teach_tasks[task_id]["error"] = str(e)

    threading.Thread(target=_run, daemon=True).start()
    return {"task_id": task_id}


@router.get("/teach/task/{task_id}")
def get_teach_task(task_id: str, authorization: str = Header(None)):
    """轮询获取AI生成任务状态和结果"""
    get_teacher_id(authorization)
    task = _teach_tasks.get(task_id)
    if not task:
        raise HTTPException(404, "任务不存在或已过期")
    resp = {"task_id": task_id, "status": task["status"]}
    if task["status"] == "completed":
        resp["result"] = task["result"]
    elif task["status"] == "failed":
        resp["error"] = task.get("error", "未知错误")
    return resp


def _enhance_with_curation(output: dict, lesson_title: str) -> dict:
    """对 TeachAgent 输出做 AI 审查：对 B站视频去劣 + 确认分层 + 生成重点标注；AI 生成内容保留原样"""
    resource_folders = output.get("resource_folders", {})
    flat = _flatten_search_results(resource_folders)
    total_found = len(flat)
    if total_found == 0:
        output["search_info"] = {"total_found": 0, "after_filter": 0, "filtered_out": 0}
        output["ai_note"] = "资源生成完成。"
        return output

    # 分离非视频内容（AI生成、知识库兜底，无需审查）和 B站视频（需要审查）
    # 关键：用 bvid/VIDEO/平台 判断是否为视频，而非用 is_ai_generated 标志
    non_video_items = [it for it in flat if not (it.get("bvid") or (it.get("format") or "").upper() == "VIDEO" or it.get("platform") == "bilibili")]
    video_items = [it for it in flat if it.get("bvid") or (it.get("format") or "").upper() == "VIDEO" or it.get("platform") == "bilibili"]

    # 只对视频做 AI 审查
    curation = ai_curate_resources(video_items, lesson_title, "五年级", "数学") if video_items else None
    keep_map = {}
    if curation:
        for c in curation:
            if c.get("keep", True):
                keep_map[c["index"]] = {"layer": c.get("layer"), "highlight": c.get("highlight", "")}

    # 视频过滤
    kept_video_indices = set()
    for i, it in enumerate(video_items):
        if curation and i not in keep_map:
            continue
        kept_video_indices.add(i)
        if curation:
            meta = keep_map.get(i, {})
            if meta.get("layer"):
                it["layer"] = meta["layer"]
            it["highlight"] = meta.get("highlight", "")
        else:
            it["highlight"] = it.get("description", "")[:40] or "教学参考资源"

    # 非视频内容保留原 highlight
    for it in non_video_items:
        if not it.get("highlight"):
            it["highlight"] = it.get("description", "")[:40] or "AI智能生成"

    after_filter = len(non_video_items) + len(kept_video_indices)
    filtered_out = total_found - after_filter

    # 重建 resource_folders 结构
    new_folders = {}
    for folder_key, folder_data in resource_folders.items():
        if not isinstance(folder_data, dict):
            continue
        new_items = {"basic": [], "advanced": [], "extension": []}
        items_by_layer = folder_data.get("items", {})
        for layer in ("basic", "advanced", "extension"):
            for it in items_by_layer.get(layer, []):
                if it.get("is_ai_generated") or it.get("is_kb_fallback"):
                    # AI 内容 / 知识库兜底内容直接保留
                    new_items[layer].append(dict(it))
                elif it in video_items:
                    # 视频内容：检查是否在保留列表
                    idx = video_items.index(it)
                    if idx in kept_video_indices:
                        enriched = dict(it)
                        new_layer = it.get("layer", layer)
                        if new_layer in new_items:
                            new_items[new_layer].append(enriched)
                        else:
                            new_items[layer].append(enriched)
                else:
                    # 百度搜索的文档结果（真实搜索、非AI生成、非知识库兜底、非视频）：直接保留
                    new_items[layer].append(dict(it))
        new_folders[folder_key] = {
            "title": folder_data.get("title", folder_key),
            "icon": folder_data.get("icon", ""),
            "color": folder_data.get("color", "#7A756D"),
            "items": new_items,
        }

    output["resource_folders"] = new_folders
    output["search_info"] = {
        "total_found": total_found,
        "after_filter": after_filter,
        "filtered_out": filtered_out,
    }
    doc_ai_count = sum(1 for it in non_video_items if it.get("is_ai_generated") or it.get("is_kb_fallback"))
    doc_search_count = sum(1 for it in non_video_items if not (it.get("is_ai_generated") or it.get("is_kb_fallback")))
    video_count = len(kept_video_indices)
    doc_total = doc_ai_count + doc_search_count
    output["ai_note"] = (
        f"检索到 {doc_total} 份教学文档"
        f"（真实搜索 {doc_search_count} 份 + AI生成 {doc_ai_count} 份），"
        f"并从 B站检索的 {len(video_items)} 个视频中精选 {video_count} 个微课资源。"
    )
    return output


def _save_teach_result(teacher_id: int, req: GenerateRequest, result: dict):
    """把课堂教学结果 upsert 到 teach_results 表"""
    with get_db() as db:
        cur = db.cursor()
        existing = cur.execute(
            "SELECT id FROM teach_results WHERE teacher_id=? AND lesson_code=?",
            (teacher_id, req.lesson_code),
        ).fetchone()
        payload = json.dumps(result, ensure_ascii=False)
        if existing:
            cur.execute(
                "UPDATE teach_results SET result_json=?, lesson_title=?, unit_code=?, created_at=CURRENT_TIMESTAMP WHERE id=?",
                (payload, req.lesson_title, req.unit_code, existing["id"]),
            )
        else:
            cur.execute(
                "INSERT INTO teach_results (teacher_id, lesson_code, lesson_title, unit_code, result_json) VALUES (?,?,?,?,?)",
                (teacher_id, req.lesson_code, req.lesson_title, req.unit_code, payload),
            )
        db.commit()


@router.get("/teach/saved")
def load_saved_teach(lesson_code: str = "", authorization: str = Header(None)):
    """加载已持久化的课堂教学结果：传 lesson_code 取该课时，不传取最近一次"""
    teacher_id = get_teacher_id(authorization)
    with get_db() as db:
        if lesson_code:
            row = db.execute(
                "SELECT * FROM teach_results WHERE teacher_id=? AND lesson_code=? ORDER BY created_at DESC LIMIT 1",
                (teacher_id, lesson_code.strip()),
            ).fetchone()
        else:
            row = db.execute(
                "SELECT * FROM teach_results WHERE teacher_id=? ORDER BY created_at DESC LIMIT 1",
                (teacher_id,),
            ).fetchone()
    if not row:
        return {"found": False}
    data = json.loads(row["result_json"])
    data["found"] = True
    data["saved_lesson_code"] = row["lesson_code"]
    data["saved_lesson_title"] = row["lesson_title"]
    return data


# ===== AI 生成板书设计 =====

@router.post("/teach/generate-blackboard")
def generate_blackboard(req: GenerateBlackboardRequest, authorization: str = Header(None)):
    """AI 生成结构化板书设计（主板书 + 副板书）"""
    get_teacher_id(authorization)
    if not req.lesson_title.strip():
        raise HTTPException(400, "课题不能为空")

    result = ai_generate_blackboard_design(
        lesson_title=req.lesson_title.strip(),
        knowledge_points=req.knowledge_points,
        preview_content=req.preview_content,
    )
    if not result or not result.get("main_board"):
        raise HTTPException(500, "AI 生成板书设计失败，请稍后重试")

    return {
        "message": "板书设计生成成功",
        "blackboard": {
            "title": f"AI生成板书设计 - {req.lesson_title}",
            "main_board": result["main_board"],
            "side_board": result.get("side_board", ""),
            "ai_powered": True,
            "ai_model": "GLM-4-Flash",
        },
    }


# ===== 生成预习资料（AI 智能体） =====

# 异步任务存储
_material_tasks: dict = {}


@router.post("/preview-material/generate")
def generate_material(req: GenerateMaterialRequest, authorization: str = Header(None)):
    """启动 AI 生成结构化预习资料任务，立即返回 task_id"""
    teacher_id = get_teacher_id(authorization)

    task_id = uuid.uuid4().hex[:12]
    _material_tasks[task_id] = {
        "status": "processing",
        "created_at": datetime.now().isoformat(),
        "lesson_title": req.lesson_title,
        "result": None,
        "error": None,
    }

    def _run():
        try:
            material = generate_preview_material(
                lesson_title=req.lesson_title,
                lesson_code=req.lesson_code,
                unit_code=req.unit_code,
                resource_folders=req.resource_folders,
                layer_videos=req.layer_videos,
                knowledge_points=req.knowledge_points,
                preview_questions=req.preview_questions,
            )
            _material_tasks[task_id]["status"] = "completed"
            _material_tasks[task_id]["result"] = material
        except Exception as e:
            import traceback
            traceback.print_exc()
            _material_tasks[task_id]["status"] = "failed"
            _material_tasks[task_id]["error"] = str(e)

    threading.Thread(target=_run, daemon=True).start()
    return {"task_id": task_id}


@router.get("/preview-material/task/{task_id}")
def get_material_task(task_id: str, authorization: str = Header(None)):
    """轮询获取预习资料生成任务状态"""
    get_teacher_id(authorization)
    task = _material_tasks.get(task_id)
    if not task:
        raise HTTPException(404, "任务不存在或已过期")
    resp = {"task_id": task_id, "status": task["status"]}
    if task["status"] == "completed":
        resp["result"] = task["result"]
    elif task["status"] == "failed":
        resp["error"] = task.get("error", "未知错误")
    return resp


# ===== 教师发布预习任务 =====

@router.post("/preview/publish")
def publish_preview(req: PublishPreviewRequest, authorization: str = Header(None)):
    """教师发布预习任务到指定班级（含分层视频 + 结构化预习资料）"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        cursor = db.cursor()
        cursor.execute(
            """INSERT INTO preview_tasks
               (class_id, teacher_id, lesson_code, lesson_title, unit_code,
                preview_content, inquiry_content, board_content, video_url, layer_videos,
                material_json, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')""",
            (req.class_id, teacher_id, req.lesson_code, req.lesson_title, req.unit_code,
             req.preview_content, req.inquiry_content, req.board_content, req.video_url,
             req.layer_videos, req.material_json),
        )
        task_id = cursor.lastrowid

        for i, q in enumerate(req.questions):
            cursor.execute(
                """INSERT INTO preview_questions
                   (preview_task_id, question_text, question_type, difficulty,
                    correct_answer, analysis, knowledge_point, sort_order)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (task_id, q.question, q.type, q.difficulty, q.answer, q.analysis,
                 q.knowledge_point, i),
            )
        db.commit()

    return {"message": "预习任务发布成功", "task_id": task_id}


@router.post("/preview/{task_id}/unpublish")
def unpublish_preview(task_id: int, authorization: str = Header(None)):
    """教师撤回已发布的预习任务。撤回后学生端不再可见。"""
    teacher_id = get_teacher_id(authorization)
    with get_db() as db:
        task = db.execute(
            "SELECT id, teacher_id, status FROM preview_tasks WHERE id=?",
            (task_id,),
        ).fetchone()
        if not task:
            raise HTTPException(404, "预习任务不存在")
        if task["teacher_id"] != teacher_id:
            raise HTTPException(403, "无权操作他人的预习任务")
        if task["status"] == "revoked":
            raise HTTPException(400, "该任务已撤回")
        db.execute(
            "UPDATE preview_tasks SET status='revoked' WHERE id=?",
            (task_id,),
        )
        db.commit()
    return {"message": "预习任务已撤回，学生端不再可见"}


@router.post("/preview/{task_id}/republish")
def republish_preview(task_id: int, authorization: str = Header(None)):
    """教师重新发布已撤回的预习任务。"""
    teacher_id = get_teacher_id(authorization)
    with get_db() as db:
        task = db.execute(
            "SELECT id, teacher_id, status FROM preview_tasks WHERE id=?",
            (task_id,),
        ).fetchone()
        if not task:
            raise HTTPException(404, "预习任务不存在")
        if task["teacher_id"] != teacher_id:
            raise HTTPException(403, "无权操作他人的预习任务")
        if task["status"] == "published":
            raise HTTPException(400, "该任务已处于发布状态")
        db.execute(
            "UPDATE preview_tasks SET status='published' WHERE id=?",
            (task_id,),
        )
        db.commit()
    return {"message": "预习任务已重新发布"}


@router.delete("/preview/{task_id}")
def delete_preview(task_id: int, authorization: str = Header(None)):
    """教师彻底删除已撤回的预习任务（仅允许删除 revoked 状态的任务）。
    联动删除：预习答案、观看记录、预习题目、预习任务本身。
    """
    teacher_id = get_teacher_id(authorization)
    with get_db() as db:
        task = db.execute(
            "SELECT id, teacher_id, status FROM preview_tasks WHERE id=?",
            (task_id,),
        ).fetchone()
        if not task:
            raise HTTPException(404, "预习任务不存在")
        if task["teacher_id"] != teacher_id:
            raise HTTPException(403, "无权操作他人的预习任务")
        if task["status"] != "revoked":
            raise HTTPException(400, "仅可删除已撤回的预习任务，请先撤回后再删除")
        # 获取该任务下所有题目ID（用于删除答案）
        q_ids = [row["id"] for row in db.execute(
            "SELECT id FROM preview_questions WHERE preview_task_id=?", (task_id,),
        ).fetchall()]
        # 联动删除：预习答案（按题目ID）、观看记录、预习题目、预习任务
        if q_ids:
            placeholders = ",".join("?" * len(q_ids))
            db.execute(
                f"DELETE FROM preview_answers WHERE preview_question_id IN ({placeholders})",
                q_ids,
            )
        # 兜底：按 task_id 删除答案（preview_answers 表也有 preview_task_id 字段）
        db.execute("DELETE FROM preview_answers WHERE preview_task_id=?", (task_id,))
        db.execute("DELETE FROM preview_watch_logs WHERE preview_task_id=?", (task_id,))
        db.execute("DELETE FROM preview_questions WHERE preview_task_id=?", (task_id,))
        db.execute("DELETE FROM preview_tasks WHERE id=?", (task_id,))
        db.commit()
    return {"message": "预习任务已彻底删除"}


# ===== 教师查看已发布的预习任务 =====

@router.get("/preview/list/{class_id}")
def list_previews(class_id: int, authorization: str = Header(None)):
    """获取班级的预习任务列表（含每题正确率、错题学生、提交率、平均正确率）。
    教师端返回所有状态的任务（published + revoked），以便查看发布记录与撤回。
    """
    get_teacher_id(authorization)
    with get_db() as db:
        # 查询班级总人数
        total_students = db.execute(
            "SELECT COUNT(*) as c FROM users WHERE class_id=? AND role='student'",
            (class_id,),
        ).fetchone()["c"]

        tasks = db.execute(
            "SELECT * FROM preview_tasks WHERE class_id=? ORDER BY created_at DESC",
            (class_id,),
        ).fetchall()
        result = []
        for t in tasks:
            task = dict(t)
            questions = db.execute(
                "SELECT id, question_text, difficulty, correct_answer, knowledge_point FROM preview_questions WHERE preview_task_id=? ORDER BY sort_order",
                (task["id"],),
            ).fetchall()
            question_stats = []
            total_submissions = 0
            total_accuracy_sum = 0.0
            questions_with_answers = 0
            for q in questions:
                answers = db.execute(
                    "SELECT student_id, student_answer, is_correct FROM preview_answers WHERE preview_question_id=?",
                    (q["id"],),
                ).fetchall()
                correct_count = sum(1 for a in answers if a["is_correct"])
                total = len(answers)
                if total > total_submissions:
                    total_submissions = total
                wrong_students = []
                if total > 0:
                    wrong_rows = db.execute(
                        """SELECT u.name, u.student_no FROM preview_answers pa
                           JOIN users u ON pa.student_id = u.id
                           WHERE pa.preview_question_id=? AND pa.is_correct=0""",
                        (q["id"],),
                    ).fetchall()
                    wrong_students = [dict(r) for r in wrong_rows]
                acc = round(correct_count / total * 100, 1) if total > 0 else 0
                if total > 0:
                    total_accuracy_sum += acc
                    questions_with_answers += 1
                question_stats.append({
                    "question_id": q["id"],
                    "question_text": q["question_text"],
                    "difficulty": q["difficulty"],
                    "knowledge_point": q["knowledge_point"] if "knowledge_point" in q.keys() else "",
                    "correct_answer": q["correct_answer"],
                    "total_answers": total,
                    "correct_count": correct_count,
                    "accuracy": acc,
                    "wrong_students": wrong_students,
                })
            task["questions"] = question_stats
            task["total_submissions"] = total_submissions
            task["total_students"] = total_students
            task["submission_rate"] = round(total_submissions / total_students * 100, 1) if total_students > 0 else 0
            task["avg_accuracy"] = round(total_accuracy_sum / questions_with_answers, 1) if questions_with_answers > 0 else 0
            task["question_count"] = len(question_stats)
            result.append(task)
    return {"tasks": result}


# ===== AI学情大数据报告 =====

@router.get("/preview/{task_id}/report")
def preview_report(task_id: int, authorization: str = Header(None)):
    """AI学情报告：逐题正确率、错题TOP、高频错误知识点、分层分析、备课重点推荐"""
    get_teacher_id(authorization)

    with get_db() as db:
        task = db.execute("SELECT * FROM preview_tasks WHERE id=?", (task_id,)).fetchone()
        if not task:
            raise HTTPException(404, "预习任务不存在")
        task = dict(task)

        # 获取班级总人数
        total_students = db.execute(
            "SELECT COUNT(*) as c FROM users WHERE class_id=? AND role='student'",
            (task["class_id"],),
        ).fetchone()["c"]

        # 班级学生分层分布（用于解释各层题目的提交数差异）
        layer_dist_rows = db.execute(
            "SELECT layer, COUNT(*) as c FROM users WHERE class_id=? AND role='student' GROUP BY layer",
            (task["class_id"],),
        ).fetchall()
        layer_distribution = {dict(r)["layer"] or "basic": dict(r)["c"] for r in layer_dist_rows}
        # 各层应答题人数：basic→全班；advanced→advanced+extension；extension→extension
        layer_eligible = {
            "basic": total_students,
            "advanced": layer_distribution.get("advanced", 0) + layer_distribution.get("extension", 0),
            "extension": layer_distribution.get("extension", 0),
        }

        questions = db.execute(
            "SELECT id, question_text, difficulty, correct_answer, knowledge_point FROM preview_questions WHERE preview_task_id=? ORDER BY sort_order",
            (task_id,),
        ).fetchall()

        question_reports = []
        knowledge_errors = {}
        layer_stats = {"basic": {"total": 0, "correct": 0, "count": 0},
                       "advanced": {"total": 0, "correct": 0, "count": 0},
                       "extension": {"total": 0, "correct": 0, "count": 0}}

        for q in questions:
            answers = db.execute(
                "SELECT student_id, student_answer, is_correct FROM preview_answers WHERE preview_question_id=?",
                (q["id"],),
            ).fetchall()
            correct_count = sum(1 for a in answers if a["is_correct"])
            total = len(answers)
            accuracy = round(correct_count / total * 100, 1) if total > 0 else 0
            error_rate = round(100 - accuracy, 1) if total > 0 else 0

            kp = q["knowledge_point"] if "knowledge_point" in q.keys() and q["knowledge_point"] else "未分类知识点"

            if total > 0 and error_rate > 0:
                if kp not in knowledge_errors:
                    knowledge_errors[kp] = {"error_count": 0, "total_count": 0, "questions": []}
                knowledge_errors[kp]["error_count"] += (total - correct_count)
                knowledge_errors[kp]["total_count"] += total
                knowledge_errors[kp]["questions"].append(q["question_text"])

            wrong_students = []
            if total > 0:
                wrong_rows = db.execute(
                    """SELECT u.name, u.student_no FROM preview_answers pa
                       JOIN users u ON pa.student_id = u.id
                       WHERE pa.preview_question_id=? AND pa.is_correct=0""",
                    (q["id"],),
                ).fetchall()
                wrong_students = [dict(r) for r in wrong_rows]

            question_reports.append({
                "question_id": q["id"],
                "question_text": q["question_text"],
                "difficulty": q["difficulty"],
                "knowledge_point": kp,
                "correct_answer": q["correct_answer"],
                "total_answers": total,
                "eligible_students": layer_eligible.get(q["difficulty"], total_students),
                "correct_count": correct_count,
                "accuracy": accuracy,
                "error_rate": error_rate,
                "wrong_students": wrong_students,
                "need_focus": accuracy < 70 and total > 0,
            })

            diff = q["difficulty"]
            if diff in layer_stats:
                layer_stats[diff]["count"] += 1
                if total > 0:
                    layer_stats[diff]["total"] += total
                    layer_stats[diff]["correct"] += correct_count

        # 错误率TOP错题
        error_top = sorted(
            [q for q in question_reports if q["total_answers"] > 0],
            key=lambda x: x["error_rate"],
            reverse=True,
        )[:3]

        # 高频错误知识点
        knowledge_ranking = sorted(
            [
                {
                    "knowledge_point": kp,
                    "error_count": v["error_count"],
                    "total_count": v["total_count"],
                    "error_rate": round(v["error_count"] / v["total_count"] * 100, 1) if v["total_count"] > 0 else 0,
                    "question_count": len(v["questions"]),
                }
                for kp, v in knowledge_errors.items()
            ],
            key=lambda x: x["error_rate"],
            reverse=True,
        )

        # 分层分析
        layer_analysis = []
        layer_labels = {"basic": "基础层", "advanced": "提升层", "extension": "拓展层"}
        layer_descs = {
            "basic": "适配学困生，核心为概念认知、公式识记",
            "advanced": "适配中等生，知识点深化理解",
            "extension": "适配尖子生，知识点延伸拓展",
        }
        for diff in ["basic", "advanced", "extension"]:
            s = layer_stats[diff]
            acc = round(s["correct"] / s["total"] * 100, 1) if s["total"] > 0 else 0
            layer_analysis.append({
                "layer": diff,
                "label": layer_labels[diff],
                "description": layer_descs[diff],
                "question_count": s["count"],
                "total_answers": s["total"],
                "correct_answers": s["correct"],
                "accuracy": acc,
                "weakness": acc < 70 if s["total"] > 0 else False,
            })

        # AI备课重点推荐
        focus_questions = [q for q in question_reports if q["need_focus"]]
        focus_knowledge = [k for k in knowledge_ranking if k["error_rate"] >= 30]
        mastered = [q for q in question_reports if q["accuracy"] >= 90 and q["total_answers"] > 0]

        ai_recommendations = []
        if focus_questions:
            ai_recommendations.append(
                f"建议课堂重点讲解以下{len(focus_questions)}道错题，涉及知识点：{', '.join(set(q['knowledge_point'] for q in focus_questions))}"
            )
        if focus_knowledge:
            ai_recommendations.append(
                f"高频错误知识点：{', '.join(k['knowledge_point'] for k in focus_knowledge[:3])}，建议增加专项练习和变式训练"
            )
        for la in layer_analysis:
            if la["weakness"]:
                ai_recommendations.append(
                    f"{la['label']}正确率仅{la['accuracy']}%，低于70%，建议课堂适当放慢节奏，加强基础概念巩固"
                )
        if mastered:
            ai_recommendations.append(
                f"以下{len(mastered)}道题正确率超过90%，学生已较好掌握，课堂可简略带过：{', '.join(q['knowledge_point'] for q in mastered)}"
            )

        # 观看统计
        watch_logs = db.execute(
            "SELECT layer, COUNT(DISTINCT student_id) as watchers, SUM(completed) as completed_count FROM preview_watch_logs WHERE preview_task_id=? GROUP BY layer",
            (task_id,),
        ).fetchall()
        watch_stats = {dict(w)["layer"]: dict(w) for w in watch_logs}

    return {
        "task": {
            "id": task["id"],
            "lesson_title": task["lesson_title"],
            "lesson_code": task["lesson_code"],
            "created_at": task["created_at"],
        },
        "summary": {
            "total_students": total_students,
            "total_submissions": max(q["total_answers"] for q in question_reports) if question_reports else 0,
            "submission_rate": round(
                max(q["total_answers"] for q in question_reports) / total_students * 100, 1
            ) if total_students > 0 and question_reports else 0,
            "total_questions": len(question_reports),
            "avg_accuracy": round(
                sum(q["accuracy"] for q in question_reports) / len(question_reports), 1
            ) if question_reports else 0,
        },
        "question_reports": question_reports,
        "error_top": error_top,
        "knowledge_ranking": knowledge_ranking,
        "layer_analysis": layer_analysis,
        "layer_distribution": layer_distribution,
        "layer_eligible": layer_eligible,
        "watch_stats": watch_stats,
        "ai_recommendations": ai_recommendations,
        "focus_questions": focus_questions,
        "mastered_questions": mastered,
    }


# ===== 学生端：获取预习任务 =====

@router.get("/student/preview/{class_id}")
def student_previews(class_id: int, student_id: int = 0):
    """学生获取班级的预习任务列表（含分层视频和观看状态）。
    同时返回该学生的分层（layer），前端据此过滤可见题目：
    basic 只做基础题；advanced 做基础+提升；extension 做全部。
    """
    student_layer = "basic"
    with get_db() as db:
        if student_id:
            stu = db.execute(
                "SELECT layer FROM users WHERE id=? AND role='student'",
                (student_id,),
            ).fetchone()
            if stu and stu["layer"]:
                student_layer = stu["layer"]

        tasks = db.execute(
            "SELECT id, lesson_code, lesson_title, unit_code, preview_content, video_url, layer_videos, material_json, created_at FROM preview_tasks WHERE class_id=? AND status='published' ORDER BY created_at DESC",
            (class_id,),
        ).fetchall()
        result = []
        for t in tasks:
            task = dict(t)
            questions = db.execute(
                "SELECT id, question_text, question_type, difficulty, options FROM preview_questions WHERE preview_task_id=? ORDER BY sort_order",
                (task["id"],),
            ).fetchall()
            task["questions"] = [dict(q) for q in questions]

            # 获取该学生的观看记录
            if student_id:
                watches = db.execute(
                    "SELECT layer, completed, watch_duration, total_duration FROM preview_watch_logs WHERE preview_task_id=? AND student_id=?",
                    (task["id"], student_id),
                ).fetchall()
                task["watch_status"] = {dict(w)["layer"]: dict(w) for w in watches}
            else:
                task["watch_status"] = {}

            result.append(task)
    return {"tasks": result, "student_layer": student_layer}


# ===== 学生端：提交预习答案 =====

@router.post("/student/preview/answer")
def submit_preview_answer(req: SubmitAnswerRequest):
    """学生提交预习练习题答案，AI智能批改 + 错题自动录入"""
    with get_db() as db:
        q = db.execute(
            "SELECT correct_answer, preview_task_id, difficulty, question_text, knowledge_point, analysis FROM preview_questions WHERE id=?",
            (req.question_id,),
        ).fetchone()
        if not q:
            raise HTTPException(404, "题目不存在")

        # 按学生分层校验题目可见性：
        # basic → 仅基础题；advanced → 基础+提升；extension → 全部
        stu = db.execute(
            "SELECT layer FROM users WHERE id=? AND role='student'",
            (req.student_id,),
        ).fetchone()
        stu_layer = (stu["layer"] if stu and stu["layer"] else "basic")
        allowed = {"basic": ["basic"], "advanced": ["basic", "advanced"], "extension": ["basic", "advanced", "extension"]}
        if q["difficulty"] not in allowed.get(stu_layer, ["basic"]):
            layer_names = {"basic": "基础层", "advanced": "提升层", "extension": "拓展层"}
            raise HTTPException(403, f"你当前是{layer_names.get(stu_layer, '基础层')}，无需完成{layer_names.get(q['difficulty'], '该')}题目")

        # 检查是否已观看对应层的视频（仅旧格式 per-layer 视频才需要锁定）
        task_row = db.execute(
            "SELECT material_json FROM preview_tasks WHERE id=?",
            (q["preview_task_id"],),
        ).fetchone()
        is_new_format = bool(task_row and task_row["material_json"])

        if not is_new_format:
            # 旧格式：按分层视频锁定答题
            watch = db.execute(
                "SELECT completed FROM preview_watch_logs WHERE preview_task_id=? AND student_id=? AND layer=?",
                (q["preview_task_id"], req.student_id, q["difficulty"]),
            ).fetchone()
            if not watch or not watch["completed"]:
                raise HTTPException(403, f"请先观看{q['difficulty']}层预习视频后再答题")
        # 新格式：题目无视频锁定，直接允许作答

        correct_answer = q["correct_answer"].strip()
        student_answer = req.answer.strip()

        # AI智能判断答案对错（先快速等价/数值比较，再调用LLM）
        try:
            judge_result = ai_judge_preview_answer(
                question_text=q["question_text"] or "",
                student_answer=student_answer,
                correct_answer=correct_answer,
            )
            is_correct = 1 if judge_result.get("is_correct") else 0
            explanation = judge_result.get("explanation", "")
            normalized_answer = judge_result.get("normalized_answer", correct_answer)
        except Exception:
            # AI判断异常时回退到简单字符串比较
            is_correct = 1 if student_answer == correct_answer else 0
            explanation = "回答正确！" if is_correct else f"正确答案：{correct_answer}，请再检查计算过程。"
            normalized_answer = correct_answer

        existing = db.execute(
            "SELECT id FROM preview_answers WHERE preview_question_id=? AND student_id=?",
            (req.question_id, req.student_id),
        ).fetchone()
        if existing:
            db.execute(
                "UPDATE preview_answers SET student_answer=?, is_correct=?, submitted_at=CURRENT_TIMESTAMP WHERE id=?",
                (req.answer, is_correct, existing["id"]),
            )
        else:
            db.execute(
                "INSERT INTO preview_answers (preview_question_id, preview_task_id, student_id, student_answer, is_correct) VALUES (?, ?, ?, ?, ?)",
                (req.question_id, q["preview_task_id"], req.student_id, req.answer, is_correct),
            )

        # 答错时自动录入错题本（source='preview'，question_id=NULL 因为不来自 questions 表）
        error_note_id = None
        if not is_correct:
            # 避免同一道预习题重复录入未解决的错题
            dup = db.execute(
                "SELECT id FROM error_notes WHERE student_id=? AND question_text=? AND source='preview' AND status='unresolved'",
                (req.student_id, q["question_text"] or ""),
            ).fetchone()
            if not dup:
                knowledge_point = (q["knowledge_point"] or "").strip()
                error_type = "计算错误" if student_answer and any(c.isdigit() for c in student_answer) else "概念混淆"
                cursor = db.execute(
                    "INSERT INTO error_notes "
                    "(student_id, question_id, question_text, student_answer, correct_answer, "
                    "analysis, knowledge_point, error_type, source, homework_question_id, status) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        req.student_id,
                        None,  # question_id=NULL，预习错题不来自 questions 表
                        q["question_text"] or "",
                        req.answer,
                        correct_answer,
                        explanation,
                        knowledge_point,
                        error_type,
                        "preview",  # source 标记为预习来源
                        0,
                        "unresolved",
                    ),
                )
                error_note_id = cursor.lastrowid

        # 完成预习任务 +0.5分：检查是否全部题目已作答且未重复加分
        task_id = q["preview_task_id"]
        total_qs = db.execute(
            "SELECT COUNT(*) as cnt FROM preview_questions WHERE preview_task_id=?",
            (task_id,),
        ).fetchone()["cnt"]
        answered_qs = db.execute(
            "SELECT COUNT(*) as cnt FROM preview_answers WHERE preview_task_id=? AND student_id=?",
            (task_id, req.student_id),
        ).fetchone()["cnt"]
        already_rewarded = db.execute(
            "SELECT id FROM point_records WHERE student_id=? AND reason LIKE ? AND reason LIKE ?",
            (req.student_id, "%预习任务%", f"%task_{task_id}%"),
        ).fetchone()
        if total_qs > 0 and answered_qs >= total_qs and not already_rewarded:
            add_points(db, req.student_id, 0.5, f"完成预习任务-task_{task_id}")

        db.commit()

    return {
        "is_correct": bool(is_correct),
        "correct_answer": None if is_correct else correct_answer,
        "explanation": explanation,
        "normalized_answer": normalized_answer,
        "error_note_id": error_note_id,
    }


# ===== 学生端：记录视频观看 =====


@router.post("/student/preview/watch-log")
def submit_watch_log(req: WatchLogRequest):
    """记录学生观看分层预习视频的进度"""
    with get_db() as db:
        existing = db.execute(
            "SELECT id FROM preview_watch_logs WHERE preview_task_id=? AND student_id=? AND layer=?",
            (req.task_id, req.student_id, req.layer),
        ).fetchone()
        if existing:
            db.execute(
                """UPDATE preview_watch_logs
                   SET watch_duration=?, total_duration=?, completed=?, watched_at=CURRENT_TIMESTAMP
                   WHERE id=?""",
                (req.watch_duration, req.total_duration, 1 if req.completed else 0, existing["id"]),
            )
        else:
            db.execute(
                """INSERT INTO preview_watch_logs
                   (preview_task_id, student_id, layer, watch_duration, total_duration, completed)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (req.task_id, req.student_id, req.layer, req.watch_duration, req.total_duration,
                 1 if req.completed else 0),
            )
        db.commit()

    return {"message": "观看记录已保存", "completed": req.completed}


# ===== 页面代理抓取（解决 iframe 无法嵌入的问题） =====

_PROXY_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# 不需要登录、可以抓到正文内容的优质域名
_GOOD_CONTENT_DOMAINS = [
    "bilibili.com", "b23.tv",
    "zhihu.com", "csdn.net", "jianshu.com",
    "edu.cn", "weixin.qq.com",
]


@router.get("/resource/preview-resolve-url")
def preview_resolve_url(url: str = "", authorization: str = Header(None)):
    """
    解析百度/各平台跳转链接，返回最终真实地址。
    用于前端「预览原文」按钮获取正确文档地址。
    """
    get_teacher_id(authorization)
    if not url or url == "#":
        raise HTTPException(400, "无效的URL")
    try:
        with httpx.Client(timeout=10, follow_redirects=True, headers=_PROXY_HEADERS) as client:
            r = client.head(url)
            return {"original_url": url, "resolved_url": str(r.url)}
    except Exception as e:
        return {"original_url": url, "resolved_url": url, "error": str(e)[:200]}


@router.get("/resource/preview-proxy")
def preview_proxy(url: str = "", authorization: str = Header(None)):
    """
    服务端代理抓取页面内容，绕过 iframe 嵌入限制。
    百度跳转链接会被 httpx 自动 follow_redirects 解析到真实地址。
    返回 JSON：{ title, description, text, images, final_url, success }
    """
    get_teacher_id(authorization)

    if not url or url == "#":
        raise HTTPException(400, "无效的URL")

    try:
        with httpx.Client(timeout=15, follow_redirects=True, headers=_PROXY_HEADERS) as client:
            r = client.get(url)
            final_url = str(r.url)
            html = r.text
            status_code = r.status_code

        # 二进制文件（PPT/PDF/DOCX 等）无法直接预览
        content_type = (r.headers.get('content-type') or '').lower()
        if any(ct in content_type for ct in [
            'application/octet-stream', 'application/pdf', 'application/msword',
            'application/vnd', 'application/zip', 'application/x-rar',
            'application/x-7z-compressed', 'application/x-tar', 'application/gzip'
        ]):
            return {
                "title": "", "description": "", "text": "", "text_length": 0,
                "images": [], "final_url": final_url, "status_code": status_code,
                "success": False, "error": "FILE_FORMAT",
            }

        soup = BeautifulSoup(html, "html.parser")

        # 提取标题
        title = ""
        if soup.title and soup.title.string:
            title = soup.title.string.strip()
        og_title = soup.find("meta", attrs={"property": "og:title"})
        if og_title and og_title.get("content") and not title:
            title = og_title["content"].strip()

        # 提取 meta description
        description = ""
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            description = meta_desc["content"].strip()[:300]
        if not description:
            og_desc = soup.find("meta", attrs={"property": "og:description"})
            if og_desc and og_desc.get("content"):
                description = og_desc["content"].strip()[:300]

        # 提取 og:image
        images = []
        og_image = soup.find("meta", attrs={"property": "og:image"})
        if og_image and og_image.get("content"):
            images.append(og_image["content"])

        # 移除无关标签
        for tag in soup(["script", "style", "nav", "header", "footer", "aside",
                         "form", "iframe", "noscript", "svg"]):
            tag.decompose()

        # 尝试定位主要内容区域
        content_area = (
            soup.find("article")
            or soup.find("div", class_=re.compile(r"content|article|main|body|detail|text", re.I))
            or soup.find("div", id=re.compile(r"content|article|main|body|detail|text", re.I))
            or soup
        )

        # 提取正文文本
        raw_text = content_area.get_text(separator="\n", strip=True)
        lines = [l.strip() for l in raw_text.split("\n") if l.strip() and len(l.strip()) > 1]
        text = "\n".join(lines[:300])  # 最多300行

        # 提取正文中的图片（补充 og:image 之外的图）
        for img in content_area.find_all("img", limit=8):
            src = img.get("src") or img.get("data-src") or img.get("data-original") or ""
            if not src or src.startswith("data:"):
                continue
            if src.startswith("//"):
                src = "https:" + src
            elif src.startswith("/"):
                src = urljoin(final_url, src)
            if src not in images:
                images.append(src)
            if len(images) >= 6:
                break

        # 判断内容质量
        text_len = len(text)
        success = text_len > 50 or len(images) > 0 or bool(description)

        return {
            "title": title or description[:50] if description else "",
            "description": description,
            "text": text[:8000],
            "text_length": text_len,
            "images": images[:6],
            "final_url": final_url,
            "status_code": status_code,
            "success": success,
        }

    except httpx.TimeoutException:
        return {
            "title": "", "description": "", "text": "", "text_length": 0,
            "images": [], "final_url": url, "status_code": 0,
            "success": False, "error": "页面请求超时",
        }
    except Exception as e:
        return {
            "title": "", "description": "", "text": "", "text_length": 0,
            "images": [], "final_url": url, "status_code": 0,
            "success": False, "error": str(e)[:200],
        }


# ===== 全学科免费备课资源AI整合库 =====

# 文件夹 key -> 前端资源类型
_FOLDER_TYPE_MAP = {
    "courseware": "课件",
    "lesson_plan": "教案",
    "exercises": "练习",
    "videos": "微课",
}


def _flatten_search_results(resource_folders: dict) -> list:
    """把 {courseware:{items:{basic,advanced,extension}}} 扁平化为带 layer/resource_type 的列表"""
    flat = []
    for folder_key, folder in resource_folders.items():
        rtype = _FOLDER_TYPE_MAP.get(folder_key, folder.get("title", folder_key))
        items_by_layer = folder.get("items", {})
        for layer in ("basic", "advanced", "extension"):
            for it in items_by_layer.get(layer, []):
                # 直接修改原始对象并收集引用，确保后续 _enhance_with_curation
                # 能通过对象身份匹配资源（重建文件夹时需要找到同一对象）
                it["resource_type"] = rtype
                it["layer"] = layer
                flat.append(it)
    return flat


def _build_platforms_summary(resources: list) -> list:
    """统计各来源平台数量"""
    counter = {}
    for r in resources:
        p = r.get("platform", "网络公开资源")
        counter[p] = counter.get(p, 0) + 1
    return [{"name": k, "count": v} for k, v in counter.items()]


@router.post("/resource/search")
def resource_search(req: ResourceSearchRequest, authorization: str = Header(None)):
    """真实联网检索 + AI审查（去垃圾/确认分层/生成重点）+ 持久化"""
    teacher_id = get_teacher_id(authorization)
    lesson_title = req.lesson_title.strip()
    if not lesson_title:
        raise HTTPException(400, "请输入教学课题")

    # 1. 真实联网检索（百度课件/教案/练习 + B站视频）
    raw = search_all_resources(lesson_title, "")
    resources = _flatten_search_results(raw.get("resource_folders", {}))
    total_found = len(resources)

    if not resources:
        return {
            "lesson_title": lesson_title,
            "search_info": {
                "grade": req.grade, "subject": req.subject,
                "lesson_title": lesson_title, "textbook_version": req.textbook_version,
                "total_found": 0, "after_filter": 0,
            },
            "ai_note": "未检索到相关资源，请更换课题关键词后重试。",
            "resources": [],
            "platforms_summary": [],
            "saved": False,
        }

    # 2. AI审查：只对 B站视频做审查，AI生成内容保留原样
    ai_resources = [r for r in resources if r.get("is_ai_generated")]
    web_resources = [r for r in resources if not r.get("is_ai_generated")]

    curation = ai_curate_resources(web_resources, lesson_title, req.grade, req.subject) if web_resources else None
    keep_set = {}  # index -> {layer, highlight}
    if curation:
        for c in curation:
            if c.get("keep", True):
                keep_set[c["index"]] = {"layer": c.get("layer"), "highlight": c.get("highlight", "")}

    filtered = list(ai_resources)  # AI 内容全部保留
    for i, it in enumerate(web_resources):
        if curation and i not in keep_set:
            continue
        if curation:
            meta = keep_set.get(i, {})
            if meta.get("layer"):
                it["layer"] = meta["layer"]
            it["highlight"] = meta.get("highlight", "")
        else:
            it["highlight"] = it.get("description", "")[:40]
        if "url" not in it or not it.get("url"):
            it["url"] = it.get("platform_url", "#")
        filtered.append(it)

    after_filter = len(filtered)
    filtered_out = total_found - after_filter
    platforms_summary = _build_platforms_summary(filtered)

    ai_count = len(ai_resources)
    video_kept = len(filtered) - ai_count
    ai_note = (
        f"AI智能体已生成 {ai_count} 份分层教学文档（课件/教案/练习），"
        f"并从 B站检索的 {len(web_resources)} 个视频中精选 {video_kept} 个微课资源。"
    )

    result = {
        "lesson_title": lesson_title,
        "search_info": {
            "grade": req.grade,
            "subject": req.subject,
            "lesson_title": lesson_title,
            "textbook_version": req.textbook_version,
            "total_found": total_found,
            "after_filter": after_filter,
            "filtered_out": filtered_out,
        },
        "ai_note": ai_note,
        "resources": filtered,
        "platforms_summary": platforms_summary,
        "saved": True,
    }

    # 3. 持久化（按 教师+课题 upsert）
    _save_search_results(teacher_id, req, result)

    return result


def _save_search_results(teacher_id: int, req: ResourceSearchRequest, result: dict):
    """检索结果 upsert 到 resource_search_results"""
    with get_db() as db:
        cur = db.cursor()
        existing = cur.execute(
            "SELECT id FROM resource_search_results WHERE teacher_id=? AND lesson_title=?",
            (teacher_id, req.lesson_title.strip()),
        ).fetchone()
        payload = json.dumps(result, ensure_ascii=False)
        if existing:
            cur.execute(
                "UPDATE resource_search_results SET result_json=?, grade=?, subject=?, textbook_version=?, created_at=CURRENT_TIMESTAMP WHERE id=?",
                (payload, req.grade, req.subject, req.textbook_version, existing["id"]),
            )
        else:
            cur.execute(
                "INSERT INTO resource_search_results (teacher_id, lesson_title, grade, subject, textbook_version, result_json) VALUES (?,?,?,?,?,?)",
                (teacher_id, req.lesson_title.strip(), req.grade, req.subject, req.textbook_version, payload),
            )
        db.commit()


@router.get("/resource/search/saved")
def load_saved_search(lesson_title: str = "", authorization: str = Header(None)):
    """加载已持久化的检索结果：传 lesson_title 取该课题，不传取最近一次"""
    teacher_id = get_teacher_id(authorization)
    with get_db() as db:
        if lesson_title:
            row = db.execute(
                "SELECT * FROM resource_search_results WHERE teacher_id=? AND lesson_title=? ORDER BY created_at DESC LIMIT 1",
                (teacher_id, lesson_title.strip()),
            ).fetchone()
        else:
            row = db.execute(
                "SELECT * FROM resource_search_results WHERE teacher_id=? ORDER BY created_at DESC LIMIT 1",
                (teacher_id,),
            ).fetchone()
    if not row:
        return {"found": False}
    data = json.loads(row["result_json"])
    data["found"] = True
    return data



# ===== 教师备课资源收藏（基础生档案 / 提升生档案 / 拓展生档案） =====

class CollectResourceRequest(BaseModel):
    layer: str = "basic"
    lesson_code: str = ""
    lesson_title: str = ""
    resource_type: str
    title: str
    url: str = ""
    embed_url: str = ""
    platform: str = ""
    description: str = ""
    highlight: str = ""
    format: str = ""
    size: str = ""
    bvid: str = ""
    match_score: int = 0
    class_id: int = 0
    is_ai_generated: bool = False
    ai_content: Optional[Dict[str, Any]] = None


@router.post("/teacher/resources/collect")
def collect_resource(req: CollectResourceRequest, authorization: str = Header(None)):
    """将教学资源收藏到对应层次的备课档案（如基础生档案）"""
    teacher_id = get_teacher_id(authorization)
    class_id = req.class_id or None  # 0 -> NULL，避免外键约束失败

    with get_db() as db:
        cursor = db.cursor()
        cursor.execute(
            """INSERT INTO teacher_resource_collections
               (teacher_id, class_id, lesson_code, lesson_title, layer, resource_type, title, url, embed_url, platform, description, highlight, format, size, bvid, match_score, is_ai_generated, ai_content)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (teacher_id, class_id, req.lesson_code, req.lesson_title, req.layer, req.resource_type, req.title,
             req.url, req.embed_url, req.platform, req.description, req.highlight,
             req.format, req.size, req.bvid, req.match_score,
             1 if req.is_ai_generated else 0, json.dumps(req.ai_content, ensure_ascii=False) if req.ai_content else None),
        )
        db.commit()
        collection_id = cursor.lastrowid

    return {"message": f"已添加到{req.layer}层备课档案", "id": collection_id}


@router.get("/teacher/resources/collection")
def list_collection(layer: str = "", lesson_code: str = "", authorization: str = Header(None)):
    """获取教师收藏的资源列表，可按层次和课时筛选"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        sql = "SELECT * FROM teacher_resource_collections WHERE teacher_id=?"
        params = [teacher_id]
        if layer:
            sql += " AND layer=?"
            params.append(layer)
        if lesson_code:
            sql += " AND lesson_code=?"
            params.append(lesson_code)
        sql += " ORDER BY created_at DESC"
        rows = db.execute(sql, params).fetchall()

    items = []
    for r in rows:
        d = dict(r)
        # 解析 ai_content JSON 字段
        if d.get('ai_content'):
            try:
                d['ai_content'] = json.loads(d['ai_content'])
            except (json.JSONDecodeError, TypeError):
                d['ai_content'] = None
        # 将 is_ai_generated 从 INTEGER 转为 bool
        d['is_ai_generated'] = bool(d.get('is_ai_generated', 0))
        items.append(d)

    return {"items": items}


@router.delete("/teacher/resources/collection/{item_id}")
def delete_collection(item_id: int, authorization: str = Header(None)):
    """删除收藏的资源"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        cursor = db.cursor()
        cursor.execute(
            "DELETE FROM teacher_resource_collections WHERE id=? AND teacher_id=?",
            (item_id, teacher_id),
        )
        db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(404, "资源不存在或无权限删除")

    return {"message": "已删除"}


class BatchCollectItem(BaseModel):
    title: str
    resource_type: str = ""
    url: str = ""
    embed_url: str = ""
    platform: str = ""
    description: str = ""
    highlight: str = ""
    format: str = ""
    size: str = ""
    bvid: str = ""
    match_score: int = 0
    is_ai_generated: bool = False
    ai_content: Optional[Dict[str, Any]] = None


class BatchCollectRequest(BaseModel):
    layer: str = "basic"
    lesson_code: str = ""
    lesson_title: str = ""
    class_id: int = 0
    items: List[BatchCollectItem]


@router.post("/teacher/resources/collect/batch")
def collect_batch(req: BatchCollectRequest, authorization: str = Header(None)):
    """批量收藏资源到某一层档案夹（基础生/提升生/拓展生）"""
    teacher_id = get_teacher_id(authorization)
    if req.layer not in ("basic", "advanced", "extension"):
        raise HTTPException(400, "层次必须是 basic / advanced / extension")
    if not req.items:
        raise HTTPException(400, "未选择任何资源")
    class_id = req.class_id or None  # 0 -> NULL，避免外键约束失败

    inserted = 0
    with get_db() as db:
        cur = db.cursor()
        for it in req.items:
            # 去重：同教师同课时同层同标题不重复加入
            dup = cur.execute(
                "SELECT id FROM teacher_resource_collections WHERE teacher_id=? AND lesson_code=? AND layer=? AND title=?",
                (teacher_id, req.lesson_code, req.layer, it.title),
            ).fetchone()
            if dup:
                continue
            cur.execute(
                """INSERT INTO teacher_resource_collections
                   (teacher_id, class_id, lesson_code, lesson_title, layer, resource_type, title, url, embed_url, platform, description, highlight, format, size, bvid, match_score, is_ai_generated, ai_content)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (teacher_id, class_id, req.lesson_code, req.lesson_title, req.layer, it.resource_type, it.title,
                 it.url, it.embed_url, it.platform, it.description, it.highlight,
                 it.format, it.size, it.bvid, it.match_score,
                 1 if it.is_ai_generated else 0, json.dumps(it.ai_content, ensure_ascii=False) if it.ai_content else None),
            )
            inserted += 1
        db.commit()

    layer_name = {"basic": "基础生", "advanced": "提升生", "extension": "拓展生"}.get(req.layer, req.layer)
    return {"message": f"已将 {inserted} 条资源加入{layer_name}档案", "inserted": inserted}
