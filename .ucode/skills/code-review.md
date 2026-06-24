---
name: code-review
description: Review a diff or file for correctness, security, and style issues before committing.
---
Review {{args}} with fresh eyes, as if preparing PR feedback:

1. Read the relevant file(s)/diff in full before commenting — don't guess from partial context.
2. Check for: correctness bugs, security issues (injection, unsafe deserialization, secrets),
   missing error handling at real boundaries, and inconsistency with the surrounding code's
   existing conventions.
3. Ignore style nitpicks that a linter would already catch.
4. Report findings as a short list ordered by severity. If nothing significant is wrong, say so
   plainly instead of inventing nitpicks.
