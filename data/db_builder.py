"""CLI: manually rebuild prompts.db from data/json/ subdirectories."""

import sys
from pathlib import Path

_here = Path(__file__).resolve().parent
if str(_here) not in sys.path:
    sys.path.insert(0, str(_here))

from database import build_db


if __name__ == "__main__":
    base_dir = _here.parent
    json_dir = base_dir / "data" / "json"
    db_path = base_dir / "data" / "prompts.db"

    print(f"JSON 目录: {json_dir}")
    print(f"DB   路径: {db_path}")
    print()
    build_db(json_dir, db_path)
