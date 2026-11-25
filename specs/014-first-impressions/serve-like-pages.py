"""A local server that behaves like GitHub Pages for missing addresses: it answers
404 with site/404.html. Used by browser-check.cjs. Run from the repo root:
    python3 specs/014-first-impressions/serve-like-pages.py 8766
"""
import http.server
import sys
from functools import partial
from pathlib import Path

SITE = Path(__file__).resolve().parents[2] / "site"


class Handler(http.server.SimpleHTTPRequestHandler):
    def send_error(self, code, message=None, explain=None):
        if code != 404:
            return super().send_error(code, message, explain)
        body = (SITE / "404.html").read_bytes()
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
http.server.ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(SITE))).serve_forever()
