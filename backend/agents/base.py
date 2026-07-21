"""Agent基类 - 所有场景Agent的公共方法"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")

from config import MOCK_MODE, ZHIPU_API_KEY, ZHIPU_API_URL, ZHIPU_MODEL, PROMPTS_DIR


class BaseAgent:
    """七大场景Agent的基类"""

    scenario = "base"
    prompt_file = "system.txt"

    def __init__(self):
        self.system_prompt = self._load_prompt("system.txt")
        self.scenario_prompt = self._load_prompt(self.prompt_file)

    def _load_prompt(self, filename: str) -> str:
        filepath = PROMPTS_DIR / filename
        if filepath.exists():
            return filepath.read_text(encoding="utf-8")
        return ""

    def _call_llm(self, user_message: str) -> str:
        """调用智谱GLM-4 API"""
        if MOCK_MODE:
            return self._mock_response(user_message)

        import httpx

        headers = {
            "Authorization": f"Bearer {ZHIPU_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": ZHIPU_MODEL,
            "messages": [
                {"role": "system", "content": self.system_prompt + "\n\n" + self.scenario_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.7,
            "max_tokens": 4096,
        }

        try:
            with httpx.Client(timeout=60.0) as client:
                resp = client.post(ZHIPU_API_URL, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"LLM调用失败: {e}, 使用Mock数据")
            return self._mock_response(user_message)

    def _parse_json(self, text: str) -> dict:
        """从LLM返回文本中解析JSON"""
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"raw_output": text, "parse_error": True}

    def _mock_response(self, user_message: str) -> str:
        """Mock模式 - 子类实现"""
        return '{"message": "Mock模式 - 请配置API Key"}'

    def invoke(self, input_data: dict, context: dict = None) -> dict:
        """统一调用入口 - 子类实现"""
        raise NotImplementedError

    def run(self, *args, **kwargs) -> dict:
        """便捷调用方法 - 子类实现"""
        raise NotImplementedError
