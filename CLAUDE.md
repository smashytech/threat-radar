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
