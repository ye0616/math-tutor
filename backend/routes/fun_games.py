"""数学趣味闯关小游戏路由

小游戏：
1. 24点游戏 - 4个数字算24
2. 速算挑战 - 限时60秒回答计算题
3. 数字记忆 - 记忆数字序列
4. 趣味数学密铺 - 图形密铺、内角和、图形运动

API:
- GET /24points - 获取24点题目
- POST /24points/verify - 验证24点答案
- GET /speed-quiz - 获取速算题目
- GET /tessellation - 获取密铺题目
- POST /record - 保存游戏成绩+积分
- GET /leaderboard - 游戏排行榜
"""

import json
import random
import re
from fastapi import APIRouter, HTTPException, Form, Query
from pydantic import BaseModel
from database import get_db, add_points, get_daily_points_by_reason_prefix
from auth import get_user_from_token
from agents.llm import ai_generate_24points, ai_generate_speed_quiz

router = APIRouter()


def get_student_id(authorization: str) -> int:
    """验证学生身份"""
    payload = get_user_from_token(authorization or "")
    if not payload:
        raise HTTPException(401, "未登录或Token已过期")
    if payload.get("role") != "student":
        raise HTTPException(403, "仅学生可使用游戏功能")
    return payload["user_id"]


# ===== 24点游戏 =====

@router.get("/24points")
def get_24points(count: int = Query(5), authorization: str = Query("")):
    """获取24点游戏题目"""
    get_student_id(authorization)
    result = ai_generate_24points(count=count)
    return {"success": True, "data": result}


@router.post("/24points/verify")
def verify_24points(
    numbers: str = Form(...),
    expression: str = Form(...),
    authorization: str = Form(""),
):
    """验证学生提交的24点表达式

    验证逻辑：
    1. 将表达式中的 × 替换为 *，÷ 替换为 /
    2. 检查使用的数字是否和给定数字一致
    3. 计算表达式结果是否等于24
    """
    get_student_id(authorization)

    # 解析给定数字
    try:
        given_nums = sorted([int(n.strip()) for n in numbers.split(",")])
    except:
        raise HTTPException(400, "数字格式错误")

    # 提取表达式中使用的数字
    expr_nums_raw = re.findall(r'\d+', expression)
    if not expr_nums_raw:
        raise HTTPException(400, "表达式无效")
    used_nums = sorted([int(n) for n in expr_nums_raw])

    if given_nums != used_nums:
        return {
            "success": True,
            "data": {
                "is_correct": False,
                "reason": "使用的数字与题目不一致",
                "given": given_nums,
                "used": used_nums,
            },
        }

    # 计算表达式
    expr_eval = expression.replace("×", "*").replace("÷", "/").replace("x", "*")
    try:
        result = eval(expr_eval, {"__builtins__": {}}, {})
        is_correct = abs(float(result) - 24) < 0.001
        return {
            "success": True,
            "data": {
                "is_correct": is_correct,
                "result": float(result),
                "reason": "正确！结果是24" if is_correct else f"结果是{result}，不等于24",
            },
        }
    except Exception as e:
        return {
            "success": True,
            "data": {
                "is_correct": False,
                "reason": f"表达式无法计算: {str(e)}",
            },
        }


# ===== 速算挑战 =====

@router.get("/speed-quiz")
def get_speed_quiz(
    count: int = Query(10),
    difficulty: str = Query("mixed"),
    unit_code: str = Query(""),
    lesson_code: str = Query(""),
    authorization: str = Query(""),
):
    """获取速算挑战题目（可选按课题出题）"""
    get_student_id(authorization)

    # 如果指定了课题，从统一知识树查找课题标题
    lesson_title = ""
    if lesson_code:
        from curriculum import KNOWLEDGE_TREE
        for unit_data in KNOWLEDGE_TREE.values():
            if lesson_code in unit_data["lessons"]:
                lesson_title = unit_data["lessons"][lesson_code]["title"]
                break

    result = ai_generate_speed_quiz(
        count=count,
        difficulty=difficulty,
        unit_code=lesson_code,
        lesson_title=lesson_title,
    )
    return {"success": True, "data": result}


# ===== 数字记忆游戏 =====
# 纯前端实现，不需要后端出题

# ===== 趣味数学密铺游戏 =====

# 密铺相关基础数据
TESSELLATION_SHAPES = [
    {"name": "等边三角形", "angles": [60, 60, 60], "can_tessellate": True, "reason": "任意三角形都可以密铺"},
    {"name": "正方形", "angles": [90, 90, 90, 90], "can_tessellate": True, "reason": "四边形内角和为360°，可以密铺"},
    {"name": "长方形", "angles": [90, 90, 90, 90], "can_tessellate": True, "reason": "四个直角可以在一个顶点拼成360°"},
    {"name": "平行四边形", "angles": "variable", "can_tessellate": True, "reason": "任意四边形都可以密铺"},
    {"name": "正六边形", "angles": [120, 120, 120, 120, 120, 120], "can_tessellate": True, "reason": "每个内角120°，3个正六边形可在一点拼成360°"},
    {"name": "正五边形", "angles": [108, 108, 108, 108, 108], "can_tessellate": False, "reason": "正五边形每个内角108°，不能整除360°"},
    {"name": "圆形", "angles": [], "can_tessellate": False, "reason": "圆形之间有缝隙，无法密铺"},
    {"name": "任意梯形", "angles": "variable", "can_tessellate": True, "reason": "梯形是四边形，可以密铺"},
]


