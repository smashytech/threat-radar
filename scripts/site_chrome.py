#!/usr/bin/env python3
"""Write the shared header and footer into every page (spec 007).

Every page has the same top bar (logo, navigation, light/dark toggle) and the
same footer. The site has no build step, so the markup lives in each HTML
file; this script keeps the copies identical. It replaces whatever sits
between the marker comments

    <!-- site-header --> ... <!-- /site-header -->
    <!-- site-footer --> ... <!-- /site-footer -->
    <!-- social --> ... <!-- /social -->        (link previews, spec 009)

Usage (from the repo root):
    python3 scripts/site_chrome.py           rewrite the pages
    python3 scripts/site_chrome.py --check   exit 1 if any page is out of date (used by the tests)
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "site"

# path → (how to get back to the site root, which nav item is "this page", page-specific footer note)
PAGES = {
    "index.html": ("", "Today", None),
    "exploited/index.html": ("../", "Exploited", None),
    "sitrep/index.html": ("../", "Sitrep",
                          "The Cyber Sitrep is compiled every weekday morning from public sources and mirrored here automatically. "
                          "Always check the linked source before acting."),
    "ransomware/index.html": ("../", "Breaches",
                              "Breach Wire is compiled daily from public leak-site aggregators and mirrored here automatically as "
                              "statistics only. Victim names are never published on this site."),
    "feeds/index.html": ("../", "Feeds", None),
}

AT_PAGE = ' aria-current="page"'
NAV = [("Today", ""), ("Exploited", "exploited/"), ("Sitrep", "sitrep/"), ("Breaches", "ransomware/"), ("Feeds", "feeds/")]

LOGO = ('<svg class="brand__mark" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true" focusable="false">'
        '<circle class="brand__ring" cx="14" cy="14" r="12.5"/><circle class="brand__ring brand__ring--inner" cx="14" cy="14" r="7"/>'
        '<path class="brand__arm" d="M14 14 L24 7"/><circle class="brand__blip" cx="19" cy="18" r="2.2"/></svg>')
MOON = ('<svg class="theme-toggle__icon theme-toggle__icon--moon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">'
        '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>')
SUN = ('<svg class="theme-toggle__icon theme-toggle__icon--sun" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">'
       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>')


def header(root: str, current: str) -> str:
    links = "\n".join(
        f'        <a class="site-nav__link" href="{nav_href(root, href)}"{AT_PAGE if name == current else ""}>{name}</a>'
        for name, href in NAV)
    home = root or "./"
    return f"""<header class="site-header">
    <div class="site-header__inner">
      <a class="brand" href="{home}">{LOGO}<span class="brand__name">Threat Radar</span></a>
      <nav class="site-nav" aria-label="Sections">
{links}
      </nav>
      <button type="button" class="theme-toggle" data-theme-toggle aria-pressed="false" aria-label="Dark mode" title="Switch to dark mode">{MOON}{SUN}</button>
    </div>
  </header>"""


def footer(root: str, note: str | None) -> str:
    note_html = f"\n      <p>{note}</p>" if note else ""
    return f"""<footer class="site-footer">
    <div class="site-footer__inner">{note_html}
      <p>Data: <a href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog" rel="noopener noreferrer">CISA Known Exploited Vulnerabilities catalog</a> (US government, public domain; not affiliated with CISA). Leak-site claims via <a href="https://www.ransomware.live/" rel="noopener noreferrer">Ransomware.live</a> and <a href="https://www.ransomlook.io/" rel="noopener noreferrer">RansomLook</a>.</p>
      <p>Your stack is kept only in this browser, and only if you tick Remember. Follow along in a feed reader, Slack or an automation tool: <a href="{root}feeds/">Feeds</a>.</p>
      <p>No ads, no trackers, no cookies, no third-party code. If Threat Radar helps you, you can <a class="coffee-link" href="https://buymeacoffee.com/devzelin" target="_blank" rel="noopener noreferrer">{COFFEE}buy me a coffee</a>. <a href="https://github.com/smashytech/threat-radar" rel="noopener noreferrer">How this site works ↗</a></p>
    </div>
  </footer>"""


COFFEE = ('<svg class="coffee-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3c-.6.8-.6 1.7 0 2.5M12 3c-.6.8-.6 1.7 0 2.5"/></svg>')

SITE = "https://zelin.se/"
CARD = SITE + "social-card.png"
CARD_ALT = "Threat Radar: what attackers are exploiting right now, a daily briefing at zelin.se"


def social(path: str, html: str) -> str:
    """Link-preview tags (Open Graph and Twitter Card), taken from the page's own
    <title> and description so they can't drift apart. Addresses must be absolute."""
    title = re.search(r"<title>([^<]*)</title>", html)
    description = re.search(r'<meta name="description" content="([^"]*)">', html)
    if not title or not description:
        raise SystemExit(f"site/{path}: needs a <title> and a meta description for link previews")
    url = SITE + path.removesuffix("index.html")
    tags = [("property", "og:type", "website"), ("property", "og:site_name", "Threat Radar"),
            ("property", "og:title", title.group(1)), ("property", "og:description", description.group(1)),
            ("property", "og:url", url), ("property", "og:image", CARD),
            ("property", "og:image:width", "1200"), ("property", "og:image:height", "630"),
            ("property", "og:image:alt", CARD_ALT), ("name", "twitter:card", "summary_large_image")]
    return "\n  ".join(f'<meta {kind}="{name}" content="{value}">' for kind, name, value in tags)


def nav_href(root: str, href: str) -> str:
    if not root:
        return href or "./"
    return root + href


def render(path: str, html: str) -> str:
    root, current, note = PAGES[path]
    for name, block in (("social", social(path, html)), ("site-header", header(root, current)), ("site-footer", footer(root, note))):
        pattern = re.compile(rf"<!-- {name} -->.*?<!-- /{name} -->", re.S)
        if not pattern.search(html):
            raise SystemExit(f"site/{path}: markers <!-- {name} --> … <!-- /{name} --> missing")
        html = pattern.sub(lambda _m, b=block, n=name: f"<!-- {n} -->\n  {b}\n  <!-- /{n} -->", html, count=1)
    return html


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="only report pages that are out of date")
    args = parser.parse_args(argv)
    stale = []
    for path in PAGES:
        file = ROOT / path
        before = file.read_text(encoding="utf-8")
        after = render(path, before)
        if after != before:
            stale.append(path)
            if not args.check:
                file.write_text(after, encoding="utf-8")
    if args.check and stale:
        print("Out of date (run python3 scripts/site_chrome.py): " + ", ".join(f"site/{p}" for p in stale))
        return 1
    print(("All pages up to date" if args.check else f"Updated {len(stale)} page(s)") + ".")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
