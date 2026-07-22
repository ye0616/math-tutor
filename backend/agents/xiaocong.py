"""
AI 智能体「小聪」—— 多方法 + 多阶段 + 必收敛的苏格拉底式错题引导

设计原则（按用户反馈调整）：
1. 多方法：默认先给"最简单方法"（生活化/具象），学生还没懂就换第二种（数形结合/列表举例），
   最多换 3 种。绝不反复用同一句话反复问。
2. 引导性：每条回复必须"接住学生上一句"——
   - 引用学生原话中的关键词
   - 指出学生思维走偏的具体位置（"你卡在 X 步骤，因为 Y"）
   - 给出下一步**方向**而不是答案
3. 必收敛：每条题 100% 要让学生自己说出正确答案后，再切到「总结 → 出巩固题」
   巩固题做错 → 走 practice_recover 继续引导，再次尝试；不能直接结束
4. 总结先行：进入 practice 前必须先让学生口述方法总结（确认真懂），再出新题

阶段状态机：
  understand        让学生复述题意，确认他理解题目在问什么
  method_simple     用第一种最简单方法（具象/生活化），引导学生走通第一步
  method_apply      让学生用这个方法真算一步（不直接给中间值）
  method_alt        [可选] 第二种方法（数形结合/举例），如果 method_simple 学生卡住了
  summary           让学生用 1 句话概括做题方法思路（必须他亲口说）
  practice          出 1 道同知识点巩固题；学生做出后进入 done，否则进入 practice_recover
  practice_recover  巩固题做错/卡住 → 退回 method_simple 重走一次，再尝试
  done              完成

会话状态：key = f"{student_id}:{error_note_id}"，持久化 5 个字段
  stage:           当前阶段
  method_idx:      已尝试的方法编号（0=第一种最简单方法，1=第二种，2=兜底）
  stuck_count:     连续 stage 不前进了多少轮（防止无限循环）
  user_mastered:   学生是否已经自答出过原题正确答案
  practice_failed_count: 巩固题连续失败次数

学生最新回复会被解析为：
  - 自我解析（自答对了原题 / 巩固题）
  - 卡住信号（"不会"/"不知道"/空白问号/很短的不相关）
  - 思维走偏（提到错误算式/错误思路）
"""

import json
import re
import threading
from typing import Dict, List, Optional

from .llm import _call_llm_json, _call_llm


# ============= 会话历史与状态 =============

_sessions_lock = threading.Lock()
_session_state: Dict[str, dict] = {}      # {key: state dict}
_session_history: Dict[str, List[dict]] = {}  # {key: [{role, content}]}

MAX_HISTORY = 24


def _session_key(student_id: int, error_note_id: int) -> str:
    return f"{student_id}:{error_note_id}"


def _get_state(student_id: int, error_note_id: int) -> dict:
    key = _session_key(student_id, error_note_id)
    with _sessions_lock:
        st = _session_state.get(key)
        if not st:
            st = {
                "stage": "understand",
                "method_idx": 0,
                "stuck_count": 0,
                "user_mastered": False,
                "practice_failed_count": 0,
                "methods_tried": [],     # 该题已经尝试过的方法描述（用于 system 提示）
                "current_question": None,  # 巩固题题干
                "current_answer": None,    # 巩固题答案
                "current_kp": None,
            }
            _session_state[key] = st
        return st


def _set_state(student_id: int, error_note_id: int, new_state: dict):
    key = _session_key(student_id, error_note_id)
    with _sessions_lock:
        _session_state[key] = new_state


def _get_history(student_id: int, error_note_id: int) -> List[dict]:
    key = _session_key(student_id, error_note_id)
    with _sessions_lock:
        return list(_session_history.get(key, []))


def _append_history(student_id: int, error_note_id: int, role: str, content: str):
    key = _session_key(student_id, error_note_id)
    with _sessions_lock:
        hist = _session_history.setdefault(key, [])
        hist.append({"role": role, "content": content})
        if len(hist) > MAX_HISTORY:
            _session_history[key] = hist[-MAX_HISTORY:]


