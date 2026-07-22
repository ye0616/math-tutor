"""
LLM模块 - 调用智谱GLM-4-Flash进行AI智能分析
功能：
1. AI分类搜索结果到基础/提升/拓展三层
2. AI生成分层练习题
3. AI生成知识点和教学建议
4. 多模态作业批改（GLM-4V-Flash）
5. 引导改错 + 类似题生成 + 错题突破
"""

import os
import json
import re
import base64
import httpx
from pathlib import Path

# 加载.env
_env_file = Path(__file__).resolve().parent.parent / ".env"
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

API_KEY = os.environ.get("ZHIPU_API_KEY", "")
API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
MODEL = "glm-4-flash"
VISION_MODEL = "glm-4v-flash"  # 多模态视觉模型（免费）


def _call_llm(messages, temperature=0.7, max_tokens=2000, timeout=90):
    """调用GLM-4-Flash API（含重试+退避）"""
    import time as _time
    max_retries = 2
    for attempt in range(max_retries):
        try:
            resp = httpx.post(
                API_URL,
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": MODEL,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
                timeout=timeout,
            )
            data = resp.json()
            if "choices" in data:
                return data["choices"][0]["message"]["content"]
            else:
                print(f"[LLM] API错误(第{attempt+1}次): {data}")
                if attempt < max_retries - 1:
                    _time.sleep(1 * (attempt + 1))
                    continue
                return None
        except Exception as e:
            print(f"[LLM] 调用异常(第{attempt+1}次): {e}")
            if attempt < max_retries - 1:
                _time.sleep(1 * (attempt + 1))
                continue
            return None
    return None


def _call_llm_vision(messages, temperature=0.3, max_tokens=1024, timeout=120):
    """调用GLM-4V-Flash多模态API（支持图片输入，含重试+退避）
    
    messages 格式：
    [
        {"role": "system", "content": "..."},
        {"role": "user", "content": [
            {"type": "text", "text": "..."},
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
        ]}
    ]
    """
    import time as _time
    max_retries = 2
    for attempt in range(max_retries):
        try:
            resp = httpx.post(
                API_URL,
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": VISION_MODEL,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
                timeout=timeout,
            )
            data = resp.json()
            if "choices" in data:
                return data["choices"][0]["message"]["content"]
            else:
                print(f"[LLM-Vision] API错误(第{attempt+1}次): {data}")
                if attempt < max_retries - 1:
                    _time.sleep(2 * (attempt + 1))
                    continue
                return None
        except Exception as e:
            print(f"[LLM-Vision] 调用异常(第{attempt+1}次): {e}")
            if attempt < max_retries - 1:
                _time.sleep(2 * (attempt + 1))
                continue
            return None
    return None


def _extract_json(raw: str) -> dict | list | None:
    """从LLM返回文本中提取JSON（多重容错策略）"""
    if not raw:
        return None

    raw = raw.strip()
    # 去除BOM等控制字符（保留换行用于多行字符串）
    raw = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', raw)

    candidates = []

    # 策略1：直接解析
    candidates.append(raw)

    # 策略2：提取 ```json ... ``` 代码块
    for m in re.finditer(r'```json\s*\n?(.*?)\n?```', raw, re.DOTALL):
        candidates.append(m.group(1).strip())

    # 策略3：提取 ``` ... ``` 通用代码块
    for m in re.finditer(r'```\s*\n?(.*?)\n?```', raw, re.DOTALL):
        block = m.group(1).strip()
        if block:
            candidates.append(block)

    # 策略4：提取最大的 {...} 或 [...] 块
    for open_ch, close_ch in [('{', '}'), ('[', ']')]:
        start = raw.find(open_ch)
        end = raw.rfind(close_ch)
        if start != -1 and end > start:
            candidates.append(raw[start:end + 1])

    # 依次尝试每个候选
    for candidate in candidates:
        if not candidate:
            continue
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            # 修复1：移除尾部多余逗号（最常见的问题）
            fixed = re.sub(r',\s*([}\]])', r'\1', candidate)
            try:
                return json.loads(fixed)
            except json.JSONDecodeError:
                continue

    print(f"[LLM] JSON解析失败（{len(candidates)}个候选均失败），原始输出前300字符: {raw[:300]}")
    return None


def _call_llm_json(messages, temperature=0.7, max_tokens=2000, timeout=90):
    """调用GLM-4-Flash并解析JSON输出（单次调用版，不做二次重试省时间）"""
    raw = _call_llm(messages, temperature, max_tokens, timeout)
    if not raw:
        return None
    result = _extract_json(raw)
    if result is not None:
        return result
    print(f"[LLM] JSON解析失败（已用5种策略提取），原始前200字符: {raw[:200]}")
    return None


def ai_classify_resources(search_results, lesson_title, resource_type):
    """
    AI智能分类搜索结果到基础/提升/拓展三层
    
    参数:
        search_results: 搜索结果列表 [{title, url, snippet, ...}]
        lesson_title: 课题名称
        resource_type: 资源类型 (courseware/lesson_plan/exercise/video)
    
    返回:
        {basic: [...], advanced: [...], extension: [...]}
    """
    # 准备搜索结果摘要
    items_text = ""
    for i, r in enumerate(search_results[:10]):
        title = r.get("title", "")
        snippet = r.get("snippet", r.get("description", ""))
        items_text += f"{i+1}. {title}\n   摘要: {snippet[:100]}\n\n"
    
    type_map = {
        "courseware": "课件",
        "lesson_plan": "教案",
        "exercise": "练习题",
        "video": "微课视频",
    }
    type_cn = type_map.get(resource_type, resource_type)
    
    prompt = f"""你是小学数学教学资源分析专家。请仔细阅读以下关于"{lesson_title}"的{type_cn}搜索结果，根据每条资源的标题和摘要内容，判断它最适合哪个教学层次。

搜索结果：
{items_text}

分类规则（必须结合标题和摘要内容判断）：
- basic（基础层）: 适合基础薄弱学生。标题/摘要中出现"基础""入门""概念""认识""例1""简单""初步"等。
- advanced（提升层）: 适合中等水平学生。标题/摘要中出现"练习""应用""巩固""变式""方法""综合"等。
- extension（拓展层）: 适合学有余力学生。标题/摘要中出现"拓展""延伸""思维""挑战""奥数""综合应用"等。

请输出JSON格式，每个资源保留原始信息并添加match_score（0-100匹配度）和reason（分类理由，必须说明基于标题/摘要的哪些内容判断）：
{{
  "basic": [{{"title": "...", "url": "...", "snippet": "...", "match_score": 85, "reason": "..."}}],
  "advanced": [{{"title": "...", "url": "...", "snippet": "...", "match_score": 80, "reason": "..."}}],
  "extension": [{{"title": "...", "url": "...", "snippet": "...", "match_score": 75, "reason": "..."}}]
}}

每层最多4个资源。只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是一位经验丰富的小学数学教研专家，擅长教学资源分析和分层教学设计。"},
        {"role": "user", "content": prompt},
    ]
    
    result = _call_llm_json(messages, temperature=0.3, max_tokens=2000)
    if result and isinstance(result, dict):
        # 确保每层都有数据
        for layer in ["basic", "advanced", "extension"]:
            if layer not in result:
                result[layer] = []
            for item in result[layer]:
                item["is_real"] = True
                item["is_ai_classified"] = True
        return result
    else:
        print(f"[LLM] 分类失败，使用原始结果")
        return None


def ai_generate_exercises(lesson_title, grade="五年级", knowledge_points=None, search_context=None):
    """
    AI实时生成分层练习题（结合课题、知识点与真实搜索资源上下文）
    
    参数:
        lesson_title: 课题名称
        grade: 年级
        knowledge_points: 知识点列表
        search_context: 搜索结果摘要文本（来自真实联网搜索的标题+摘要）
    
    返回:
        [{layer, question, options, answer, analysis, knowledge_point}, ...]
    """
    kp_text = f"\n知识点要求: {', '.join(knowledge_points)}" if knowledge_points else ""
    ctx_text = f"\n\n参考真实搜索资源（已联网检索到的相关教学资源摘要）:\n{search_context[:1500]}" if search_context else ""

    prompt = f"""你是小学数学{grade}出题专家。请为课题"{lesson_title}"实时生成5道分层练习题。{kp_text}{ctx_text}

要求：
- 基础层(basic) 2题: 直接应用基本概念，难度较低
- 提升层(advanced) 1题: 需要一定思考，涉及变式
- 拓展层(extension) 2题: 综合应用，有挑战性

人教版小学数学{grade}水平。题目要真实、准确、有教学价值，可参考联网搜索资源中的题型与方向。

输出JSON格式：
{{
  "questions": [
    {{
      "layer": "basic",
      "question": "题目内容",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "analysis": "解析说明",
      "knowledge_point": "对应知识点"
    }}
  ]
}}

