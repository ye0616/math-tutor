"""管·班级管理 Agent"""

import json
from agents.base import BaseAgent
from database import get_db


class ManageAgent(BaseAgent):
    scenario = "manage"
    prompt_file = "manage.txt"

    def run(self, class_id: int) -> dict:
        return self.invoke({"class_id": class_id})

    def invoke(self, input_data: dict, context: dict = None) -> dict:
        class_id = input_data.get("class_id", 1)
        with get_db() as db:
            students = db.execute(
                "SELECT * FROM users WHERE role='student' AND class_id=? ORDER BY points DESC",
                (class_id,),
            ).fetchall()
            student_list = [dict(s) for s in students]
            total = len(student_list)

        if total == 0:
            return {
                "scenario": "管·班级管理",
                "stratification": {
                    "excellent": {"count": 0, "range": "-", "students": []},
                    "medium": {"count": 0, "range": "-", "students": []},
                    "struggling": {"count": 0, "range": "-", "students": []},
                },
                "output": {
                    "weekly_plan": {
                        "title": "培优补差周辅导方案",
                        "excellent_plan": {"target": "优等生", "focus": "-", "content": "暂无学生数据，请先导入学生名单", "time": "-"},
                        "medium_plan": {"target": "中等生", "focus": "-", "content": "-", "time": "-"},
                        "struggling_plan": {"target": "学困生", "focus": "-", "content": "-", "time": "-"},
                    }
                },
            }

        # 动态分层：按比例划分（前30%优等，中间40%中等，后30%学困）
        excellent_count = max(1, int(total * 0.3))
        struggling_count = max(1, int(total * 0.3))
        medium_count = total - excellent_count - struggling_count
        if medium_count < 0:
            # 学生太少时均分
            excellent_count = total // 3 if total >= 3 else (total if total == 1 else 1)
            medium_count = (total - excellent_count) // 2 if total >= 2 else 0
            struggling_count = total - excellent_count - medium_count

        excellent = student_list[:excellent_count]
        medium = student_list[excellent_count:excellent_count + medium_count]
        struggling = student_list[excellent_count + medium_count:]

        # 计算实际分数区间
        all_points = [s["points"] for s in student_list]
        excellent_points = [s["points"] for s in excellent] if excellent else [0]
        medium_points = [s["points"] for s in medium] if medium else [0]
        struggling_points = [s["points"] for s in struggling] if struggling else [0]

        excellent_range = f"{min(excellent_points)}-{max(excellent_points)}分" if excellent else "-"
        medium_range = f"{min(medium_points)}-{max(medium_points)}分" if medium else "-"
        struggling_range = f"{min(struggling_points)}-{max(struggling_points)}分" if struggling else "-"

        # 按人教版五年级知识点生成提示
        excellent_names = [s["name"] for s in excellent[:5]]
        medium_names = [s["name"] for s in medium[:5]]
        struggling_names = [s["name"] for s in struggling[:5]]

        user_msg = (
            f"全班{total}人学情数据：优等生{len(excellent)}人（{excellent_range}），"
            f"中等生{len(medium)}人（{medium_range}），学困生{len(struggling)}人（{struggling_range}）。"
            f"请基于人教版小学数学五年级知识点生成培优补差周辅导方案。"
        )
        raw = self._call_llm(user_msg)
        result = self._parse_json(raw)
        result["scenario"] = "管·班级管理"
        result["stratification"] = {
            "excellent": {"count": len(excellent), "range": excellent_range, "students": excellent_names},
            "medium": {"count": len(medium), "range": medium_range, "students": medium_names},
            "struggling": {"count": len(struggling), "range": struggling_range, "students": struggling_names},
        }
        return result

    def _mock_response(self, user_message: str) -> str:
        return json.dumps({
            "scenario": "管·班级管理",
            "output": {
                "weekly_plan": {
                    "title": "培优补差周辅导方案（可直接打印）",
                    "excellent_plan": {
                        "target": "优等生",
                        "focus": "拓展思维题/数学竞赛题",
                        "content": "五上第六单元组合图形面积挑战题5道",
                        "time": "周五午自习 20分钟"
                    },
                    "medium_plan": {
                        "target": "中等生",
                        "focus": "易错题巩固+方法归纳",
                        "content": "小数乘除法易错题专项练习10道",
                        "time": "周二/四午自习 各15分钟"
                    },
                    "struggling_plan": {
                        "target": "学困生",
                        "focus": "基础知识重建+一对一辅导",
                        "content": "小数乘法竖式计算基础练习8道（教师当面批改）",
                        "time": "每日课间 10分钟 x 5天"
                    }
                }
            }
        }, ensure_ascii=False)