def _reset_session(student_id: int, error_note_id: int):
    key = _session_key(student_id, error_note_id)
    with _sessions_lock:
        _session_state.pop(key, None)
        _session_history.pop(key, None)


# ============= 学生回复分析（不依赖 LLM） =============

_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _normalize_answer(s: str) -> str:
    if not s:
        return ""
    s = str(s).strip()
    for unit in ["元", "米", "kg", "km", "平方米", "平方厘米", "平方分米", "分米",
                 "厘米", "吨", "立方厘米", "立方分米", "立方米", "升", "毫升",
                 "g", "cm", "m", "ha", "倍"]:
        if s.endswith(unit):
            s = s[: -len(unit)]
    s = s.replace(" ", "").replace("（", "(").replace("）", ")").replace("，", ",").replace("。", ".")
    return s.lower()


def _extract_numbers(text: str) -> List[str]:
    if not text:
        return []
    return _NUMBER_RE.findall(text)


def _looks_correct(student_msg: str, correct_answer: str) -> bool:
    """判断学生最新消息是否包含正确答案"""
    if not student_msg or not correct_answer:
        return False
    msg = _normalize_answer(student_msg)
    ca = _normalize_answer(correct_answer)
    if not ca:
        return False
    if ca in msg:
        return True
    # 完全等于
    if msg.strip() == ca.strip():
        return True
    # 数值等价
    try:
        f1 = float(re.sub(r"[^\d.\-]", "", msg))
        f2 = float(re.sub(r"[^\d.\-]", "", ca))
        if abs(f1 - f2) < 1e-6:
            return True
    except (ValueError, TypeError):
        pass
    # 整数答案 + 学生写的整数（可能多字）
    if ca.replace(".", "").lstrip("-").isdigit():
        msg_nums = _extract_numbers(msg)
        if msg_nums and msg_nums[-1] == ca:
            return True
    return False


_STUCK_PHRASES = [
    "不会", "不知道", "不懂", "不明白", "不清楚", "没学过",
    "咋办", "怎么办", "救命", "求救", "help",
    "??", "？?",
]


def _looks_stuck(student_msg: str) -> bool:
    """判断学生是否明确卡住（求助/空白/完全无关键词回复）"""
    if not student_msg:
        return True
    msg = student_msg.strip()
    if len(msg) <= 2 and not _NUMBER_RE.search(msg):
        return True
    for p in _STUCK_PHRASES:
        if p in msg:
            return True
    # 纯标点
    if re.fullmatch(r"[\s\?\？\!\！\.\。，。、]+", msg):
        return True
    return False


# ============= Prompt =============

