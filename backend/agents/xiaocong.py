"""
AI 智能体「小聪」—— 苏格拉底式错题引导

定位：
- 不是冷冰冰的「纠错步骤」，而是一个有名字、有性格的小学数学辅导伙伴
- 对学生不直接给答案，而是连续追问「你怎么看？」「下一步呢？」「为什么？」
- 根据当前题目 + 学生最新的回答 + 多轮对话历史，给方向性提示
- 答对后自动在同一对话窗口出 2-3 道同知识点巩固题

实现策略（轻量级，独立模块）：
- 在内存里维护会话历史（key = error_note_id + student_id）
- 重启 backend 不会丢，因为错题本本身有 ID；丢失后从 error_notes.question_text/correct_answer 恢复上下文
- 调用 GLM-4-Flash（已有 _call_llm_json 通道）
- Prompt 中强制：
  1. 不直接给答案
  2. 永远以问题或小提示回应
  3. 用五年级孩子能听懂的语言
  4. 检测学生已自答出正确答案后切到「出巩固题」分支
"""

import re
import json
import threading
from typing import Dict, List, Optional

from .llm import _call_llm_json, _call_llm

# 会话历史：key = f"{student_id}:{error_note_id}"
_session_lock = threading.Lock()
_sessions: Dict[str, List[dict]] = {}

MAX_HISTORY = 16  # 同一错题最多保留 16 轮对话上下文


# ============ 内部工具 ============

def _session_key(student_id: int, error_note_id: int) -> str:
    return f"{student_id}:{error_note_id}"


def _get_history(student_id: int, error_note_id: int) -> List[dict]:
    key = _session_key(student_id, error_note_id)
    with _session_lock:
        return list(_sessions.get(key, []))


def _append_history(student_id: int, error_note_id: int, role: str, content: str):
    key = _session_key(student_id, error_note_id)
    with _session_lock:
        hist = _sessions.setdefault(key, [])
        hist.append({"role": role, "content": content})
        # 截断
        if len(hist) > MAX_HISTORY:
            _sessions[key] = hist[-MAX_HISTORY:]


def _reset_session(student_id: int, error_note_id: int):
    key = _session_key(student_id, error_note_id)
    with _session_lock:
        _sessions[key] = []


def _normalize_answer(s: str) -> str:
    """归一化答案字符串，用于初步等价判断（去空格、单位、标点）"""
    if not s:
        return ""
    s = s.strip()
    # 去掉常见单位
    for unit in ["元", "米", "kg", "km", "平方米", "平方厘米", "分米", "厘米", "吨", "平方分米", "立方厘米", "立方分米", "立方米", "升", "毫升", "g", "cm", "m", "ha"]:
        s = s.rstrip(unit)
    s = s.replace(" ", "").replace("（", "(").replace("）", ")").replace("，", ",").replace("。", ".")
    return s.lower()


def _looks_like_correct(student_msg: str, correct_answer: str) -> bool:
    """轻量判断学生最新消息是否包含正确答案（启发式，不完全依赖 LLM）"""
    if not student_msg or not correct_answer:
        return False
    msg = _normalize_answer(student_msg)
    ca = _normalize_answer(correct_answer)
    if not ca:
        return False
    # 完全包含
    if ca in msg:
        return True
    # 数值等价
    try:
        f1 = float(re.sub(r"[^\d.\-]", "", msg))
        f2 = float(re.sub(r"[^\d.\-]", "", ca))
        if abs(f1 - f2) < 1e-6:
            return True
    except (ValueError, TypeError):
        pass
    return False


# ============ Prompt 模板 ============

_SYSTEM_PROMPT = """你是「小聪」—— 一名有耐心、活泼的小学五年级数学AI辅导伙伴，专门帮助学生攻克错题。

【核心风格：苏格拉底式引导】
- 你从不说「答案是 X」或「你应该这么算」
- 你只做三件事：
  1. 反问（"你怎么看？""你为什么这么觉得？""下一步呢？"）
  2. 给方向性小提示（"再看看题目里有没有一个关键词"、"小数点的位置对不对"）
  3. 鼓励与确认（学生答对时热情肯定，再引向下一步）

【语言要求】
- 用五年级孩子能听懂的口语
- 一句话不超过 30 字
- 用「我们一起」「试试看」「猜猜」这类亲切的词
- 永远不要一次性讲超过 1 个知识点

【对话阶段】
- 阶段1「引导」（stage=guide）：学生还没答对 → 反问 + 小提示
- 阶段2「答对·出巩固题」（stage=practice）：学生已自己改对 → 热情表扬 + 在同一对话中出 1 道新题让学生接着做
- 阶段3「巩固完成」（stage=done）：巩固题也做完 → 表扬 + 邀请结束

【绝对禁止】
- 直接给正确答案
- 一次性列多个提示
- 用"显然""简单""这么基础的题"等贬义词
- 说"我不知道""我不理解"等推辞话

【输出格式（严格遵守 JSON）】
{
  "stage": "guide" | "practice" | "done",
  "reply": "你说的话（亲切、简短、一句或两句话）",
  "next_question": "下一道巩固题的题目（仅 stage=practice 时填写；stage=done 时为 null）",
  "next_answer": "下一道题的正确答案（仅 stage=practice 时填写）",
  "next_knowledge_point": "下一道题的知识点（仅 stage=practice 时填写）"
}

只输出 JSON，不要任何额外文字。"""


