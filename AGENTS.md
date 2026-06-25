# AGENTS.md

Instructions for any AI coding agent (including `ucode` itself, when run inside this repo —
`AGENTS.md` is one of its auto-loaded project memory files) working on this codebase.

## What this is

`ucode` ("Universal Code") is a clean-room, model-agnostic reimplementation of Claude Code's
agent loop: same tool-calling conventions, permission model, and workflow, but pluggable to any
provider that supports tool/function calling (OpenAI-compatible `/chat/completions` or Anthropic's
native Messages API). Pure Node.js (`>=18.17`), zero runtime dependencies, ESM only (`"type":
"module"` — use `import`/`export`, not `require`).

## Setup / run / test

```bash
npm install
npm link              # or: node bin/ucode.js ...
export GLM_API_KEY=... # or whichever provider's key; see .env.example
node bin/ucode.js --help
npm test               # node --test --test-concurrency=1 test/*.test.js
```

`--test-concurrency=1` is required, not optional: several test files spawn real shell
subprocesses (hooks, auto-fix), and Node's default concurrent test-file workers race on the
test runner's IPC channel when that happens. Don't remove that flag from `package.json`.

## Architecture map

```
bin/ucode.js           CLI entry: flag parsing, subcommands (providers, config set, loop, fix)
src/config/            layered config resolution (defaults < global < project < env < CLI flags)
src/providers/         provider adapters behind a common Provider interface (base.js)
src/agent/
  loop.js              the agentic tool-calling loop (retry/backoff, hooks, permissions)
  permissions.js       permission modes (default/acceptEdits/plan/bypassPermissions) + allow/deny
  session.js           session persistence + context compaction
  systemPrompt.js      system prompt templating (do not add few-shot tool-call examples here —
                        that was explicitly rejected in favor of calibration; see below)
  calibrate.js         first-run tool-calling self-test + cache (~/.ucode/calibration.json)
  runtime.js           wires config + provider + tools + memory + permissions + calibration
  subagentTypes.js     builtin + custom (.ucode/agents/*.md) subagent type resolution
src/tools/             individual tool implementations (read/write/edit/glob/grep/bash/...)
src/skills/            skill loading (.ucode/skills/*.md) + templating
src/hooks/             PreToolUse/PostToolUse/SessionStart hook execution
src/plugins/           plugin loading (.ucode/plugins/<name>/, bundles skills/agents/themes/hooks)
src/util/              resourceFiles.js: shared frontmatter/JSON parsing used by skills/agents/
                       themes/plugins -- keep this dependency-free (no imports from plugins/,
                       skills/, or agent/subagentTypes.js) to avoid import cycles
src/automation/        loop.js (continuous re-run), heartbeat.js (.ucode/HEARTBEAT.md sourcing,
                       re-read fresh each tick), autoFix.js (diagnose-fix-reverify)
src/memory/            project/global memory file loading
src/ui/                REPL, one-shot mode, terminal rendering, themes.js (built-in + custom
                       theme resolution and ANSI compilation)
test/                  node:test suite (one *.test.js file per module, same basename)
```

## Conventions

- **Internal message shape** (provider-agnostic, defined in `src/providers/base.js`):
  `{ role, content, toolCalls?: [{id, name, arguments}], toolCallId?, name? }`. Every
  `Provider.chat()` implementation must translate to/from this shape, not leak wire format
  upward.
- **Tool shape**: `{ name, description, parameters /* JSON Schema */, riskLevel: "read" |
  "write" | "exec" | "interactive", execute(args, ctx) }`. `riskLevel` drives permission
  decisions in `src/agent/permissions.js` — pick the correct one, don't default to "read".
- **No new runtime dependencies.** This is a zero-dependency project; if you think you need a
  package, use Node's built-ins (`node:fs`, `node:fetch`, `node:test`, etc.) instead.
- **Config precedence is sacred**: CLI flags > env vars (`UCODE_*`) > project
  `.ucode/settings.json` > global `~/.ucode/config.json` > `src/config/defaults.js`. New config
  fields need to be wired into `fromEnv()`/`fromCliFlags()` in `src/config/index.js` to respect
  this, not just `defaults.js`.
- **Calibration, not priming**: model-agnostic "teach the AI how to use this tool" support is
  handled via `src/agent/calibrate.js` (a synthetic tool-call probe run once per
  provider+model+baseURL, cached, surfaced as a warning on failure) — deliberately *not* via
  extra few-shot examples baked into `systemPrompt.js`. Keep that separation when extending this.
- **Tests mirror source paths** 1:1 (`src/agent/calibrate.js` → `test/calibrate.test.js`). Fake
  providers in tests implement just `{ async chat(request) { ... } }` — see any existing
  `test/*.test.js` for the pattern before inventing a new mocking style.
- Comments are rare and only explain non-obvious *why* (see existing code for the bar to clear).

## Extending

- **New provider**: if it speaks OpenAI's `/chat/completions` format, just add a preset in
  `src/config/presets.js` — no new code needed. Otherwise implement `Provider` in
  `src/providers/` and register via `registerProviderKind()` in `src/providers/index.js`.
- **New tool**: add it under `src/tools/`, export it, register it in `src/tools/index.js`'s
  `buildAllTools()`, give it a correct `riskLevel`.
- **New builtin subagent type or skill**: see `src/agent/subagentTypes.js` /
  `src/skills/index.js`; custom ones are just markdown files under `.ucode/agents/` /
  `.ucode/skills/` and need no code changes.
- **New builtin theme**: add an entry to `BUILTIN_THEMES` in `src/ui/themes.js`; custom ones are
  JSON files under `.ucode/themes/` / `~/.ucode/themes/` and need no code changes.
- **Plugins**: `.ucode/plugins/<name>/` (or `~/.ucode/plugins/<name>/`) bundles skills/agents/
  themes/hooks for a single name using the same file conventions as their standalone forms (see
  `src/plugins/index.js`). On a name collision, project-level standalone definitions win over a
  plugin's.

## Before committing

Run `npm test` and make sure it's still all-green. Don't push to a branch other than the one
you were told to develop on.
