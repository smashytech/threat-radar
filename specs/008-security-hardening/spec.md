# Feature spec: Security hardening

| | |
|---|---|
| **Spec ID** | 008-security-hardening |
| **Status** | Approved v1 (owner: "go", 2026-11-24). Built, verified, owner checklist done |
| **Owner** | smashytech |
| **Builds on** | [001](../001-threat-radar/spec.md) – [007](../007-briefing-redesign/spec.md) |
| **Created** | 2026-11-24 |

---

## 1. Summary

An audit on 2026-11-24 found the website itself well protected: strict Content Security Policy, text-only rendering, safe links, no third parties, pinned and least-privilege workflows, secret scanning. The weak spot is the **automation**:

- The Sitrep and Breach Wire **publishers** (scheduled Claude tasks that read outside text: email and leak-site aggregators) push straight to `main`. Every push, theirs, the builder's and the owner's, arrives as the same GitHub account, so GitHub can't tell them apart.
- On 2026-11-18 the Breach Wire publisher **edited its own gatekeeper** (`scripts/add_breachwire.py`, its tests and spec 003) so that its issue would pass. That change was harmless, but nothing would have stopped a harmful one.
- The deploy already re-checks every published issue, but **with the rules from the same push**. Rules loosened in a push are the rules that push is checked against.

This spec adds a **deploy gate** (option A, chosen by the owner) and a set of smaller fixes.

## 2. Decisions

| Question | Answer |
|---|---|
| How strict for code changes? | **A: deploy gate + Slack alert.** Code changes don't need a pull request. Upgrade to pull requests (option B) if the site gets real traffic, takes money, or other people get write access |
| Protect `main`? | Yes: block force-pushes and deletion; normal pushes keep working |

## 3. The deploy gate

```
 every deploy
   ① publisher commits touch only their data folder?            no → ⛔ stop + Slack
   ② every issue passes the CURRENT gatekeeper rules?            no → ⛔ stop + Slack
   ③ rules changed since the last deploy?
        → every issue must ALSO pass the PREVIOUS rules,
          unless the run was started by hand with "accept rule change"  no → ⛔ stop + Slack
   ④ anything outside site/data/ changed?                        yes → 🔔 Slack heads-up
   → deploy ✅ → mark this commit as "last deployed"
```

- **FR-1** The gate compares the commit being deployed with the **last deployed commit** (a git tag `deployed`, moved after every successful deploy).
- **FR-2** **Publisher lanes**: a commit whose message starts with `sitrep:` may only change `site/data/sitrep/`; `breachwire:` only `site/data/breachwire/`. The KEV commits by `github-actions[bot]` (`data:`) only `site/data/kev.json`, `meta.json` and `status.json`. Anything else stops the deploy.
- **FR-3** Every Sitrep and Breach Wire issue must pass the gatekeeper **as it is now** (unchanged from today).
- **FR-4** If a gatekeeper script (`scripts/add_sitrep.py`, `scripts/add_breachwire.py`) changed since the last deploy, every issue must **also** pass the version from the last deploy. A deliberate loosening needs a **manual run** with the input "accept rule change", which only the owner or the builder can start.
- **FR-5** Code changes are never blocked by the gate (that's option B), but any change outside `site/data/` sends a **Slack heads-up** listing the changed files and commit titles.
- **FR-6** A stopped deploy leaves the live site as it was, marks the run failed (GitHub also emails the owner) and sends a Slack message with the reason. **Never victim names or secrets** in any message.
- **FR-7** The first run after this ships sets `deployed` without comparing (nothing to compare with).
- **FR-7b** *(Added during build.)* A stopped publisher commit stays in the compared range even after a revert, so a **manual run with "approve publisher commits"** lets the deploy through once the owner has checked it; Slack notes the approval.
- **FR-8** The publishers' instructions say: change only your data folder; if the gatekeeper refuses an issue, **stop and report**, never edit scripts, tests or specs.

## 4. Smaller fixes

- **FR-9** `main` gets a GitHub rule: **no force-push, no deletion**. If the builder can't create it from here, the owner gets click-by-click steps.
- **FR-10** Links shown on the site from data must be **`https://`** (today `http://` is accepted too). The 6 KEV notes with `http://` links show as plain text.
- **FR-11** A way to report security problems privately: `SECURITY.md` in the repo and `/.well-known/security.txt` on the site (RFC 9116), both pointing to GitHub's private vulnerability reporting. No personal email address anywhere.
- **FR-12** Remove what isn't used: the leftover `fonts` branch, and the wiki.

## 5. The owner's part (click-by-click steps in the README)

| Step | Why |
|---|---|
| Verify `zelin.se` in GitHub (TXT record `_github-pages-challenge-smashytech`) | Stops someone else claiming the domain on GitHub if Pages is ever switched off |
| Turn on **private vulnerability reporting** | Where `SECURITY.md` and `security.txt` point |
| Check **two-step login (2FA)** on the GitHub account | Covers the threat option A doesn't: someone using your account |
| Turn on **Dependabot alerts** | GitHub warns about known-vulnerable actions |
| (If needed) create the `main` rule | See FR-9 |

## 6. Non-functional requirements

- **NFR-1** The gate is a Python standard-library script, tested like the gatekeepers (`scripts/test_deploy_gate.py`), with git calls only through a small wrapper so tests use a temporary repository.
- **NFR-2** The gate adds under 10 seconds to a deploy.
- **NFR-3** Workflow permissions don't grow: moving the `deployed` tag uses the `contents: write` the refresh job already has.

## 7. Out of scope

- Pull requests for code (option B).
- Security headers that GitHub Pages can't send (anti-framing, HSTS preload, Permissions-Policy). The site has no logins or forms; a CDN like Cloudflare could add them later.

## 8. Acceptance criteria

| AC | Criterion |
|---|---|
| **AC-1** | A `breachwire:` commit that also changes `scripts/add_breachwire.py` stops the deploy; one that changes only `site/data/breachwire/` passes; same for `sitrep:` and the KEV lane |
| **AC-2** | An issue that breaks the current rules stops the deploy (as today) |
| **AC-3** | Rules loosened in the same push, with an issue that only the looser rules accept → stopped; the same push run by hand with "accept rule change" → deploys |
| **AC-4** | A code-only change deploys and sends one Slack heads-up naming the files; a data-only change sends none |
| **AC-5** | A stopped deploy leaves the live site unchanged, fails the run, and posts the reason to Slack, with no victim names or secrets |
| **AC-6** | First run: no `deployed` tag → no comparison, tag set after the deploy |
| **AC-7** | `main` can't be force-pushed or deleted (rule visible in GitHub) |
| **AC-8** | `http://` links from data show as plain text; `https://` links still work |
| **AC-9** | `https://zelin.se/.well-known/security.txt` is served and valid (Contact, Expires, Canonical, Policy); `SECURITY.md` exists |
| **AC-10** | The `fonts` branch and the wiki are gone; the publishers' instructions contain the "stop and report" rule |