def _generate_tessellation_questions(count: int = 10) -> list:
    """生成趣味数学密铺题目（模板化，无需AI）"""
    _NUM_NAMES = {3: '三', 4: '四', 5: '五', 6: '六', 8: '八', 10: '十'}

    questions = []
    templates = [
        # 类型1：判断能否密铺
        {
            "type": "choice",
            "generator": lambda shape: {
                "question": f"下列图形中，哪个{'能' if shape['can_tessellate'] else '不能'}单独密铺平面？",
                "options": _build_options(shape, key=lambda s: s["name"], correct=lambda s: s["can_tessellate"] == shape["can_tessellate"]),
                "answer": shape["name"],
                "analysis": f"{shape['name']} {shape['reason']}。",
                "knowledge_point": "平面图形的密铺",
            },
            "pool": TESSELLATION_SHAPES,
        },
        # 类型2：内角和计算
        {
            "type": "fill",
            "generator": lambda n: {
                "question": f"一个{_NUM_NAMES.get(n, str(n))}边形的内角和是多少度？",
                "answer": str((n - 2) * 180),
                "analysis": f"多边形内角和公式：(n-2)×180°，所以 {n} 边形内角和 = ({n}-2)×180° = {(n-2)*180}°。",
                "knowledge_point": "多边形内角和",
            },
            "pool": [4, 5, 6, 8],
        },
        # 类型3：正多边形每个内角
        {
            "type": "fill",
            "generator": lambda n: {
                "question": f"正{_NUM_NAMES.get(n, str(n))}边形的每个内角是多少度？",
                "answer": str((n - 2) * 180 // n),
                "analysis": f"正{n}边形内角和为{(n-2)*180}°，平均分成{n}份，每个内角 = {(n-2)*180//n}°。",
                "knowledge_point": "正多边形内角",
            },
            "pool": [3, 4, 5, 6, 8],
        },
        # 类型4：一个顶点周围能放几个正多边形
        {
            "type": "fill",
            "generator": lambda n: {
                "question": f"几个正{_NUM_NAMES.get(n, str(n))}边形可以在一个顶点处刚好密铺？（没有重叠也没有空隙）",
                "answer": str(360 // ((n - 2) * 180 // n)),
                "analysis": f"正{n}边形每个内角是{((n-2)*180//n)}°，360°÷{((n-2)*180//n)}° = {360 // ((n - 2) * 180 // n)}。",
                "knowledge_point": "密铺的角度条件",
            },
            "pool": [3, 4, 6],
        },
        # 类型5：识别密铺用到的变换
        {
            "type": "choice",
            "generator": lambda transform: {
                "question": f"很多地砖图案是通过同一种基本图形不断{transform['desc']}得到的，这种运动方式叫什么？",
                "options": random.sample(["平移", "旋转", "轴对称"], 3),
                "answer": transform["name"],
                "analysis": transform["analysis"],
                "knowledge_point": "图形的运动",
            },
            "pool": [
                {"name": "平移", "desc": "沿着直线移动", "analysis": "平移是指图形沿某个方向移动一定的距离，形状和大小不变。"},
                {"name": "旋转", "desc": "绕着一个点转动", "analysis": "旋转是指图形绕某一点转动一定的角度，形状和大小不变。"},
                {"name": "轴对称", "desc": "对折后完全重合", "analysis": "轴对称是指图形沿一条直线对折后，两边能够完全重合。"},
            ],
        },
    ]

    random.shuffle(templates)
    used = []
    while len(questions) < count:
        for t in templates:
            item = random.choice(t["pool"])
            # 避免连续重复
            if item in used and len(used) >= 2:
                continue
            used.append(item)
            q = t["generator"](item)
            q["question_type"] = t["type"]
            questions.append(q)
            if len(questions) >= count:
                break
    return questions[:count]


def _build_options(target, key, correct, count=4):
    """为选择题构造干扰项（确保只有一个正确选项）"""
    correct_name = key(target)
    correct_val = correct(target)
    # 干扰项必须与正确选项的 can_tessellate 属性相反
    candidates = [key(s) for s in TESSELLATION_SHAPES if key(s) != correct_name and correct(s) != correct_val]
    random.shuffle(candidates)
    options = [correct_name]
    for c in candidates:
        if len(options) >= count:
            break
        options.append(c)
    random.shuffle(options)
    return options


@router.get("/tessellation")
def get_tessellation_questions(
    count: int = Query(10),
    authorization: str = Query(""),
):
    """获取趣味数学密铺题目"""
    get_student_id(authorization)
    questions = _generate_tessellation_questions(count)
    return {"success": True, "data": {"questions": questions}}


# ===== 游戏成绩保存 =====

class GameRecordRequest(BaseModel):
    game_type: str  # 24points / speed_quiz / memory
    score: int = 0
    correct_count: int = 0
    total_count: int = 0
    time_used: int = 0  # 秒
    detail: dict = {}
    wrong_questions: list = []  # [{question, student_answer, correct_answer, knowledge_point}] 错题列表


@router.post("/record")
def save_game_record(
    req: GameRecordRequest,
    authorization: str = Query(""),
):
    """保存游戏成绩并发放积分

    积分规则：完成闯关 +0.1，每日累计最多 +1（与创意闯关共用前缀"闯关"）
    """
    student_id = get_student_id(authorization)

    # 积分：闯关 +0.1，每日累计最多 +1
    with get_db() as db:
        daily_earned = get_daily_points_by_reason_prefix(db, student_id, "闯关")
        points = 0.0
        if daily_earned < 1.0:
            points = min(0.1, 1.0 - daily_earned)
            if points > 0:
                game_name = {
                    "24points": "24点游戏",
                    "speed_quiz": "速算挑战",
                    "memory": "数字记忆",
                    "tessellation": "趣味数学密铺",
                }.get(req.game_type, req.game_type)
                add_points(db, student_id, points, f"闯关{game_name}")

        # 保存记录
        db.execute(
            "INSERT INTO mini_game_records (student_id, game_type, score, correct_count, total_count, time_used, detail_json, points_earned) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                student_id,
                req.game_type,
                req.score,
                req.correct_count,
                req.total_count,
                req.time_used,
                json.dumps(req.detail, ensure_ascii=False),
                points,
            ),
        )

        # 速算/密铺挑战错题同步到错题本
        if req.game_type in ("speed_quiz", "tessellation") and req.wrong_questions:
            for wq in req.wrong_questions:
                db.execute(
                    "INSERT INTO error_notes (student_id, question_id, question_text, student_answer, correct_answer, knowledge_point, source, status) "
                    "VALUES (?, NULL, ?, ?, ?, ?, 'fun_game', 'unresolved')",
                    (
                        student_id,
                        wq.get("question", ""),
                        wq.get("student_answer", ""),
                        wq.get("correct_answer", ""),
                        wq.get("knowledge_point", "速算练习"),
                    ),
                )

    return {
        "success": True,
        "data": {
            "points_earned": points,
            "daily_earned": daily_earned + points,
            "daily_cap": 1.0,
        },
    }


# ===== 游戏排行榜 =====

@router.get("/leaderboard")
def get_game_leaderboard(
    game_type: str = Query(""),
    limit: int = Query(20),
    authorization: str = Query(""),
):
    """获取游戏排行榜"""
    student_id = get_student_id(authorization)

    with get_db() as db:
        if game_type:
            rows = db.execute(
                "SELECT r.*, u.name, u.avatar FROM mini_game_records r "
                "JOIN users u ON r.student_id = u.id "
                "WHERE r.game_type=? "
                "GROUP BY r.student_id "
                "ORDER BY MAX(r.score) DESC, MAX(r.correct_count) DESC LIMIT ?",
                (game_type, limit),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT r.*, u.name, u.avatar FROM mini_game_records r "
                "JOIN users u ON r.student_id = u.id "
                "GROUP BY r.student_id, r.game_type "
                "ORDER BY r.score DESC, r.correct_count DESC LIMIT ?",
                (limit,),
            ).fetchall()

        leaderboard = []
        for i, r in enumerate(rows):
            leaderboard.append({
                "rank": i + 1,
                "student_id": r["student_id"],
                "name": r["name"],
                "avatar": r["avatar"],
                "game_type": r["game_type"],
                "score": r["score"],
                "correct_count": r["correct_count"],
                "total_count": r["total_count"],
                "time_used": r["time_used"],
                "is_me": r["student_id"] == student_id,
            })

    return {"success": True, "data": leaderboard}


# ===== 学生游戏历史 =====

@router.get("/my-records")
def get_my_game_records(
    game_type: str = Query(""),
    limit: int = Query(20),
    authorization: str = Query(""),
):
    """获取我的游戏记录"""
    student_id = get_student_id(authorization)

    with get_db() as db:
        if game_type:
            rows = db.execute(
                "SELECT * FROM mini_game_records WHERE student_id=? AND game_type=? ORDER BY created_at DESC LIMIT ?",
                (student_id, game_type, limit),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM mini_game_records WHERE student_id=? ORDER BY created_at DESC LIMIT ?",
                (student_id, limit),
            ).fetchall()

        records = []
        for r in rows:
            d = dict(r)
            d["detail"] = json.loads(d.get("detail_json") or "{}")
            del d["detail_json"]
            records.append(d)

    return {"success": True, "data": records}
