"""评·学情评价 Agent - OCR拍照批改 + 学情报告"""

import json
import os
from datetime import datetime
from agents.base import BaseAgent
from database import get_db
from config import UPLOAD_DIR


class EvaluateAgent(BaseAgent):
    scenario = "evaluate"
    prompt_file = "evaluate.txt"

    def run(self, image_bytes: bytes, filename: str) -> dict:
        # 保存图片
        safe_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"
        img_path = UPLOAD_DIR / safe_name
        img_path.write_bytes(image_bytes)

        # TODO: 对接百度OCR识别手写内容
        # 目前用Mock数据
        return self._mock_grade_result()

    def get_class_report(self, class_id: int) -> dict:
        """班级学情报告"""
        with get_db() as db:
            students = db.execute(
                "SELECT * FROM users WHERE role='student' AND class_id=? ORDER BY points DESC",
                (class_id,),
            ).fetchall()

            answers = db.execute(
                "SELECT sa.*, q.unit_code FROM student_answers sa JOIN questions q ON sa.question_id=q.id"
            ).fetchall()

            total = len(students)
            excellent = len([s for s in students if s["points"] >= 800])
            medium = len([s for s in students if 500 <= s["points"] < 800])
            struggling = len([s for s in students if s["points"] < 500])

            avg_points = sum(s["points"] for s in students) / total if total else 0

            return {
                "class_id": class_id,
                "total_students": total,
                "avg_points": round(avg_points, 1),
                "distribution": {
                    "excellent": {"count": excellent, "range": "800+", "label": "优等生"},
                    "medium": {"count": medium, "range": "500-799", "label": "中等生"},
                    "struggling": {"count": struggling, "range": "<500", "label": "学困生"},
                },
                "common_errors": [
                    {"error": "小数点位置错误", "count": 18, "rate": "45%"},
                    {"error": "循环小数判断错误", "count": 8, "rate": "20%"},
                    {"error": "方程移项符号错误", "count": 6, "rate": "15%"},
                ],
                "weak_units": ["第三单元 小数除法", "第五单元 简易方程"],
            }

    def get_student_report(self, student_id: int) -> dict:
        """单人学情报告"""
        with get_db() as db:
            student = db.execute("SELECT * FROM users WHERE id=?", (student_id,)).fetchone()
            if not student:
                return {"error": "学生不存在"}

            rank_query = db.execute(
                "SELECT COUNT(*)+1 as rank FROM users WHERE role='student' AND points > ?",
                (student["points"],),
            ).fetchone()

            return {
                "student": dict(student),
                "rank": rank_query["rank"],
                "shortcomings": [
                    {"knowledge": "小数乘法-小数点定位", "level": "薄弱", "suggested_action": "进入【学】场景补救"},
                    {"knowledge": "简易方程-解方程", "level": "一般", "suggested_action": "加强基础练习"},
                ],
                "recent_answers": [],
            }

    def invoke(self, input_data: dict, context: dict = None) -> dict:
        return {"message": "请通过 /api/teacher/grade 上传图片进行批改"}

    def _mock_grade_result(self) -> dict:
        return {
            "scenario": "评·学情评价",
            "grading": {
                "title": "逐题批改结果",
                "questions": [
                    {
                        "q_num": 1,
                        "student_answer": "10.5",
                        "correct_answer": "10.5",
                        "is_correct": True,
                        "score": 5,
                        "full_score": 5,
                    },
                    {
                        "q_num": 2,
                        "student_answer": "0.1",
                        "correct_answer": "1",
                        "is_correct": False,
                        "score": 0,
                        "full_score": 5,
                        "error_reason": "小数点位置错误：0.25x4应先算25x4=100，再数两位小数得1.00=1",
                        "knowledge_gap": "小数乘法-小数点定位",
                    },
                    {
                        "q_num": 3,
                        "student_answer": "A",
                        "correct_answer": "A",
                        "is_correct": True,
                        "score": 5,
                        "full_score": 5,
                    },
                ],
                "total_score": 10,
                "full_score": 15,
                "accuracy": "66.7%",
            },
            "auto_action": {
                "triggered_agent": "学·自主学习",
                "message": "检测到错题，已自动创建错题记录并触发了自主学习引导",
            },
        }

    def _mock_response(self, user_message: str) -> str:
        return json.dumps(self._mock_grade_result(), ensure_ascii=False)
