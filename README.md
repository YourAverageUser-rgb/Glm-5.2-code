# Universal Code (`ucode`)

A model-agnostic, terminal-based coding agent built to operate the way Claude Code does —
same tool-calling conventions, same permission model, same workflow — but not locked to any
one provider. It defaults to **GLM-5.2** (Zhipu AI / Z.ai), and works with any model that
supports tool/function calling: OpenAI, Anthropic, DeepSeek, Groq, Mistral, OpenRouter, local
models via Ollama/LM Studio, or any other OpenAI-compatible or Anthropic-compatible endpoint.

> This is a clean-room reimplementation inspired by Claude Code's publicly observable behavior
> and conventions (tool set shape, permission modes, slash commands, memory files, subagents).
> It is not a copy of Claude Code's source — Claude Code is closed-source — and it is not
> affiliated with Anthropic.

## Features

- **Any model, any provider** — named presets for common providers, or point at a fully custom
  endpoint. Swap providers/models mid-session with `/provider` and `/model`.
- **Full tool suite** — read/write/edit files, glob, grep, run shell commands (foreground or
  background), manage todos, fetch URLs, ask the user a question, write to persistent memory.
- **Permission modes** — `default`, `acceptEdits`, `plan`, `bypassPermissions` ("auto mode"),
  plus per-tool allow/deny lists.
- **Persistent memory** — project memory files (`UCODE.md` / `AGENTS.md` / `CLAUDE.md`) and a
  global `~/.ucode/MEMORY.md`, loaded into every session and updatable via `remember`.
- **Sessions** — every conversation is saved to disk and resumable; long conversations are
  auto-compacted (summarized) before they blow the context window.
- **Subagents** — dispatch focused subagents (`explore`, `plan`, `general`, or custom types you
  define) with a restricted tool subset, for parallel or sandboxed work.
- **Skills** — drop a markdown playbook in `.ucode/skills/` and the agent can invoke it by name.
- **Hooks** — shell commands that run before/after tool calls (can block a tool call) or on
  session start, configured in `.ucode/settings.json`.
- **Continuous loops** — `ucode loop <interval> "<prompt>"` re-runs a prompt on a timer
  (polling/monitoring use cases) until it self-reports done or you stop it.
- **Auto-fix** — `ucode fix "<command>"` runs a command (test/build/lint); on failure it hands
  the output to the agent to diagnose and fix, then **re-runs the command for real verification**
  rather than trusting the model's self-report. Repeats until it passes or attempts run out.
- **Zero runtime dependencies** — pure Node.js (`>=18.17`), uses the built-in `fetch` and
  `node:test`.

## Install

```bash
./install.sh   # checks your Node version, npm install, npm link (falls back to ~/.local/bin)
```

Or do it by hand:

```bash
npm install
npm link   # makes the `ucode` command available globally, or just run `node bin/ucode.js`
```

Set an API key for whichever provider you're using:

```bash
export GLM_API_KEY=...        # default provider
# or: OPENAI_API_KEY / ANTHROPIC_API_KEY / DEEPSEEK_API_KEY / GROQ_API_KEY / MISTRAL_API_KEY / OPENROUTER_API_KEY
```

See `.env.example` for the full list. Local providers (Ollama, LM Studio) need no key.

## Quickstart

```bash
ucode                          # interactive session in the current directory
ucode "explain this codebase"  # one-shot, non-interactive
ucode --auto "fix the failing test in src/foo.js"   # auto-accept edits/commands, no prompts
ucode providers                # list built-in provider presets
ucode loop 10m "check CI status and report any failures"
ucode fix "npm test" --auto    # diagnose-fix-reverify loop until the command passes
```

## Choosing a provider/model

Three ways, in increasing precedence:

1. **Global config**: `ucode config set provider openai` (writes `~/.ucode/config.json`).
2. **Project settings**: create `.ucode/settings.json` (see `.ucode/settings.example.json`):
   ```json
   { "provider": "openai", "model": "gpt-4.1" }
   ```
3. **Flags / env vars**: `--provider`, `--model`, `--base-url`, `--api-key`, `--api-key-env`, or
   `UCODE_PROVIDER` / `UCODE_MODEL` / `UCODE_BASE_URL` / `UCODE_API_KEY` / `UCODE_API_KEY_ENV`.

Full precedence (highest wins): **CLI flags > env vars > project `.ucode/settings.json` >
global `~/.ucode/config.json` > built-in defaults.**

