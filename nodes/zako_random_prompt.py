import sqlite3
from pathlib import Path

try:
    from ..data.database import ensure_db
except ImportError:
    import sys

    _proj = Path(__file__).resolve().parent.parent
    if str(_proj) not in sys.path:
        sys.path.insert(0, str(_proj))
    from data.database import ensure_db


class ZakoRandomPrompt:
    """从本地 SQLite 提示词库随机抽卡，支持分级过滤和主题选择。

    enable_random = True  → 每次执行重新抽卡，更新缓存
    enable_random = False → 不抽新卡，输出上次抽到的结果
    """

    @classmethod
    def _get_json_dir(cls) -> Path:
        return Path(__file__).resolve().parent.parent / "data" / "json"

    @classmethod
    def _get_db_path(cls) -> Path:
        return Path(__file__).resolve().parent.parent / "data" / "prompts.db"

    @classmethod
    def _scan_topics(cls) -> list[str]:
        json_dir = cls._get_json_dir()
        if not json_dir.exists():
            return ["全部"]
        topics: set[str] = set()
        for sub in json_dir.iterdir():
            if sub.is_dir() and sub.name.upper() in ("G", "S", "Q", "E"):
                for jf in sub.glob("*.json"):
                    if jf.stem:
                        topics.add(jf.stem)
        return ["全部"] + sorted(topics)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "enable_random": (
                    "BOOLEAN",
                    {"default": True, "label_on": "抽取", "label_off": "固定"},
                ),
                "主题": (cls._scan_topics(), {"default": "全部"}),
            },
            "optional": {
                "普通": ("BOOLEAN", {"default": True, "label_on": "G", "label_off": "G"}),
                "敏感": ("BOOLEAN", {"default": True, "label_on": "S", "label_off": "S"}),
                "可疑": ("BOOLEAN", {"default": True, "label_on": "Q", "label_off": "Q"}),
                "露骨": ("BOOLEAN", {"default": True, "label_on": "E", "label_off": "E"}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "get_prompt"
    CATEGORY = "Zako-Prompt-Tools"
    OUTPUT_NODE = False
    DESCRIPTION = "从内置提示词库随机抽卡。支持 G/S/Q/E 分级过滤 + 主题选择，开启=每次刷新，关闭=锁定上次结果。"

    @classmethod
    def IS_CHANGED(cls, enable_random, **kwargs):
        if not enable_random:
            return 0
        return float("nan")

    def get_prompt(
        self,
        enable_random: bool,
        主题: str = "全部",
        普通: bool = True,
        敏感: bool = True,
        可疑: bool = True,
        露骨: bool = True,
    ) -> tuple:
        if not enable_random:
            last = getattr(self, "_last_prompt", None)
            if last is not None:
                return (last,)
            return ("[未抽过卡，请先开启随机]",)

        ratings: list[str] = []
        if 普通:
            ratings.append("G")
        if 敏感:
            ratings.append("S")
        if 可疑:
            ratings.append("Q")
        if 露骨:
            ratings.append("E")

        if not ratings:
            return ("[ERROR: 至少勾选一个分级]",)

        db_path = self._get_db_path()
        json_dir = db_path.parent / "json"
        ensure_db(json_dir, db_path)

        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        conditions = [f"rating IN ({','.join('?' * len(ratings))})"]
        params: list[str] = list(ratings)

        if 主题 and 主题 != "全部":
            conditions.append("topic = ?")
            params.append(主题)

        where = " AND ".join(conditions)
        cursor.execute(
            f"SELECT tag_text FROM prompts WHERE {where} ORDER BY RANDOM() LIMIT 1",
            params,
        )

        row = cursor.fetchone()
        conn.close()

        if row is None:
            return ("[ERROR: 所选条件下无数据]",)

        self._last_prompt = row[0]
        return (row[0],)
