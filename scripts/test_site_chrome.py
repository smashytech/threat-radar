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


    def test_social_preview_tags_on_every_page(self):
        """Spec 009 AC-5: link previews in Slack, LinkedIn, Teams."""
        for path in site_chrome.PAGES:
            html = (site_chrome.ROOT / path).read_text(encoding="utf-8")
            tags = dict(re.findall(r'<meta (?:property|name)="((?:og|twitter):[a-z:_]+)" content="([^"]*)">', html))
            for name in ("og:title", "og:description", "og:url", "og:site_name", "og:type", "og:image", "og:image:alt", "twitter:card"):
                self.assertTrue(tags.get(name), f"{path}: {name}")
            title = re.search(r"<title>([^<]*)</title>", html).group(1)
            self.assertEqual(tags["og:title"], title, f"{path}: preview title follows the page title")
            for name in ("og:url", "og:image"):
                self.assertTrue(tags[name].startswith("https://zelin.se/"), f"{path}: {name} must be absolute")
            expected_url = "https://zelin.se/" + path.removesuffix("index.html")
            self.assertEqual(tags["og:url"], expected_url, path)
            self.assertEqual(tags["twitter:card"], "summary_large_image")

    def test_preview_image_is_a_1200x630_png_under_300_kb(self):
        image = site_chrome.ROOT / "social-card.png"
        data = image.read_bytes()
        self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
        width, height = int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
        self.assertEqual((width, height), (1200, 630))
        self.assertLess(len(data), 300 * 1024)

if __name__ == "__main__":
    unittest.main()