Built-in presets: `glm` (default), `glm-mainland`, `openai`, `anthropic`, `deepseek`, `groq`,
`mistral`, `openrouter`, `ollama`, `lm-studio`. Any preset field can be overridden individually,
or skip presets entirely with a fully custom block in `.ucode/settings.json`:

```json
{
  "provider": "my-provider",
  "kind": "openai-compatible",
  "model": "some-model-name",
  "baseURL": "https://my.endpoint.example/v1",
  "apiKeyEnv": "MY_PROVIDER_API_KEY"
}
```

`kind` is `"openai-compatible"` (OpenAI-style `/chat/completions` wire format — covers most
providers) or `"anthropic"` (native Anthropic Messages API).

## Permission modes

| Mode | Read | Write/Edit | Exec (shell) |
|---|---|---|---|
| `default` | allow | confirm | confirm |
| `acceptEdits` | allow | allow | confirm |
| `plan` | allow | deny | deny |
| `bypassPermissions` ("auto mode") | allow | allow | allow |

Switch modes with `--permission-mode <mode>` / `--auto` / `--plan` at launch, or `/mode`,
`/auto`, `/plan` mid-session. Per-tool overrides via `allowTools`/`denyTools` in settings always
win over the mode (deny-list checked first, then allow-list, then mode logic). Interactive tools
(asking the user a question) are always allowed regardless of mode.

## Memory

The agent automatically loads (and the system prompt includes) the first of `UCODE.md`,
`AGENTS.md`, or `CLAUDE.md` found walking up from the project root, plus `~/.ucode/MEMORY.md`
globally. Append to either with `/remember <text>` (REPL) or the `remember` tool (project by
default; pass `scope: "global"` for the global file).

`AGENTS.md` is recognized for compatibility with the emerging cross-tool convention used by other
coding agents (Codex CLI, Cursor, etc.) — drop one in a project and any of those tools, plus
`ucode`, pick it up as project briefing/memory. This repo's own `AGENTS.md` is a working example.

## Model calibration

The first time you point `ucode` at a given provider+model+baseURL, it runs one throwaway
tool-call probe before your real request — a synthetic "call this tool with this exact value"
check — to verify the model actually emits well-formed tool calls. The result is cached in
`~/.ucode/calibration.json` (keyed by provider+model+baseURL, re-checked monthly) so it doesn't
re-run on every invocation. A failed check doesn't block you — it's surfaced as a one-line
warning, since some models may still work despite a noisy probe response:

```bash
ucode --no-calibrate "..."   # skip the check entirely
ucode --recalibrate "..."    # ignore the cache and re-check now
```

Also configurable via `skipCalibration: true` in `.ucode/settings.json`/`~/.ucode/config.json`,
or `UCODE_SKIP_CALIBRATION=1`. Switching providers mid-REPL with `/provider` re-runs the check for
the newly selected model.

## Slash commands (interactive REPL)

```
/help                 show this help
/mode <mode>          set permission mode: default, acceptEdits, plan, bypassPermissions
/auto                 shortcut for mode bypassPermissions ("auto mode")
/plan                 shortcut for mode plan (read-only planning)
/model [name]          show or change the model name
/provider [name]       show or switch provider preset
/memory                show loaded project/global memory
/remember <text>       append a fact to project memory
/sessions               list saved sessions in this project
/resume <id>            resume a saved session
/skills                 list available skills (.ucode/skills/*.md)
/agents                 list available subagent types
/jobs                   list background processes started via run_command
/loop <interval> <prompt>   re-run a prompt on a timer; Ctrl+C to stop
/clear                  start a fresh session
/exit, /quit            leave
```

## Skills

Drop a markdown file in `.ucode/skills/`:

```markdown
---
name: code-review
description: Review a diff or file for correctness, security, and style issues.
---
Review {{args}} with fresh eyes... (the rest is the playbook body)
```

The agent sees all loaded skills (with descriptions) via the `run_skill` tool and can invoke one
by name, optionally passing `args` that substitute into `{{args}}` in the body. See
`.ucode/skills/code-review.md` for a working example.

## Subagents

The agent can dispatch focused subagents via the `dispatch_agent` tool, each with its own tool
subset:

- **`general`** — full tool set minus further nesting.
- **`explore`** — read-only (`read_file`, `glob_files`, `grep`, `web_fetch`); for codebase search.
- **`plan`** — read-only plus `todo_write`; investigates and proposes a plan without changing code.

