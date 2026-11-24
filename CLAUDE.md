# Instructions for Claude sessions in this repository

## Commit identity (owner's rule, 2026-11-24)

Every commit in this repository is made in the owner's name. Before your first
commit in a session, run:

```
git config user.name "smashytech"
git config user.email "207307169+smashytech@users.noreply.github.com"
```

- Use exactly this name and this GitHub no-reply address. Never use any other
  email address: the owner's real address must never appear in this public repo.
- Do not add `Co-Authored-By:` or `Claude-Session:` lines to commit messages.
- Keep the commit title prefixes the deploy gate relies on (spec 008):
  `sitrep:` for the Sitrep publisher, `breachwire:` for the Breach Wire
  publisher, `data:` is reserved for the KEV workflow. Other commits must not
  start with these prefixes.

## How changes are made: spec-driven, sized to the change (owner's rule, 2026-11-24)

Every change is classified **before** any code is written, and the class is said
to the owner.

| Class | Examples | What it needs |
|---|---|---|
| **Feature** | A new page, data source, integration, security mechanism, or anything that changes how data flows | A new spec folder `specs/NNN-name/` with `spec.md` (what and why, acceptance criteria), `plan.md`, `tasks.md` (tests first) and, when done, `verification.md`. Build only after the owner says "go" |
| **Small change** | A new link, a rename, a tooltip, a layout tweak, a change to one rule | An **amendment** in `amendments.md` of the spec that owns the area (or `specs/housekeeping.md` for repo-wide changes): the request, the decision, one acceptance check, and later how it was verified. Write it and get the owner's OK **before** building; add a test first when the change has logic |
| **Trivial** | A typo, a broken link, a comment | The commit message is enough |

- When unsure, pick the larger class.
- If a choice has more than one reasonable answer (for example wording, placement or naming), settle it in the spec or amendment before building, not by shipping and changing it back.
- Update `specs/README.md` when a spec or amendment changes what a page does.
