"""建·资源建设 Agent"""

import json
from agents.base import BaseAgent
from database import get_db


class BuildAgent(BaseAgent):
    scenario = "build"
    prompt_file = "build.txt"

    def run(self, unit_code: str) -> dict:
        return self.invoke({"unit_code": unit_code})

    def invoke(self, input_data: dict, context: dict = None) -> dict:
        unit_code = input_data.get("unit_code", "")

        with get_db() as db:
            questions = db.execute(
                "SELECT * FROM questions WHERE unit_code LIKE ? ORDER BY difficulty",
                (unit_code + "%",),
            ).fetchall()

        q_list = [dict(q) for q in questions]
        basic = [q for q in q_list if q.get("difficulty") == "basic"]
        advanced = [q for q in q_list if q.get("difficulty") == "advanced"]
        extension = [q for q in q_list if q.get("difficulty") == "extension"]

        user_msg = f"单元：{unit_code}\n题目数量：基础{len(basic)}题，提升{len(advanced)}题，拓展{len(extension)}题\n请生成结构化校本资源文档。"
        raw = self._call_llm(user_msg)
        result = self._parse_json(raw)
        result["scenario"] = "建·资源建设"
        result["statistics"] = {
            "basic_count": len(basic),
            "advanced_count": len(advanced),
            "extension_count": len(extension),
            "total": len(q_list),
        }
        return result

    def _mock_response(self, user_message: str) -> str:
        return json.dumps({
            "scenario": "建·资源建设",
            "output": {
                "resource_doc": {
                    "title": "五年级数学校本资源库 - 第一单元",
                    "sections": {
                        "exercise_bank": {
                            "title": "单元习题库",
                            "categories": {
                                "basic": {"count": 4, "range": "基础计算题"},
                                "applied": {"count": 3, "range": "应用题"},
                                "challenge": {"count": 3, "range": "拓展思维题"}
                            }
                        },
                        "lesson_plans": {
                            "title": "优秀教案存档",
                            "plans": [
                                {"name": "小数乘法-情境驱动法", "author": "王老师", "rating": "推荐"},
                                {"name": "小数乘法-知识迁移法", "author": "李老师", "rating": "推荐"}
                            ]
                        },
                        "error_cases": {
                            "title": "典型错题案例库",
                            "cases": [
                                {
                                    "error": "0.25x4=0.1（小数点位置错）",
                                    "correct": "0.25x4=1",
                                    "analysis": "未正确数因数小数位数",
                                    "remediation": "加强小数位数确定专项练习",
                                    "frequency": "高频（45%）"
                                }
                            ]
                        },
                        "export_format": "支持导出为Word/PDF，方便教研组共享"
                    }
                }
            }
        }, ensure_ascii=False)
