#!/usr/bin/env python3
"""
One-off migration: backfill web_url on Stage2Repo entries from the
corresponding Stage1Repo in the same release state.json.

Run from the backend directory:
    python migrate_stage2_web_url.py

Safe to run multiple times (idempotent). Delete this file after running.
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"


def migrate_state(path: Path) -> bool:
    """Returns True if the file was modified."""
    raw = json.loads(path.read_text())

    stage1 = raw.get("stage1", [])
    stage2 = raw.get("stage2", [])

    # Build lookup: project_id -> web_url  and  name -> web_url  from stage1
    s1_by_id: dict[int, str] = {}
    s1_by_name: dict[str, str] = {}
    for r in stage1:
        pid = r.get("project_id")
        url = r.get("web_url") or ""
        name = r.get("name") or ""
        if pid and url:
            s1_by_id[pid] = url
        if name and url:
            s1_by_name[name] = url

    modified = False
    for r in stage2:
        if r.get("web_url"):
            continue  # already populated, skip
        pid = r.get("project_id")
        name = r.get("name") or ""
        url = s1_by_id.get(pid) or s1_by_name.get(name)
        if url:
            r["web_url"] = url
            modified = True

    if modified:
        path.write_text(json.dumps(raw, indent=2, default=str))
        print(f"  ✓ Updated: {path}")
    else:
        print(f"  – No changes: {path}")

    return modified


def main() -> None:
    state_files = sorted(DATA_DIR.rglob("state.json"))
    if not state_files:
        print("No state.json files found — nothing to migrate.")
        return

    updated = 0
    for p in state_files:
        if migrate_state(p):
            updated += 1

    print(f"\nDone. {updated}/{len(state_files)} files updated.")


if __name__ == "__main__":
    main()
