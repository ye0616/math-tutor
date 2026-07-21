"""研·教研备课 Agent"""

import json
from agents.base import BaseAgent
from database import get_db


class ResearchAgent(BaseAgent):
    scenario = "research"
    prompt_file = "research.txt"

    def run(self, unit_code: str) -> dict:
        return self.invoke({"unit_code": unit_code})

    def invoke(self, input_data: dict, context: dict = None) -> dict:
        unit_code = input_data.get("unit_code", "")
        user_msg = f"教研单元：{unit_code}\n请汇总该单元共性错题，生成重难点分析、同课异构教学设计和教研组研讨议题。"
        raw = self._call_llm(user_msg)
        result = self._parse_json(raw)
        result["scenario"] = "研·教研备课"
        result["unit_code"] = unit_code
        return result

    def _mock_response(self, user_message: str) -> str:
        return json.dumps({
            "scenario": "研·教研备课",
            "output": {
                "difficulty_analysis": {
                    "title": "单元教学重难点分析",
                    "unit": "第三单元 小数除法",
                    "key_points": [
                        {"point": "商的小数点要和被除数的小数点对齐", "difficulty": "中", "error_rate": "35%"},
                        {"point": "除数是小数时转化为除数是整数", "difficulty": "高", "error_rate": "52%"}
                    ],
                    "root_cause": "学生对'商不变性质'在小数除法中的迁移应用不足"
                },
                "lesson_variants": {
                    "title": "同课异构教学设计",
                    "plan_a": {
                        "name": "情境驱动法",
                        "approach": "从购物找零情境引入，让学生在实际问题中发现转化规律",
                        "suitable_for": "中等及以上班级"
                    },
                    "plan_b": {
                        "name": "知识迁移法",
                        "approach": "先复习整数除法，逐步引入小数点移动，搭建脚手架",
                        "suitable_for": "基础薄弱班级"
                    }
                },
                "discussion_topics": {
                    "title": "教研组研讨议题",
                    "topics": [
                        "如何帮助学生理解'除数变整数'背后的数学本质，而非机械操作？",
                        "循环小数与有限小数的判断，是否有更直观的教学方法？",
                        "错题数据显示52%学生在'除数转整数'出错，是否需要增加专项练习课时？"
                    ]
                }
            }
        }, ensure_ascii=False)
