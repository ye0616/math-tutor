"""预习资料生成 Agent - 基于备课档案夹资源，调用 GLM-4-Flash 生成结构化预习单"""

import json
import random
from agents.llm import _call_llm_json
from agents.lesson_knowledge import get_lesson_data


# 文件夹 key -> 中文名
_FOLDER_TYPE_MAP = {
    "courseware": "课件",
    "lesson_plan": "教案",
    "exercises": "练习",
    "videos": "微课",
}


def _flatten_search_results(resource_folders: dict) -> list:
    """把 resource_folders 扁平化为带 layer/resource_type 的列表"""
    flat = []
    for folder_key, folder in resource_folders.items():
        rtype = _FOLDER_TYPE_MAP.get(folder_key, folder.get("title", folder_key))
        items_by_layer = folder.get("items", {})
        for layer in ("basic", "advanced", "extension"):
            for it in items_by_layer.get(layer, []):
                it_copy = dict(it)
                it_copy["resource_type"] = rtype
                it_copy["layer"] = layer
                flat.append(it_copy)
    return flat


def generate_preview_material(
    lesson_title: str,
    lesson_code: str = "",
    unit_code: str = "",
    resource_folders: dict = None,
    layer_videos: dict = None,
    knowledge_points: list = None,
    preview_questions: list = None,
) -> dict:
    """
    基于 TeachAgent 输出的备课档案夹资源，调用 AI 生成结构化预习资料。

    输入：
        - lesson_title: 课题
        - resource_folders: TeachAgent 输出的资源文件夹
        - layer_videos: 分层视频 {basic: {...}, advanced: {...}, extension: {...}}
        - knowledge_points: 知识点列表
        - preview_questions: 预习题目列表

    输出：
        结构化预习资料 JSON，包含：
        - knowledge_guide: 知识引导（主题、核心结论、学习目标、例题解析）
        - videos: 分层视频（直接复用 layer_videos）
        - knowledge_summary: 分层知识点总结
        - preview_questions: 分层预习题目（直接复用）
        - reference_materials: 参考资料列表（从 resource_folders 提取）
    """
    resource_folders = resource_folders or {}
    layer_videos = layer_videos or {}
    knowledge_points = knowledge_points or []
    preview_questions = preview_questions or []

    # 1. 提取参考资料（从 resource_folders 中选取有 URL 的资源）
    reference_materials = _extract_reference_materials(resource_folders)

    # 2. 组织分层视频（优先从备课档案夹 videos 文件夹中选取）
    videos = _organize_videos(layer_videos, resource_folders)

    # 3. 知识库降级数据
    lesson_data = get_lesson_data(lesson_code, lesson_title)
    fallback_kp = lesson_data.get("knowledge_points", knowledge_points)

    # 4. 调用 AI 生成知识引导 + 知识点总结
    resource_summary = _build_resource_summary(resource_folders, knowledge_points or fallback_kp, layer_videos, videos)

    ai_result = _ai_generate_knowledge_guide(
        lesson_title,
        resource_summary,
        knowledge_points or fallback_kp,
    )

    if ai_result:
        knowledge_guide = ai_result.get("knowledge_guide", {})
        knowledge_summary = ai_result.get("knowledge_summary", _fallback_knowledge_summary(lesson_data))
    else:
        # AI 失败时的降级
        knowledge_guide = _fallback_knowledge_guide(lesson_title, lesson_data)
        knowledge_summary = _fallback_knowledge_summary(lesson_data)

    # 5. 调用 AI 基于备课档案夹（尤其是视频资源）生成预习题目
    ai_questions = _ai_generate_preview_questions(
        lesson_title,
        resource_folders,
        layer_videos,
        videos,
        knowledge_points or fallback_kp,
    )

    if ai_questions:
        questions_by_layer = ai_questions
        ai_powered_questions = True
    else:
        questions_by_layer = _organize_questions(preview_questions)
        ai_powered_questions = False

    return {
        "title": lesson_title,
        "knowledge_guide": knowledge_guide,
        "videos": videos,
        "knowledge_summary": knowledge_summary,
        "preview_questions": questions_by_layer,
        "reference_materials": reference_materials,
        "ai_powered": bool(ai_result),
        "ai_questions": ai_powered_questions,
        "ai_model": "GLM-4-Flash" if ai_result else "knowledge_base",
    }