注意：选择题必须有4个选项，答案为单个字母。只输出JSON。"""

    messages = [
        {"role": "system", "content": "你是人教版小学数学教研员，精通分层教学设计和练习题编写。"},
        {"role": "user", "content": prompt},
    ]
    
    result = _call_llm_json(messages, temperature=0.5, max_tokens=2000)
    if result and "questions" in result:
        return result["questions"]
    else:
        print(f"[LLM] 生成题目失败")
        return None


def ai_generate_teaching_analysis(lesson_title, search_summary=None, grade="五年级", search_resources=None):
    """
    AI生成知识点分析、探究提问和教学建议（结合真实搜索资源）
    
    参数:
        lesson_title: 课题
        search_summary: 搜索结果摘要（兼容旧调用）
        search_resources: 真实搜索结果（列表，每项含 title/snippet/source）
        grade: 年级
    
    返回:
        {knowledge_points, inquiry_questions, teaching_tips, blackboard_design}
    """
    # 汇总真实搜索资源文本
    resources_text = ""
    if search_resources:
        for i, r in enumerate(search_resources[:30]):
            title = r.get("title", "")
            snippet = r.get("snippet") or r.get("description") or ""
            platform = r.get("source") or r.get("platform") or ""
            if title:
                resources_text += f"{i+1}. [{platform}] {title}\n   {snippet[:120]}\n\n"
    if not resources_text and search_summary:
        resources_text = search_summary

    prompt = f"""你是小学数学{grade}教研专家。根据课题"{lesson_title}"和以下真实联网检索到的教学资源，生成教学分析。

真实搜索资源（已从百度/B站检索到的标题与摘要）：
{resources_text[:3000]}

请结合上述资源的内容进行教学设计，给出具体可操作的备课建议。

输出JSON格式：
{{
  "knowledge_points": ["知识点1", "知识点2", "知识点3", "知识点4"],
  "inquiry_questions": [
    {{"question": "探究问题", "purpose": "设计目的"}},
    {{"question": "探究问题", "purpose": "设计目的"}},
    {{"question": "探究问题", "purpose": "设计目的"}}
  ],
  "teaching_tips": ["教学建议1", "教学建议2", "教学建议3"],
  "blackboard_design": "板书设计内容（用\\n换行）",
  "preview_tasks": {{
    "basic": ["基础预习任务1", "基础预习任务2"],
    "advanced": ["提升预习任务1", "提升预习任务2"],
    "extension": ["拓展预习任务1", "拓展预习任务2"]
  }}
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是人教版小学数学资深教研员，擅长教学设计和学情分析。"},
        {"role": "user", "content": prompt},
    ]
    
    result = _call_llm_json(messages, temperature=0.5, max_tokens=2000)
    if result and isinstance(result, dict):
        return result
    else:
        print(f"[LLM] 生成教学分析失败")
        return None


def ai_generate_blackboard_design(lesson_title, knowledge_points=None, preview_content="", grade="五年级"):
    """
    AI 生成结构化板书设计（主板书 + 副板书）
    
    参数:
        lesson_title: 课题
        knowledge_points: 知识点列表
        preview_content: 预习内容/教学要点文本
        grade: 年级
    
    返回:
        {"main_board": "主板书内容", "side_board": "副板书内容"}
    """
    kp_text = ""
    if knowledge_points:
        kp_text = "\n".join(f"  {i+1}. {kp}" for i, kp in enumerate(knowledge_points[:6]))
    
    preview_text = (preview_content or "")[:500]

    prompt = f"""你是小学数学{grade}教研专家，擅长板书设计。请为课题「{lesson_title}」设计一份结构化板书。

知识点：
{kp_text or '（请根据课题自行提炼核心知识点）'}

教学要点：
{preview_text or '（请根据课题自行设计）'}

设计要求：
1. 主板书（main_board）：位于黑板中央，包含课题、核心公式/法则、例题解答过程，用换行符\\n分隔，可使用 →、①②③、÷、× 等符号
2. 副板书（side_board）：位于黑板侧边，包含关键步骤、易错提醒、方法小结，用换行符\\n分隔

输出JSON格式：
{{
  "main_board": "主板书内容（多行用\\n分隔）",
  "side_board": "副板书内容（多行用\\n分隔）"
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是人教版小学数学资深教研员，擅长板书设计，板书简洁清晰、重点突出。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.6, max_tokens=1200)
    if result and isinstance(result, dict):
        return {
            "main_board": result.get("main_board", ""),
            "side_board": result.get("side_board", ""),
        }
    print("[LLM] 生成板书设计失败")
    return None


def ai_analyze_search_quality(search_results, lesson_title):
    """
    AI分析搜索结果与课题的相关性和质量
    
    返回:
        [{title, url, relevance_score, quality_note}, ...]
    """
    items_text = "\n".join([
        f"{i+1}. {r.get('title','')} - {r.get('snippet', r.get('description',''))[:80]}"
        for i, r in enumerate(search_results[:8])
    ])
    
    prompt = f"""分析以下关于"{lesson_title}"的搜索结果与课题的相关性：

{items_text}

输出JSON，对每个结果评分(0-100)并简要说明：
[{{"index": 1, "score": 85, "note": "相关性说明"}}]

只输出JSON。"""

    messages = [
        {"role": "system", "content": "你是教学资源质量评估专家。"},
        {"role": "user", "content": prompt},
    ]
    
    result = _call_llm_json(messages, temperature=0.3, max_tokens=1000)
    return result if result else None


def ai_curate_resources(items, lesson_title, grade="五年级", subject="数学"):
    """
    AI审查检索到的资源：剔除垃圾/不相关，确认分层，为每条生成「重点」标注。

    参数:
        items: 真实检索到的资源列表 [{title, platform, resource_type, layer, description, match_score, ...}]
        lesson_title: 课题
        grade/subject: 年级/学科

    返回:
        [{title, keep, layer, highlight}]  keep=False 表示建议剔除
    """
    if not items:
        return []

    # 构造紧凑清单送审（最多25条）
    lines = []
    for i, it in enumerate(items[:25]):
        lines.append(
            f"{i+1}. [{it.get('resource_type','')}/{it.get('layer','')}] "
            f"{it.get('title','')}（来源:{it.get('platform','')}）"
            f" 摘要:{(it.get('description','') or '')[:70]}"
        )
    list_text = "\n".join(lines)

    prompt = f"""你是人教版{grade}{subject}教研专家。下面是通过百度/B站真实检索到的「{lesson_title}」相关教学资源清单。请你逐一审查：

{list_text}

审查要求：
1. 剔除垃圾：与课题无关、纯广告、内容空泛、明显重复的，keep=false。
2. 确认分层：结合标题与摘要，判定该资源最适合哪个学生层次。
   - basic(基础生)：讲概念、入门、基础例题讲解
   - advanced(提升生)：变式练习、方法归纳、综合应用
   - extension(拓展生)：思维拓展、奥数、挑战难题
3. 生成重点(highlight)：用一句话说明老师可以拿这条资源做什么（如"课前导入用，动画演示小数乘法算理"）。

只输出JSON数组：
[{{"index": 1, "keep": true, "layer": "basic", "highlight": "一句话重点"}}]

注意：index 对应上面清单的序号。只输出JSON。"""

    messages = [
        {"role": "system", "content": "你是小学数学教研员，擅长教学资源筛选与分层教学设计。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.3, max_tokens=2000, timeout=90)
    if not isinstance(result, list):
        print("[LLM] 资源审查返回格式异常，跳过审查")
        return None

    out = []
    for entry in result:
        try:
            idx = int(entry.get("index", 0)) - 1
            if 0 <= idx < len(items):
                out.append({
                    "index": idx,
                    "keep": bool(entry.get("keep", True)),
                    "layer": entry.get("layer", items[idx].get("layer", "basic")),
                    "highlight": entry.get("highlight", ""),
                })
        except (TypeError, ValueError):
            continue
    return out


# ===== 方案 C：AI 直出结构化内容 =====

_LAYER_DESC = {
    "basic": "基础层——面向基础薄弱的学生，内容通俗易懂、循序渐进，重在概念理解和基本方法掌握",
    "advanced": "提升层——面向中等水平的学生，内容有一定深度，重在变式训练和综合应用",
    "extension": "拓展层——面向学有余力的学生，内容有挑战性，重在思维拓展和探究创新",
}


def ai_generate_courseware(lesson_title, grade="五年级", layer="basic", knowledge_points=None):
    """
    AI 直接生成课件内容（知识点讲解 + 例题 + 板书）

    参数:
        lesson_title: 课题名称
        grade: 年级
        layer: 分层 (basic/advanced/extension)
        knowledge_points: 已知知识点列表

    返回:
        dict: 结构化课件内容
    """
    kp_text = f"\n本课时核心知识点: {', '.join(knowledge_points)}" if knowledge_points else ""
    layer_desc = _LAYER_DESC.get(layer, _LAYER_DESC["basic"])

    prompt = f"""你是人教版小学数学{grade}课件设计专家。请为课题「{lesson_title}」设计一份{layer_desc}的课件内容。

{kp_text}

要求：
1. 内容要贴合人教版{grade}教材，语言准确、生动、适合小学生
2. 知识讲解要循序渐进，配合生动的情境引入
3. 例题要规范、有代表性，解答过程要完整
4. 板书设计要清晰美观，突出重点

输出JSON格式：
{{
  "title": "课件标题（如：{lesson_title}·基础课件）",
  "knowledge_points": ["知识点1", "知识点2", "知识点3"],
  "sections": [
    {{
      "phase": "情境导入",
      "content": "用一段生动的日常场景引入本课主题（3-4行文字）"
    }},
    {{
      "phase": "概念讲解",
      "content": "清晰讲解核心概念，用学生能理解的语言（5-8行）"
    }},
    {{
      "phase": "例题精讲",
      "content": "给出1-2个典型例题，附完整解答步骤",
      "examples": [
        {{
          "question": "例题文字",
          "solution": "解答步骤（分步骤写）",
          "tip": "解题要点提示"
        }}
      ]
    }},
    {{
      "phase": "方法归纳",
      "content": "总结解题方法和注意事项（3-4行）"
    }},
    {{
      "phase": "课堂练习",
      "content": "2-3道即时练习题，巩固所学",
      "exercises": [
        {{
          "question": "练习题目文字",
          "answer": "答案",
          "hint": "思考提示"
        }}
      ]
    }}
  ],
  "board_design": "板书设计文字描述（用换行分隔，标注重点用【】括起来）"
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是人教版小学数学课件设计专家，擅长将抽象数学概念转化为生动直观的课堂内容。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.5, max_tokens=2000, timeout=90)
    if result and isinstance(result, dict):
        # 确保必要字段存在
        if "title" not in result:
            result["title"] = f"{lesson_title}·{layer_desc.split('——')[0]}课件"
        if "sections" not in result:
            result["sections"] = []
        return result
    print(f"[LLM] 课件生成失败 (layer={layer})")
    return None


def ai_generate_lesson_plan(lesson_title, grade="五年级", layer="basic", knowledge_points=None):
    """
    AI 直接生成教案内容（教学目标 + 过程 + 重难点）

    参数:
        lesson_title: 课题名称
        grade: 年级
        layer: 分层 (basic/advanced/extension)
        knowledge_points: 已知知识点列表

    返回:
        dict: 结构化教案内容
    """
    kp_text = f"\n本课时核心知识点: {', '.join(knowledge_points)}" if knowledge_points else ""
    layer_desc = _LAYER_DESC.get(layer, _LAYER_DESC["basic"])

    prompt = f"""你是人教版小学数学{grade}教案编写专家。请为课题「{lesson_title}」编写一份{layer_desc}的教案。

{kp_text}

要求：
1. 教学目标要明确、可衡量，分知识与技能、过程与方法、情感态度三维目标
2. 教学过程要具体、可操作，每环节写清活动内容和教师引导语
3. 重难点要精准定位，给出突破策略
4. 板书设计要清晰、美观

输出JSON格式：
{{
  "title": "教案标题（如：{lesson_title}·基础教案）",
  "objectives": {{
    "knowledge": "知识与技能目标",
    "process": "过程与方法目标",
    "emotion": "情感态度目标"
  }},
  "key_points": ["教学重点1", "教学重点2"],
  "difficult_points": ["教学难点1", "教学难点2"],
  "difficult_breakthrough": ["突破策略1", "突破策略2"],
  "teaching_process": [
    {{
      "phase": "导入（5分钟）",
      "activities": ["活动1：具体描述", "活动2：具体描述"],
      "teacher_guide": "教师引导语示例"
    }},
    {{
      "phase": "新授（15分钟）",
      "activities": ["活动1：具体描述", "活动2：具体描述"],
      "teacher_guide": "教师引导语示例"
    }},
    {{
      "phase": "练习（10分钟）",
      "activities": ["活动1：具体描述", "活动2：具体描述"],
      "teacher_guide": "教师引导语示例"
    }},
    {{
      "phase": "总结（5分钟）",
      "activities": ["活动1：具体描述"],
      "teacher_guide": "教师引导语示例"
    }}
  ],
  "board_design": "板书设计文字描述（用换行分隔，标注重点用【】括起来）",
  "teaching_tips": ["教学建议1", "教学建议2"]
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是人教版小学数学教案编写专家，擅长分层教学设计和课堂活动设计。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.5, max_tokens=2000, timeout=90)
    if result and isinstance(result, dict):
        if "title" not in result:
            result["title"] = f"{lesson_title}·{layer_desc.split('——')[0]}教案"
        if "teaching_process" not in result:
            result["teaching_process"] = []
        return result
    print(f"[LLM] 教案生成失败 (layer={layer})")
    return None


def ai_generate_exercises_v2(lesson_title, grade="五年级", layer="basic", knowledge_points=None):
    """
    AI 生成分层练习题（增强版，返回更丰富的结构化内容）

    参数:
        lesson_title: 课题名称
        grade: 年级
        layer: 分层 (basic/advanced/extension)
        knowledge_points: 已知知识点列表

    返回:
        dict: 结构化练习内容
    """
    kp_text = f"\n本课时核心知识点: {', '.join(knowledge_points)}" if knowledge_points else ""
    layer_desc = _LAYER_DESC.get(layer, _LAYER_DESC["basic"])

    prompt = f"""你是人教版小学数学{grade}出题专家。请为课题「{lesson_title}」设计一份{layer_desc}的练习题集。

{kp_text}

要求：
1. 题目要贴合人教版{grade}教材，难度符合该层次学生水平
2. 题目真实、准确、有教学价值
3. 解析要详细、有步骤、帮助学生理解
4. 标注每题对应的知识点

输出JSON格式：
{{
  "title": "练习标题（如：{lesson_title}·基础练习）",
  "questions": [
    {{
      "id": 1,
      "type": "选择题/填空题/计算题/应用题",
      "question": "题目内容",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A 或具体答案",
      "analysis": "详细解析（包含解题步骤）",
      "knowledge_point": "对应知识点"
    }}
  ]
}}

基础层：3道选择题+1道填空题+1道计算题
提升层：2道计算题+2道应用题+1道变式题
拓展层：1道挑战题+2道应用题+1道探究题+1道思维题

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是人教版小学数学教研员，精通分层出题和练习题编写。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.5, max_tokens=2000, timeout=90)
    if result and isinstance(result, dict):
        if "title" not in result:
            result["title"] = f"{lesson_title}·{layer_desc.split('——')[0]}练习"
        if "questions" not in result:
            result["questions"] = []
        return result
    print(f"[LLM] 练习生成失败 (layer={layer})")
    return None


# ===== 多模态作业批改智能体 =====

def ai_grade_homework(image_base64: str, lesson_title: str, grade: str = "五年级") -> dict:
    """
    多模态作业批改：使用GLM-4V-Flash识别图片中的数学题，逐题批改对错，
    并为每道错题提供详细的错误分析和订正建议。

    参数:
        image_base64: 图片的base64编码字符串
        lesson_title: 课题名称
        grade: 年级

    返回:
        {
            "success": bool,
            "questions": [
                {
                    "index": 1,
                    "question_text": "原题文字",
                    "student_answer": "学生写的答案",
                    "correct_answer": "正确答案",
                    "is_correct": true/false,
                    "analysis": "批改分析",
                    "error_type": "错误类型（如：计算错误/概念不清/审题错误）",
                    "correction_hint": "改错提示",
                    "knowledge_point": "涉及的知识点"
                }
            ],
            "summary": "整体评价（1-2句话）"
        }
    """
    prompt = f"""你是一位专业的小学数学教师，正在批改学生"{lesson_title}"的作业。请仔细查看上传的作业图片，完成以下任务：

1. 识别图片中所有数学题
2. 读取每道题的学生答案
3. 逐题判断对错
4. 对错题给出简要分析

输出纯JSON格式（每题analysis不超过30字，hint不超过20字）：
{{
  "success": true,
  "questions": [
    {{
      "index": 1,
      "question_text": "题目内容",
      "student_answer": "学生答案",
      "correct_answer": "正确答案",
      "is_correct": true,
      "analysis": "简要分析",
      "error_type": "计算错误",
      "correction_hint": "引导提示",
      "knowledge_point": "知识点"
    }}
  ],
  "summary": "整体评价"
}}

注意：analysis和hint要简短；只输出JSON。"""

    messages = [
        {"role": "system", "content": "你是一位专业的小学数学教师，擅长作业批改和错题分析。批改认真细致，善于发现学生的知识漏洞。"},
        {"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
        ]},
    ]

    raw = _call_llm_vision(messages, temperature=0.3, max_tokens=1024, timeout=120)
    if not raw:
        print("[LLM-Homework] 多模态批改失败")
        return {"success": False, "questions": [], "summary": "AI批改失败，请稍后重试"}

    result = _extract_json(raw)
    if result and isinstance(result, dict) and "questions" in result:
        result["success"] = True
        return result

    print(f"[LLM-Homework] JSON解析失败，原始输出: {raw[:300]}")
    return {"success": False, "questions": [], "summary": "批改结果解析失败，请稍后重试"}


