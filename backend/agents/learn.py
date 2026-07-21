"""学·自主学习 Agent - 核心约束：禁止直接给答案"""

import json
from agents.base import BaseAgent


class LearnAgent(BaseAgent):
    scenario = "learn"
    prompt_file = "learn.txt"

    def run(self, student_id: int, topic: str, error_type: str = None) -> dict:
        return self.invoke({
            "student_id": student_id,
            "topic": topic,
            "error_type": error_type,
        })

    def invoke(self, input_data: dict, context: dict = None) -> dict:
        topic = input_data.get("topic", "")
        error_type = input_data.get("error_type", "")
        user_msg = f"学生薄弱知识点：{topic}\n错误类型：{error_type}\n请按分步引导格式输出，注意：禁止直接给答案！"
        raw = self._call_llm(user_msg)
        result = self._parse_json(raw)
        result["scenario"] = "学·自主学习"
        result["student_topic"] = topic
        return result

    def _mock_response(self, user_message: str) -> str:
        return json.dumps({
            "scenario": "学·自主学习",
            "output": {
                "step1_diagnose": {
                    "title": "知识漏洞定位",
                    "analysis": "看起来你在小数点位置上遇到了困难，我们一起来找找原因...",
                    "question": "先想想：25乘4等于多少？那0.25和25之间差了多少倍呢？",
                    "note": "不给答案，引导学生自己推导"
                },
                "step2_ladder": {
                    "title": "阶梯习题（逐层解锁）",
                    "level1_basic": "25 x 4 = ? （整数乘法复习）",
                    "level2_transition": "2.5 x 4 = ? （一位小数）",
                    "level3_target": "0.25 x 4 = ? （两位小数）",
                    "note": "每层完成后才解锁下一层"
                },
                "step3_guide": {
                    "title": "追问引导",
                    "questions": [
                        "观察上面三道题，因数的小数位数和积的小数位数有什么关系？",
                        "0.25有几位小数？那积应该有几位小数？",
                        "你再算一次试试看？"
                    ]
                },
                "step4_knowledge_map": {
                    "title": "个人知识图谱更新",
                    "mastered": ["整数乘法", "一位小数乘法"],
                    "weak": ["两位小数乘法-小数点定位"],
                    "recommended_next": "巩固两位小数乘法后，进入小数乘小数"
                }
            },
            "protection": {
                "answer_blocked": True,
                "message": "已拦截直接答案输出，使用追问引导"
            }
        }, ensure_ascii=False)