def _extract_reference_materials(resource_folders: dict) -> dict:
    """从 resource_folders 提取参考资料，按类型分组"""
    refs = {"courseware": [], "lesson_plan": [], "exercises": [], "videos": []}
    for folder_key, folder_data in resource_folders.items():
        if not isinstance(folder_data, dict):
            continue
        items_by_layer = folder_data.get("items", {})
        collected = []
        for layer in ("basic", "advanced", "extension"):
            for it in items_by_layer.get(layer, []):
                title = it.get("title", "")
                url = it.get("platform_url") or it.get("url") or ""
                platform = it.get("platform", "")
                description = it.get("description") or it.get("snippet") or ""
                highlight = it.get("highlight", "")
                bvid = it.get("bvid", "")
                if title and url:
                    collected.append({
                        "title": title,
                        "url": url,
                        "platform": platform,
                        "description": description[:120] if description else "",
                        "highlight": highlight,
                        "bvid": bvid,
                        "layer": layer,
                    })
        if folder_key in refs:
            # 去重（同标题只保留一条）
            seen = set()
            unique = []
            for item in collected:
                if item["title"] not in seen:
                    seen.add(item["title"])
                    unique.append(item)
            refs[folder_key] = unique[:6]  # 每类最多6条
    return refs


def _normalize_video_item(item: dict) -> dict:
    """将备课档案夹中的视频项标准化为 layer_videos 格式"""
    url = item.get("url") or item.get("platform_url") or ""
    if not url and item.get("bvid"):
        url = f"https://www.bilibili.com/video/{item['bvid']}"
    return {
        "title": item.get("title", ""),
        "bvid": item.get("bvid", ""),
        "url": url,
        "embed_url": item.get("embed_url", ""),
        "platform": item.get("platform", ""),
        "duration": item.get("duration", 0),
        "description": item.get("description", ""),
        "page": item.get("page", 1),
    }


def _organize_videos(layer_videos: dict, resource_folders: dict = None) -> dict | None:
    """
    选取一个微课视频。
    优先从备课档案夹的 videos 文件夹中随机选取（教师精选/收藏的视频），
    其次从 layer_videos 中选取（TeachAgent 自动分配的分层视频）。
    优先级：basic → advanced → extension。
    """
    # 1. 优先从备课档案夹的 videos 文件夹中随机选取
    resource_folders = resource_folders or {}
    videos_folder = resource_folders.get("videos", {})
    if isinstance(videos_folder, dict):
        items_by_layer = videos_folder.get("items", {})
        for layer in ("basic", "advanced", "extension"):
            layer_items = items_by_layer.get(layer, [])
            # 过滤出有有效链接的视频
            valid_items = [
                it for it in layer_items
                if isinstance(it, dict) and (it.get("bvid") or it.get("embed_url") or it.get("platform_url") or it.get("url"))
            ]
            if valid_items:
                return _normalize_video_item(random.choice(valid_items))

    # 2. 降级：从 layer_videos 中选取
    for layer in ("basic", "advanced", "extension"):
        v = layer_videos.get(layer)
        if v and isinstance(v, dict):
            return {
                "title": v.get("title", ""),
                "bvid": v.get("bvid", ""),
                "url": v.get("url", ""),
                "embed_url": v.get("embed_url", ""),
                "platform": v.get("platform", ""),
                "duration": v.get("duration", 0),
                "description": v.get("description", ""),
                "page": v.get("page", 1),
            }
    return None


def _organize_questions(preview_questions: list) -> dict:
    """按层分组预习题目"""
    by_layer = {"basic": [], "advanced": [], "extension": []}
    for q in preview_questions:
        layer = q.get("layer") or q.get("difficulty") or "basic"
        if layer not in by_layer:
            layer = "basic"
        by_layer[layer].append({
            "question": q.get("question", ""),
            "type": q.get("type", "fill"),
            "options": q.get("options", []),
            "answer": q.get("answer", ""),
            "analysis": q.get("analysis", ""),
            "knowledge_point": q.get("knowledge_point", ""),
        })
    return by_layer