_SYSTEM_PROMPT = """你是「小聪」—— 一个温暖、有耐心的小学五年级数学 AI 小伙伴，专门通过多轮对话帮学生攻克错题，最终让他**自己**得出正确答案。

【硬性原则，绝对不能违反】

1. 绝不直接告诉学生答案。例如不能说「答案是 X」「你应该算 X·Y」「答案是 6」。最多只能给方向性提示。

2. 每一句回复都必须「接住学生」。也就是：
   - 引用他刚才那句话里的 1-2 个关键词（不要泛泛地说「你答得不错」）
   - 指出他卡在哪一步（具体到方法名/算式名/题型）
   - 给出**下一步方向**，不要给数值答案

3. 必须用「最简单方法」开场，生活化、具象化（买东西、排队、量东西等）。如果学生说「还是不懂/不会/我还是不会」，立刻换第二种方法（数形结合、举例、列表），**措辞一定要换新**。

4. 引导学生每次只走**一步**，从不一次性讲 2 个以上知识点。**只问 1 个问题**或**只给 1 个方向**。

5. 语言：五年级孩子能听懂的口语。一句话不超过 40 字。亲切：多用「我们一起」「试试看」「想一想」「再往前一步」。每轮必加 1 个 emoji。

【多阶段引导协议】

对话会按下面顺序推进，**你只处理当前阶段给你的任务**：

- stage=understand       【学生复述题意】用一句亲切的反问让他说出题目在算什么、已知什么、问什么。**学生答完后**，你返回 stage=method_simple。
- stage=method_simple    【最简单方法·第一步】用生活化的类比（买几个/分几份/排队），引导学生走出第一步（不直接给具体算式数值）。**学生走出第一步后**，你返回 stage=method_apply。
- stage=method_apply     【最简单方法·继续】让学生用这个方法继续做下一步。同样只引导一步。**学生做完中间步骤后**，你返回 stage=method_apply（继续应用同一方法），**当他给出最终正确答案时**，你返回 stage=summary。
- stage=method_alt       【换一种方法】因为 method_simple 上学生卡了。换数形结合（画方格/列单）/ 列举具体例子。**绝对不要重复 method_simple 的话**。
- stage=summary          【总结方法】让学生自己用 1 句话说「做这道题，**先做什么、再做什么**」。**学生说完后**，你返回 stage=practice。
- stage=practice         【出巩固题】先热情表扬（具体引用学生刚才做对的事情），再出 1 道**同知识点但数字不一样**的题。
- stage=practice_recover 【巩固题做错/卡住，重新走一遍最简单方法】先肯定他愿意再试，再换一种具象方式重做。**学生做对后**，你返回 stage=done。
- stage=done             【结束】热情总结：\"这道题我们学到了 X\"，给出标准方法总结。

【重要：主动推进 stage】

**每轮回复都必须返回你认为的下一步 stage**：
- 如果你引导学生走出了下一步，学生又做对了 → 升 stage
- 如果学生卡住 → 保留当前 stage，并在 reply 里给更细的提示
- 如果学生答对最终答案 → 直接 stage=summary
- 如果学生让你总结 → stage=summary

不要永远卡在同一阶段。

【严格输出格式】

你**只能**输出一个 JSON 对象，不要任何额外文字：

{
  "stage": "understand" | "method_simple" | "method_apply" | "method_alt" | "summary" | "practice" | "practice_recover" | "done",
  "reply": "你说的话（不超过 50 字；必须接住学生上一句；引用学生原话关键词；加 1 个 emoji）",
  "next_question": "下一道巩固题题干（仅 stage=practice 时填，否则 null）",
  "next_answer": "下一道题正确答案（仅 stage=practice 时填，否则 null）",
  "next_knowledge_point": "下一道题知识点（仅 stage=practice 时填，否则 null）",
  "hint_for_student": "下一轮如果学生又卡住，给个最小提示（不超过 20 字；不能含答案）",
  "summary_text": "标准方法总结（仅 stage=done 时填，30-50 字）"
}

【绝对禁止】
- 直接说答案
- 直接说算式中的具体数字结果（中间过程可以给方向）
- 用「想想看」「再看看」「你知道吗」等万能敷衍
- 用「显然」「这么简单」「你是不是没认真听」等贬义词
- 输出超过 1 个 JSON
- 永远停留同一 stage"""


