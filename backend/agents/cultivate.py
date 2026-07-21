"""育·素养培育 Agent"""

import json
from agents.base import BaseAgent


class CultivateAgent(BaseAgent):
    scenario = "cultivate"
    prompt_file = "cultivate.txt"

    def run(self, unit_code: str) -> dict:
        return self.invoke({"unit_code": unit_code})

    def invoke(self, input_data: dict, context: dict = None) -> dict:
        unit_code = input_data.get("unit_code", "")
        user_msg = f"单元知识点：{unit_code}\n请围绕该单元设计生活化数学劳动实践活动，实现五育融合。"
        raw = self._call_llm(user_msg)
        result = self._parse_json(raw)
        result["scenario"] = "育·素养培育"
        result["unit_code"] = unit_code
        return result

    def _mock_response(self, user_message: str) -> str:
        return json.dumps({
            "scenario": "育·素养培育",
            "output": {
                "activity": {
                    "title": "校园花坛设计师",
                    "knowledge_link": "平行四边形/三角形/梯形面积计算",
                    "five_dimensions": {
                        "德育": "了解校园美化的重要性，培养责任感",
                        "智育": "运用面积公式解决实际测量问题",
                        "体育": "实地测量花坛尺寸（体力活动）",
                        "美育": "设计花坛造型和花卉布局方案",
                        "劳动": "参与花坛种植劳动实践"
                    },
                    "task_steps": [
                        "分组实地测量校园中3个花坛的底和高",
                        "计算每个花坛的面积，记录数据",
                        "设计一个面积为6平方米的新花坛方案（自选形状）",
                        "估算所需花卉数量，制作预算表",
                        "小组展示设计方案，全班评选最佳设计"
                    ],
                    "materials": "卷尺、方格纸、计算器、彩色笔",
                    "assessment": {
                        "knowledge": "面积计算准确度（40%）",
                        "creativity": "设计方案的创意性（30%）",
                        "practice": "测量和劳动的参与度（30%）"
                    }
                }
            }
        }, ensure_ascii=False)