def _build_resource_summary(resource_folders: dict, knowledge_points: list, layer_videos: dict = None, selected_video: dict = None) -> str:
    """构建给 AI 看的资源摘要文本（突出视频资源，优先备课档案夹）"""
    lines = []
    if knowledge_points:
        lines.append(f"本课核心知识点：{', '.join(knowledge_points[:6])}")

    # 视频资源单独突出（优先备课档案夹 + layer_videos）
    layer_videos = layer_videos or {}
    video_lines = []

    # 精选微课（从备课档案夹选取的）
    if selected_video and selected_video.get("title"):
        video_lines.append(f"  [精选微课] {selected_video['title']} | {selected_video.get('description', '')[:80]}")

    # 备课档案夹 videos 文件夹中的视频
    resource_folders = resource_folders or {}
    videos_folder = resource_folders.get("videos", {})
    if isinstance(videos_folder, dict):
        items_by_layer = videos_folder.get("items", {})
        for layer in ("basic", "advanced", "extension"):
            for it in items_by_layer.get(layer, []):
                if isinstance(it, dict) and it.get("title") and (it.get("bvid") or it.get("embed_url")):
                    title = it.get("title", "")
                    desc = it.get("description", "")
                    dur = it.get("duration", 0)
                    dur_str = f"{dur}秒" if dur else ""
                    line = f"  [{layer}层] {title} | {dur_str} | {desc[:80]}"
                    if line not in video_lines:
                        video_lines.append(line)

    # layer_videos 中的视频（补充）
    for layer in ("basic", "advanced", "extension"):
        v = layer_videos.get(layer)
        if v and isinstance(v, dict):
            title = v.get("title", "")
            desc = v.get("description", "")
            dur = v.get("duration", 0)
            dur_str = f"{dur}秒" if dur else ""
            line = f"  [{layer}层] {title} | {dur_str} | {desc[:80]}"
            if line not in video_lines:
                video_lines.append(line)

    if video_lines:
        lines.append("\n【微课视频资源（出题重点参考）】")
        lines.extend(video_lines)

    # 备课档案夹其他资源（排除 videos 文件夹，已在上面突出）
    flat = _flatten_search_results(resource_folders)
    other_lines = []
    for it in flat[:20]:
        rtype = it.get("resource_type", "")
        if rtype == "微课":
            continue  # 视频已单独列出
        title = it.get("title", "")
        desc = it.get("description") or it.get("snippet") or ""
        layer = it.get("layer", "")
        if title:
            other_lines.append(f"[{rtype}/{layer}] {title} | {desc[:80]}")
    if other_lines:
        lines.append("\n【备课档案夹资源】")
        lines.extend(other_lines)

    return "\n".join(lines) if lines else "无可用资源"


