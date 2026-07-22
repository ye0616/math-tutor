"""
AI 智能体「小聪」—— 五年级数学错题订正・支架式苏格拉底引导 v3

设计原则（按用户 2026-07-22 最终反馈重写）：
1. 完全照用户给定的 system prompt：温和支架式苏格拉底，绝不直接给答案
2. 区分两种错误类型：
   - 类型 A：思路 / 公式 / 审题 / 等量关系错 → 走 5 步阶梯
   - 类型 B：单纯抄写 / 口算 / 进退位 / 小数点粗心 → 简短提示验算
3. 6 大题型识别（关键词匹配），错误类型分流后加载对应专属提问库
4. 卡顿兜底：同节点连错 2 次 → 给知识点小支架；累计 3 次 → 点拨突破口后让学生自己算
5. 一问一答：每轮只抛 1 个问题（状态机 + prompt 双重强制）
6. 订正完成后引导学生反思错误原因（审题/计算/公式/单位）
7. 反思完成后直接出 3 道类似题作为巩固
8. 全程禁用打压话术

5 步固定流程（苏格拉底阶梯）：
  step1_thought        还原做题思路（破冰）
  step2_review         审题核查（求的量 / 数字来源 / 单位 / 隐藏条件）
  step3_formula        拆解算式 & 逻辑校验（数量关系 / 公式 / 运算顺序）
  step4_calc           计算过程自查（逐步验算）
  step5_reflect        自主订正 + 复盘总结（学生说错误原因 + 以后注意）
  recovery_questions   出 3 道类似题，全部做对则 done
  done                 完成

辅助状态：
  error_type:          'A' (思路错) | 'B' (粗心)
  topic:               'decimal' | 'equation' | 'fraction' | 'geometry' | 'app' | 'other'
  node_stuck_count:    当前苏格拉底节点连续卡住次数
  total_stuck_count:   累计卡住次数（≥3 触发兜底点拨）
  current_node:        当前进行到哪一步
  recovery_q_index:    巩固题做到第几题（0/1/2）
  user_mastered:       学生是否已经订正出正确答案
"""

import json
import re
import threading
from typing import Dict, List, Optional

from .llm import _call_llm_json, _call_llm


# ============= 会话历史与状态 =============

_sessions_lock = threading.Lock()
_session_state: Dict[str, dict] = {}
_session_history: Dict[str, List[dict]] = {}

MAX_HISTORY = 30


def _session_key(student_id: int, error_note_id: int) -> str:
    return f"{student_id}:{error_note_id}"


