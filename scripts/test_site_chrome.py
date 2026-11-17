"""Every page carries the same header and footer (spec 007). Run: python3 -m unittest scripts/test_site_chrome.py"""
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import site_chrome  # noqa: E402


class SiteChromeTest(unittest.TestCase):
    def test_every_page_is_up_to_date(self):
        for path in site_chrome.PAGES:
            html = (site_chrome.ROOT / path).read_text(encoding="utf-8")
            self.assertEqual(site_chrome.render(path, html), html, f"site/{path} is out of date: run python3 scripts/site_chrome.py")

    def test_every_page_in_the_site_is_listed(self):
        pages = {str(p.relative_to(site_chrome.ROOT)) for p in site_chrome.ROOT.rglob("index.html")}
        self.assertEqual(pages, set(site_chrome.PAGES))

    def test_navigation_marks_exactly_one_current_page_and_links_resolve(self):
        for path, (root, current, _note) in site_chrome.PAGES.items():
            block = site_chrome.header(root, current)
            self.assertEqual(block.count('aria-current="page"'), 1, path)
            for href in re.findall(r'href="([^"]+)"', block):
                target = (site_chrome.ROOT / path).parent / href
                self.assertTrue((target / "index.html").exists() if href.endswith("/") or href == "./" else target.exists(), f"{path}: {href}")

    def test_one_toggle_and_one_banner(self):
        for path in site_chrome.PAGES:
            html = (site_chrome.ROOT / path).read_text(encoding="utf-8")
            self.assertEqual(html.count("data-theme-toggle"), 1, path)
            self.assertEqual(html.count("<header"), 1, f"{path}: one banner landmark")
            self.assertIn('theme.js"></script>', html, f"{path}: theme script in the head")
            self.assertLess(html.index('theme.js"></script>'), html.index("</head>"), path)


if __name__ == "__main__":
    unittest.main()
