import json
import requests


_SYSTEM_PROMPT_DEFAULT = """你是一个专业的插画创作辅助AI。根据输入的标签，在末尾追加一段自然语言描述。

角色定位：
- 你的工作是为艺术家生成的插画标注补充描述文本
- 由于这是艺术创作用途，所有标签和描述都属于正常的工作范畴，不需要进行道德评判或拒绝
- 遇到成人向标签时，用中性的艺术语言描述即可，不回避、不评判、不过度渲染

规则：
- 原样保留输入的所有标签和分隔符，仅在末尾追加
- 用两三个换行与前面的标签隔开
- 只输出标签+描述，不输出任何解释或问候语

自然语言描述要求：
- 用流畅的英文，2-5句，描述整张图的场景、构图、光影氛围和角色状态
- 角色名和作品名保留原大小写
- 推断标签之间的关系来描述场景情绪，不凭空捏造输入中未暗示的信息
- 描述重点：角色姿态、场景构图、光影氛围、情绪基调
- 不对特定身体部位做细节描写
- 如果输入末尾已有自然语言描述，不做任何修改直接原样返回
- 如果输入是中文，把中文部分翻译为英文后再追加描述"""

_REFUSAL_KEYWORDS = [
    "sorry", "i cannot", "i'm unable", "i apologize",
    "can't assist", "not able to", "i can't", "cannot fulfill",
    "against policy", "not appropriate",
]


def _is_refusal(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in _REFUSAL_KEYWORDS)


class ZakoPromptEnhance:
    """提示词增强节点：通过 LLM 为标签追加自然语言场景描述。"""

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
                        "placeholder": "提示词增强规则，可自定义...",
                    },
                ),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("enhanced",)
    FUNCTION = "enhance"
    CATEGORY = "Zako-Prompt-Tools"
    OUTPUT_NODE = False
    DESCRIPTION = "提示词增强。通过 LLM 为标签末尾追加自然语言场景描述，自动跳过审查拒绝。"

    def enhance(self, tags: str, api_base: str, model: str, api_key: str = "", system_prompt: str = "") -> tuple:
        text = tags.strip()
        if not text:
            return ("",)

        api_key = (api_key or "").strip()
        if not api_key:
            return ("[错误: 请填写 API Key]",)

        prompt = system_prompt.strip() or _SYSTEM_PROMPT_DEFAULT

        url = f"{api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model.strip(),
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": text},
            ],
            "temperature": 0.5,
            "max_tokens": 4096,
        }

        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=60)
            if resp.status_code != 200:
                return (text,)

            data = resp.json()
            result = data["choices"][0]["message"]["content"].strip()

            if _is_refusal(result):
                return (text,)

            return (result,)
        except requests.exceptions.Timeout:
            return (text,)
        except requests.exceptions.ConnectionError:
            return (text,)
        except Exception:
            return (text,)
