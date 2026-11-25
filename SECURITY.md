# Security policy

Threat Radar ([zelin.se](https://zelin.se)) is a static website: no accounts, no
forms, no cookies, no tracking and no third-party code. It shows public data:
CISA's Known Exploited Vulnerabilities catalog, the Cyber Sitrep, and Breach Wire
statistics (never victim names).

## Reporting a problem

Please report security problems **privately** through GitHub:
[Report a vulnerability](https://github.com/smashytech/threat-radar/security/advisories/new).
Don't open a public issue for them.

Useful to include: what you found, where (page, file or workflow), and how to
reproduce it. You'll get a reply within a week.

**In scope:** the site at zelin.se, the code in this repository, the GitHub
Actions workflows, the feeds and the Slack alerts. That includes a victim name
appearing anywhere on the site or in a feed, which would break a core rule of
this project.

**Out of scope:** the data sources themselves (CISA, Ransomware.live,
RansomLook), GitHub Pages' own infrastructure, and automated scanner output
without a concrete impact.

## How the site protects itself

A short overview; the details are in the [specs index](specs/README.md#threats-and-defences) and the
specs under [`specs/`](specs).

- A strict Content Security Policy on every page: only this site's own files can
  run, with no inline code.
- Everything from data is shown as plain text; links must be `https://`.
- Workflows use pinned actions and the fewest permissions they need.
- A **deploy gate** (spec 008) checks every deploy: the bots that publish the
  Sitrep and Breach Wire may only change their own data, and gatekeeper rules
  can't be loosened and used in the same push without a manual approval.
- An **independent victim-name check** (spec 011) compares every new Breach Wire
  issue with the public victim list from Ransomware.live before it is published.
  If the list can't be fetched, Breach Wire waits for the next run; the rest of
  the site still updates.

## A victim name reached the repository

What to do when the independent check reports *"A victim name was found in
Breach Wire"*. The name is **not** on the site: the check held that issue back.
But the publisher bot's commit is already in this public repository.

1. **Revert the publisher commit** named in the run (on GitHub: the commit page,
   or locally `git revert <commit>` and push). The next deploy passes the check
   again and Breach Wire carries on.
2. **Remove the name from the history.** On your own computer, with
   [git filter-repo](https://github.com/newren/git-filter-repo): write the name on
   one line in a file **outside** the repository (for example `~/names.txt`), then
   run `git filter-repo --replace-text ~/names.txt` in a fresh clone. It replaces
   the name with `***REMOVED***` in every commit and tag. Delete `~/names.txt` afterwards.
3. **Push the cleaned history.** The ruleset *protect main* blocks force pushes,
   so switch it off for a moment (Settings → Rules), run
   `git push --force --all` and `git push --force --tags`, then switch it **back on**.
4. **Ask GitHub to purge cached copies** of the old commits: GitHub's guide
   [Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
   links the support form.
5. **Find out how it got through**: read the Breach Wire email for that day and
   look for text that tried to steer the publisher bot. Fix the cause before the
   next issue.
