#!/usr/bin/env python3
"""Run docs/tests.js in an embedded JS engine (QuickJS).

    python3 tools/run_tests_qjs.py

The files under docs/lib are plain ES modules, so this flattens the import
lines and evaluates them in dependency order, then reads the same summary the
test page shows. It is the fast loop; the shipped proof is the same suite run
in a real browser against the live page.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import quickjs

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
ORDER = ["lib/time.js", "lib/rules.js", "lib/payslip.js", "tests.js"]


def flatten(path: Path) -> str:
    out = []
    depth = 0
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("import "):
            if stripped.endswith("{"):
                depth += 1
            continue
        if depth and stripped.startswith("} from "):
            depth -= 1
            continue
        if stripped.startswith("export default "):
            out.append(line.replace("export default ", "", 1))
            continue
        if stripped.startswith("export "):
            out.append(line.replace("export ", "", 1))
            continue
        out.append(line)
    return "\n".join(out)


def main() -> int:
    src = "\n\n".join(flatten(DOCS / part) for part in ORDER)
    ctx = quickjs.Context()
    ctx.eval(src)
    raw = ctx.get("__testSummary")
    if raw is None or str(raw) == "undefined":
        print("no summary produced", file=sys.stderr)
        return 2
    summary = json.loads(ctx.eval("JSON.stringify(globalThis.__testSummary)"))
    print(f"quickjs → {summary['passed']}/{summary['total']} passed")
    for failure in summary["failures"]:
        print(f"  FAIL [{failure['group']}] {failure['label']} — {failure['detail']}")
    return 0 if summary["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
