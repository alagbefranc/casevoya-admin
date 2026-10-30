"""Local screenshots of the admin UI at 1440 and 390 with fictional fixtures.

Usage: python3 scripts/screenshots/shoot.py [--base http://127.0.0.1:3100] [--out /workspace/shots] [name ...]

Requests to /api/admin/* are answered inside the test browser by Playwright (page.route) from
fixtures.py. The app has no dev bypass; this script is the only place fixtures exist.
"""
import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
import fixtures as fx  # noqa: E402
from scenarios import SCENARIOS  # noqa: E402


def make_handler(routes, errors):
    def handle(route):
        url = urlsplit(route.request.url)
        path = url.path[len("/api/admin"):] or "/"
        full = f"{path}?{url.query}" if url.query else path
        method = route.request.method
        key = f"{method} {path}"
        if key in errors or f"{method} {full}" in errors:
            status, body = errors.get(key) or errors[f"{method} {full}"]
            if body == "HANG":
                return  # never answer: loading / slow states
            return route.fulfill(status=status, content_type="application/json", body=json.dumps(body), headers={"x-request-id": "req_example_0001"})
        best = None
        for k in routes:
            if " " in k:
                m, p = k.split(" ", 1)
                if m != method:
                    continue
            else:
                if method != "GET":
                    continue
                p = k
            if full == p or full.startswith(p + "&") or (("?" not in p) and (path == p)) or ("?" in p and full.startswith(p)):
                if best is None or len(p) > len(best[0]):
                    best = (p, routes[k])
        if best is None:
            return route.fulfill(status=404, content_type="application/json", body=json.dumps({"error": {"code": "not_found", "message": f"No fixture for {method} {full}", "requestId": "req_example_404"}}))
        return route.fulfill(status=200, content_type="application/json", body=json.dumps({"data": best[1], "requestId": "req_example_0001"}), headers={"x-request-id": "req_example_0001"})
    return handle


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:3100")
    ap.add_argument("--out", default="/workspace/shots")
    ap.add_argument("--widths", default="1440,390")
    ap.add_argument("names", nargs="*")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    widths = [int(w) for w in args.widths.split(",")]
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        for sc in SCENARIOS:
            if args.names and sc["name"] not in args.names:
                continue
            for w in widths:
                ctx = browser.new_context(viewport={"width": w, "height": 900 if w > 500 else 844}, device_scale_factor=1, timezone_id="America/Toronto", locale="en-CA")
                page = ctx.new_page()
                routes = {**fx.base_routes(), **fx.ops_routes(), **fx.records_routes(), **fx.admin_routes()}
                routes.update(sc.get("routes", {}))
                errs = dict(sc.get("errors", {}))
                page.route("**/api/admin/**", make_handler(routes, errs))
                if sc.get("offline"):
                    pass
                page.goto(args.base + sc["url"], wait_until="domcontentloaded")
                try:
                    page.wait_for_selector(sc.get("wait", "main h1, .full h1"), timeout=20000)
                except Exception:
                    pass
                page.wait_for_timeout(sc.get("settle", 900))
                for step in sc.get("steps", []):
                    kind, arg = step
                    if kind == "click":
                        page.click(arg)
                    elif kind == "fill":
                        page.fill(arg[0], arg[1])
                    elif kind == "select":
                        page.select_option(arg[0], arg[1])
                    elif kind == "wait":
                        page.wait_for_timeout(arg)
                    elif kind == "offline":
                        ctx.set_offline(True)
                        page.evaluate("window.dispatchEvent(new Event('offline'))")
                    elif kind == "fail":
                        errs[arg[0]] = arg[1]  # later requests to this route now fail (stale state)
                    elif kind == "eval":
                        page.evaluate(arg)
                page.wait_for_timeout(300)
                path = out / f"{sc['name']}-{w}.png"
                page.screenshot(path=str(path), full_page=sc.get("full", True))
                print(path)
                ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
