---
name: changelog
description: Draft a changelog entry for the current uncommitted changes.
---
Look at the working tree's uncommitted changes ({{args}}, or `git diff`/`git status` if no
args were given) and draft a changelog entry:

1. Summarize the user-facing effect of the change in one line (what changed, not how).
2. Note any breaking changes or migration steps separately, if applicable.
3. Use the imperative mood ("Add", "Fix", "Remove"), matching Keep a Changelog conventions.