def _ai_generate_knowledge_guide(lesson_title: str, resource_summary: str, knowledge_points: list) -> dict | None:
    """
    调用 GLM-4-Flash 生成知识引导和知识点总结。

    输出 JSON：
    {
      "knowledge_guide": {
        "topic": "本课主题概述",
        "key_conclusion": "核心结论（一句话）",
        "learning_goals": ["目标1", "目标2", "目标3"],
        "example_analysis": {
          "question": "例题题目",
          "steps": ["步骤1", "步骤2", "步骤3"]
        }
      },
      "knowledge_summary": {
        "basic": ["基础要点1", "基础要点2"],
        "advanced": ["提升要点1", "提升要点2"],
        "extension": ["拓展要点1", "拓展要点2"]
      }
    }
    """
    kp_text = f"\n核心知识点：{', '.join(knowledge_points)}" if knowledge_points else ""

    prompt = f"""你是人教版小学数学五年级教研专家。请根据课题「{lesson_title}」和以下备课资源，生成一份结构化的预习资料。

备课资源摘要：
{resource_summary[:2500]}
{kp_text}

要求：
1. 内容要贴合人教版五年级教材，语言准确、通俗，适合小学生自主预习
2. 知识引导要包含主题概述、核心结论（一句话总结本课最重要的知识点）、学习目标（2-3条）、例题解析（1道典型例题+分步骤解析）
3. 知识点总结按基础/提升/拓展三层分别给出2-3条要点
4. 例题解析要像课本里的格式：先给题目，再分步骤解答

输出JSON格式：
{{
  "knowledge_guide": {{
    "topic": "本课主题概述（2-3句话）",
    "key_conclusion": "核心结论（一句话，如：小数乘整数，先按整数乘法算出积，再看因数中有几位小数，就从积的右边起数出几位点上小数点）",
    "learning_goals": ["学习目标1", "学习目标2", "学习目标3"],
    "example_analysis": {{
      "question": "例题题目文字",
      "steps": ["第一步...", "第二步...", "第三步..."]
    }}
  }},
  "knowledge_summary": {{
    "basic": ["基础要点1", "基础要点2", "基础要点3"],
    "advanced": ["提升要点1", "提升要点2"],
    "extension": ["拓展要点1", "拓展要点2"]
  }}
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是人教版小学数学资深教研员，擅长预习材料设计和分层教学。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.5, max_tokens=2000, timeout=90)
    if result and isinstance(result, dict):
        kg = result.get("knowledge_guide", {})
        if not kg.get("topic"):
            return None
        return result

    print("[PreviewMaterialAgent] AI 生成知识引导失败")
    return None


def _ai_generate_preview_questions(
    lesson_title: str,
    resource_folders: dict,
    layer_videos: dict,
    selected_video: dict | None,
    knowledge_points: list,
) -> dict | None:
    """
    调用 GLM-4-Flash 基于备课档案夹（尤其是视频资源）生成预习题目。

    输出格式：
    {
      "basic": [{question, type, options, answer, analysis, knowledge_point}, ...],
      "advanced": [...],
      "extension": [...]
    }
    """
    # 构建视频资源上下文（优先备课档案夹）
    video_context_lines = []
    seen_titles = set()

    # 精选微课（从备课档案夹选取的）
    if selected_video:
        title = selected_video.get("title", "")
        if title:
            video_context_lines.append(f"  - [精选微课] {title}：{selected_video.get('description', '')[:100]}")
            seen_titles.add(title)

    # 备课档案夹 videos 文件夹中的视频
    resource_folders = resource_folders or {}
    videos_folder = resource_folders.get("videos", {})
    if isinstance(videos_folder, dict):
        items_by_layer = videos_folder.get("items", {})
        for layer in ("basic", "advanced", "extension"):
            for it in items_by_layer.get(layer, []):
                if isinstance(it, dict) and it.get("title") and (it.get("bvid") or it.get("embed_url")):
                    t = it.get("title", "")
                    if t not in seen_titles:
                        video_context_lines.append(f"  - [{layer}层] {t}：{it.get('description', '')[:100]}")
                        seen_titles.add(t)

    # layer_videos 中的视频（补充）
    layer_videos = layer_videos or {}
    for layer in ("basic", "advanced", "extension"):
        v = layer_videos.get(layer)
        if v and isinstance(v, dict):
            t = v.get("title", "")
            if t and t not in seen_titles:
                video_context_lines.append(f"  - [{layer}层] {t}：{v.get('description', '')[:100]}")
                seen_titles.add(t)

    video_context = "\n".join(video_context_lines) if video_context_lines else "无视频资源"

    # 备课档案夹其他资源（排除视频，已单独列出）
    flat = _flatten_search_results(resource_folders)
    folder_lines = []
    for it in flat[:15]:
        title = it.get("title", "")
        rtype = it.get("resource_type", "")
        if rtype == "微课":
            continue  # 视频已单独列出
        if title:
            folder_lines.append(f"  - [{rtype}] {title}")
    folder_context = "\n".join(folder_lines) if folder_lines else "无"

    kp_str = "、".join(knowledge_points[:5]) if knowledge_points else "本课核心知识点"

    prompt = f"""你是人教版小学数学五年级出题专家。请根据以下备课资源，为课题「{lesson_title}」设计预习练习题。

【微课视频资源（出题重点参考）】
{video_context}

【备课档案夹资源】
{folder_context}

【知识点】
{kp_str}

