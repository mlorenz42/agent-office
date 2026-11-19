"""Add or remove the Agent Office subagent hooks in a Claude Code settings file."""
import json
import sys
from pathlib import Path

MARKER = "agent-office"
OLD_MARKERS = ["claude-office"]  # the app's former name; removed on install/uninstall
COMMAND = (
    "curl -s -m 1 -X POST -H 'Content-Type: application/json' --data-binary @- "
    "http://127.0.0.1:47321/hook >/dev/null 2>&1 || true # " + MARKER
)
EVENTS = ["SubagentStart", "SubagentStop"]


def strip(groups):
    kept = []
    for group in groups:
        hooks = [h for h in group.get("hooks", []) if not any(m in h.get("command", "") for m in [MARKER, *OLD_MARKERS])]
        if hooks:
            kept.append({**group, "hooks": hooks})
    return kept


def main(action, path):
    settings_path = Path(path).expanduser()
    settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
    hooks = settings.setdefault("hooks", {})
    for event in EVENTS:
        groups = strip(hooks.get(event, []))
        if action == "install":
            groups.append({"hooks": [{"type": "command", "command": COMMAND}]})
        if groups:
            hooks[event] = groups
        else:
            hooks.pop(event, None)
    if not hooks:
        settings.pop("hooks")
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")
    print(f"{action}ed Agent Office hooks in {settings_path}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "~/.claude/settings.local.json")
