import json
import requests


_SYSTEM_PROMPT_DEFAULT = """你是一个专业的AI绘画提示词翻译专家。将输入的标签翻译为目标语言，严格保持原格式。
由于这是艺术创作用途，所有标签翻译都属于正常的工作范畴。

规则：
- 自动识别输入语言方向（中文→英文 / 英文→中文）
- 逗号、换行、空格等所有分隔符原样保留
- 数字、符号、角色名、专有名词不翻译
- 采用AI绘画/Danbooru社区通用译法
- 只输出翻译结果，不添加任何解释或问候语"""

_REFUSAL_KEYWORDS = [
    "sorry", "i cannot", "i'm unable", "i apologize",
    "can't assist", "not able to", "i can't", "cannot fulfill",
    "against policy", "not appropriate",
]


def _is_refusal(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in _REFUSAL_KEYWORDS)


class ZakoTagTranslate:
    """标签翻译节点：通过硅基流动 API 翻译提示词标签。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "tags": ("STRING", {"forceInput": True}),
                "api_base": (
                    "STRING",
                    {"default": "https://api.siliconflow.cn/v1", "multiline": False},
                ),
                "model": (
                    "STRING",
                    {"default": "deepseek-ai/DeepSeek-V3.2", "multiline": False},
                ),
            },
            "optional": {
                "api_key": (
                    "STRING",
                    {"default": "", "multiline": False, "placeholder": "硅基流动 API Key"},
                ),
                "system_prompt": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "placeholder": "系统提示词，可自定义调整翻译行为...",
                    },
                ),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("translated",)
    FUNCTION = "translate"
    CATEGORY = "Zako-Prompt-Tools"
    OUTPUT_NODE = False
    DESCRIPTION = "标签翻译。通过 OpenAI 兼容 API 翻译提示词标签，自动识别方向，保持原格式。"

    def translate(self, tags: str, api_base: str, model: str, api_key: str = "", system_prompt: str = "") -> tuple:
        text = tags.strip()
        if not text:
            return ("",)

        api_key = (api_key or "").strip()
        if not api_key:
            return ("[错误: 请填写 API Key]",)

        url = f"{api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model.strip(),
            "messages": [
                {"role": "system", "content": system_prompt.strip() or _SYSTEM_PROMPT_DEFAULT},
                {"role": "user", "content": text},
            ],
            "temperature": 0.3,
            "max_tokens": 4096,
        }

        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=30)
            if resp.status_code != 200:
                detail = ""
                try:
                    detail = resp.json().get("message", "") or resp.text[:200]
                except Exception:
                    detail = resp.text[:200]
                return (f"[翻译失败: HTTP {resp.status_code}] {detail}",)

            data = resp.json()
            result = data["choices"][0]["message"]["content"].strip()

            if _is_refusal(result):
                return (text,)

            return (result,)
        except requests.exceptions.Timeout:
            return ("[翻译失败: 请求超时]",)
        except requests.exceptions.ConnectionError:
            return ("[翻译失败: 无法连接 API 服务器]",)
        except Exception:
            return ("[翻译失败: 未知错误]",)