def _stage_directive(stage: str, ctx_extra: dict) -> str:
    """根据当前阶段给 LLM 的明确指令"""
    if stage == "understand":
        return (
            "【本轮你的任务】\n"
            "1. 用一句亲切的反问引导学生把题目用自己的话说一遍："
            "「题目让你算什么？已知条件是什么？」\n"
            "2. 学生说对 → 下轮换 stage=method_simple。\n"
            "3. 你的回复不超过 30 字。"
        )
    if stage == "method_simple":
        methods_tried = ctx_extra.get("methods_tried", [])
        method_num = len(methods_tried) + 1
        return (
            f"【本轮你的任务 - 第 {method_num} 次尝试最简单方法】\n"
            "1. 用生活化、具象化场景引导学生走出第一步（绝对不要说答案数字）。\n"
            "   比如「我们想象小明去买 X 个 Y，每个 Y 单价 Z 元，那他要给多少钱？」\n"
            "2. 只引导一步，让学生在下一轮告诉你他算的中间结果。\n"
            "3. 你的回复不超过 40 字。\n"
            "注意：每轮都要引用学生上一句的具体词，不要用万能敷衍。"
        )
    if stage == "method_apply":
        return (
            "【本轮你的任务 - 继续用这个方法做下一步】\n"
            "1. 学生刚走出第一步。请你用一句话告诉他下一步该做什么、为什么这么做。\n"
            "2. 不要给数值答案，只给方向：「接下来我们需要 X」「那 X 怎么算呢？」\n"
            "3. 30 字以内。\n"
            "4. 如果学生这一步已经算出最终正确答案，stage 切到 summary。"
        )
    if stage == "method_alt":
        return (
            "【本轮你的任务 - 换一种方法】\n"
            "1. 之前的方法他不适应。这次用数形结合：让他画方格/画图/列具体小例子。\n"
            "2. 引导他走第一步。\n"
            "3. 40 字以内。\n"
            "注意：绝对不要再用刚才的方法措辞，换新的具象比喻。"
        )
    if stage == "summary":
        return (
            "【本轮你的任务 - 让学生自己总结方法】\n"
            "1. 请学生用 1-2 句话告诉你：「做这道题，**先做什么、再做什么**？」\n"
            "2. 不要讲知识、不给答案。\n"
            "3. 30 字以内。\n"
            "4. 学生说完后，stage=practice 出题。"
        )
    if stage == "practice":
        return (
            "【本轮你的任务 - 出巩固题】\n"
            "1. 先热情表扬：「可以呀，那我们再来一道～」\n"
            "2. 然后给 1 道**同知识点但数字不一样**的题（避免原题）。\n"
            "3. 在 next_question 给题面，next_answer 给正确答案，next_knowledge_point 给知识点。\n"
            "4. 总回复不超过 60 字。\n"
            "5. JSON next_question/next_answer/next_knowledge_point 必须填，缺一不可。"
        )
    if stage == "practice_recover":
        return (
            "【本轮你的任务 - 巩固题没做出来，重新引导】\n"
            "1. 先温和地说「没关系，我们再看一遍～」（不要批评）。\n"
            "2. 然后用比之前更具体的生活例子重新走最简单方法（不是上一轮的复述）。\n"
            "3. 提示学生当前巩固题是哪道题，再引导他做当前这道的**第一步**。\n"
            "4. 50 字以内。"
        )
    if stage == "done":
        return (
            "【本轮你的任务 - 结束总结】\n"
            "1. 用 1-2 句话热情总结：\"这道题我们学到了 X\"。\n"
            "2. 在 summary_text 字段写一段 30-50 字的标准方法总结（用于记入错题本）。\n"
            "3. reply 不要给答案数字。"
        )
    return "【引导】"


def _build_messages(error_ctx: dict, state: dict, history: List[dict], student_msg: str) -> List[dict]:
    question = error_ctx.get("question_text", "")
    correct = error_ctx.get("correct_answer", "")
    knowledge = error_ctx.get("knowledge_point", "")
    student_wrong = error_ctx.get("student_answer", "")

    current_q = state.get("current_question")
    current_a = state.get("current_answer")

    ctx = (
        f"【当前错题】\n题目：{question}\n"
        f"正确答案：{correct}\n"
        f"学生最初错误答案：{student_wrong or '（无）'}\n"
        f"知识点：{knowledge or '小学五年级数学'}\n"
    )
    if current_q:
        ctx += (
            f"\n【当前巩固题】\n巩固题：{current_q}\n"
            f"正确答案：{current_a}\n"
        )

    stage = state["stage"]
    ctx_extra = {"methods_tried": state.get("methods_tried", [])}
    directive = _stage_directive(stage, ctx_extra)

    base = (
        ctx
        + f"\n【当前阶段】\nstage={stage}\n"
        f"已尝试方法数：{len(state.get('methods_tried', []))}\n"
        f"卡住计数：{state.get('stuck_count', 0)}\n"
        + directive
    )

    if history:
        history_text = ""
        for h in history[-MAX_HISTORY:]:
            role = "小聪" if h["role"] == "assistant" else "学生"
            history_text += f"{role}：{h['content']}\n"
        user_msg = (
            base
            + f"\n【对话历史】\n{history_text}\n"
            + f"【学生最新回复】\n{student_msg or '（暂无）'}\n"
        )
    else:
        user_msg = (
            base
            + f"\n【学生最新回复】\n{student_msg or '（暂无）'}\n"
        )

    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]


