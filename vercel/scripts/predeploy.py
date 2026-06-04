"""Pre-deploy: sync tag.sqlite and regenerate hot-tags.json."""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
VERCEL = Path(__file__).resolve().parent.parent

SRC_SQLITE = ROOT / "mapping" / "tag.sqlite"
DST_SQLITE = VERCEL / "mapping" / "tag.sqlite"

def main():
    if not SRC_SQLITE.exists():
        print(f"ERROR: {SRC_SQLITE} not found")
        sys.exit(1)

    # Sync tag.sqlite
    if not DST_SQLITE.exists() or SRC_SQLITE.stat().st_mtime > DST_SQLITE.stat().st_mtime:
        VERCEL.joinpath("mapping").mkdir(exist_ok=True)
        shutil.copy2(SRC_SQLITE, DST_SQLITE)
        print(f"Synced: {SRC_SQLITE.name} → vercel/mapping/")
    else:
        print(f"Skip: vercel/mapping/tag.sqlite is up to date")

    # Run extract-hot-tags.py
    extract_script = VERCEL / "scripts" / "extract-hot-tags.py"
    subprocess.run([sys.executable, str(extract_script)], check=True, cwd=str(VERCEL))

    print("Pre-deploy done. Ready to push to Vercel.")

if __name__ == "__main__":
    main()