def ai_guided_correction(question_text: str, student_answer: str, correct_answer: str,
                         knowledge_point: str = "") -> dict:
    """
    引导改错：不直接告诉正确答案，而是通过分步引导的方式帮助学生自己发现并改正错误。

    参数:
        question_text: 原题文字
        student_answer: 学生错误的答案
        correct_answer: 正确答案
        knowledge_point: 知识点

    返回:
        {
            "steps": [
                {"step": 1, "type": "hint", "content": "引导提示"},
                {"step": 2, "type": "checkpoint", "content": "检查点问题"},
                {"step": 3, "type": "method", "content": "方法点拨"},
                {"step": 4, "type": "practice", "content": "小练习验证"}
            ],
            "full_solution": "完整解题过程（在学生完成引导后展示）"
        }
    """
    prompt = f"""你是一位有耐心的数学辅导老师。学生做错了下面的题目，请你设计一套"不直接给答案"的分步引导改错方案。

**错题信息：**
- 题目：{question_text}
- 学生错误答案：{student_answer}
- 正确答案：{correct_answer}
- 知识点：{knowledge_point or "小学数学"}

**引导原则（不可违反）：**
- 绝对不要直接说出正确答案！
- 每步只给一个小提示，让学生自己思考
- 用提问引导，不代替学生思考
- 如果学生答案接近正确，先肯定再指出问题

输出JSON格式：
{{
  "steps": [
    {{
      "step": 1,
      "type": "hint",
      "content": "第一步引导提示（如：'我们来看一下题目，你写的{student_answer}是怎么算出来的？回忆一下这个知识点的计算规则...'）"
    }},
    {{
      "step": 2,
      "type": "checkpoint",
      "content": "检查点问题（如：'在计算过程中，小数点的位置对吗？我们重新数一数...'）"
    }},
    {{
      "step": 3,
      "type": "method",
      "content": "方法点拨（如：'解决这类题的关键步骤是：1)... 2)... 你可以试试按这个步骤重新算一遍'）"
    }},
    {{
      "step": 4,
      "type": "practice",
      "content": "小练习验证（一道非常简单的小题，让验证是否真的理解了，如：'试试看：2 × 0.5 = ____，看看你掌握了没有？'）"
    }}
  ],
  "error_reason": "错误原因简述（如：小数点位置错误 / 计算粗心）",
  "full_solution": "完整解题过程（在学生完成引导后展示，包含详细步骤）"
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是一位有耐心的小学数学辅导老师，擅长通过提问和引导帮助学生自主发现错误。绝不要直接给出答案。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.5, max_tokens=1500, timeout=60)
    if result and isinstance(result, dict):
        return result
    print("[LLM] 引导改错生成失败")
    return {"steps": [], "error_reason": "生成失败"}


def ai_generate_similar_questions(question_text: str, correct_answer: str,
                                  knowledge_point: str = "", count: int = 3) -> dict:
    """
    错题巩固：基于原错题生成类似但不完全相同的题目，供学生巩固练习。

    参数:
        question_text: 原题文字
        correct_answer: 正确答案
        knowledge_point: 知识点
        count: 生成题目数量

    返回:
        {
            "questions": [
                {"index": 1, "question": "类似题目", "answer": "答案", "hint": "提示"}
            ]
        }
    """
    prompt = f"""你是小学数学出题专家。请根据下面这道题，生成{count}道类似但不完全相同的题目，帮助学生巩固这个知识点。

