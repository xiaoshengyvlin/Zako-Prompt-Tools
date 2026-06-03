class ZakoDanbooruSearch:
    """D站灵感搜索：点击搜索 → 弹窗内输入标签 → 返回点赞最高缩略图 → 点击填入提示词。

    api_key  → (可选) D站 API Key，格式 username:api_key
    tag_mode → 输出筛选：全部 / 不含画师 / anima画师（元数据始终排除）
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "tag_mode": (
                    ["全部", "不含画师", "anima画师"],
                    {"default": "不含画师"},
                ),
                "selected_tags": (
                    "STRING",
                    {"default": "", "multiline": False},
                ),
            },
            "optional": {
                "api_key": (
                    "STRING",
                    {"default": "", "multiline": False, "placeholder": "username:api_key (可选)"},
                ),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "get_prompt"
    CATEGORY = "Zako-Prompt-Tools"
    OUTPUT_NODE = False
    DESCRIPTION = "D站灵感搜索。弹窗内输入标签搜索，支持中文→英文翻译，tag筛选(全部/不含画师/anima画师)，API Key可选。"

    def get_prompt(self, tag_mode: str = "不含画师", selected_tags: str = "", api_key: str = "") -> tuple:
        if not selected_tags.strip():
            return ("[请先搜索并点击选择一张图]",)

        return (selected_tags.strip(),)