def _safe_parse(raw: str) -> Optional[dict]:
    if not raw:
        return None
    try:
        d = json.loads(raw)
        if isinstance(d, dict):
            return d
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", raw)
    if m:
        try:
            d = json.loads(m.group(0))
            if isinstance(d, dict):
                return d
        except Exception:
            pass
    return {
        "stage": "method_simple",
        "reply": raw.strip()[:80] or "我们一起想一想～",
        "next_question": None,
        "next_answer": None,
        "next_knowledge_point": None,
        "hint_for_student": None,
        "summary_text": None,
    }


def _call_llm_one_shot(messages) -> dict:
    parsed_dict = _call_llm_json(messages, temperature=0.6, max_tokens=600, timeout=60)
    if isinstance(parsed_dict, dict):
        return parsed_dict
    if isinstance(parsed_dict, str):
        return _safe_parse(parsed_dict)
    raw = _call_llm(messages, temperature=0.6, max_tokens=600, timeout=60)
    return _safe_parse(raw) if raw else {}


# ============= 状态机推进 =============

def _advance_state(state: dict, parsed: dict, student_msg: str, error_ctx: dict) -> dict:
    """根据学生最新回复和 LLM 返回，更新 state。返回 (new_state, forced_action)。
    forced_action 是 dict 时，下游会按它覆盖 LLM 的 stage/reply（避免 LLM 给错）。
    """
    forced = {}

    # 学生自答正确 → 学生掌握了，可能的话直接进 summary
    correct_a = error_ctx.get("correct_answer", "")
    if student_msg and _looks_correct(student_msg, correct_a):
        state["user_mastered"] = True

    # ===== 累计方法阶段轮次（method_simple / method_apply / method_alt）=====
    # 防止 LLM 把状态机卡死在 method_apply
    if state["stage"] in ("method_simple", "method_apply", "method_alt"):
        state.setdefault("method_round", 0)
        state["method_round"] += 1
        # 累计到 5 轮还没自答 → 进 summary（让学生用这个方法总结）
        if state["method_round"] >= 5 and state["stage"] != "summary":
            state["stage"] = "summary"
            forced["override_stage"] = "summary"
            state["method_round"] = 0
            # 不能立即给答案——让 LLM 在 summary 阶段让学生自己总结
            return state, forced
    else:
        state["method_round"] = 0

    # ===== 巩固题答对/答错判定（practice + practice_recover 都适用）=====
    if state["stage"] in ("practice", "practice_recover") and state.get("current_answer"):
        if student_msg:
            # 答对当前巩固题 → done
            if _looks_correct(student_msg, state["current_answer"]):
                state["stage"] = "done"
                forced["override_stage"] = "done"
                forced["override_reply_extra"] = "答对啦～你太棒了！🎉"
                return state, forced
            # 答错/卡住 → 累加失败计数
            if _looks_stuck(student_msg) or not _looks_correct(student_msg, state["current_answer"]):
                state["practice_failed_count"] = state.get("practice_failed_count", 0) + 1
                if state["practice_failed_count"] >= 3:
                    # 兜底：直接给答案并结束
                    correct_a = error_ctx.get("correct_answer", "")
                    state["stage"] = "done"
                    forced["override_stage"] = "done"
                    forced["override_reply_extra"] = (
                        f"（小聪看你试了好几次了～其实这道题的答案是 {correct_a}。"
                        f"下次慢慢来，我们下次再做类似题哦～）"
                    )
                    return state, forced
                # 未到 3 次：进入 / 停留在 recover
                state["stage"] = "practice_recover"
                forced["override_stage"] = "practice_recover"
                return state, forced

    # 如果当前是 summary，学生回答了 → 推进到 practice
    if state["stage"] == "summary":
        if student_msg and not _looks_stuck(student_msg):
            # 学生说了一些东西，让他过 summary → practice
            state["stage"] = "practice"
            forced["override_stage"] = "practice"
            # 让 LLM 在 practice 阶段出题
            return state, forced

    # 如果当前是 method_simple / method_apply / method_alt
    # 学生卡住次数累加；连续 4 次卡在同一个方法上 → 升级到方法 1 / 2
    if state["stage"] in ("method_simple", "method_apply"):
        if _looks_stuck(student_msg or ""):
            state["stuck_count"] = state.get("stuck_count", 0) + 1
            if state["stuck_count"] >= 4:
                state["method_idx"] = state.get("method_idx", 0) + 1
                if state["method_idx"] >= 2:
                    # 兜底：直接给答案并 done
                    state["stage"] = "done"
                    forced["override_stage"] = "done"
                    forced["override_reply_extra"] = (
                        f"（看小聪你一直在想…要不今天先到这？答案是 {correct_a}，我们下次再来挑战～）"
                    )
                    return state, forced
                state["stage"] = "method_alt"
                state["methods_tried"].append("method_alt")
                state["stuck_count"] = 0
                forced["override_stage"] = "method_alt"
        else:
            state["stuck_count"] = 0

    # 如果学生在 method_simple/method_apply/method_alt 已经自答 → summary
    # 这一步必须先于"卡住次数累加"分支
    if state["stage"] in ("method_simple", "method_apply", "method_alt"):
        if student_msg and _looks_correct(student_msg, correct_a):
            state["stage"] = "summary"
            forced["override_stage"] = "summary"

    # method_simple/method_alt 学生不卡但还没答对 → 推进到 method_apply
    if state["stage"] in ("method_simple", "method_alt"):
        if student_msg and not _looks_stuck(student_msg) and not forced.get("override_stage"):
            # 只要学生做了一些事（不卡），就推进到下一步
            state["stage"] = "method_apply"
            forced["override_stage"] = "method_apply"

    # 如果当前是 understand（首轮），学生描述后 → method_simple
    if state["stage"] == "understand":
        if student_msg and not _looks_stuck(student_msg):
            # 学生说了一些东西，进入方法
            state["stage"] = "method_simple"
            if "method_simple" not in state["methods_tried"]:
                state["methods_tried"].append("method_simple")
            forced["override_stage"] = "method_simple"

    return state, forced