**参考原题：**
- 题目：{question_text}
- 答案：{correct_answer}
- 知识点：{knowledge_point or "小学数学"}

要求：
1. 题目与原题知识点相同、难度相近，但数字和表述要改变
2. 由易到难排列，第1道最接近原题，后面逐步增加变化
3. 题目要准确、清晰，适合五年级学生
4. **question 字段必须是完整的数学题题目本身**（如"6 × 7 = ?"或"一支铅笔3元，小明买4支需要多少钱？"），不要写"类题1（与原题最接近）"这样的描述！

输出JSON格式：
{{
  "questions": [
    {{
      "index": 1,
      "question": "完整的数学题目",
      "answer": "答案",
      "explanation": "简要解题思路"
    }}
  ]
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是小学数学出题专家，擅长设计分层巩固练习题。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.6, max_tokens=1500, timeout=60)
    if result and isinstance(result, dict) and "questions" in result:
        return result
    print("[LLM] 类似题生成失败")
    return {"questions": []}


def ai_generate_breakthrough_questions(error_list: list, count: int = 5) -> dict:
    """
    错题突破：根据学生的错题记录，AI 智能筛选薄弱知识点，
    随机生成与错题相关的全新题目供强化练习。

    参数:
        error_list: 错题列表 [{"question_text": "...", "knowledge_point": "...", "correct_answer": "..."}, ...]
        count: 生成题目数量

    返回:
        {
            "knowledge_tag": "薄弱知识点标签",
            "questions": [
                {"index": 1, "question": "...", "answer": "...", "knowledge_point": "...", "difficulty": "..."}
            ]
        }
    """
    # 提炼错题知识点
    kp_set = set()
    error_items_text = ""
    for i, e in enumerate(error_list[:10]):
        kp = e.get("knowledge_point", "")
        if kp:
            kp_set.add(kp)
        error_items_text += f"{i+1}. {e.get('question_text','')} （错答：{e.get('student_answer','')}，正答：{e.get('correct_answer','')}，知识点：{kp}）\n"

    knowledge_tag = "、".join(kp_set) if kp_set else "综合薄弱知识点"

    prompt = f"""你是小学数学出题专家。以下是一位学生的错题记录，请根据这些错题暴露的薄弱知识点，生成{count}道随机练习题目帮助学生突破薄弱点。

**学生错题记录：**
{error_items_text if error_items_text else "无具体记录"}

**薄弱知识点：{knowledge_tag}**

要求：
1. 题目围绕上述薄弱知识点设计，难度适中
2. 题目类型多样：填空、计算、应用、判断均可
3. 题目要准确、清晰，适合五年级学生
4. 标注每道题的难度（basic基础/advanced提升）

输出JSON格式：
{{
  "knowledge_tag": "{knowledge_tag}",
  "questions": [
    {{
      "index": 1,
      "question": "题目内容",
      "answer": "答案",
      "knowledge_point": "知识点",
      "difficulty": "basic",
      "explanation": "简要解题思路"
    }}
  ]
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是小学数学教研员，擅长针对学生薄弱点设计针对性练习题。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.6, max_tokens=2000, timeout=60)
    if result and isinstance(result, dict) and "questions" in result:
        result.setdefault("knowledge_tag", knowledge_tag)
        return result
    print("[LLM] 错题突破生成失败")
    return {"knowledge_tag": knowledge_tag, "questions": []}


# ===== AI 课堂交互式探索提问 =====
def ai_generate_interactive_inquiry(lesson_title: str, unit_info: str = "", difficulty: str = "mixed"):
    """AI生成课堂交互式探索提问问题链

    教师端点击后AI设计一组递进式的课堂提问，包含：
    - 热身提问（激活已有知识）
    - 核心探究（突破重难点）
    - 拓展挑战（高阶思维）
    每道题包含预期的学生回答、引导策略
    """
    prompt = f"""你是小学数学名师。请为以下课时设计一组课堂交互式探索提问问题链，用于教师在课堂中引导学生思考。

**课时名称：** {lesson_title}
**单元信息：** {unit_info or "五年级上册数学"}
**难度分布：** {difficulty}

请设计6-8道递进式提问，分三个阶段：

阶段1 - 热身激活（2道）：激活学生已有的相关知识，建立新旧联系
阶段2 - 核心探究（3-4道）：围绕课时核心概念和重难点，引导学生一步步深入
阶段3 - 拓展挑战（2道）：鼓励高阶思维，尝试不同方法，挑战变式

每道题需包含：
- question: 提问内容（对学生的提问）
- expected_answer: 预期的学生回答（1-2句）
- guide_strategy: 如果学生答错或卡住，教师如何引导（可以是追问、提示、类比等方式）
- difficulty: easy/medium/hard
- teaching_tip: 教师教学小贴士（如：这里可以让学生小组讨论/这里常见错误是...）

输出JSON格式：
{{
  "lesson_title": "{lesson_title}",
  "unit_info": "{unit_info or '五年级上册数学'}",
  "stages": [
    {{
      "stage": "热身激活",
      "stage_goal": "激活已有知识，建立新旧联系",
      "questions": [
        {{
          "question": "...",
          "expected_answer": "...",
          "guide_strategy": "...",
          "difficulty": "easy",
          "teaching_tip": "..."
        }}
      ]
    }},
    {{
      "stage": "核心探究",
      "stage_goal": "突破重难点，层层深入",
      "questions": [...]
    }},
    {{
      "stage": "拓展挑战",
      "stage_goal": "高阶思维，变式应用",
      "questions": [...]
    }}
  ]
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是全国小学数学教学名师，擅长设计课堂提问引导学生自主探究。你的提问要有层次感、启发性，每个问题都配有可操作的引导策略。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.7, max_tokens=3000, timeout=90)
    if result and isinstance(result, dict) and "stages" in result:
        result.setdefault("lesson_title", lesson_title)
        result.setdefault("unit_info", unit_info)
        return result
    print("[LLM] 交互式提问生成失败")
    return {
        "lesson_title": lesson_title,
        "unit_info": unit_info,
        "stages": [],
    }


# ===== AI 创意闯关出题 =====
def ai_generate_challenge_questions(knowledge_points: list, count: int = 5):
    """根据五上知识点生成创意闯关题目

    闯关设计思路：将数学题包装成有趣的闯关场景（如太空探险、海盗寻宝、美食大厨等），
    每道题是一个"关卡"，包含题目、答案、知识点标签、闯关提示
    """
    kp_text = "\n".join([f"- {kp}" for kp in knowledge_points[:10]])

    themes = ["太空探险", "海底寻宝", "魔法学院", "美食大厨", "动物园历险记", "时间旅行", "运动会挑战", "建筑大师"]

    prompt = f"""你是小学数学创意出题专家。请根据以下五年级上册知识点，设计一个创意闯关游戏，共{count}关。

**知识点范围：**
{kp_text}

**闯关要求：**
1. 给整个闯关起一个有趣的主题名称（从以下选一个或自创：{', '.join(themes)}）
2. 每道题包装成该主题下的一个"关卡"，包含关卡名称和情境描述
3. 题目必须是数学计算/应用题，符合五年级难度
4. 题目类型多样：计算、填空、判断、应用等
5. 每道题标注对应知识点和难度（basic/advanced）
6. 关卡难度递进

输出JSON格式：
{{
  "theme": "闯关主题名称",
  "theme_intro": "欢迎语，2-3句",
  "levels": [
    {{
      "level": 1,
      "level_name": "关卡名称（和主题相关）",
      "scene": "情境描述，1-2句",
      "question": "数学题目内容",
      "answer": "正确答案",
      "explanation": "解题思路和步骤",
      "knowledge_point": "对应知识点",
      "difficulty": "basic",
      "question_type": "calculation/fill_blank/choice/application"
    }}
  ]
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是小学数学创意出题专家，擅长将枯燥的数学题包装成有趣的闯关游戏。题目要准确、清晰，适合五年级学生。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.8, max_tokens=3000, timeout=90)
    if result and isinstance(result, dict) and "levels" in result:
        result.setdefault("knowledge_points", knowledge_points)
        return result
    print("[LLM] 闯关题目生成失败")
    return {"theme": "数学大冒险", "theme_intro": "准备好了吗？", "levels": [], "knowledge_points": knowledge_points}


# ===== AI 错题知识点解析（弹窗用） =====
def ai_analyze_error_knowledge(question_text: str, student_answer: str, correct_answer: str, knowledge_point: str):
    """深度解析错题涉及的知识点，用于闯关做完后的弹窗

    返回：知识点精讲 + 常见误区 + 解题口诀
    """
    prompt = f"""你是小学数学辅导专家。学生做错了以下题目，请深度分析涉及的数学知识点，用小学生能理解的语言解释。

**题目：** {question_text}
**学生答案：** {student_answer}
**正确答案：** {correct_answer}
**知识点：** {knowledge_point}

请输出以下内容：
1. 知识点精讲：用通俗易懂的语言（适合五年级）解释这个知识点，2-3句话
2. 常见误区：指出学生容易犯的错误是什么，为什么会犯这个错误
3. 解题口诀：一句朗朗上口的口诀帮学生记住
4. 同类题型识别特征：教学生以后看到什么样的题目就该想到这个知识点

输出JSON格式：
{{
  "knowledge_point": "{knowledge_point}",
  "knowledge_explanation": "知识点精讲...",
  "common_mistake": "常见误区...",
  "mnemonic": "解题口诀...",
  "type_features": "同类题型识别特征..."
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是小学数学辅导专家，擅长用生动语言解释数学概念，帮助小学生理解错误原因并记住正确的解题方法。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.5, max_tokens=1500, timeout=60)
    if result and isinstance(result, dict):
        return result
    print("[LLM] 错题知识点解析失败")
    return {
        "knowledge_point": knowledge_point,
        "knowledge_explanation": "请仔细检查计算过程。",
        "common_mistake": "可能是计算粗心或概念不清。",
        "mnemonic": "仔细审题，认真计算！",
        "type_features": "类似的计算题。",
    }


def ai_generate_hint(question_text: str, correct_answer: str, knowledge_point: str = "",
                     student_answer: str = "") -> dict:
    """
    饲养员提示：基于知识点+正确答案（+学生错答）生成一个"不剧透答案"的引导提示。
    用于闯关答题区"饲养员提示"按钮。

    返回:
        {
            "hint": "具体提示内容（1-2 句话，不直接给答案）",
            "thinking_path": "思考路径关键词（如：先把大单位换小单位 → 用整数除法）"
        }
    """
    student_part = ""
    if student_answer:
        student_part = f"\n- 学生的错误答案：{student_answer}\n"

    prompt = f"""你是小学数学闯关游戏的"饲养员"。学生正在解一道闯关题，需要你给他一个不剧透正确答案的引导提示。

**题目信息：**
- 题目：{question_text}
- 正确答案：{correct_answer}
- 知识点：{knowledge_point or "小学数学"}
{student_part}

**提示要求（严格遵守）：**
1. **绝对不能直接说出正确答案**！
2. 用提问/类比/生活情境给学生方向感，让他自己想出来
3. 1-2 句话，简洁清晰，五年级学生能听懂
4. 如果学生答错了，可以点出思路偏差（如"你算的是乘法，其实题目让求的是……"）
5. 如果学生没作答，可以提示"先审题，关键字是……"或"这道题可以用……方法试试"

输出JSON格式：
{{
  "hint": "具体的提示内容（1-2 句，不超过 60 字）",
  "thinking_path": "简短关键词（如：小数点对齐 → 从右往左逐位相乘）"
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是小学数学闯关游戏的'饲养员'，擅长用启发式提示帮助学生自己发现答案，绝不剧透。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.6, max_tokens=400, timeout=30)
    if result and isinstance(result, dict) and result.get("hint"):
        return result
    print("[LLM] 饲养员提示生成失败")
    return {
        "hint": f"回想一下「{knowledge_point or '这个知识点'}」的关键步骤是什么？一步步来。",
        "thinking_path": knowledge_point or "审题 → 列式 → 计算 → 检查",
    }


def ai_judge_preview_answer(question_text: str, student_answer: str, correct_answer: str) -> dict:
    """AI判断学生预习答案是否正确，并给出简短解析。

    返回：{is_correct: bool, explanation: str, normalized_answer: str}
    """
    # 快速等价判断：去除空格、统一标点
    def _norm(s: str) -> str:
        if not s:
            return ""
        s = s.strip().replace(" ", "").replace("（", "(").replace("）", ")").replace("，", ",").replace("。", ".")
        return s.lower()

    ns = _norm(student_answer)
    nc = _norm(correct_answer)

    # 完全等价直接通过
    if ns == nc:
        return {"is_correct": True, "explanation": "回答正确！", "normalized_answer": nc}

    # 尝试数值比较（如 10.5 与 10.50、1.0 与 1）
    try:
        sv = float(ns.rstrip("元").rstrip("米").rstrip("kg").rstrip("km"))
        cv = float(nc.rstrip("元").rstrip("米").rstrip("kg").rstrip("km"))
        if abs(sv - cv) < 1e-6:
            return {"is_correct": True, "explanation": "答案数值正确！", "normalized_answer": nc}
    except (ValueError, AttributeError):
        pass

    # 调用LLM做智能判断（处理单位、格式、表达差异）
    prompt = f"""你是小学数学AI助教。请判断学生的预习答案是否正确。

题目：{question_text}
标准答案：{correct_answer}
学生答案：{student_answer}

只判断数学等价性，不要纠结书写格式（如 10.5 与 10.50 等价，带单位与不带单位等价，只要数值正确）。
如果错误，用一句话给出正确答案和关键提醒。

以JSON输出：
{{
  "is_correct": true/false,
  "explanation": "简短说明（1-2句话）",
  "normalized_answer": "标准答案的最简形式"
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是一个小学数学判断助手，只输出JSON。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.2, max_tokens=300, timeout=30)
    if result and isinstance(result, dict):
        return {
            "is_correct": bool(result.get("is_correct", False)),
            "explanation": result.get("explanation", "请检查答案。"),
            "normalized_answer": result.get("normalized_answer", nc),
        }

    # 兜底：如果LLM调用失败，保守判断
    return {"is_correct": False, "explanation": f"正确答案：{correct_answer}。请再检查你的计算过程。", "normalized_answer": nc}


# ===== AI 识别学生上传的错题图片 =====
def ai_recognize_student_error_image(image_base64: str) -> dict:
    """学生上传错题照片，AI识别题目内容并给出正确答案和知识点

    返回：
        {
            "question_text": "题目内容",
            "correct_answer": "正确答案",
            "analysis": "解题解析",
            "knowledge_point": "知识点",
            "error_type": "错误类型推测"
        }
    """
    system_msg = "你是小学数学AI助教。学生会拍照上传自己做错的题目，请识别题目内容、给出正确答案和解析。"
    user_msg = """请识别图片中的数学题目，并按以下JSON格式输出（不要其他文字）：
{
  "question_text": "完整的题目内容",
  "correct_answer": "正确答案（如果有单位请包含）",
  "analysis": "简短的解题思路（1-2句话）",
  "knowledge_point": "涉及的知识点（如：小数乘整数、方程等）",
  "error_type": "学生可能的错误类型推测（如：计算错误、概念混淆、审题不清等）"
}

要求：
1. 题目内容要完整准确
2. 答案要正确，应用题要包含单位
3. 知识点要具体到小学五年级数学的知识点
4. 只输出JSON，不要其他文字"""

    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": [
            {"type": "text", "text": user_msg},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
        ]}
    ]

    raw = _call_llm_vision(messages, temperature=0.3, max_tokens=1024, timeout=120)
    if not raw:
        return {"question_text": "", "correct_answer": "", "analysis": "", "knowledge_point": "", "error_type": "识别失败"}

    result = _extract_json(raw)
    if result and isinstance(result, dict):
        return {
            "question_text": result.get("question_text", ""),
            "correct_answer": result.get("correct_answer", ""),
            "analysis": result.get("analysis", ""),
            "knowledge_point": result.get("knowledge_point", ""),
            "error_type": result.get("error_type", "计算错误"),
        }

    return {"question_text": "", "correct_answer": "", "analysis": "", "knowledge_point": "", "error_type": "识别失败"}


# ===== AI 错题拓展出题（基于已解决错题确认掌握） =====
def ai_generate_expansion_questions(resolved_errors: list, count: int = 5) -> dict:
    """根据已解决的错题，AI生成拓展题目确认知识点掌握

    与breakthrough不同：expansion针对已解决的错题，出题难度略高，确认学生真正掌握。

    参数:
        resolved_errors: 已解决的错题列表 [{"question_text": "...", "knowledge_point": "...", "correct_answer": "..."}, ...]
        count: 生成题目数量

    返回:
        {
            "knowledge_tag": "知识点标签",
            "questions": [
                {"index": 1, "question": "...", "answer": "...", "knowledge_point": "...", "difficulty": "...", "explanation": "..."}
            ]
        }
    """
    kp_set = set()
    items_text = ""
    for i, e in enumerate(resolved_errors[:10]):
        kp = e.get("knowledge_point", "")
        if kp:
            kp_set.add(kp)
        items_text += f"{i+1}. {e.get('question_text','')} （知识点：{kp}）\n"

    knowledge_tag = "、".join(kp_set) if kp_set else "综合知识点"

    prompt = f"""你是小学数学出题专家。以下是一位学生已经"解决"的错题记录（已通过回炉学习纠正）。请根据这些错题涉及的知识点，生成{count}道拓展练习题，确认学生真正掌握了这些知识点。

**已解决的错题记录：**
{items_text if items_text else "无具体记录"}

**涉及知识点：{knowledge_tag}**

要求：
1. 题目围绕上述知识点设计，难度比原错题略高一级（如原题是基础题，拓展题应为提升题）
2. 题目类型多样：计算、应用、判断、填空均可
3. 题目要准确、清晰，适合五年级学生
4. 标注每道题的难度（basic基础/advanced提升/extension拓展）

输出JSON格式：
{{
  "knowledge_tag": "{knowledge_tag}",
  "questions": [
    {{
      "index": 1,
      "question": "题目内容",
      "answer": "答案",
      "knowledge_point": "知识点",
      "difficulty": "advanced",
      "explanation": "简要解题思路"
    }}
  ]
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是小学数学教研员，擅长设计拓展练习题帮助学生巩固已学知识。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.6, max_tokens=2000, timeout=60)
    if result and isinstance(result, dict) and "questions" in result:
        result.setdefault("knowledge_tag", knowledge_tag)
        return result
    print("[LLM] 错题拓展生成失败")
    return {"knowledge_tag": knowledge_tag, "questions": []}


# ===== AI 知识图谱分析 =====
def ai_generate_knowledge_graph(student_id: int = None, errors: list = None, practices: list = None):
    """根据学生的做题情况和错题数据生成个人知识图谱

    返回：知识节点、掌握程度、关联关系
    """
    if not errors:
        errors = []
    if not practices:
        practices = []

    # 汇总知识点统计
    error_kp_map = {}
    for e in errors:
        kp = e.get("knowledge_point", "") or e.get("knowledge_gap", "")
        if kp:
            kp_clean = kp.strip()
            if kp_clean:
                error_kp_map[kp_clean] = error_kp_map.get(kp_clean, 0) + 1

    # 统计做过的知识点
    practice_kp_map = {}
    for p in practices:
        kp = p.get("knowledge_point", "") or ""
        if kp:
            kp_clean = kp.strip()
            if kp_clean:
                practice_kp_map[kp_clean] = practice_kp_map.get(kp_clean, 0) + 1
                if p.get("is_correct"):
                    error_kp_map[kp_clean] = error_kp_map.get(kp_clean, 0)  # 标记为掌握良好

    # 构建统计文本
    error_summary = "\n".join([f"- {kp}: 错{count}次" for kp, count in sorted(error_kp_map.items(), key=lambda x: -x[1])[:20]])

    prompt = f"""你是小学数学学情分析专家。请根据以下学生的错题和练习数据，分析其知识掌握情况，生成知识图谱。

**错题知识点统计：**
{error_summary if error_summary else '暂无错题记录'}

**分析要求：**
1. 识别学生的薄弱知识点（错误次数多的）
2. 识别学生的优势知识点（错误少或没有的）
3. 分析知识点之间的关联关系（如：小数乘法不熟可能导致小数除法也困难）
4. 给出针对性的学习建议

输出JSON格式：
{{
  "summary": "整体评价，2-3句",
  "nodes": [
    {{
      "id": "知识点ID（如fraction_multiply）",
      "name": "知识点名称",
      "mastery": 85,
      "category": "计算/几何/统计/代数",
      "status": "mastered/learning/weak",
      "error_count": 0
    }}
  ],
  "edges": [
    {{
      "source": "前置知识点ID",
      "target": "后置知识点ID",
      "relation": "prerequisite/related/extends"
    }}
  ],
  "weak_areas": ["薄弱领域1", "薄弱领域2"],
  "strength_areas": ["优势领域1"],
  "suggestions": ["学习建议1", "学习建议2"]
}}

注意：
- mastery 值0-100，表示掌握程度（错得多则低，没错过则高）
- nodes 要覆盖五上的主要知识点领域
- edges 要体现知识点之间的前后置/关联关系
- 只输出JSON，不要其他文字"""

    messages = [
        {"role": "system", "content": "你是小学数学学情分析专家，擅长通过学生的做题数据诊断知识薄弱点，构建可视化的知识掌握图谱。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.5, max_tokens=3000, timeout=90)
    if result and isinstance(result, dict) and "nodes" in result:
        return result
    print("[LLM] 知识图谱生成失败")
    return {
        "summary": "暂无足够数据生成图谱，继续练习吧！",
        "nodes": [],
        "edges": [],
        "weak_areas": [],
        "strength_areas": [],
        "suggestions": [],
    }


# ===== AI 班级共性错题分析 =====
def ai_analyze_class_common_errors(class_errors: list):
    """AI分析班级共性错题，汇总知识点薄弱环节

    输入：班级所有学生的错题列表
    返回：按知识点汇总的共性错题分析，含教学建议
    """
    # 汇总知识点
    kp_count = {}
    error_items_text = ""
    for i, e in enumerate(class_errors[:30]):
        kp = e.get("knowledge_point", "") or e.get("knowledge_gap", "")
        if kp:
            kp_count[kp] = kp_count.get(kp, 0) + 1
        error_items_text += f"{i+1}. {e.get('student_name','学生')} - {e.get('question_text','')}（错答：{e.get('student_answer','')}，正答：{e.get('correct_answer','')}，知识点：{kp}）\n"

    top_kps = sorted(kp_count.items(), key=lambda x: -x[1])[:8]
    kp_summary = "\n".join([f"- {kp}: {count}人次出错" for kp, count in top_kps])

    prompt = f"""你是小学数学教研组长。请分析以下班级共性错题数据，给出针对性的教学建议。

**共性错题知识点统计：**
{kp_summary}

**部分错题明细：**
{error_items_text[:2000]}

**分析要求：**
1. 识别班级的共性薄弱知识点（Top 3-5个）
2. 分析这些共性错误的原因（概念不清/计算粗心/方法不当/审题不清等）
3. 给出教学建议（课堂如何补救、布置什么练习）
4. 推荐改进策略

输出JSON格式：
{{
  "common_weak_points": [
    {{
      "knowledge_point": "知识点名称",
      "error_count": 15,
      "error_rate": 0.45,
      "root_cause": "错误原因",
      "teaching_suggestion": "教学建议"
    }}
  ],
  "overall_analysis": "整体分析，2-3句",
  "urgent_actions": ["紧急补救措施1", "紧急补救措施2"],
  "recommended_exercises": ["推荐练习题型1", "推荐练习题型2"]
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是小学数学教研组长，擅长通过数据诊断班级的共性问题，给出可操作的教学改进建议。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.5, max_tokens=2500, timeout=90)
    if result and isinstance(result, dict):
        return result
    print("[LLM] 班级共性错题分析失败")
    return {
        "common_weak_points": [],
        "overall_analysis": "暂无足够数据。",
        "urgent_actions": [],
        "recommended_exercises": [],
    }


# ===== AI 从图片提取题目和答案（教师上传试卷） =====
def ai_extract_homework_questions_from_image(image_base64: str) -> dict:
    """教师上传试卷/作业图片，AI识别其中的题目和答案，返回结构化题目列表

    返回：
        {
            "title": "试卷标题",
            "questions": [
                {"index": 1, "question_text": "题目", "correct_answer": "答案",
                 "analysis": "解析", "knowledge_point": "知识点", "difficulty": "basic"},
            ],
            "summary": "共识别X道题"
        }
    """
    system_msg = "你是小学数学题目识别专家。请仔细识别图片中的每一道数学题目，提取题目内容、答案、解析和知识点。"
    user_msg = """请识别图片中的所有数学题目，并按以下JSON格式输出（不要其他文字）：
{
  "title": "图片中试卷/练习的标题，没有则自动生成",
  "questions": [
    {
      "index": 1,
      "question_text": "完整题目内容（不含答案）",
      "correct_answer": "正确答案",
      "analysis": "简短解题解析",
      "knowledge_point": "涉及的知识点",
      "difficulty": "basic|advanced|extension"
    }
  ],
  "summary": "共识别X道题目"
}

要求：
1. 题目要完整，不要遗漏任何图片中的题目
2. 答案要准确，如果是应用题要包含单位
3. 每个题目标注难度层次（basic基础题、advanced提升题、extension拓展题）
4. 只输出JSON，不要其他文字"""

    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": [
            {"type": "text", "text": user_msg},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
        ]}
    ]

    raw = _call_llm_vision(messages, temperature=0.3, max_tokens=1024, timeout=120)
    if not raw:
        return {"title": "", "questions": [], "summary": "识别失败"}

    result = _extract_json(raw)
    if result and isinstance(result, dict) and "questions" in result:
        return result

    return {"title": "", "questions": [], "summary": "识别失败"}


