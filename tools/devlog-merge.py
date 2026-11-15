"""Resolve merge conflicts in an append-only log (docs/DEVLOG.md) by keeping both sides.

When two branches each append an entry at the end of docs/DEVLOG.md, git reports a conflict
in that file only. This keeps "ours" then "theirs" for every conflict block, in that order.
Use it only on append-only files; check the result before `git add`.

Usage: python3 tools/devlog-merge.py docs/DEVLOG.md
"""

import re
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    text = handle.read()
merged = re.sub(
    r"<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n",
    lambda match: match.group(1) + match.group(2),
    text,
    flags=re.S,
)
with open(path, "w", encoding="utf-8") as handle:
    handle.write(merged)
