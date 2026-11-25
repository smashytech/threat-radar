# Housekeeping amendments

Repo-wide small changes that don't belong to one feature spec. Same format as a
spec's `amendments.md`: request, decision, acceptance check, verification.

## H1 · Commits in the owner's name (2026-11-24)

*Recorded after the fact.*

- **Request:** "for future commits … can we change so it looks like I've committed, not Claude".
- **Decision:** all Claude sessions commit as `smashytech <207307169+smashytech@users.noreply.github.com>` (GitHub's private no-reply address) without `Co-Authored-By:` / `Claude-Session:` lines, via a rule in `CLAUDE.md` that every session reads. The KEV workflow keeps `github-actions[bot]` (honest about automation; the deploy gate uses titles, not names). Old commits unchanged.
- **Check:** new commits show the owner's name and avatar; the publisher bots' next commits follow the rule.
- **Verified:** commit 6c4206d and later. Publisher bots: to be confirmed on their next run (2026-11-25, about 08:45).

## H2 · Shorter README and a specs index (2026-11-24)

*Recorded after the fact.*

- **Request:** "can we clean up readme? feels like we put too much information there".
- **Decision:** the README keeps what a visitor needs (what it is, pages, how it works, security in brief, how to run it); per-feature detail and the threats table move to `specs/README.md`, which also notes which later spec changed what.
- **Check:** no broken links to removed README sections.
- **Verified:** 188 → 79 lines; `SECURITY.md` and spec 008 links updated.

## H3 · The change-size rule (2026-11-24)

- **Request:** "have we drifted from spec driven development?" Owner approved the three classes: feature, small change, trivial.
- **Decision:** the rule is in `CLAUDE.md`; this file and the spec 007 amendments record the changes made without a spec before the rule existed.
- **Check:** future changes name their class before code is written.

## H4 · Code of conduct (2026-11-25)

- **Request:** "we need a code of conduct document as well. Don't know if it should be linked somewhere on the page as well or not?"
- **Decision:**
  - `CODE_OF_CONDUCT.md` in the repo root, using the **Contributor Covenant 2.1** (owner's choice), with its required credit line.
  - Reports go to the owner by **LinkedIn message** (owner's choice; the link is already public in the site footer). No email address is added.
  - It covers the repository (issues, pull requests, any future discussions). It is **not** linked from the website, which has no comments or accounts; the README gets one line pointing to it.
- **Check:** GitHub's community profile lists the code of conduct; no email address in the file; README links to it.
- **Verified:** 2026-11-25. GitHub's community profile recognises it as "Contributor Covenant" (community health 28 % → 42 %); no email address in the file; README links to it. Text checked against the official 2.1 wording (one word corrected: "email").


## H5 · Accepted scanner findings (2026-11-25)

- **Request:** "how do i fix these suggestions by web-check.xyz?" (missing CSP, HSTS, X-Frame-Options and X-Content-Type-Options headers; no DMARC record).
- **Decision:** owner chose option C, **accept and document** the four header findings (GitHub Pages can't set headers; Cloudflare in front, or moving hosting, were offered and declined). `SECURITY.md` gets "Scanner findings we accept", with the reason for each and when to revisit. The DMARC finding is not accepted: the owner adds SPF and DMARC records at the domain registrar (the domain sends no email, so both say "reject").
- **Check:** `SECURITY.md` explains each header finding; after the owner's DNS change, web-check no longer reports "No DMARC record".
- **Verified:** *(header part after build; DMARC after the owner's DNS change)*

## H6 · Licence (2026-11-25)

- **Request:** readiness check before sharing: "no licence". Owner: "What license do you recommend?", then chose MIT with the data excluded, copyright holder "smashytech".
- **Decision:** `LICENSE` holds the standard MIT text (so GitHub recognises it). The README's new "Licence" section says the data in `site/data/` is not covered: it stays under its sources' terms (CISA KEV, Ransomware.live, RansomLook).
- **Check:** GitHub's community profile shows the MIT licence; the README states the data exclusion.
- **Verified:** 2026-11-25. GitHub detects the licence as MIT; community health 42 % → 57 %; README states the data exclusion.
