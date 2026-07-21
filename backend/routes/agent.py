"""Agent统一调用路由"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, Dict, Any
from agents.teach import TeachAgent
from agents.learn import LearnAgent
from agents.evaluate import EvaluateAgent
from agents.research import ResearchAgent
from agents.manage import ManageAgent
from agents.cultivate import CultivateAgent
from agents.build import BuildAgent

router = APIRouter()

SCENARIO_MAP = {
    "teach": TeachAgent,
    "learn": LearnAgent,
    "evaluate": EvaluateAgent,
    "research": ResearchAgent,
    "manage": ManageAgent,
    "cultivate": CultivateAgent,
    "build": BuildAgent,
}


class AgentRequest(BaseModel):
    scenario: str
    input: Dict[str, Any] = {}
    context: Dict[str, Any] = {}


@router.post("/invoke")
def invoke(req: AgentRequest):
    """统一Agent调用入口"""
    scenario_names = {
        "teach": "教·课堂教学",
        "learn": "学·自主学习",
        "evaluate": "评·学情评价",
        "research": "研·教研备课",
        "manage": "管·班级管理",
        "cultivate": "育·素养培育",
        "build": "建·资源建设",
    }
    if req.scenario not in SCENARIO_MAP:
        return {"error": f"未知场景: {req.scenario}", "available": list(SCENARIO_MAP.keys())}

    agent = SCENARIO_MAP[req.scenario]()
    result = agent.invoke(req.input, req.context)
    result["scenario_name"] = scenario_names.get(req.scenario, req.scenario)
    return result


@router.get("/scenarios")
def scenarios():
    """列出所有可用场景"""
    return {
        "scenarios": [
            {"code": "teach", "name": "教·课堂教学", "input": "教学课题"},
            {"code": "learn", "name": "学·自主学习", "input": "错题/薄弱知识点"},
            {"code": "evaluate", "name": "评·学情评价", "input": "试卷/作业照片"},
            {"code": "research", "name": "研·教研备课", "input": "班级共性错题汇总"},
            {"code": "manage", "name": "管·班级管理", "input": "全班学情数据"},
            {"code": "cultivate", "name": "育·素养培育", "input": "单元知识点"},
            {"code": "build", "name": "建·资源建设", "input": "习题/教案/错题案例"},
        ]
    }
