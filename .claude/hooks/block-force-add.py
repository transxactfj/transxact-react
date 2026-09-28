"""PreToolUse hook: block `git add -f/--force`, which stages .gitignore'd files.

See AGENTS.md: anything matched by .gitignore must never be committed or pushed.
Exit code 2 blocks the tool call and shows stderr to the agent.
"""

import json
import re
import sys

GIT_ADD = re.compile(r"\bgit\b[^\n;&|]*?\badd\b([^\n;&|]*)")
FORCE_FLAG = re.compile(r"(?:^|\s)(?:--force|-[A-Za-z]*f[A-Za-z]*)(?=\s|$)")

try:
    command = json.load(sys.stdin).get("tool_input", {}).get("command", "")
except Exception:
    sys.exit(0)

for match in GIT_ADD.finditer(command):
    if FORCE_FLAG.search(match.group(1)):
        sys.stderr.write(
            "Blocked: `git add -f/--force` stages files matched by .gitignore, "
            "which must never be committed or pushed (see AGENTS.md). "
            "If an ignored file seems to belong in the repo, ask the user.\n"
        )
        sys.exit(2)
