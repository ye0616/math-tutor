"""教·课堂教学 Agent - 真实联网搜索 + GLM-4-Flash AI智能分析"""

import json
from agents.base import BaseAgent
from agents.lesson_knowledge import get_lesson_data, build_video_obj, build_resource_folders
from agents.web_search import search_all_resources
from agents.llm import ai_generate_teaching_analysis


class TeachAgent(BaseAgent):
    scenario = "teach"
    prompt_file = "teach.txt"

    def run(self, lesson_topic: str, lesson_code: str = "", unit_code: str = "") -> dict:
        return self.invoke({
            "lesson_topic": lesson_topic,
            "lesson_code": lesson_code,
            "unit_code": unit_code,
        })

    def invoke(self, input_data: dict, context: dict = None) -> dict:
        try:
            return self._do_invoke(input_data, context)
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"[TeachAgent] 全局异常: {e}")
            return self._fallback_response(input_data)

    def _fallback_response(self, input_data: dict) -> dict:
        """全局异常降级：返回知识库数据"""
        lesson_topic = input_data.get("lesson_topic", "")
        lesson_code = input_data.get("lesson_code", "")
        unit_code = input_data.get("unit_code", "")
        lesson_data = get_lesson_data(lesson_code, lesson_topic)
        topic = lesson_data["topic"]

        from agents.lesson_knowledge import build_resource_folders, build_video_obj
        resource_folders = build_resource_folders(lesson_data)
        videos_raw = lesson_data["videos"]
        layer_videos = {}
        for layer in ["basic", "advanced", "extension"]:
            v = videos_raw.get(layer, videos_raw.get("basic"))
            layer_videos[layer] = build_video_obj(v)

        preview_questions = []
        for layer in ["basic", "advanced", "extension"]:
            qs = lesson_data["questions"].get(layer, [])
            for q in qs:
                preview_questions.append({
                    "question": q["question"],
                    "type": "fill",
                    "difficulty": layer,
                    "layer": layer,
                    "answer": q["answer"],
                    "analysis": q["analysis"],
                    "knowledge_point": q["knowledge_point"],
                })

        return {
            "scenario": "教·课堂教学",
            "lesson_topic": topic,
            "lesson_code": lesson_code,
            "unit_code": unit_code,
            "output": {
                "agent_steps": [
                    {"step": 1, "icon": "search", "text": f"正在检索「{topic}」教学资源..."},
                    {"step": 2, "icon": "check", "text": "AI服务暂时不可用，已使用内置知识库数据"},
                ],
                "resource_folders": resource_folders,
                "knowledge_points": lesson_data["knowledge_points"],
                "search_source": "fallback",
                "ai_powered": False,
                "ai_model": "knowledge_base",
                "layer1_preview": {
                    "title": "分层预习任务",
                    "basic": lesson_data["preview_tasks"]["basic"],
                    "advanced": lesson_data["preview_tasks"]["advanced"],
                    "extension": lesson_data["preview_tasks"]["extension"],
                },
                "layer_videos": layer_videos,
                "preview_questions": preview_questions,
                "layer2_inquiry": {"title": "课堂交互式探究提问", "stages": lesson_data["inquiry"]},
                "layer3_blackboard": {"title": "差异化板书设计", **lesson_data["board"]},
                "recommended_video": {
                    "title": f"{topic} 教学视频",
                    "search_keywords": f"人教版五年级上册 {topic}",
                },
            },
        }

    def _do_invoke(self, input_data: dict, context: dict = None) -> dict:
        lesson_topic = input_data.get("lesson_topic", "")
        lesson_code = input_data.get("lesson_code", "")
        unit_code = input_data.get("unit_code", "")

        # 知识库数据（作为降级备份）
        lesson_data = get_lesson_data(lesson_code, lesson_topic)
        topic = lesson_data["topic"]

        # ===== 步骤1：调用方案 C 资源生成（AI 直出课件/教案/练习 + B站视频） =====
        try:
            search_result = search_all_resources(
                topic, lesson_code, lesson_data.get("knowledge_points", [])
            )
        except Exception as e:
            print(f"[TeachAgent] 搜索生成异常: {e}")
            import traceback
            traceback.print_exc()
            search_result = {"success": False, "resource_folders": {}, "layer_videos": {}, "agent_steps": []}

        if search_result.get("success"):
            resource_folders = search_result["resource_folders"]
            layer_videos = search_result["layer_videos"]
            search_source = "real"
            search_stats = search_result.get("search_stats", {})
        else:
            resource_folders = build_resource_folders(lesson_data)
            videos_raw = lesson_data["videos"]
            layer_videos = {}
            for layer in ["basic", "advanced", "extension"]:
                v = videos_raw.get(layer, videos_raw.get("basic"))
                layer_videos[layer] = build_video_obj(v)
            search_source = "fallback"
            search_stats = {}

        # 准备搜索结果文本，给AI出题和教学分析使用
        search_context_lines = []
        for folder_key, folder_data in resource_folders.items():
            if not isinstance(folder_data, dict):
                continue
            type_cn = {"courseware": "课件", "lesson_plan": "教案", "exercises": "练习", "videos": "微课"}.get(folder_key, folder_key)
            for layer, items in folder_data.get("items", {}).items():
                for item in items[:2]:
                    title = item.get("title", "")
                    snippet = item.get("description") or item.get("snippet") or ""
                    if title:
                        search_context_lines.append(f"[{type_cn}/{layer}] {title} | {snippet[:80]}")
        search_context = "\n".join(search_context_lines)

        # ===== 步骤2：AI 教学分析（唯一的AI调用，~35秒） =====
        # 不再调 ai_generate_exercises，因为搜索结果中已有练习题资源链接
        # 预习题直接用知识库数据（稳定可靠）
        try:
            ai_analysis = ai_generate_teaching_analysis(topic, search_context, "五年级", {})
        except Exception as e:
            print(f"[TeachAgent] AI分析超时: {e}")
            ai_analysis = None

        # ===== 预习题：用知识库数据（搜索结果是链接，无法提取单题） =====
        preview_questions = []
        for layer in ["basic", "advanced", "extension"]:
            qs = lesson_data["questions"].get(layer, [])
            for q in qs:
                preview_questions.append({
                    "question": q["question"],
                    "type": "fill" if "\nA." not in q["question"] else "choice",
                    "difficulty": layer,
                    "layer": layer,
                    "answer": q["answer"],
                    "analysis": q["analysis"],
                    "knowledge_point": q["knowledge_point"],
                })
        questions_source = "knowledge_base"

        # ===== 处理AI教学分析 =====
        if ai_analysis:
            knowledge_points = ai_analysis.get("knowledge_points", lesson_data["knowledge_points"])
            inquiry_stages = []
            for iq in ai_analysis.get("inquiry_questions", []):
                inquiry_stages.append({
                    "stage": iq.get("question", ""),
                    "purpose": iq.get("purpose", ""),
                    "questions": [iq.get("question", "")],
                })
            if not inquiry_stages:
                inquiry_stages = lesson_data["inquiry"]

            pt = ai_analysis.get("preview_tasks", {})
            layer1_preview = {
                "title": "AI生成分层预习任务",
                "basic": pt.get("basic", lesson_data["preview_tasks"]["basic"]),
                "advanced": pt.get("advanced", lesson_data["preview_tasks"]["advanced"]),
                "extension": pt.get("extension", lesson_data["preview_tasks"]["extension"]),
            }

            board_text = ai_analysis.get("blackboard_design", "")
            tips = ai_analysis.get("teaching_tips", [])
            side_text = ""
            if tips:
                side_text = "教学建议：\n" + "\n".join(f"• {t}" for t in tips)
            elif lesson_data["board"].get("side_board"):
                side_text = lesson_data["board"]["side_board"]
            layer3_blackboard = {
                "title": "AI生成差异化板书设计",
                "main_board": board_text if board_text else lesson_data["board"].get("main_board", ""),
                "side_board": side_text,
            }

            layer2_inquiry = {
                "title": "AI生成课堂交互式探究提问",
                "stages": inquiry_stages,
            }
            analysis_source = "ai"
        else:
            knowledge_points = lesson_data["knowledge_points"]
            layer1_preview = {
                "title": "分层预习任务",
                "basic": lesson_data["preview_tasks"]["basic"],
                "advanced": lesson_data["preview_tasks"]["advanced"],
                "extension": lesson_data["preview_tasks"]["extension"],
            }
            layer2_inquiry = {"title": "课堂交互式探究提问", "stages": lesson_data["inquiry"]}
            layer3_blackboard = {"title": "差异化板书设计", **lesson_data["board"]}
            analysis_source = "knowledge_base"

        # ===== Agent检索步骤（真实搜索版） =====
        search_doc_count = 0
        video_count = 0
        for f in resource_folders.values():
            if not isinstance(f, dict):
                continue
            for layer_items in f.get("items", {}).values():
                for it in layer_items:
                    if it.get("format") == "VIDEO" or it.get("bvid"):
                        video_count += 1
                    else:
                        search_doc_count += 1

        agent_steps = [
            {"step": 1, "icon": "search", "text": f"正在为「{topic}」搜索真实教学资源..."},
            {"step": 2, "icon": "presentation", "text": f"百度搜索教案 → 课件 → 练习题（3次搜索）"},
            {"step": 3, "icon": "video", "text": f"B站 API 搜索微课视频 → 找到 {video_count} 个视频"},
            {"step": 4, "icon": "filter", "text": "搜索结果智能分层归类：基础层 / 提升层 / 拓展层"},
            {"step": 5, "icon": "sparkles", "text": f"GLM-4-Flash AI 生成教学分析（预习任务 + 探究提问 + 板书设计）..."},
            {"step": 6, "icon": "check", "text": f"完成！搜索文档 {search_doc_count} 份 | 微课视频 {video_count} 个 | 分析: {analysis_source}"},
        ]

        output = {
            "agent_steps": agent_steps,
            "resource_folders": resource_folders,
            "knowledge_points": knowledge_points,
            "search_source": search_source,
            "ai_powered": True,
            "ai_model": "GLM-4-Flash",
            "layer1_preview": layer1_preview,
            "layer_videos": layer_videos,
            "preview_questions": preview_questions,
            "layer2_inquiry": layer2_inquiry,
            "layer3_blackboard": layer3_blackboard,
            "recommended_video": {
                "title": f"{topic} 教学视频",
                "search_keywords": f"人教版五年级上册 {topic}",
            },
        }

        return {
            "scenario": "教·课堂教学",
            "lesson_topic": topic,
            "lesson_code": lesson_code,
            "unit_code": unit_code,
            "output": output,
        }

    def _ai_classify_all(self, folder_search_items, topic):
        """合并所有资源分类为一次AI调用"""
        from agents.llm import _call_llm_json

        # 准备所有资源文本
        all_items_text = ""
        folder_item_map = {}  # 临时编号到folder_key的映射

        idx = 0
        for folder_key, items in folder_search_items.items():
            type_names = {
                "courseware": "课件", "lesson_plan": "教案",
                "exercise": "练习", "video": "视频"
            }
            type_cn = type_names.get(folder_key, folder_key)
            for item in items[:6]:
                idx += 1
                title = item.get("title", "")
                snippet = item.get("snippet", item.get("description", ""))[:60]
                all_items_text += f"[{idx}] ({type_cn}) {title}\n    {snippet}\n"
                folder_item_map[idx] = (folder_key, item)

        if not all_items_text:
            return {}

        prompt = f"""你是小学数学教学资源分析专家。请仔细阅读以下关于"{topic}"的教学搜索结果，根据每条资源的标题和摘要内容，判断它最适合哪个教学层次（基础层/提升层/拓展层）。

搜索结果：
{all_items_text}

分层规则（必须结合标题和摘要内容判断）：
- basic（基础层）: 适合基础薄弱、需要巩固概念的学生。标题/摘要中出现"基础""入门""概念""认识""例1""第1课时""简单""初步""什么是""理解"等关键词，或内容明显偏向概念讲解、基本技能训练。
- advanced（提升层）: 适合中等水平学生。标题/摘要中出现"练习""应用""巩固""变式""方法""技巧""综合""提高""例2""例3"等，或内容偏向方法应用和中等难度练习。
- extension（拓展层）: 适合学有余力的学生。标题/摘要中出现"拓展""延伸""思维""挑战""奥数""探究""提高题""难题""综合应用"等，或内容明显更深层、更综合、更有挑战性。

重要：
1. 必须基于标题和摘要的内容进行判断，不要只看关键词。
2. 每个资源只能分到一个层，请选择最合适的一层。
3. 如果摘要为空，主要依据标题判断。

输出JSON格式：
{{
  "courseware": {{"basic": [{{"idx": 1, "match_score": 85, "reason": "..."}}], "advanced": [], "extension": []}},
  "lesson_plan": {{"basic": [], "advanced": [], "extension": []}},
  "exercise": {{"basic": [], "advanced": [], "extension": []}},
  "video": {{"basic": [], "advanced": [], "extension": []}}
}}

每层最多4个资源。只输出JSON，不要其他文字。"""

        messages = [
            {"role": "system", "content": "你是小学数学教研专家，擅长教学资源分层分析。"},
            {"role": "user", "content": prompt},
        ]

        result = _call_llm_json(messages, temperature=0.3, max_tokens=1500)
        if not result:
            return {}

        # 将AI分类结果映射回原始资源
        classified = {}
        for folder_key in folder_search_items:
            folder_result = result.get(folder_key, {})
            classified[folder_key] = {}
            for layer in ["basic", "advanced", "extension"]:
                layer_items = []
                for entry in folder_result.get(layer, []):
                    idx = entry.get("idx")
                    if idx and idx in folder_item_map:
                        orig_folder, orig_item = folder_item_map[idx]
                        if orig_folder == folder_key:
                            item_copy = dict(orig_item)
                            item_copy["match_score"] = entry.get("match_score", 70)
                            item_copy["ai_reason"] = entry.get("reason", "")
                            item_copy["is_ai_classified"] = True
                            layer_items.append(item_copy)
                classified[folder_key][layer] = layer_items[:4]

        return classified

    def _mock_response(self, user_message: str) -> str:
        return json.dumps({"output": {}})
