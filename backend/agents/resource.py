"""资源建设 Agent - 全学科免费备课资源AI整合库"""

import json
from agents.base import BaseAgent


class ResourceAgent(BaseAgent):
    scenario = "resource"
    prompt_file = "resource.txt"

    def run(self, grade: str, subject: str, lesson_title: str, textbook_version: str = "人教版") -> dict:
        return self.invoke({
            "grade": grade,
            "subject": subject,
            "lesson_title": lesson_title,
            "textbook_version": textbook_version,
        })

    def invoke(self, input_data: dict, context: dict = None) -> dict:
        grade = input_data.get("grade", "五年级")
        subject = input_data.get("subject", "数学")
        lesson_title = input_data.get("lesson_title", "")
        textbook_version = input_data.get("textbook_version", "人教版")

        user_msg = (
            f"年级：{grade}\n学科：{subject}\n课题：{lesson_title}\n"
            f"教材版本：{textbook_version}\n"
            f"请从国家中小学智慧教育平台、学科网免费专区、人教社官方资源、各地教研公开课件、"
            f"公开课优质教案等平台检索匹配的免费课件、教案、课时练习、微课视频资源。"
            f"AI自动去重、筛选合规无版权内容。"
        )
        raw = self._call_llm(user_msg)
        result = self._parse_json(raw)
        return result

    def _mock_response(self, user_message: str) -> str:
        # 从用户消息中提取课题
        lesson_title = "小数乘整数"
        for line in user_message.split("\n"):
            if line.startswith("课题："):
                lesson_title = line.replace("课题：", "").strip()
                break

        return json.dumps({
            "scenario": "全学科免费备课资源AI整合库",
            "output": {
                "search_info": {
                    "grade": "五年级",
                    "subject": "数学",
                    "lesson_title": lesson_title,
                    "textbook_version": "人教版",
                    "total_found": 12,
                    "deduplicated": 3,
                    "copyright_filtered": 2,
                },
                "resources": [
                    {
                        "id": 1,
                        "title": f"{lesson_title} - 优质课件PPT",
                        "platform": "国家中小学智慧教育平台",
                        "platform_type": "国家级官方平台",
                        "resource_type": "课件",
                        "format": "PPTX",
                        "size": "4.2MB",
                        "description": f"人教版五年级数学《{lesson_title}》配套课件，含动画演示和课堂互动环节设计，已通过白板格式适配",
                        "whiteboard_ready": True,
                        "copyright_free": True,
                        "download_url": "https://www.smartedu.cn",
                        "rating": 4.9,
                        "downloads": 12856,
                        "ai_match_score": 98,
                    },
                    {
                        "id": 2,
                        "title": f"{lesson_title} - 完整教案设计",
                        "platform": "人教社官方资源",
                        "platform_type": "教材出版社官方",
                        "resource_type": "教案",
                        "format": "DOCX",
                        "size": "320KB",
                        "description": f"人民教育出版社官方配套教案，含教学目标、重难点分析、教学过程设计、板书设计，直接适配白板",
                        "whiteboard_ready": True,
                        "copyright_free": True,
                        "download_url": "https://www.pep.com.cn",
                        "rating": 5.0,
                        "downloads": 8932,
                        "ai_match_score": 97,
                    },
                    {
                        "id": 3,
                        "title": f"{lesson_title} - 名师微课视频",
                        "platform": "一师一优课",
                        "platform_type": "教育部优质课",
                        "resource_type": "微课",
                        "format": "MP4",
                        "size": "85MB",
                        "duration": "8分钟",
                        "description": f"省级优课获奖教师录制，时长适中不拖沓，聚焦{lesson_title}核心知识点讲解，适合课前预习和课堂导入",
                        "whiteboard_ready": True,
                        "copyright_free": True,
                        "download_url": "https://1s1k.eduyun.cn",
                        "rating": 4.8,
                        "downloads": 6541,
                        "ai_match_score": 95,
                    },
                    {
                        "id": 4,
                        "title": f"{lesson_title} - 课时同步练习",
                        "platform": "学科网免费专区",
                        "platform_type": "教育资源平台",
                        "resource_type": "练习",
                        "format": "PDF",
                        "size": "1.1MB",
                        "description": f"含基础题、提升题、拓展题三层分层练习，附详细答案解析，可直接导入白板随堂检测",
                        "whiteboard_ready": True,
                        "copyright_free": True,
                        "download_url": "https://www.zxxk.com",
                        "rating": 4.7,
                        "downloads": 9821,
                        "ai_match_score": 94,
                    },
                    {
                        "id": 5,
                        "title": f"{lesson_title} - 互动式白板课件",
                        "platform": "各地教研公开课件",
                        "platform_type": "地方教研室",
                        "resource_type": "课件",
                        "format": "ENB",
                        "size": "6.8MB",
                        "description": f"已转换为白板专用格式，支持拖拽、批注、弹窗互动、随堂标注，无需二次修改直接可用",
                        "whiteboard_ready": True,
                        "copyright_free": True,
                        "download_url": "#",
                        "rating": 4.6,
                        "downloads": 3210,
                        "ai_match_score": 92,
                    },
                    {
                        "id": 6,
                        "title": f"{lesson_title} - 优质公开课实录",
                        "platform": "国家中小学智慧教育平台",
                        "platform_type": "国家级官方平台",
                        "resource_type": "微课",
                        "format": "MP4",
                        "size": "120MB",
                        "duration": "12分钟",
                        "description": f"全国优质课一等奖课例实录片段，聚焦核心知识点突破，可截取关键环节用于课堂播放",
                        "whiteboard_ready": True,
                        "copyright_free": True,
                        "download_url": "https://www.smartedu.cn",
                        "rating": 4.9,
                        "downloads": 7654,
                        "ai_match_score": 90,
                    },
                    {
                        "id": 7,
                        "title": f"{lesson_title} - 课后作业设计",
                        "platform": "人教社官方资源",
                        "platform_type": "教材出版社官方",
                        "resource_type": "练习",
                        "format": "PDF",
                        "size": "850KB",
                        "description": f"人教社官方课后作业设计，分层布置建议，含易错题预警和拓展思考题",
                        "whiteboard_ready": True,
                        "copyright_free": True,
                        "download_url": "https://www.pep.com.cn",
                        "rating": 4.8,
                        "downloads": 5632,
                        "ai_match_score": 89,
                    },
                    {
                        "id": 8,
                        "title": f"{lesson_title} - 教学反思与改进建议",
                        "platform": "一师一优课",
                        "platform_type": "教育部优质课",
                        "resource_type": "教案",
                        "format": "DOCX",
                        "size": "180KB",
                        "description": f"优秀教师教学反思记录，包含常见问题应对策略和课堂生成性资源处理建议",
                        "whiteboard_ready": False,
                        "copyright_free": True,
                        "download_url": "https://1s1k.eduyun.cn",
                        "rating": 4.5,
                        "downloads": 2103,
                        "ai_match_score": 85,
                    },
                ],
                "platforms_summary": [
                    {"name": "国家中小学智慧教育平台", "count": 2, "type": "国家级官方平台"},
                    {"name": "人教社官方资源", "count": 2, "type": "教材出版社官方"},
                    {"name": "一师一优课", "count": 2, "type": "教育部优质课"},
                    {"name": "学科网免费专区", "count": 1, "type": "教育资源平台"},
                    {"name": "各地教研公开课件", "count": 1, "type": "地方教研室"},
                ],
                "ai_note": f"AI已从5个平台检索到15条相关资源，自动去重3条重复内容，过滤2条版权不明确资源，最终推荐8条优质免费资源。所有推荐资源均无版权风险，可放心下载使用。",
            }
        }, ensure_ascii=False)