def _apply_forced(state: dict, parsed: dict, forced: dict) -> dict:
    """把强制覆盖加到 parsed 上"""
    out = dict(parsed)
    if forced.get("override_stage"):
        out["stage"] = forced["override_stage"]
    if forced.get("override_reply_extra"):
        extra = forced["override_reply_extra"]
        reply = out.get("reply") or ""
        out["reply"] = f"{reply} {extra}".strip()
    return out


# ============= 主入口 =============

def chat_with_xiaocong(
    student_id: int,
    error_note_id: int,
    student_msg: str,
    error_ctx: dict,
) -> dict:
    """与小聪对话一轮（多阶段 + 必收敛）

    参数:
        student_id: 学生 ID
        error_note_id: 错题 ID
        student_msg: 学生最新发言；首轮可空
        error_ctx: {
            "question_text": 题面
            "correct_answer": 正确答案
            "student_answer": 最初错误答案（可选）
            "knowledge_point": 知识点
        }

    返回:
        {
            "stage": str,
            "reply": str,
            "next_question": str | None,
            "next_answer": str | None,
            "next_knowledge_point": str | None,
            "hint_for_student": str | None,
            "summary_text": str | None,
            "current_question": str | None,
            "current_answer": str | None,
            "current_stage_label": str,
            "session_round": int,
        }
    """
    state = _get_state(student_id, error_note_id)
    history = _get_history(student_id, error_note_id)

    # 1. 先用本地启发式推进状态（不调 LLM 就能转阶段的情况）
    new_state, forced = _advance_state(
        state, {}, student_msg or "", error_ctx
    )

    # 2. 如果强制覆盖已经把 stage 推到 done，且不需要新的 LLM 回复，直接返回
    messages = _build_messages(error_ctx, new_state, history, student_msg or "")

    parsed = _call_llm_one_shot(messages)
    if not parsed:
        parsed = {
            "stage": new_state["stage"],
            "reply": "小聪正在整理思路～要不你把你的想法说给我听？",
            "next_question": None,
            "next_answer": None,
            "next_knowledge_point": None,
            "hint_for_student": None,
            "summary_text": None,
        }

    # 3. 应用强制覆盖
    parsed = _apply_forced(new_state, parsed, forced)

    # 4. 写 history（不在 LLM 里就把 stage 落到 state，否则会让下轮失同步）
    if student_msg:
        _append_history(student_id, error_note_id, "user", student_msg)
    _append_history(student_id, error_note_id, "assistant", parsed.get("reply", ""))

    # 5. 进入 practice → 落地巩固题
    if parsed.get("stage") == "practice":
        nq = (parsed.get("next_question") or "").strip()
        na = (parsed.get("next_answer") or "").strip()
        if nq:
            new_state["current_question"] = nq
            new_state["current_answer"] = na
            new_state["current_kp"] = parsed.get("next_knowledge_point")
            new_state["practice_failed_count"] = 0
            _set_state(student_id, error_note_id, new_state)

    # 6. 落最终状态（覆盖 LLM 给的非法 stage）
    legal_stage = new_state.get("stage") or "understand"
    if parsed.get("stage") and parsed["stage"] in (
        "understand", "method_simple", "method_apply",
        "method_alt", "summary", "practice", "practice_recover", "done"
    ):
        # state 推进需与已写入的 forced 一致
        pass
    new_state["stage"] = legal_stage
    _set_state(student_id, error_note_id, new_state)

    # 7. 阶段标签（前端可显示）
    stage_labels = {
        "understand": "理解题意",
        "method_simple": "找突破口（用最简单方法）",
        "method_apply": "用这个方法做下去",
        "method_alt": "换一种方法",
        "summary": "总结做题思路",
        "practice": "巩固题",
        "practice_recover": "再来一次",
        "done": "完成啦",
    }

    return {
        "stage": new_state["stage"],
        "reply": (parsed.get("reply") or "我们继续～").strip(),
        "next_question": parsed.get("next_question") if new_state["stage"] == "practice" else None,
        "next_answer": parsed.get("next_answer") if new_state["stage"] == "practice" else None,
        "next_knowledge_point": parsed.get("next_knowledge_point") if new_state["stage"] == "practice" else None,
        "hint_for_student": parsed.get("hint_for_student"),
        "summary_text": parsed.get("summary_text") if new_state["stage"] == "done" else None,
        "current_question": new_state.get("current_question"),
        "current_answer": new_state.get("current_answer"),
        "current_stage_label": stage_labels.get(new_state["stage"], "思考中"),
        "session_round": len(_get_history(student_id, error_note_id)) // 2,
        "user_mastered": new_state.get("user_mastered", False),
    }


def reset_xiaocong_session(student_id: int, error_note_id: int) -> dict:
    _reset_session(student_id, error_note_id)
    return {"reset": True}


def get_session_round(student_id: int, error_note_id: int) -> int:
    return len(_get_history(student_id, error_note_id)) // 2
