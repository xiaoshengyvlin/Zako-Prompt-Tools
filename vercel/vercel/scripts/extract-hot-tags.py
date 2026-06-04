"""Extract high-frequency tags from tag.sqlite into hot-tags.json."""

import sqlite3
import json
import sys
from pathlib import Path

THRESHOLD = 100  # post_count >= this goes into hot JSON

def main():
    src = Path(__file__).resolve().parent.parent / "mapping" / "tag.sqlite"
    dst = Path(__file__).resolve().parent.parent / "mapping" / "hot-tags.json"

    conn = sqlite3.connect(str(src))
    cur = conn.cursor()

    cur.execute(
        "SELECT name, cn_name, post_count FROM tags WHERE post_count >= ? ORDER BY post_count DESC",
        (THRESHOLD,),
    )
    rows = cur.fetchall()
    conn.close()

    list_all = []
    for name, cn_name, post_count in rows:
        list_all.append({"en": name, "cn": cn_name, "c": post_count})

    output = {"threshold": THRESHOLD, "count": len(list_all), "list": list_all}

    dst.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size_kb = dst.stat().st_size / 1024
    print(f"Hot tags: {len(list_all)} entries, {size_kb:.0f} KB → {dst}")

if __name__ == "__main__":
    main()