出题要求：
1. 基础层（basic）2-3题：考查视频中最基础的知识点，学生看完视频就能回答
2. 提升层（advanced）2题：需要理解视频内容后进行简单应用
3. 拓展层（extension）1-2题：综合应用，稍有挑战
4. 【重要】每层最多1道概念/性质题（如"什么是XX""XX的性质是"），其余必须是具体数学计算题！
   - ✅数学计算题示例："计算 2.5 × 3 = ___"、"0.24 × 5 = ___"、"一本笔记本3.5元，买4本需要多少元？"
   - ❌不要出太多纯概念题，如"小数乘整数的意义是什么？""小数乘法有什么性质？"
5. 题目类型以填空题（fill）为主，答案简洁明确
6. 每题必须包含答案(answer)和解析(analysis)，解析要说明解题思路
7. knowledge_point 要标注本题考查的知识点

输出JSON格式：
{{
  "basic": [
    {{"question": "题目文字", "type": "fill", "options": [], "answer": "答案", "analysis": "解析", "knowledge_point": "知识点"}}
  ],
  "advanced": [
    {{"question": "题目文字", "type": "fill", "options": [], "answer": "答案", "analysis": "解析", "knowledge_point": "知识点"}}
  ],
  "extension": [
    {{"question": "题目文字", "type": "fill", "options": [], "answer": "答案", "analysis": "解析", "knowledge_point": "知识点"}}
  ]
}}

只输出JSON，不要其他文字。"""

    messages = [
        {"role": "system", "content": "你是人教版小学数学出题专家，擅长基于视频资源设计分层预习题目。出题以具体数学计算题为主，概念性质题不超过1道。"},
        {"role": "user", "content": prompt},
    ]

    result = _call_llm_json(messages, temperature=0.6, max_tokens=1500, timeout=60)
    if result and isinstance(result, dict):
        # 验证至少有 basic 层且有题目
        basic_qs = result.get("basic", [])
        if basic_qs and isinstance(basic_qs, list) and len(basic_qs) > 0:
            # 确保每题有必要字段
            for layer in ("basic", "advanced", "extension"):
                qs = result.get(layer, [])
                for q in qs:
                    if not q.get("question"):
                        q["question"] = ""
                    if not q.get("type"):
                        q["type"] = "fill"
                    if not q.get("options"):
                        q["options"] = []
                    if not q.get("answer"):
                        q["answer"] = ""
                    if not q.get("analysis"):
                        q["analysis"] = ""
                    if not q.get("knowledge_point"):
                        q["knowledge_point"] = kp_str
            print(f"[PreviewMaterialAgent] AI 生成预习题目成功：basic={len(result.get('basic', []))}, advanced={len(result.get('advanced', []))}, extension={len(result.get('extension', []))}")
            return result

    print("[PreviewMaterialAgent] AI 生成预习题目失败，将使用知识库题目")
    return None


def _fallback_knowledge_guide(lesson_title: str, lesson_data: dict) -> dict:
    """AI 失败时的降级知识引导"""
    kps = lesson_data.get("knowledge_points", [])
    preview_tasks = lesson_data.get("preview_tasks", {})
    basic_tasks = preview_tasks.get("basic", [])

    return {
        "topic": f"本课学习「{lesson_title}」，是人教版五年级数学的重要内容。",
        "key_conclusion": kps[0] if kps else f"掌握{lesson_title}的基本概念和计算方法。",
        "learning_goals": basic_tasks[:3] if basic_tasks else [
            f"理解{lesson_title}的含义",
            f"掌握{lesson_title}的计算方法",
            "能正确解决相关实际问题",
        ],
        "example_analysis": {
            "question": f"请结合课本例题学习「{lesson_title}」。",
            "steps": ["阅读课本中的例题", "理解解题思路", "尝试独立完成"],
        },
    }


def _fallback_knowledge_summary(lesson_data: dict) -> dict:
    """AI 失败时的降级知识点总结"""
    preview_tasks = lesson_data.get("preview_tasks", {})
    return {
        "basic": preview_tasks.get("basic", ["掌握基本概念", "理解计算方法"])[:3],
        "advanced": preview_tasks.get("advanced", ["能进行变式练习", "综合应用知识"])[:3],
        "extension": preview_tasks.get("extension", ["拓展思维", "解决实际问题"])[:3],
    }