Define your own in `.ucode/agents/*.md`:

```markdown
---
name: security-reviewer
description: Read-only audit for security issues.
tools: read_file, grep, glob_files, web_fetch
---
Focus on injection, secrets, unsafe deserialization, missing authn/authz checks...
```

Omitting `tools` gives the custom type every tool except further subagent dispatch. See
`.ucode/agents/security-reviewer.md` for a working example. List available types with `/agents`.

## Hooks

Configure shell commands that fire around tool calls or at session start, in
`.ucode/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "run_command", "command": "..." }],
    "PostToolUse": [{ "matcher": "write_file", "command": "..." }],
    "SessionStart": [{ "command": "..." }]
  }
}
```

`matcher` is a tool name, `"*"`, a `"prefix*"` glob, or omitted (matches everything). The hook
receives the event payload as JSON on stdin. For `PreToolUse`, a non-zero exit **blocks** the
tool call (stderr/stdout becomes the denial reason shown to the model); `PostToolUse` and
`SessionStart` hooks run fire-and-forget and never block. See
`examples/settings-with-hooks.json` for a fuller example (blocking `rm -rf`, logging edited
files).

## Continuous loop & auto-fix

```bash
ucode loop 10m "check CI status and report any failures" --auto
ucode loop 30s "poll the queue and process anything new" --max-runs 20
ucode fix "npm test" --auto
ucode fix "npm run build" --auto --max-attempts 10
```

Also available mid-REPL as `/loop <interval> <prompt>` (Ctrl+C to stop). `loop` re-runs the
*same* prompt on a fixed interval as fresh, independent conversations — it's for
polling/monitoring, not for continuing one long task. It stops when the model's reply contains
the internal stop sentinel (i.e. it decides the task is done), `--max-runs` is hit, or you
interrupt it.

`fix` treats a failing command as ground truth: run it, and if it fails, hand the output to the
agent to diagnose and fix the *underlying code* (not the command), then re-run the command for
real verification — it never trusts the model's self-report that something is fixed.

Both are non-interactive by default (mutating tool calls are denied unless you pass `--auto`).

## Sessions

Every turn is saved under `.ucode/sessions/<id>.json`. Resume the most recent with `-c`/
`--continue`, or a specific one with `--resume <id>`. List them with `ucode` then `/sessions`,
or read IDs straight from the session files. Conversations that approach the configured context
window are automatically summarized (oldest messages condensed, most recent kept verbatim) so
long-running sessions don't blow out the context.

## Architecture

```
bin/ucode.js           CLI entry: flag parsing, subcommands (providers, config set, loop, fix)
src/config/            layered config resolution + named provider presets
src/providers/         provider adapters (openai-compatible, anthropic) behind a common interface
src/agent/
  loop.js              the agentic tool-calling loop (retry/backoff, hooks, permissions)
  permissions.js       permission modes + allow/deny logic
  session.js           session persistence + context compaction
  systemPrompt.js       system prompt templating
  calibrate.js          first-run model tool-calling self-test + cache
  subagentTypes.js      builtin + custom (.ucode/agents/*.md) subagent type resolution
  runtime.js            wires config + provider + tools + memory + permissions + calibration
src/tools/             individual tool implementations (read/write/edit/glob/grep/bash/...)
src/skills/            skill loading (.ucode/skills/*.md) + templating
src/hooks/             PreToolUse/PostToolUse/SessionStart hook execution
src/automation/        loop.js (continuous re-run) and autoFix.js (diagnose-fix-reverify)
src/memory/            project/global memory file loading
src/ui/                REPL, one-shot mode, terminal rendering
test/                  node:test suite (node --test test/*.test.js)
```

## Testing

```bash
npm test
```

Tests spawn real shell subprocesses (hooks, auto-fix), so the suite runs with
`--test-concurrency=1` to avoid races between parallel test-file workers and those subprocesses.

## Extending to a new provider

Most providers that speak the OpenAI `/chat/completions` format work out of the box — just add
a preset (or a custom `.ucode/settings.json` block) with `kind: "openai-compatible"` and the
right `baseURL`/`model`/`apiKeyEnv`. For a genuinely different wire protocol, implement the
`Provider` interface in `src/providers/` (see `openaiCompatible.js`/`anthropic.js`) and register
it with `registerProviderKind()` in `src/providers/index.js`.
