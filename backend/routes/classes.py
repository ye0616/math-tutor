"""班级管理路由"""

import io
import csv
import random
import string
from fastapi import APIRouter, Header, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from database import get_db, hash_password
from auth import get_user_from_token

router = APIRouter()


def generate_class_code() -> str:
    """生成6位班级码（大写字母+数字）"""
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=6))


def get_teacher_id(authorization: str) -> int:
    """验证教师身份，返回 user_id（同时检查用户在数据库中是否存在）"""
    payload = get_user_from_token(authorization or "")
    if not payload:
        raise HTTPException(401, "未登录或Token已过期，请重新登录")
    if payload["role"] != "teacher":
        raise HTTPException(403, "仅教师可操作")
    user_id = payload["user_id"]
    # 验证用户在数据库中是否存在（防止旧 token 指向已删除的用户）
    with get_db() as db:
        cursor = db.cursor()
        user = cursor.execute("SELECT id, role, status FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        raise HTTPException(401, "账号不存在，请重新登录")
    if user["role"] != "teacher":
        raise HTTPException(403, "仅教师可操作")
    return user_id


class CreateClassRequest(BaseModel):
    name: str


@router.post("/create")
def create_class(req: CreateClassRequest, authorization: str = Header(None)):
    """教师创建班级，自动生成班级码"""
    teacher_id = get_teacher_id(authorization)

    if not req.name.strip():
        raise HTTPException(400, "班级名称不能为空")

    with get_db() as db:
        cursor = db.cursor()
        # 生成唯一班级码
        code = generate_class_code()
        while cursor.execute("SELECT id FROM classes WHERE class_code = ?", (code,)).fetchone():
            code = generate_class_code()

        cursor.execute(
            "INSERT INTO classes (name, teacher_id, class_code) VALUES (?, ?, ?)",
            (req.name.strip(), teacher_id, code),
        )
        class_id = cursor.lastrowid

    return {
        "message": "班级创建成功",
        "class": {"id": class_id, "name": req.name.strip(), "class_code": code},
    }


@router.get("/my")
def my_classes(authorization: str = Header(None)):
    """获取当前教师的班级列表"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        cursor = db.cursor()
        rows = cursor.execute(
            """SELECT c.id, c.name, c.class_code,
               (SELECT COUNT(*) FROM users WHERE class_id = c.id AND role = 'student') as student_count
               FROM classes c WHERE c.teacher_id = ? ORDER BY c.id DESC""",
            (teacher_id,),
        ).fetchall()

    return {"classes": [dict(r) for r in rows]}


@router.get("/{class_id}/students")
def class_students(class_id: int, authorization: str = Header(None)):
    """获取班级学生列表"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        cursor = db.cursor()
        # 验证班级归属
        cls = cursor.execute("SELECT id, name, class_code, teacher_id FROM classes WHERE id = ?", (class_id,)).fetchone()
        if not cls:
            raise HTTPException(404, "班级不存在")
        if cls["teacher_id"] != teacher_id:
            raise HTTPException(403, "无权操作其他教师的班级")

        students = cursor.execute(
            "SELECT id, name, student_no, points, status FROM users WHERE class_id = ? AND role = 'student' ORDER BY id",
            (class_id,),
        ).fetchall()

    return {"class": dict(cls), "students": [dict(s) for s in students]}


class ImportStudentsRequest(BaseModel):
    class_id: int
    students: list[dict]  # [{"name": "张三", "student_no": "S001"}] 或 [{"name": "张三"}]


@router.post("/import-students")
def import_students(req: ImportStudentsRequest, authorization: str = Header(None)):
    """批量导入学生（自动创建账号，学号即密码）"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        cursor = db.cursor()
        # 验证班级归属
        cls = cursor.execute("SELECT id, teacher_id FROM classes WHERE id = ?", (req.class_id,)).fetchone()
        if not cls:
            raise HTTPException(404, "班级不存在")
        if cls["teacher_id"] != teacher_id:
            raise HTTPException(403, "无权操作其他教师的班级")

        imported = []
        moved = []
        skipped = []
        for s in req.students:
            name = s.get("name", "").strip()
            if not name:
                skipped.append({"name": name, "reason": "姓名为空"})
                continue
            student_no = s.get("student_no", "").strip()
            if not student_no:
                skipped.append({"name": name, "reason": "学号为空"})
                continue

            # 检查学号是否已存在
            existing = cursor.execute("SELECT id, name, class_id FROM users WHERE student_no = ?", (student_no,)).fetchone()
            if existing:
                if existing["class_id"] == req.class_id:
                    skipped.append({"name": name, "student_no": student_no, "reason": "已在当前班级"})
                else:
                    cursor.execute(
                        "UPDATE users SET class_id = ?, name = ? WHERE id = ?",
                        (req.class_id, name, existing["id"]),
                    )
                    moved.append({"name": name, "student_no": student_no, "previous_class_id": existing["class_id"]})
                continue

            cursor.execute(
                "INSERT INTO users (role, name, student_no, password_hash, status, class_id, points) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("student", name, student_no, hash_password(student_no), "active", req.class_id, 0),
            )
            imported.append({"name": name, "student_no": student_no})

    return {
        "message": f"导入完成：成功{len(imported)}人，移动{len(moved)}人，跳过{len(skipped)}人",
        "imported": imported,
        "moved": moved,
        "skipped": skipped,
    }


@router.post("/import-excel")
async def import_excel(
    file: UploadFile = File(...),
    class_id: int = Form(...),
    authorization: str = Header(None),
):
    """上传 Excel/CSV 文件批量导入学生（自动解析学号+姓名列）"""
    teacher_id = get_teacher_id(authorization)

    # 读取文件内容
    content = await file.read()
    filename = file.filename or ""

    # 解析学生列表
    students = []

    if filename.endswith(".xlsx") or filename.endswith(".xls"):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            raise HTTPException(400, "文件为空")
        # 解析表头，找学号列和姓名列
        header = [str(c).strip() if c else "" for c in rows[0]]
        no_idx = None
        name_idx = None
        for i, h in enumerate(header):
            if "学号" in h or "student" in h.lower() or "no" in h.lower():
                no_idx = i
            if "姓名" in h or "name" in h.lower():
                name_idx = i
        # 如果没找到表头，尝试第一列学号、第二列姓名
        has_header = no_idx is not None and name_idx is not None
        if not has_header:
            no_idx, name_idx = 0, 1
            data_rows = rows
        else:
            data_rows = rows[1:]
        for row in data_rows:
            if no_idx >= len(row) or name_idx >= len(row):
                continue
            no = str(row[no_idx]).strip() if row[no_idx] else ""
            name = str(row[name_idx]).strip() if row[name_idx] else ""
            if name and no:
                students.append({"name": name, "student_no": no})

    elif filename.endswith(".csv"):
        text = content.decode("utf-8-sig")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        if not rows:
            raise HTTPException(400, "CSV 文件为空")
        header = [str(c).strip() if c else "" for c in rows[0]]
        no_idx = None
        name_idx = None
        for i, h in enumerate(header):
            if "学号" in h or "student" in h.lower():
                no_idx = i
            if "姓名" in h or "name" in h.lower():
                name_idx = i
        has_header = no_idx is not None and name_idx is not None
        if not has_header:
            no_idx, name_idx = 0, 1
            data_rows = rows
        else:
            data_rows = rows[1:]
        for row in data_rows:
            if no_idx >= len(row) or name_idx >= len(row):
                continue
            no = row[no_idx].strip()
            name = row[name_idx].strip()
            if name and no:
                students.append({"name": name, "student_no": no})
    else:
        raise HTTPException(400, "仅支持 .xlsx 和 .csv 文件")

    if not students:
        raise HTTPException(400, "未解析到有效学生数据，请确认文件包含学号和姓名列")

    # 导入到数据库
    with get_db() as db:
        cursor = db.cursor()
        cls = cursor.execute("SELECT id, teacher_id FROM classes WHERE id = ?", (class_id,)).fetchone()
        if not cls:
            raise HTTPException(404, "班级不存在")
        if cls["teacher_id"] != teacher_id:
            raise HTTPException(403, "无权操作其他教师的班级")

        imported = []
        moved = []
        skipped = []
        for s in students:
            name = s["name"].strip()
            student_no = s["student_no"].strip()
            if not name or not student_no:
                skipped.append({"name": name, "student_no": student_no, "reason": "姓名或学号为空"})
                continue
            existing = cursor.execute("SELECT id, name, class_id FROM users WHERE student_no = ?", (student_no,)).fetchone()
            if existing:
                if existing["class_id"] == class_id:
                    skipped.append({"name": name, "student_no": student_no, "reason": "已在当前班级"})
                else:
                    cursor.execute(
                        "UPDATE users SET class_id = ?, name = ? WHERE id = ?",
                        (class_id, name, existing["id"]),
                    )
                    moved.append({"name": name, "student_no": student_no, "previous_class_id": existing["class_id"]})
                continue
            cursor.execute(
                "INSERT INTO users (role, name, student_no, password_hash, status, class_id, points) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("student", name, student_no, hash_password(student_no), "active", class_id, 0),
            )
            imported.append({"name": name, "student_no": student_no})

    return {
        "message": f"导入完成：成功{len(imported)}人，移动{len(moved)}人，跳过{len(skipped)}人",
        "imported": imported,
        "moved": moved,
        "skipped": skipped,
    }


@router.get("/by-code/{class_code}")
def class_by_code(class_code: str):
    """通过班级码查询班级信息（学生注册时用）"""
    with get_db() as db:
        cursor = db.cursor()
        cls = cursor.execute(
            "SELECT id, name, class_code FROM classes WHERE class_code = ?",
            (class_code.upper(),),
        ).fetchone()

    if not cls:
        raise HTTPException(404, "班级码不存在")

    return {"class": dict(cls)}


@router.delete("/{class_id}")
def delete_class(class_id: int, authorization: str = Header(None)):
    """删除班级（不删学生，只解绑）"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        cursor = db.cursor()
        cls = cursor.execute("SELECT id, teacher_id FROM classes WHERE id = ?", (class_id,)).fetchone()
        if not cls:
            raise HTTPException(404, "班级不存在")
        if cls["teacher_id"] != teacher_id:
            raise HTTPException(403, "无权操作其他教师的班级")

        # 解绑学生
        cursor.execute("UPDATE users SET class_id = NULL WHERE class_id = ?", (class_id,))
        # 删除班级
        cursor.execute("DELETE FROM classes WHERE id = ?", (class_id,))

    return {"message": "班级已删除"}


# ===== 学生分层管理 =====

class SetLayerRequest(BaseModel):
    layer: str  # basic / advanced / extension


@router.get("/{class_id}/layers")
def get_class_layers(class_id: int, authorization: str = Header(None)):
    """获取班级学生分层列表"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        cursor = db.cursor()
        cls = cursor.execute("SELECT id, teacher_id FROM classes WHERE id = ?", (class_id,)).fetchone()
        if not cls:
            raise HTTPException(404, "班级不存在")
        if cls["teacher_id"] != teacher_id:
            raise HTTPException(403, "无权操作其他教师的班级")

        students = cursor.execute(
            "SELECT id, name, student_no, points, layer FROM users WHERE class_id = ? AND role = 'student' ORDER BY id",
            (class_id,),
        ).fetchall()

        # 分层统计
        layer_counts = {"basic": 0, "advanced": 0, "extension": 0, "unassigned": 0}
        for s in students:
            layer = s["layer"] or "basic"
            if layer in layer_counts:
                layer_counts[layer] += 1
            else:
                layer_counts["unassigned"] += 1

        # 最近一次分层记录
        history = cursor.execute(
            """SELECT slh.*, u.name as student_name
               FROM student_layer_history slh
               JOIN users u ON slh.student_id = u.id
               WHERE slh.class_id = ?
               ORDER BY slh.created_at DESC LIMIT 20""",
            (class_id,),
        ).fetchall()

    return {
        "students": [dict(s) for s in students],
        "layer_counts": layer_counts,
        "history": [dict(h) for h in history],
    }


@router.post("/{class_id}/students/{student_id}/layer")
def set_student_layer(class_id: int, student_id: int, req: SetLayerRequest, authorization: str = Header(None)):
    """手动设置学生分层"""
    teacher_id = get_teacher_id(authorization)

    if req.layer not in ("basic", "advanced", "extension"):
        raise HTTPException(400, "layer 必须为 basic / advanced / extension")

    with get_db() as db:
        cursor = db.cursor()
        cls = cursor.execute("SELECT id, teacher_id FROM classes WHERE id = ?", (class_id,)).fetchone()
        if not cls:
            raise HTTPException(404, "班级不存在")
        if cls["teacher_id"] != teacher_id:
            raise HTTPException(403, "无权操作其他教师的班级")

        student = cursor.execute(
            "SELECT id, name, layer, class_id FROM users WHERE id = ? AND role = 'student'",
            (student_id,),
        ).fetchone()
        if not student:
            raise HTTPException(404, "学生不存在")
        if student["class_id"] != class_id:
            raise HTTPException(400, "该学生不在当前班级")

        old_layer = student["layer"] or "basic"
        cursor.execute("UPDATE users SET layer = ? WHERE id = ?", (req.layer, student_id))
        cursor.execute(
            """INSERT INTO student_layer_history (student_id, class_id, old_layer, new_layer, source)
               VALUES (?, ?, ?, ?, 'manual')""",
            (student_id, class_id, old_layer, req.layer),
        )
        db.commit()

    return {"message": f"已将学生分层设为 {req.layer}", "old_layer": old_layer, "new_layer": req.layer}


class AutoLayerRequest(BaseModel):
    scores: list[dict]  # [{"student_id": 1, "score": 85}, ...] 或 [{"name": "张三", "student_no": "S001", "score": 85}, ...]


@router.post("/{class_id}/auto-layer")
def auto_layer(class_id: int, req: AutoLayerRequest, authorization: str = Header(None)):
    """根据考试成绩 AI 自动分层"""
    teacher_id = get_teacher_id(authorization)

    with get_db() as db:
        cursor = db.cursor()
        cls = cursor.execute("SELECT id, teacher_id, name FROM classes WHERE id = ?", (class_id,)).fetchone()
        if not cls:
            raise HTTPException(404, "班级不存在")
        if cls["teacher_id"] != teacher_id:
            raise HTTPException(403, "无权操作其他教师的班级")

        # 获取班级所有学生
        students = cursor.execute(
            "SELECT id, name, student_no, layer FROM users WHERE class_id = ? AND role = 'student'",
            (class_id,),
        ).fetchall()
        student_map = {s["id"]: s for s in students}
        student_map_by_no = {s["student_no"]: s for s in students}

        # 匹配成绩
        score_map = {}  # student_id -> score
        unmatched = []
        for entry in req.scores:
            sid = entry.get("student_id")
            score = entry.get("score", 0)
            if sid and sid in student_map:
                score_map[sid] = float(score)
            else:
                # 尝试用 name + student_no 匹配
                name = entry.get("name", "")
                sno = entry.get("student_no", "")
                matched = False
                if sno and sno in student_map_by_no:
                    score_map[student_map_by_no[sno]["id"]] = float(score)
                    matched = True
                if not matched:
                    # 用 name 模糊匹配
                    for s in students:
                        if s["name"] == name:
                            score_map[s["id"]] = float(score)
                            matched = True
                            break
                if not matched:
                    unmatched.append(entry)

        if not score_map:
            raise HTTPException(400, "未匹配到任何学生成绩，请确认学生姓名/学号")

        # 按成绩排序并分层
        sorted_scores = sorted(score_map.items(), key=lambda x: x[1], reverse=True)
        n = len(sorted_scores)

        # 分层比例：前 30% 拓展层，中间 40% 提升层，后 30% 基础层
        # 至少每层 1 人（如果人数足够）
        if n <= 2:
            # 少于3人，全部基础层
            layer_assignment = {sid: "basic" for sid, _ in sorted_scores}
        else:
            ext_count = max(1, round(n * 0.3))
            adv_count = max(1, round(n * 0.4))
            layer_assignment = {}
            for i, (sid, score) in enumerate(sorted_scores):
                if i < ext_count:
                    layer_assignment[sid] = "extension"
                elif i < ext_count + adv_count:
                    layer_assignment[sid] = "advanced"
                else:
                    layer_assignment[sid] = "basic"

        # 写入数据库
        results = []
        for sid, layer in layer_assignment.items():
            old_layer = student_map[sid]["layer"] or "basic"
            score = score_map[sid]
            cursor.execute("UPDATE users SET layer = ? WHERE id = ?", (layer, sid))
            cursor.execute(
                """INSERT INTO student_layer_history (student_id, class_id, old_layer, new_layer, source, exam_score)
                   VALUES (?, ?, ?, ?, 'ai', ?)""",
                (sid, class_id, old_layer, layer, score),
            )
            results.append({
                "student_id": sid,
                "name": student_map[sid]["name"],
                "student_no": student_map[sid]["student_no"],
                "score": score,
                "old_layer": old_layer,
                "new_layer": layer,
            })

        db.commit()

    layer_counts = {"basic": 0, "advanced": 0, "extension": 0}
    for r in results:
        layer_counts[r["new_layer"]] += 1

    return {
        "message": f"AI自动分层完成：基础层{layer_counts['basic']}人，提升层{layer_counts['advanced']}人，拓展层{layer_counts['extension']}人",
        "results": results,
        "layer_counts": layer_counts,
        "unmatched": unmatched,
    }
