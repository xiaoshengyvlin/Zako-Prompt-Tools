"""Shared database module: build and auto-detect prompts.db from data/json/."""

import os
import sqlite3
import json
import time
from pathlib import Path


VALID_RATINGS = {"G", "S", "Q", "E"}
BUILD_STATE_FILE = ".build_state.json"


def _acquire_lock(lock_path: str, timeout: float = 30) -> bool:
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
            os.close(fd)
            return True
        except FileExistsError:
            time.sleep(0.05)
    return False


def _release_lock(lock_path: str):
    try:
        os.remove(lock_path)
    except OSError:
        pass


def _parse_large_json_string(content: str) -> dict:
    """Line-by-line fallback parser. Format per line: "key": "value", """
    results = {}
    for line in content.splitlines():
        line = line.strip()
        if not line or line in ("{", "}"):
            continue
        if line.endswith(","):
            line = line[:-1]
        inner = line[1:]
        if '": ' in inner:
            key, value = inner.split('": ', 1)
        elif '":"' in inner:
            key, value = inner.split('":"', 1)
        else:
            continue
        if value.startswith('"'):
            value = value[1:]
        if value.endswith('"'):
            value = value[:-1]
        if key and value:
            results[key] = value
    return results


def _gather_files(json_dir: Path) -> list[tuple[str, str, Path]]:
    """Return [(rating, topic, filepath), ...]. Topic from filename stem, rating from parent folder."""
    if not json_dir.exists():
        return []
    result = []
    for sub in sorted(json_dir.iterdir()):
        if sub.is_dir() and sub.name.upper() in VALID_RATINGS:
            rating = sub.name.upper()
            for jf in sorted(sub.glob("*.json")):
                topic = jf.stem
                if topic:
                    result.append((rating, topic, jf))
    for jf in sorted(json_dir.glob("*.json")):
        stem = jf.stem.upper()
        if stem in VALID_RATINGS:
            result.append((stem, stem, jf))
    return result


def _snapshot(json_dir: Path) -> dict:
    """Return {filepath: [rating, topic, size, mtime]} for all JSON source files."""
    state = {}
    for rating, topic, jf in _gather_files(json_dir):
        st = jf.stat()
        state[str(jf.resolve())] = [rating, topic, st.st_size, int(st.st_mtime)]
    return state


def _needs_rebuild(json_dir: Path, db_path: Path) -> bool:
    if not db_path.exists():
        return True

    current = _snapshot(json_dir)
    if not current:
        return False

    state_file = db_path.parent / BUILD_STATE_FILE
    if not state_file.exists():
        return True

    try:
        previous = json.loads(state_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return True

    if set(current.keys()) != set(previous.keys()):
        return True

    for path, info in current.items():
        prev = previous.get(path)
        if prev != info:
            return True

    return False


def _save_state(json_dir: Path, db_path: Path):
    state = _snapshot(json_dir)
    state_file = db_path.parent / BUILD_STATE_FILE
    state_file.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def build_db(json_dir: Path, db_path: Path, batch_size: int = 10000) -> dict:
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=OFF")
    cursor = conn.cursor()

    cursor.execute("DROP TABLE IF EXISTS prompts")
    cursor.execute(
        "CREATE TABLE prompts ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "tag_text TEXT NOT NULL, "
        "post_id TEXT NOT NULL, "
        "rating TEXT NOT NULL DEFAULT 'E', "
        "topic TEXT NOT NULL DEFAULT ''"
        ")"
    )

    files = _gather_files(json_dir)
    stats = {}
    batch = []

    for rating, topic, jf in files:
        size_mb = jf.stat().st_size / 1024 / 1024
        print(f"[{rating}] {topic}/{jf.name} ({size_mb:.1f} MB)...", end=" ")

        try:
            with open(jf, "r", encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError:
            print("(line-by-line)")
            with open(jf, "r", encoding="utf-8") as f:
                data = _parse_large_json_string(f.read())

        count = 0
        for tag_text, post_id in data.items():
            tag_text = tag_text.strip()
            if not tag_text:
                continue
            batch.append((tag_text, str(post_id), rating, topic))
            count += 1
            if len(batch) >= batch_size:
                cursor.executemany(
                    "INSERT OR IGNORE INTO prompts (tag_text, post_id, rating, topic) VALUES (?, ?, ?, ?)",
                    batch,
                )
                batch = []

        if batch:
            cursor.executemany(
                "INSERT OR IGNORE INTO prompts (tag_text, post_id, rating, topic) VALUES (?, ?, ?, ?)",
                batch,
            )
            batch = []

        stats[rating] = stats.get(rating, 0) + count
        print(f"{count} entries")

    conn.commit()
    cursor.execute("SELECT COUNT(*) FROM prompts")
    db_total = cursor.fetchone()[0]
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_prompts_rating ON prompts(rating)")
    conn.commit()
    cursor.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.close()

    _save_state(json_dir, db_path)

    stats["_total"] = db_total
    stats["_size_mb"] = round(db_path.stat().st_size / 1024 / 1024, 1)
    return stats


def ensure_db(json_dir: Path, db_path: Path) -> bool:
    """Auto-build prompts.db if missing or source files changed. Returns True if built."""
    if not _needs_rebuild(json_dir, db_path):
        return False

    lock_path = str(db_path) + ".lock"
    if not _acquire_lock(lock_path):
        print("[Zako] WARNING: Could not acquire build lock, skipping rebuild")
        return False

    try:
        if not _needs_rebuild(json_dir, db_path):
            return False
        print("[Zako] Building prompts database...")
        stats = build_db(json_dir, db_path)
        print(
            f"[Zako] DB ready: G={stats.get('G', 0)} S={stats.get('S', 0)} "
            f"Q={stats.get('Q', 0)} E={stats.get('E', 0)} "
            f"total={stats['_total']} ({stats['_size_mb']} MB)"
        )
        return True
    finally:
        _release_lock(lock_path)