def _build_messages(error_ctx: dict, history: List[dict], student_msg: str) -> List[dict]:
    """构造 messages：system + 当前题目上下文 + 历史 + 本轮用户输入"""
    question = error_ctx.get("question_text", "")
    correct = error_ctx.get("correct_answer", "")
    knowledge = error_ctx.get("knowledge_point", "")
    student_wrong = error_ctx.get("student_answer", "")

    # 用户消息模板：把题目上下文塞在每轮 user 消息前部（保持简单稳定）
    ctx_block = (
        f"【当前错题】\n题目：{question}\n"
        f"学生最初错误答案：{student_wrong}\n正确答案：{correct}\n"
        f"知识点：{knowledge or '小学数学'}\n"
    )
    if not history:
        # 首轮：小聪主动发起引导
        first_user = (
            ctx_block
            + "\n【你的任务】\n"
            "学生刚刚答错了这道题。请用 stage=guide 的方式，"
            "用一句亲切的反问或一个小提示开场（不要直接说答案），"
            "把对话引导起来。"
        )
        return [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": first_user},
        ]

    # 后续轮：保留历史 + 新一轮
    history_text = ""
    for h in history[-MAX_HISTORY:]:
        role = "学生" if h["role"] == "user" else "小聪"
        history_text += f"{role}：{h['content']}\n"

    new_user = (
        ctx_block
        + f"\n【对话历史】\n{history_text}\n"
        + f"【学生最新回复】\n{student_msg}\n\n"
        + "【你的任务】\n"
        "判断学生是否已自答出正确答案。如果是，stage=practice 并出 1 道同知识点新题；\n"
        "如果不是，stage=guide，给一句反问或方向性提示。\n"
        "如果学生回答跟当前题无关或想放弃，也用 stage=guide 温柔拉回。"
    )
    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": new_user},
    ]


def _safe_parse(raw: str) -> Optional[dict]:
    """解析小聪回复，宽松处理"""
    if not raw:
        return None
    # 直接解析
    try:
        d = json.loads(raw)
        if isinstance(d, dict):
            return d
    except Exception:
        pass
    # 找第一段 {...}
    m = re.search(r"\{[\s\S]*\}", raw)
    if m:
        try:
            d = json.loads(m.group(0))
            if isinstance(d, dict):
                return d
        except Exception:
            pass
    # 兜底：当作普通回复（stage=guide，无新题）
    return {
        "stage": "guide",
        "reply": raw.strip()[:200],
        "next_question": None,
        "next_answer": None,
        "next_knowledge_point": None,
    }


# ============ 主入口 ============

def chat_with_xiaocong(
    student_id: int,
    error_note_id: int,
    student_msg: str,
    error_ctx: dict,
) -> dict:
    """与小聪对话一轮。

    参数:
        student_id: 学生 ID
        error_note_id: 错题 ID
        student_msg: 学生最新发言（首轮可以是空字符串或"开始"）
        error_ctx: {
            "question_text": str,
            "correct_answer": str,
            "student_answer": str,    # 学生最初的错误答案（可选）
            "knowledge_point": str,
        }

    返回:
        {
            "stage": "guide" | "practice" | "done",
            "reply": "小聪说的话",
            "next_question": str | None,
            "next_answer": str | None,
            "next_knowledge_point": str | None,
            "session_round": int,
        }
    """
    history = _get_history(student_id, error_note_id)

    # 极简预判：首轮 + 学生发的就是正确答案 → 直接进入 practice
    if not history and student_msg and _looks_like_correct(student_msg, error_ctx.get("correct_answer", "")):
        # 走一次 LLM，让小聪热情确认并出题（而不是用模板）
        pass

    # 构造 messages 并调用 LLM
    # 注意：_call_llm_json 已返回解析后的 dict（可能是 None）；不再做二次 JSON 解析
    messages = _build_messages(error_ctx, history, student_msg or "")
    parsed_dict = _call_llm_json(messages, temperature=0.7, max_tokens=800, timeout=60)
    if isinstance(parsed_dict, dict):
        parsed = parsed_dict
    elif isinstance(parsed_dict, str):
        # 极少数情况：解析失败时 _call_llm_json 可能透传原始字符串（看实现约定）
        parsed = _safe_parse(parsed_dict)
    else:
        # None 或其他：尝试再调一次拿原文
        raw_text = _call_llm(messages, temperature=0.7, max_tokens=800, timeout=60)
        parsed = _safe_parse(raw_text) if raw_text else None

    if not parsed:
        parsed = {
            "stage": "guide",
            "reply": "小聪正在思考中…要不你把你的思路再说一遍？我们一起看看～",
            "next_question": None,
            "next_answer": None,
            "next_knowledge_point": None,
        }

    # 规范化 stage
    stage = parsed.get("stage", "guide")
    if stage not in ("guide", "practice", "done"):
        stage = "guide"

    # 写入历史
    if student_msg:
        _append_history(student_id, error_note_id, "user", student_msg)
    _append_history(student_id, error_note_id, "assistant", parsed.get("reply", ""))

    return {
        "stage": stage,
        "reply": parsed.get("reply", "").strip() or "我们继续～",
        "next_question": parsed.get("next_question"),
        "next_answer": parsed.get("next_answer"),
        "next_knowledge_point": parsed.get("next_knowledge_point"),
        "session_round": len(_get_history(student_id, error_note_id)),
    }


def reset_xiaocong_session(student_id: int, error_note_id: int) -> dict:
    """重置某错题的小聪对话历史（学生主动结束）"""
    _reset_session(student_id, error_note_id)
    return {"reset": True}


def get_session_round(student_id: int, error_note_id: int) -> int:
    return len(_get_history(student_id, error_note_id))