# ===== AI 生成分层周辅导方案 =====
def ai_generate_tiered_weekly_plan(
    class_name: str,
    tier: str,
    weak_areas: list,
    recent_exam_score: float = None,
) -> dict:
    """根据学生分层数据，AI生成可打印的培优/补差周辅导方案

    参数:
        class_name: 班级名称
        tier: 分层 'basic'|'advanced'|'extension'
        weak_areas: 薄弱知识点列表
        recent_exam_score: 最近考试成绩（可选）

    返回:
        {
            "title": "方案标题",
            "weekly_goal": "本周目标",
            "plan": [  // 每天的内容
                {"day": "周一", "focus": "重点", "exercises": ["练习1"], "notes": "备注"},
            ],
            "key_points": ["关键要点1"],
            "printable_html": "可打印HTML"
        }
    """
    tier_names = {
        "basic": "基础巩固层",
        "advanced": "能力提升层",
        "extension": "拓展挑战层",
    }
    tier_name = tier_names.get(tier, "分层辅导")

    weak_text = "、".join(weak_areas[:5]) if weak_areas else "暂无明确薄弱点"
    score_text = f"\n最近考试成绩：{recent_exam_score}分" if recent_exam_score else ""

    prompt = f"""你是小学数学教研专家。请为{class_name}的{tier_name}学生制定一份"可打印的周辅导方案"。

薄弱知识点：{weak_text}{score_text}

方案要求：
1. 周一至周五，每天一个主题，包含：复习内容、练习题目（2-3道）、自我检测
2. 题目要适合{tier_name}学生的水平，不要过难或过简单
3. 周五安排一次小测验（5道题），用于检测本周学习效果
4. 方案要有可操作性，老师可以直接打印下发给学生

输出JSON格式：
{{
  "title": "方案标题",
  "weekly_goal": "本周总目标（30字以内）",
  "plan": [
    {{
      "day": "周一",
      "focus": "本日主题",
      "exercises": ["具体练习题目1", "练习题目2"],
      "notes": "教师提醒/解题要点"
    }}
  ],
  "key_points": ["本周关键要点1", "关键要点2"],
  "printable_html": "<html><body>可打印的HTML内容（包含简单样式，方便直接打印）</body></html>"
}}

注意：
- exercises 中每道题必须是完整的、可实际使用的数学计算/应用题
- printable_html 要包含完整HTML标签，使用简单的内联样式，适合A4纸打印
- 只输出JSON，不要其他文字"""

    messages = [
        {"role": "system", "content": "你是小学数学教学专家，擅长设计分层辅导方案，注重实操性和可打印性。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.6, max_tokens=3000, timeout=120)
    if result and isinstance(result, dict):
        return result

    return {
        "title": f"{class_name} {tier_name} 周辅导方案",
        "weekly_goal": "巩固薄弱知识点，提升解题能力",
        "plan": [],
        "key_points": weak_areas[:3] if weak_areas else ["继续练习"],
        "printable_html": "<html><body><h2>辅导方案</h2><p>请根据薄弱知识点自行设计练习。</p></body></html>",
    }


# ===== AI 随机考察题（全对学生"再考考你"） =====
def ai_generate_random_challenge(lesson_title: str = "", knowledge_points: str = "", count: int = 5) -> dict:
    """
    作业全对时生成"再考考你"5道随机题，防止学生抄袭作业。

    参数:
        lesson_title: 课题（如"小数乘整数"）
        knowledge_points: 知识点列表文本
        count: 题目数量（默认5）

    返回:
        {
            "challenge_title": "再考考你",
            "questions": [
                {"index": 1, "question": "...", "answer": "...", "knowledge_point": "...", "explanation": "..."}
            ]
        }
    """
    prompt = f"""你是小学数学出题专家。学生今天完成了"{lesson_title or '数学'}"的作业并且全部正确！
为了确认学生真正掌握了知识（而非抄袭），请生成{count}道随机考察题。

**课题：** {lesson_title or '小学数学（五年级）'}
**知识点范围：** {knowledge_points or '与课题相关的五年级数学知识点'}

要求：
1. 题目围绕当天课题知识点，但换一种出题方式（不同的数字、不同的情境）
2. 难度与作业题相当或略高，以真正考察掌握程度
3. 题型多样：计算题、填空题、应用题、判断题
4. 每题必须有明确的标准答案和解题说明
5. 适合五年级学生水平

输出JSON格式：
{{
  "challenge_title": "再考考你",
  "questions": [
    {{
      "index": 1,
      "question": "题目内容",
      "answer": "标准答案",
      "knowledge_point": "考察的知识点",
      "explanation": "简要解题思路"
    }}
  ]
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是小学数学教研员，擅长设计检验性练习题目。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.7, max_tokens=2000, timeout=60)
    if result and isinstance(result, dict) and "questions" in result:
        result.setdefault("challenge_title", "再考考你")
        return result
    print("[LLM] 随机考察题生成失败")
    return {"challenge_title": "再考考你", "questions": []}


# ===== AI 苏格拉底式学习问答 =====
def ai_socratic_qa(question: str, image_base64: str = "", conversation_history: list = None) -> dict:
    """
    学习问答：学生提出学习问题（文字或拍照），AI以苏格拉底式引导方式帮助学生自行得出答案。

    参数:
        question: 学生的问题文字
        image_base64: 可选的题目图片（base64）
        conversation_history: 之前的对话历史 [{"role": "user/assistant", "content": "..."}]

    返回:
        {
            "reply": "AI的回复（苏格拉底式引导）",
            "is_solved": false,  # 是否认为学生已得出正确答案
            "suggested_answer": "",  # 当is_solved=true时给出标准答案确认
            "similar_question": ""  # 当is_solved=true时可选附带巩固题
        }
    """
    history_text = ""
    if conversation_history:
        for h in conversation_history[-6:]:  # 保留最近6轮
            role = "学生" if h.get("role") == "user" else "老师"
            history_text += f"{role}: {h.get('content', '')}\n"

    if image_base64:
        # 有图片：使用多模态模型
        prompt_text = f"""你是一位有耐心的小学数学辅导老师。学生通过图片向你提问。

**学生的文字描述：** {question or "（请看图片中的题目）"}

**对话历史：**
{history_text if history_text else "（首次提问）"}

**苏格拉底式引导原则（必须严格遵守）：**
1. 绝对不要直接说出答案！
2. 用提问引导学生自己思考
3. 每次只给一个小提示或一个引导性问题
4. 如果学生接近正确答案，给予鼓励并微调方向
5. 如果学生已经自己说出了正确答案，确认并表扬，设置 is_solved=true

输出JSON格式：
{{
  "reply": "你的回复内容（苏格拉底式引导）",
  "is_solved": false,
  "suggested_answer": "",
  "similar_question": ""
}}

当且仅当学生已经自己得出正确答案时：
{{
  "reply": "太棒了！你说得完全正确！...",
  "is_solved": true,
  "suggested_answer": "标准答案确认",
  "similar_question": "一道类似的巩固题（让学生继续练习）"
}}

只输出JSON，不要其他文字。"""

        messages = [
            {"role": "system", "content": "你是耐心的小学数学辅导老师，擅长苏格拉底式提问引导。绝不要直接给答案。"},
            {"role": "user", "content": [
                {"type": "text", "text": prompt_text},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}},
            ]},
        ]
        raw = _call_llm_vision(messages, temperature=0.5, max_tokens=1024, timeout=60)
        result = _extract_json(raw) if raw else None
        if result and isinstance(result, dict):
            return result
        # 视觉模型JSON解析失败时，直接用raw文本
        if raw:
            return {"reply": raw, "is_solved": False, "suggested_answer": "", "similar_question": ""}
        print("[LLM] 苏格拉底问答（图片）生成失败")
        return {"reply": "抱歉，我暂时无法处理你的问题，请稍后重试。", "is_solved": False}
    else:
        # 纯文字：使用文本模型
        prompt = f"""你是一位有耐心的小学数学辅导老师。学生向你提出了一个问题，请用苏格拉底式引导方式帮助他/她自己思考得出答案。

**学生的问题：** {question}

**对话历史：**
{history_text if history_text else "（首次提问）"}

**苏格拉底式引导原则（必须严格遵守）：**
1. 绝对不要直接说出答案！
2. 用提问引导学生自己思考
3. 每次只给一个小提示或一个引导性问题
4. 如果学生接近正确答案，给予鼓励并微调方向
5. 如果学生已经自己说出了正确答案，确认并表扬，设置 is_solved=true
6. 适合五年级学生理解水平

输出JSON格式：
{{
  "reply": "你的回复内容（苏格拉底式引导，如'我们一起来想想...你觉得这道题的关键是什么？'）",
  "is_solved": false,
  "suggested_answer": "",
  "similar_question": ""
}}

当且仅当学生已经自己得出正确答案时：
{{
  "reply": "太棒了！你说得完全正确！...",
  "is_solved": true,
  "suggested_answer": "标准答案确认",
  "similar_question": "一道类似的巩固题"
}}

只输出JSON，不要其他文字。"""

        messages = [
            {"role": "system", "content": "你是耐心的小学数学辅导老师，擅长苏格拉底式提问引导。绝不要直接给答案。"},
            {"role": "user", "content": prompt},
        ]

        result = _call_llm_json(messages, temperature=0.5, max_tokens=1000, timeout=60)
        if result and isinstance(result, dict):
            return result
        print("[LLM] 苏格拉底问答生成失败")
        return {"reply": "抱歉，我暂时无法回答你的问题，请稍后重试。", "is_solved": False}


# ===== AI 每日科普小知识生成 =====
def ai_generate_daily_fact(category: str = "") -> dict:
    """生成一条每日科普小知识（数学/科学趣味知识）

    Args:
        category: 可选类别，如 "数学趣闻"、"科学常识"、"生活数学"、"数学家故事"

    Returns:
        dict: {title, content, fun_fact, category, question, answer}
    """
    import random

    categories = ["数学趣闻", "科学常识", "生活数学", "数学家故事", "趣味几何", "数字奥秘"]
    if not category or category not in categories:
        category = random.choice(categories)

    prompt = f"""你是面向小学五年级学生的科普小知识生成专家。请生成一条关于"{category}"的趣味科普小知识。

**要求：**
1. 标题简短有趣（10-15字），能引起小学生好奇心
2. 内容通俗易懂（100-150字），用生动的比喻或故事讲解
3. 趣味拓展：一个让人"哇！"的小知识或冷知识
4. 互动小问题：出一个和该知识点相关的小问题（选择题或填空题）
5. 适合五年级学生理解水平

输出JSON格式：
{{
  "title": "知识标题",
  "content": "科普正文内容",
  "fun_fact": "趣味拓展小知识",
  "category": "{category}",
  "question": "互动小问题",
  "options": ["选项A", "选项B", "选项C", "选项D"],
  "answer": "正确答案（如B）",
  "explanation": "答案解析"
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是生动有趣的小学科普作家，擅长用故事和比喻讲解知识。内容要准确、有趣、适合小学生。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.9, max_tokens=1000, timeout=60)
    if result and isinstance(result, dict) and "title" in result:
        result.setdefault("category", category)
        result.setdefault("options", [])
        result.setdefault("answer", "")
        result.setdefault("explanation", "")
        return result
    print("[LLM] 每日科普生成失败")
    return {
        "title": "数学的奇妙世界",
        "content": "数学无处不在，从花瓣的排列到星球的轨道，都藏着数学的奥秘。",
        "fun_fact": "蜜蜂建造的蜂巢是正六边形，这是最节省材料的形状！",
        "category": category,
        "question": "蜂巢的形状是什么？",
        "options": ["正方形", "正三角形", "正六边形", "圆形"],
        "answer": "C",
        "explanation": "蜜蜂建造的蜂巢是正六边形，这种形状最节省蜂蜡材料。",
    }


# ===== AI 速算题目生成 =====
def ai_generate_speed_quiz(count: int = 10, difficulty: str = "mixed", unit_code: str = "", lesson_title: str = "") -> dict:
    """生成速算挑战题目（纯计算题）

    Args:
        count: 题目数量
        difficulty: easy/medium/hard/mixed
        unit_code: 课程单元代码（如 u2-l1），为空则混合出题
        lesson_title: 课时标题（如"小数乘整数（1）"），用于AI定向出题

    Returns:
        dict: {questions: [{question, answer, difficulty}]}
    """
    diff_desc = {
        "easy": "简单：两位数加减法、一位数乘法",
        "medium": "中等：三位数加减法、两位数乘一位数、简单除法",
        "hard": "困难：小数加减乘除、混合运算",
        "mixed": "混合：包含简单、中等、困难各三分之一",
    }.get(difficulty, "混合难度")

    # 课题定向出题
    topic_hint = ""
    if lesson_title and unit_code:
        topic_hint = f"""
**课题要求：** 所有题目必须围绕"{lesson_title}"这一课题出题
- 题目内容必须与该课题的知识点紧密相关
- 例如：如果是"小数乘整数"，题目应为 2.5 × 3 = ? 这类小数乘整数计算
- 如果是"平行四边形面积"，题目应为 底×高 的计算题
- 难度可以混合，但必须紧扣课题知识点
"""

    prompt = f"""你是小学数学速算出题专家。请生成{count}道速算题目，适合五年级学生。

**难度要求：** {diff_desc}
{topic_hint}
**题目要求：**
1. 纯计算题（不要应用题），可以直接心算
2. 题目简洁，如 "25 × 4 = ?" 或 "3.6 + 2.4 = ?"
3. 答案为数字或小数
4. 每题标注难度：easy/medium/hard

输出JSON格式：
{{
  "questions": [
    {{"question": "25 × 4 = ?", "answer": "100", "difficulty": "easy"}},
    {{"question": "3.6 + 2.4 = ?", "answer": "6", "difficulty": "medium"}}
  ]
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是小学数学速算出题专家。题目要计算准确，答案唯一。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.7, max_tokens=2000, timeout=60)
    if result and isinstance(result, dict) and "questions" in result:
        return result
    print("[LLM] 速算题目生成失败，使用备用题库")
    # 备用题库
    fallback = [
        {"question": "12 + 18 = ?", "answer": "30", "difficulty": "easy"},
        {"question": "25 × 4 = ?", "answer": "100", "difficulty": "easy"},
        {"question": "99 - 37 = ?", "answer": "62", "difficulty": "easy"},
        {"question": "7 × 8 = ?", "answer": "56", "difficulty": "easy"},
        {"question": "144 ÷ 12 = ?", "answer": "12", "difficulty": "medium"},
        {"question": "3.6 + 2.4 = ?", "answer": "6", "difficulty": "medium"},
        {"question": "15 × 12 = ?", "answer": "180", "difficulty": "medium"},
        {"question": "2.5 × 4 = ?", "answer": "10", "difficulty": "medium"},
        {"question": "0.25 × 8 = ?", "answer": "2", "difficulty": "hard"},
        {"question": "3.14 × 2 = ?", "answer": "6.28", "difficulty": "hard"},
    ]
    return {"questions": fallback[:count]}


# ===== AI 24点游戏题目生成 =====
def ai_generate_24points(count: int = 5) -> dict:
    """生成24点游戏题目（4个数字，用加减乘除算出24）

    Returns:
        dict: {puzzles: [{numbers: [n1,n2,n3,n4], solution: "解题表达式"}]}
    """
    prompt = f"""请生成{count}道24点游戏题目。每题给出4个1-13之间的正整数，通过加(+)、减(-)、乘(×)、除(÷)运算（每个数字恰好用一次）得到24。

**要求：**
1. 每题4个数字，范围1-13
2. 确保有解
3. 给出一种解题表达式（用 × 和 ÷ 符号）
4. 难度递进：前2题简单，中间2题中等，最后1题较难

输出JSON格式：
{{
  "puzzles": [
    {{"numbers": [3, 4, 5, 6], "solution": "(5 - 3) × 6 × (4 - 2) = 24", "difficulty": "easy"}},
    {{"numbers": [2, 7, 8, 9], "solution": "(9 - 7) × (8 + 2) = 20... ", "difficulty": "medium"}}
  ]
}}

注意：solution 必须是真实可算出24的表达式。只输出JSON。"""

    messages = [
        {"role": "system", "content": "你是24点游戏出题专家。每道题确保有解且解法正确。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.7, max_tokens=1500, timeout=60)
    if result and isinstance(result, dict) and "puzzles" in result:
        # 验证每道题的数字范围
        valid = []
        for p in result["puzzles"]:
            nums = p.get("numbers", [])
            if isinstance(nums, list) and len(nums) == 4 and all(isinstance(n, int) and 1 <= n <= 13 for n in nums):
                valid.append(p)
        if valid:
            result["puzzles"] = valid
            return result

    print("[LLM] 24点题目生成失败，使用备用题库")
    fallback = [
        {"numbers": [3, 4, 5, 6], "solution": "(5 + 3) × (6 - 4) = 16", "difficulty": "easy"},
        {"numbers": [2, 3, 4, 6], "solution": "6 × 4 × (3 - 2) = 24", "difficulty": "easy"},
        {"numbers": [1, 5, 5, 5], "solution": "5 × (5 - 1 ÷ 5) = 24", "difficulty": "hard"},
        {"numbers": [3, 3, 8, 8], "solution": "8 ÷ (3 - 8 ÷ 3) = 24", "difficulty": "hard"},
        {"numbers": [4, 6, 6, 8], "solution": "(6 + 6) × (8 - 4) = 48", "difficulty": "medium"},
    ]
    return {"puzzles": fallback[:count]}


# ===== AI 拍照出题 OCR 识别 =====
def ai_ocr_question(image_base64: str) -> dict:
    """教师拍照出题 - 用 GLM-4V-Flash 视觉模型识别数学题图片

    Args:
        image_base64: 图片的 base64 编码字符串（不含 data:image/... 前缀）

    Returns:
        dict: {question_text, answer, knowledge_point, question_type, analysis}
    """
    prompt = """你是一位小学数学教师助手。请仔细识别图片中的数学题目，提取以下信息：

1. **question_text**: 题目的完整文字内容（保持原始表述，包括数字、符号、单位等）
2. **answer**: 标准答案（如果是计算题给出最终结果；如果是填空题给出应填内容；如果是应用题给出完整解答过程）
3. **knowledge_point**: 相关知识点（如"小数乘法"、"多边形面积"等，1-2个关键词）
4. **question_type**: 题目类型（fill=填空题, choice=选择题, compute=计算题, word=应用题）
5. **analysis**: 简要解题思路（1-2句话）

注意事项：
- 如果图片中有多道题，只识别第一道题
- 如果图片不清晰或不是数学题，返回 {"question_text": "", "error": "无法识别"}
- 数学符号用标准写法：× ÷ + - = < > ≤ ≥
- 小数用点号：如 2.5

输出JSON格式：
{
  "question_text": "题目内容",
  "answer": "标准答案",
  "knowledge_point": "知识点",
  "question_type": "fill",
  "analysis": "解题思路"
}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是数学题目识别专家，准确提取图片中的数学题目信息。"},
        {"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}},
        ]},
    ]

    raw = _call_llm_vision(messages, temperature=0.1, max_tokens=1024, timeout=60)
    result = _extract_json(raw) if raw else None
    if result and isinstance(result, dict):
        # 如果识别到错误标记，返回错误
        if result.get("error"):
            return result
        # 确保必要字段存在
        result.setdefault("question_text", "")
        result.setdefault("answer", "")
        result.setdefault("knowledge_point", "")
        result.setdefault("question_type", "fill")
        result.setdefault("analysis", "")
        return result

    print("[LLM] 拍照出题OCR识别失败")
    return {"question_text": "", "error": "AI识别失败，请手动输入题目"}
