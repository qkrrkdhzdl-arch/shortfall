#!/usr/bin/env python3
"""Run the app's test suite in a real browser.

    python3 tools/run_tests.py

Serves docs/ on a free local port, opens tests.html in Chromium, waits for the
summary line and prints it. Exit code 1 when any assertion fails.
"""
from __future__ import annotations

import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):  # keep the run readable
        pass


def serve() -> tuple[socketserver.TCPServer, int]:
    handler = functools.partial(Quiet, directory=str(DOCS))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


def main() -> int:
    httpd, port = serve()
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.goto(f"{base}/tests.html")
            page.wait_for_function("window.__testSummary !== undefined", timeout=15000)
            summary = page.evaluate("window.__testSummary")
            text = page.locator("#summary").inner_text()
            print(f"tests.html → {text}")
            if summary["failed"]:
                for failure in summary["failures"]:
                    print(f"  FAIL [{failure['group']}] {failure['label']} — {failure['detail']}")
            else:
                print("  every assertion passed")
            browser.close()
            return 0 if summary["failed"] == 0 else 1
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    sys.exit(main())