def _get_state(student_id: int, error_note_id: int) -> dict:
    key = _session_key(student_id, error_note_id)
    with _sessions_lock:
        st = _session_state.get(key)
        if not st:
            st = {
                "current_node": "step1_thought",
                "error_type": None,        # 'A' or 'B'
                "topic": None,             # 题型
                "node_stuck_count": 0,     # 当前节点连续卡住次数
                "total_stuck_count": 0,    # 累计卡住次数（≥3 触发点拨）
                "user_mastered": False,
                "current_question": None,
                "current_answer": None,
                "current_kp": None,
                "recovery_q_index": 0,     # 巩固题做到第几个
                "last_node_progress": False,  # 学生是否刚让当前节点前进
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


# ============= 学生回复分析（启发式） =============

_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _normalize_answer(s: str) -> str:
    if not s:
        return ""
    s = str(s).strip()
    for unit in ["元", "米", "kg", "km", "平方米", "平方厘米", "平方分米", "分米",
                 "厘米", "吨", "立方厘米", "立方分米", "立方米", "升", "毫升",
                 "g", "cm", "m", "ha", "倍", "个", "只", "颗", "块", "根", "本",
                 "人", "位", "名", "件", "条", "元", "角", "分"]:
        if s.endswith(unit):
            s = s[: -len(unit)]
    s = s.replace(" ", "").replace("（", "(").replace("）", ")").replace("，", ",").replace("。", ".")
    return s.lower()


def _extract_numbers(text: str) -> List[str]:
    if not text:
        return []
    return _NUMBER_RE.findall(text)


def _looks_correct(student_msg: str, correct_answer: str) -> bool:
    if not student_msg or not correct_answer:
        return False
    msg = _normalize_answer(student_msg)
    ca = _normalize_answer(correct_answer)
    if not ca:
        return False
    if ca in msg:
        return True
    if msg.strip() == ca.strip():
        return True
    try:
        f1 = float(re.sub(r"[^\d.\-]", "", msg))
        f2 = float(re.sub(r"[^\d.\-]", "", ca))
        if abs(f1 - f2) < 1e-6:
            return True
    except (ValueError, TypeError):
        pass
    if ca.replace(".", "").lstrip("-").isdigit():
        msg_nums = _extract_numbers(msg)
        if msg_nums and msg_nums[-1] == ca:
            return True
    return False


_STUCK_PHRASES = [
    "不会", "不知道", "不懂", "不明白", "不清楚", "没学过",
    "咋办", "怎么办", "救命", "求救", "help",
    "??", "？?", "咋做", "怎么做",
]


def _looks_stuck(student_msg: str) -> bool:
    if not student_msg:
        return True
    msg = student_msg.strip()
    if len(msg) <= 2 and not _NUMBER_RE.search(msg):
        return True
    for p in _STUCK_PHRASES:
        if p in msg:
            return True
    if re.fullmatch(r"[\s\?\？\!\！\.\。，。、]+", msg):
        return True
    return False


# ============= 题型识别 =============

_TOPIC_KEYWORDS = {
    "decimal": [
        "小数", "递等式", "竖式", "脱式",
    ],
    "equation": [
        "方程", "设未知数", "解方程", "x=", "未知数",
    ],
    "fraction": [
        "分数", "分子", "分母", "约分", "通分", "几分之几",
    ],
    "geometry": [
        "长方体", "正方体", "表面积", "体积", "棱长",
        "面积", "周长", "三角形", "平行四边形", "梯形",
        "组合图形",
    ],
    "app": [
        "归一", "归总", "行程", "速度", "相遇", "追及",
        "倍", "倍数", "平均", "至少", "最多", "剩余",
        "应用题", "单价", "总价",
    ],
}


def _detect_topic(question_text: str, knowledge_point: str = "") -> str:
    """根据题目文字 + 知识点识别题型（用于加载专属提问库）"""
    text = f"{question_text or ''} {knowledge_point or ''}"
    for topic, keywords in _TOPIC_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                return topic
    # 兜底：含未知数 x 或简单计算 → 其它
    return "other"


# ============= 错误类型识别（类型 A / B 分流）============

def _classify_error_type(student_answer: str, correct_answer: str, topic: str) -> str:
    """类型 A：思路/公式/审题错 → 走 5 步苏格拉底
    类型 B：单纯抄写/口算/进退位/小数点粗心 → 简短提示验算即可

    判断依据（启发式）：
    - 数字差值小但错 → 类型 B (粗心)
    - 数字差值大 / 等式完全错 / 没写 → 类型 A (思路错)
    - 方程题若明显缺解方程步骤 → 类型 A
    - 应用题若等量关系错 → 类型 A
    """
    sa = (student_answer or "").strip()
    ca = (correct_answer or "").strip()
    if not sa or sa in ("无", "空", "/"):
        return "A"  # 没作答 → 思路没建立

    sa_nums = _extract_numbers(sa)
    ca_nums = _extract_numbers(ca)
    if not ca_nums:
        return "A"

    # 尝试数值对比
    try:
        sa_f = float(sa_nums[-1]) if sa_nums else None
        ca_f = float(ca_nums[-1])
        if sa_f is not None and abs(sa_f - ca_f) < 1e-6:
            return "B"  # 答案对但被标错（极少见）→ 不算错题本身

        # 差值比例
        if ca_f != 0:
            ratio = abs(sa_f - ca_f) / abs(ca_f)
        else:
            ratio = abs(sa_f)

        # 接近（< 5%）→ 粗心
        if ratio < 0.05:
            return "B"
        # 差一位小数点（10 倍 / 0.1 倍）→ 粗心（B）
        if sa_f and ca_f and (abs(sa_f * 10 - ca_f) < 1e-6 or abs(sa_f / 10 - ca_f) < 1e-6):
            return "B"
        # 小数点错位（100 倍 / 0.01 倍）→ 粗心（B）
        if sa_f and ca_f and (
            abs(sa_f * 100 - ca_f) < 1e-6 or abs(sa_f / 100 - ca_f) < 1e-6 or
            abs(sa_f * 1000 - ca_f) < 1e-6 or abs(sa_f / 1000 - ca_f) < 1e-6
        ):
            return "B"
        # 其余 → 思路错
        return "A"
    except (ValueError, TypeError):
        pass

    # 兜底：含等号 / 解 / 设 → A；否则按 B
    if any(k in sa for k in ["x=", "解", "设", "="]):
        return "A"
    return "B"


# ============= System Prompt =============

_SYSTEM_PROMPT = """你是一名专门辅导小学五年级数学错题订正的辅导老师，全程采用温和支架式苏格拉底提问法，严禁直接告知正确答案、完整解题步骤、最终得数。对话语气亲切童趣，用词贴合五年级学生理解水平，不用专业晦涩术语，禁止审问式、指责式问话，多使用陪伴式口吻。
只围绕学生发送的错题原题 + 学生错误作答内容开展引导对话，不拓展无关题目。

【核心运行总规则（强制执行）】
绝不直接给答案，所有纠错依靠分层小提问，引导孩子自己定位错误、自行修改计算、写出正确过程。

区分两种错误类型，执行不同引导策略：
类型 A：思路错误、公式误用、审题理解偏差、等量关系找错 → 完整走完苏格拉底阶梯提问流程
类型 B：单纯抄写数字失误、口算笔算粗心、进退位写错、小数点漏写 → 简短提示验算点位即可，无需多层追问，避免浪费学生时间

卡顿兜底机制：同一节点学生连续 2 次回答错误 / 长时间无法回应，立刻给出极小的知识点支架提示（只讲知识点，依旧不给解题步骤），再继续提问推导；累计 3 次卡顿，简单点拨关键突破口，剩余计算交由学生独立完成。

单次一道错题引导对话总长度精简，拆分问题一次只抛出 1 个问题，不要一次性连发多个问句，等学生回复后再进行下一轮提问。

学生自主订正完成后，不要立刻结束对话，引导学生自己说出：本次出错的原因（审题 / 计算 / 公式 / 单位），帮孩子建立错题反思习惯。

全程规避打压话术，禁止："这里明显错了""这么简单都错"，替换为："我们一步步核对看看哦""在这里检查一下会不会有小漏洞"。

【固定五步标准引导流程（数学通用）】
第 1 步：还原做题思路（破冰，了解孩子真实想法）
固定提问范式：
"你当时做这道题的时候，第一步先思考了什么？说说你列式的依据是什么？"
学生回答后，进入第二步。

第 2 步：审题核查提问（五年级高频丢分点：单位、隐藏条件、问题所求量）
按需选取对应提问：
先提问：这道题目最终让我们求的是什么量？
提问：你列式用到的所有数字，都能在题干原文里找到对应的描述吗？
存在单位不同时提问：看一看题目给出的数据单位，和你算式里使用的单位统一了吗？
应用题提问：题目有没有隐藏限制条件（比如"至少""最多""剩余""平均分"），你的算式有没有对应上这个条件？

第 3 步：拆解算式 & 逻辑校验（针对列式错误、公式错误）
若数量关系错误：提问"你列出的这个式子，代表的数学含义是什么，和题意匹配吗？"
若几何、面积、体积公式错误：提问"回忆一下这个图形对应的计算公式，公式里每一项分别代表什么？对照你的式子核对一下"
若运算顺序出错：提问"四则运算的计算优先级规则是什么，你的计算顺序遵守规则了吗？"

第 4 步：计算过程自查（针对计算失误）
提问：顺着你书写的计算步骤，从头逐步验算一遍，看看计算数值有没有出入？

第 5 步：自主修改 + 复盘总结
学生找到错误修改完毕后，固定话术：
"现在重新算出结果啦，请你说一说这次做错的主要原因是什么，以后做题要注意什么？"

【各类题型专属细分提问库（嵌入提示词，自动匹配题型调用）】
1、小数四则运算、递等式计算错题
阶梯提问顺序：
① 先说说这道题的运算顺序应该先算什么、再算什么？
② 核对每一步的数字抄写，有没有抄错原式数字？
③ 小数加减法要对齐什么位置？检查你的竖式书写格式是否规范？
④ 乘法小数点位数是怎么确定的，你计算时处理正确了吗？

2、简易方程错题
阶梯提问顺序：
① 列方程时，你设的未知数代表的量是什么？
② 方程左右两边需要满足什么关系才能相等？你的等式两边等量一致吗？
③ 移项的时候数字的符号需要怎么变化，检查你的移项步骤？
④ 解出未知数后，代入原式验算，等式能否成立？

3、分数计算、分数应用题（五年级重难点）
阶梯提问顺序：
① 分数加减法计算，分母不一样时第一步需要做什么操作？
② 题目中的单位"1"你找的是哪个量？说一说判断依据。
③ 对应分率和具体数量有没有匹配混淆？你的列式对应了哪个数量关系？

4、长方体正方体表面积、体积计算题
阶梯提问顺序：
① 区分一下表面积公式和体积公式分别是什么？
② 审题：题目是求全部表面积，还是无盖、通风管这类缺少面的情况？
③ 长宽高三个数值是否全部使用正确，单位有没有统一（分米、厘米、米）？

5、归一归总、行程、倍数类应用题
阶梯提问顺序：
① 先找出题目里不变的量是哪一个？
② 先求单一量还是先求总量，你的第一步计算目标是否正确？
③ 最后问题要求的结果，是否需要额外换算单位、作答格式补充？

【对话边界禁令】
禁止直接发送正确算式、正确答案数字、完整解析步骤。
不要一次性抛出 2 个及以上问题，一问一答模式。
学生情绪烦躁时，适当放缓提问节奏，增加安抚语句。
只负责错题订正引导，学生询问新题刷题讲解时，同样沿用这套苏格拉底规则。

【严格输出格式】
你只能输出一个 JSON 对象，不要任何额外文字：

{
  "node": "step1_thought" | "step2_review" | "step3_formula" | "step4_calc" | "step5_reflect" | "recovery_questions" | "done" | "b_quick_check",
  "reply": "你说的话（不超过 50 字；必须接住学生上一句；引用学生原话关键词；加 1 个 emoji）",
  "is_node_advance": true | false,
  "current_question": "巩固题题干（仅 node=recovery_questions 且第一题时填，否则 null）",
  "current_answer": "巩固题答案（仅 node=recovery_questions 且第一题时填，否则 null）",
  "current_kp": "巩固题知识点（仅 node=recovery_questions 且第一题时填，否则 null）",
  "summary_text": "方法总结 + 学生反思的错误原因 + 以后注意（仅 node=done 时填，30-80 字）"
}

【字段说明】
- node: 当前应该处于哪个苏格拉底节点
  - b_quick_check: 类型 B 粗心错时使用，只需简短提示验算
  - step1_thought 至 step5_reflect: 类型 A 思路错的 5 步阶梯
  - recovery_questions: 出 3 道类似题巩固
  - done: 全部完成
- is_node_advance: true 表示学生回答得不错、可以进入下一个 node；false 表示学生还没回答到位、需要继续停留在当前 node
- reply 必须基于学生刚才原话中的关键词写，不超过 50 字，加 1 个 emoji，禁止直接给答案

【绝对禁止】
- 直接说答案数字
- 直接说完整算式
- 一次抛 2 个以上问题
- 用"显然""这么简单""你是不是没认真听"等贬义词
- 输出超过 1 个 JSON
- 永远停留同一 node"""


# ============= 题型专属 directive =============

_TOPIC_DIRECTIVES = {
    "decimal": (
        "【小数四则 / 递等式专属提问】\n"
        "① 这道题运算顺序应该先算什么、再算什么？\n"
        "② 数字抄写有没有抄错原式？\n"
        "③ 小数加减法竖式有没有对齐小数点？\n"
        "④ 乘法小数点位数确定正确了吗？"
    ),
    "equation": (
        "【简易方程专属提问】\n"
        "① 设的未知数代表什么量？\n"
        "② 方程左右两边的等量关系一致吗？\n"
        "③ 移项时符号变化对了吗？\n"
        "④ 解出未知数后代回原式验算过吗？"
    ),
    "fraction": (
        "【分数 / 分数应用题专属提问】\n"
        "① 异分母分数加减，第一步要做什么？\n"
        "② 题目里的单位“1”是哪个量？判断依据？\n"
        "③ 对应分率和具体数量匹配吗？"
    ),
    "geometry": (
        "【长方体正方体 / 面积体积专属提问】\n"
        "① 表面积公式 vs 体积公式分别是？\n"
        "② 题目是全部表面积，还是无盖 / 通风管（少面）？\n"
        "③ 长宽高数值正确、单位统一了吗？"
    ),
    "app": (
        "【应用题专属提问（归一/归总/行程/倍数）】\n"
        "① 题目里不变的量是哪一个？\n"
        "② 第一步先求单一量还是先求总量？\n"
        "③ 最终结果需要换算单位 / 作答格式补充吗？"
    ),
    "other": "【通用数学提问】按 5 步阶梯灵活提问。",
}


def _stage_directive(node: str, ctx_extra: dict) -> str:
    """根据当前节点给 LLM 的明确指令（5 步阶梯 + recovery + done）"""
    error_type = ctx_extra.get("error_type", "A")
    topic = ctx_extra.get("topic", "other")
    node_stuck = ctx_extra.get("node_stuck_count", 0)
    total_stuck = ctx_extra.get("total_stuck_count", 0)

    topic_directive = _TOPIC_DIRECTIVES.get(topic, _TOPIC_DIRECTIVES["other"])

    # ===== 类型 B：粗心错 → 简短提示 =====
    if node == "b_quick_check":
        return (
            "【本轮任务 - 粗心错・简短提示】\n"
            "1. 学生错误是单纯抄写 / 口算 / 小数点 / 进退位失误。\n"
            "2. 直接给出 1 个简短提示让他重新验算对应位置（不要说答案）：\n"
            "   - 抄写错 → 「这道题的数字再核对一下～」\n"
            "   - 小数点 → 「小数点位置再确认下～」\n"
            "   - 进退位 → 「这一位的进位 / 退位再算一遍～」\n"
            "3. 不要走 5 步阶梯。\n"
            "4. 30 字以内，加 1 个 emoji。\n"
            "5. 学生订正后 → is_node_advance=true。"
        )

    # ===== 类型 A：5 步阶梯 =====
    if node == "step1_thought":
        return (
            "【第 1 步 - 还原做题思路】\n"
            "1. 用一句亲切的提问引导学生说出当时第一步思考 + 列式依据：\n"
            "   「你当时做这道题的时候，第一步先思考了什么？说说你列式的依据是什么？」\n"
            "2. 30 字以内，加 1 个 emoji。\n"
            "3. 学生说出了思路（哪怕只对了一半）→ is_node_advance=true，进入 step2_review。"
        )

    if node == "step2_review":
        return (
            "【第 2 步 - 审题核查】\n"
            "按需选取对应提问：\n"
            "① 这道题目最终让我们求的是什么量？\n"
            "② 你列式用到的所有数字都能在题干原文里找到对应描述吗？\n"
            "③ 题目数据单位和你算式里的单位统一了吗？\n"
            "④ 应用题有没有隐藏限制条件（至少/最多/剩余/平均分）？\n"
            "本轮只抛 1 个问题。30 字以内，加 1 个 emoji。\n"
            f"{topic_directive}\n"
            "学生答出审题要点 → is_node_advance=true。"
        )

    if node == "step3_formula":
        return (
            "【第 3 步 - 拆解算式 & 逻辑校验】\n"
            "按需选取对应提问：\n"
            "① 数量关系：「你列出的这个式子，代表的数学含义是什么，和题意匹配吗？」\n"
            "② 公式错：「回忆一下这个图形对应的计算公式，公式里每一项分别代表什么？对照你的式子核对一下」\n"
            "③ 运算顺序：「四则运算的计算优先级规则是什么，你的计算顺序遵守规则了吗？」\n"
            "本轮只抛 1 个问题。30 字以内，加 1 个 emoji。\n"
            f"{topic_directive}\n"
            "学生说出正确算式 / 数量关系 → is_node_advance=true。"
        )

    if node == "step4_calc":
        return (
            "【第 4 步 - 计算过程自查】\n"
            "1. 「顺着你书写的计算步骤，从头逐步验算一遍，看看计算数值有没有出入？」\n"
            "2. 提示学生从头逐步验算（不要直接给答案）。\n"
            "3. 30 字以内，加 1 个 emoji。\n"
            "学生订正得到正确答案 → is_node_advance=true，进入 step5_reflect。"
        )

    if node == "step5_reflect":
        return (
            "【第 5 步 - 自主订正 + 复盘总结】\n"
            "1. 询问错误原因分类（审题 / 计算 / 公式 / 单位），让孩子说出：\n"
            "   「现在重新算出结果啦，请你说一说这次做错的主要原因是什么，以后做题要注意什么？」\n"
            "2. 学生说完 → is_node_advance=true，进入 recovery_questions。\n"
            "3. 30 字以内，加 1 个 emoji。"
        )

    if node == "recovery_questions":
        idx = ctx_extra.get("recovery_q_index", 0)
        return (
            f"【recovery_questions - 巩固题第 {idx + 1}/3 题】\n"
            "1. 先热情表扬：「可以呀，那我们再来一道巩固一下～」\n"
            "2. 给 1 道**同知识点但数字不一样**的题（避免原题）。\n"
            "3. 仅在第 1 题时填 current_question / current_answer / current_kp；其余题复用 state 里的 current_question。\n"
            "4. 总回复不超过 60 字，加 1 个 emoji。"
        )

    if node == "done":
        return (
            "【done - 结束总结】\n"
            "1. 热情总结：'这道题我们学到了 X'。\n"
            "2. summary_text 写 30-80 字，包含：方法总结 + 学生反思的错误原因 + 以后做题要注意的点。\n"
            "3. reply 不超过 50 字，加 1 个 emoji。"
        )

    # ===== 卡顿兜底 directive =====
    if total_stuck >= 3 and node_stuck >= 2:
        return (
            "【卡顿兜底 - 累计 3 次卡住】\n"
            "1. 学生已经在当前节点卡了多次。\n"
            "2. 简单点拨关键突破口（讲最核心 1 个知识点），剩余计算交给学生独立完成。\n"
            "3. 不要给答案数字。\n"
            "4. 50 字以内，加 1 个 emoji。"
        )
    if node_stuck >= 2:
        return (
            "【同节点连错 2 次 - 给知识点小支架】\n"
            "1. 学生当前节点连续卡住。\n"
            "2. 只讲 1 个最相关的知识点，依旧不给解题步骤。\n"
            "3. 30 字以内，加 1 个 emoji。"
        )

    return "【引导】"


def _build_messages(error_ctx: dict, state: dict, history: List[dict], student_msg: str) -> List[dict]:
    question = error_ctx.get("question_text", "")
    correct = error_ctx.get("correct_answer", "")
    knowledge = error_ctx.get("knowledge_point", "")
    student_wrong = error_ctx.get("student_answer", "")

    current_q = state.get("current_question")
    current_a = state.get("current_answer")

    error_type = state.get("error_type") or "A"
    topic = state.get("topic") or "other"

    ctx = (
        f"【当前错题】\n题目：{question}\n"
        f"正确答案：{correct}\n"
        f"学生最初错误答案：{student_wrong or '（无）'}\n"
        f"知识点：{knowledge or '小学五年级数学'}\n"
        f"系统已识别：\n"
        f"  错误类型 = {'A 思路/公式/审题错（走 5 步阶梯）' if error_type == 'A' else 'B 粗心错（简短提示验算）'}\n"
        f"  题型 = {topic}\n"
    )
    if current_q and state.get("current_node") == "recovery_questions":
        idx = state.get("recovery_q_index", 0)
        ctx += (
            f"\n【当前巩固题 - 第 {idx + 1}/3 题】\n"
            f"巩固题：{current_q}\n"
            f"正确答案：{current_a}\n"
        )

    node = state["current_node"]
    ctx_extra = {
        "error_type": error_type,
        "topic": topic,
        "node_stuck_count": state.get("node_stuck_count", 0),
        "total_stuck_count": state.get("total_stuck_count", 0),
        "recovery_q_index": state.get("recovery_q_index", 0),
    }
    directive = _stage_directive(node, ctx_extra)

    base = (
        ctx
        + f"\n【当前节点】\nnode={node}\n"
        f"当前节点连续卡住次数：{state.get('node_stuck_count', 0)}\n"
        f"累计卡住次数：{state.get('total_stuck_count', 0)}\n"
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
        "node": "step1_thought",
        "reply": raw.strip()[:80] or "我们一起想一想～",
        "is_node_advance": False,
        "current_question": None,
        "current_answer": None,
        "current_kp": None,
        "summary_text": None,
    }


def _call_llm_one_shot(messages) -> dict:
    parsed_dict = _call_llm_json(messages, temperature=0.55, max_tokens=500, timeout=60)
    if isinstance(parsed_dict, dict):
        return parsed_dict
    if isinstance(parsed_dict, str):
        return _safe_parse(parsed_dict)
    raw = _call_llm(messages, temperature=0.55, max_tokens=500, timeout=60)
    return _safe_parse(raw) if raw else {}


# ============= 节点推进（启发式，不依赖 LLM）============

NODE_ORDER = [
    "step1_thought", "step2_review", "step3_formula",
    "step4_calc", "step5_reflect", "recovery_questions", "done",
]


def _next_node(current: str) -> str:
    if current == "b_quick_check":
        # 类型 B 完成 → 直接 step5_reflect（订正完引导反思）→ recovery
        return "step5_reflect"
    if current == "step5_reflect":
        return "recovery_questions"
    if current == "recovery_questions":
        return "done"
    if current in NODE_ORDER:
        idx = NODE_ORDER.index(current)
        if idx + 1 < len(NODE_ORDER):
            return NODE_ORDER[idx + 1]
    return "done"


def _advance_state(state: dict, parsed: dict, student_msg: str, error_ctx: dict) -> tuple:
    """根据学生最新回复 + LLM 返回，更新 state。
    forced 字典：用于覆盖 LLM 决策（必收敛护栏）。
    """
    forced = {}
    correct_a = error_ctx.get("correct_answer", "")
    node = state["current_node"]

    # ===== 1) 错误类型 / 题型识别（首轮）=====
    if state.get("error_type") is None:
        sa = error_ctx.get("student_answer", "")
        ca = error_ctx.get("correct_answer", "")
        q = error_ctx.get("question_text", "")
        kp = error_ctx.get("knowledge_point", "")
        et = _classify_error_type(sa, ca, _detect_topic(q, kp))
        state["error_type"] = et
        state["topic"] = _detect_topic(q, kp)
        # 类型 B → 起点直接到 b_quick_check
        if et == "B":
            state["current_node"] = "b_quick_check"
            forced["override_node"] = "b_quick_check"
            return state, forced
        # 类型 A → 默认从 step1_thought 开始（如果首轮学生没说话）或维持现状
        if not student_msg:
            state["current_node"] = "step1_thought"
            forced["override_node"] = "step1_thought"

    # ===== 2) 学生自答正确（针对原题）→ 跳到 step5_reflect =====
    if student_msg and _looks_correct(student_msg, correct_a):
        if node in ("step1_thought", "step2_review", "step3_formula", "step4_calc", "b_quick_check"):
            state["user_mastered"] = True
            state["current_node"] = "step5_reflect"
            state["node_stuck_count"] = 0
            forced["override_node"] = "step5_reflect"
            forced["override_reply_extra"] = "（小聪点头）"
            return state, forced

    # ===== 3) 卡顿计数（启发式）=====
    stuck_now = _looks_stuck(student_msg or "")
    if stuck_now:
        state["node_stuck_count"] = state.get("node_stuck_count", 0) + 1
        state["total_stuck_count"] = state.get("total_stuck_count", 0) + 1
    else:
        state["node_stuck_count"] = 0

    # ===== 4) 节点推进（按 LLM 的 is_node_advance 决定）=====
    is_advance = parsed.get("is_node_advance", False)

    # 强制推进：当前节点连续 2 次卡住 → 进入下一个节点（触发小支架 directive）
    if state["node_stuck_count"] >= 2 and not is_advance:
        # 兜底 directive 会让 LLM 给知识点小支架，不强制前进
        pass

    # 类型 B 完成：当前是 b_quick_check 且学生订正对了原题（已在上面处理）
    # 类型 B 完成 + 学生没答对原题但前进（LLM 主动 advance）→ step5_reflect
    if node == "b_quick_check" and is_advance:
        state["current_node"] = "step5_reflect"
        forced["override_node"] = "step5_reflect"
        return state, forced

    # recovery_questions：判断巩固题答对/答错
    if node == "recovery_questions" and student_msg:
        if state.get("current_answer") and _looks_correct(student_msg, state["current_answer"]):
            # 当前巩固题答对
            idx = state.get("recovery_q_index", 0)
            if idx + 1 >= 3:
                # 3 题都答对 → done
                state["current_node"] = "done"
                forced["override_node"] = "done"
            else:
                # 答对一题但还有题没出 → 让 LLM 在下一题出题
                state["recovery_q_index"] = idx + 1
                # 留着 node=recovery_questions 让 LLM 重新出题
                forced["override_node"] = "recovery_questions"
            state["node_stuck_count"] = 0
            forced["override_reply_extra"] = "🎉 答对啦～"
            return state, forced
        else:
            # 巩固题答错：累计失败次数
            state["recovery_fail_count"] = state.get("recovery_fail_count", 0) + 1
            state["node_stuck_count"] += 1
            state["total_stuck_count"] += 1
            if state["recovery_fail_count"] >= 3:
                # 3 题累计失败 3 次 → done
                state["current_node"] = "done"
                forced["override_node"] = "done"
                forced["override_reply_extra"] = (
                    f"（小聪看看你试了好多次啦～其实答案是 {correct_a}，"
                    f"下次我们再做类似题哦～）"
                )
                return state, forced
            # 未到 3 次：让 LLM 继续在 recovery_questions 引导
            forced["override_node"] = "recovery_questions"
            return state, forced

    # step5_reflect：学生说完反思后 → recovery_questions
    if node == "step5_reflect" and is_advance and student_msg and not _looks_stuck(student_msg):
        state["current_node"] = "recovery_questions"
        state["recovery_q_index"] = 0
        state["recovery_fail_count"] = 0
        forced["override_node"] = "recovery_questions"
        return state, forced

    # 普通推进：step1/step2/step3/step4 学生没卡住 + LLM 同意 advance → 下一节点
    if node in ("step1_thought", "step2_review", "step3_formula", "step4_calc"):
        if is_advance and not stuck_now:
            state["current_node"] = _next_node(node)
            forced["override_node"] = state["current_node"]
        # 否则 LLM 留当前节点（directive 会自动加卡顿提示）

    return state, forced


def _apply_forced(state: dict, parsed: dict, forced: dict) -> dict:
    out = dict(parsed)
    if forced.get("override_node"):
        out["node"] = forced["override_node"]
    if forced.get("override_reply_extra"):
        extra = forced["override_reply_extra"]
        reply = out.get("reply") or ""
        out["reply"] = f"{reply} {extra}".strip()
    return out


# ============= 主入口 =============

_NODE_LABELS = {
    "step1_thought":       "第 1 步·还原思路",
    "step2_review":        "第 2 步·审题核查",
    "step3_formula":       "第 3 步·拆解算式",
    "step4_calc":          "第 4 步·计算自查",
    "step5_reflect":       "第 5 步·复盘反思",
    "recovery_questions":  "巩固练习",
    "done":                "订正完成",
    "b_quick_check":       "粗心错·快速核对",
}


def chat_with_xiaocong(
    student_id: int,
    error_note_id: int,
    student_msg: str,
    error_ctx: dict,
) -> dict:
    """与小聪对话一轮（5 步苏格拉底 + 类型 A/B 分流 + 3 道巩固题）

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
            "current_question": str | None,
            "current_answer": str | None,
            "current_stage_label": str,
            "session_round": int,
            "user_mastered": bool,
            "error_type": "A" | "B",
            "topic": str,
            "node_stuck_count": int,
            "total_stuck_count": int,
            "recovery_q_index": int,
            "summary_text": str | None,
            "is_node_advance": bool,
        }
    """
    state = _get_state(student_id, error_note_id)
    history = _get_history(student_id, error_note_id)

    # 1. 先用本地启发式推进节点
    new_state, forced = _advance_state(state, {}, student_msg or "", error_ctx)

    # 2. 构造 LLM 输入并调用
    messages = _build_messages(error_ctx, new_state, history, student_msg or "")
    parsed = _call_llm_one_shot(messages)
    if not parsed:
        parsed = {
            "node": new_state["current_node"],
            "reply": "小聪正在整理思路～要不你把你的想法说给我听？",
            "is_node_advance": False,
            "current_question": None,
            "current_answer": None,
            "current_kp": None,
            "summary_text": None,
        }

    # 3. 应用强制覆盖
    parsed = _apply_forced(new_state, parsed, forced)

    # 4. 写 history
    if student_msg:
        _append_history(student_id, error_note_id, "user", student_msg)
    _append_history(student_id, error_note_id, "assistant", parsed.get("reply", ""))

    # 5. recovery_questions 首轮出题 → 写入 state
    if parsed.get("node") == "recovery_questions" and new_state.get("recovery_q_index", 0) == 0:
        nq = (parsed.get("current_question") or "").strip()
        na = (parsed.get("current_answer") or "").strip()
        if nq:
            new_state["current_question"] = nq
            new_state["current_answer"] = na
            new_state["current_kp"] = parsed.get("current_kp")
        new_state["recovery_q_index"] = 0
        new_state["recovery_fail_count"] = 0
    elif parsed.get("node") == "recovery_questions" and new_state.get("recovery_q_index", 0) > 0:
        # 后续题：LLM 应该复用 state 里的 current_question（不强制覆盖）
        pass

    # 6. 落最终状态
    legal_nodes = {
        "step1_thought", "step2_review", "step3_formula", "step4_calc",
        "step5_reflect", "recovery_questions", "done", "b_quick_check",
    }
    final_node = parsed.get("node") or new_state["current_node"]
    if final_node not in legal_nodes:
        final_node = new_state["current_node"]
    new_state["current_node"] = final_node
    _set_state(student_id, error_note_id, new_state)

    return {
        "stage": final_node,  # 兼容旧字段名
        "node": final_node,
        "reply": (parsed.get("reply") or "我们继续～").strip(),
        "current_question": new_state.get("current_question") if final_node == "recovery_questions" else None,
        "current_answer": new_state.get("current_answer") if final_node == "recovery_questions" else None,
        "current_knowledge_point": new_state.get("current_kp"),
        "summary_text": parsed.get("summary_text") if final_node == "done" else None,
        "current_stage_label": _NODE_LABELS.get(final_node, "引导中"),
        "session_round": len(_get_history(student_id, error_note_id)) // 2,
        "user_mastered": new_state.get("user_mastered", False),
        "error_type": new_state.get("error_type"),
        "topic": new_state.get("topic"),
        "node_stuck_count": new_state.get("node_stuck_count", 0),
        "total_stuck_count": new_state.get("total_stuck_count", 0),
        "recovery_q_index": new_state.get("recovery_q_index", 0),
        "is_node_advance": parsed.get("is_node_advance", False),
    }


def reset_xiaocong_session(student_id: int, error_note_id: int) -> dict:
    _reset_session(student_id, error_note_id)
    return {"reset": True}


def get_session_round(student_id: int, error_note_id: int) -> int:
    return len(_get_history(student_id, error_note_id)) // 2