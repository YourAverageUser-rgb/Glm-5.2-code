#!/usr/bin/env node
import { startRepl } from "../src/ui/repl.js";
import { runOneShot } from "../src/ui/oneShot.js";
import { writeGlobalConfig, loadConfig } from "../src/config/index.js";
import { listPresets } from "../src/config/presets.js";
import { buildRuntime } from "../src/agent/runtime.js";
import { Session } from "../src/agent/session.js";
import { color, nonInteractiveUi } from "../src/ui/render.js";
import { startLoopRunner, parseInterval } from "../src/automation/loop.js";
import { runAutoFix } from "../src/automation/autoFix.js";
import { readHeartbeat, scaffoldHeartbeat } from "../src/automation/heartbeat.js";
import { resolveThemes } from "../src/ui/themes.js";
import { loadPlugins } from "../src/plugins/index.js";

const HELP = `Universal Code (ucode) - a model-agnostic terminal coding agent.

Usage:
  ucode                          start interactive session in the current directory
  ucode "<prompt>"                run one prompt non-interactively and exit
  ucode loop <interval> "<prompt>"  re-run a prompt on a timer until stopped (Ctrl+C)
  ucode heartbeat [interval]      re-run .ucode/HEARTBEAT.md on a timer (default 30m), re-read fresh each tick
  ucode heartbeat --init          write a starter .ucode/HEARTBEAT.md
  ucode fix "<command>"           run a command; on failure, diagnose & fix, then re-verify
  ucode config set <key> <value>  write a value to ~/.ucode/config.json
  ucode providers                 list built-in provider presets
  ucode themes                    list available color themes (built-in, plugin, custom)
  ucode plugins                   list installed plugins (.ucode/plugins/, ~/.ucode/plugins/)

Flags:
  --provider <name>      provider preset (${listPresets().map((p) => p.name).join(", ")}), default: glm
  --model <name>         model name override
  --base-url <url>       custom API base URL override
  --api-key <key>        API key (prefer env vars in practice)
  --api-key-env <name>   env var name to read the API key from
  --permission-mode <m>  default | acceptEdits | plan | bypassPermissions
  --auto                 shortcut for --permission-mode bypassPermissions
  --plan                 shortcut for --permission-mode plan
  --theme <name>         color theme (default, dracula, solarized-dark, nord, monochrome, or custom), default: default
  -c, --continue         resume the most recent session in this project
  --resume <id>          resume a specific session id
  -p, --print            one-shot mode: print only the final answer
  -q, --quiet            suppress tool-call/result chatter
  --max-runs <n>         ucode loop: stop after n runs (default: unlimited)
  --max-attempts <n>     ucode fix: give up after n attempts (default: 5)
  --no-calibrate         skip the first-run model tool-calling check
  --recalibrate          ignore the cached calibration result and re-check
  -h, --help             show this help

Configuration (highest precedence first): CLI flags > env vars (UCODE_*) >
.ucode/settings.json (project) > ~/.ucode/config.json (global) > built-in defaults.

GLM/Zhipu key:        export GLM_API_KEY=...
OpenAI key:            export OPENAI_API_KEY=...
Anthropic key:         export ANTHROPIC_API_KEY=...
(any OpenAI-compatible endpoint works via --provider/--base-url/--api-key-env)
`;

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--provider": flags.provider = argv[++i]; break;
      case "--model": flags.model = argv[++i]; break;
      case "--base-url": flags.baseUrl = argv[++i]; break;
      case "--api-key": flags.apiKey = argv[++i]; break;
      case "--api-key-env": flags.apiKeyEnv = argv[++i]; break;
      case "--permission-mode": flags.permissionMode = argv[++i]; break;
      case "--auto": flags.permissionMode = "bypassPermissions"; flags.auto = true; break;
      case "--plan": flags.permissionMode = "plan"; break;
      case "-c": case "--continue": flags.continueSession = true; break;
      case "--resume": flags.resume = argv[++i]; break;
      case "-p": case "--print": flags.print = true; break;
      case "-q": case "--quiet": flags.quiet = true; break;
      case "--max-runs": flags.maxRuns = Number(argv[++i]); break;
      case "--max-attempts": flags.maxAttempts = Number(argv[++i]); break;
      case "--no-calibrate": flags.noCalibrate = true; break;
      case "--recalibrate": flags.recalibrate = true; break;
      case "--theme": flags.theme = argv[++i]; break;
      case "--init": flags.init = true; break;
      case "-h": case "--help": flags.help = true; break;
      default: positional.push(a);
    }
  }
  return { flags, positional };
}

async function main() {
  const argv = process.argv.slice(2);
  const { flags, positional } = parseArgs(argv);

  if (flags.help) {
    console.log(HELP);
    return;
  }

  if (positional[0] === "providers") {
    for (const p of listPresets()) console.log(`${p.name.padEnd(14)} ${p.label}  (model: ${p.model})`);
    return;
  }

  if (positional[0] === "themes") {
    const config = loadConfig({ flags });
    const themes = resolveThemes(config);
    for (const [name, def] of Object.entries(themes)) {
      const marker = name === config.theme ? "*" : " ";
      console.log(`${marker} ${name.padEnd(16)} ${(def.description ?? "").padEnd(58)} (${def.source})`);
    }
    return;
  }

  if (positional[0] === "plugins") {
    const config = loadConfig({ flags });
    const plugins = loadPlugins(config);
    if (!plugins.length) {
      console.log("No plugins installed. Drop a directory under .ucode/plugins/<name>/ or ~/.ucode/plugins/<name>/.");
      return;
    }
    for (const p of plugins) {
      const parts = [];
      if (p.skills.length) parts.push(`${p.skills.length} skill(s)`);
      if (Object.keys(p.agents).length) parts.push(`${Object.keys(p.agents).length} agent(s)`);
      if (Object.keys(p.themes).length) parts.push(`${Object.keys(p.themes).length} theme(s)`);
      if (Object.keys(p.hooks).length) parts.push("hooks");
      console.log(`${p.name}${p.version ? `@${p.version}` : ""}  (${p.source})  ${p.description}`.trim());
      console.log(`  provides: ${parts.join(", ") || "nothing"}`);
    }
    return;
  }

  if (positional[0] === "config" && positional[1] === "set") {
    const [, , key, value] = positional;
    if (!key || value === undefined) {
      console.error("Usage: ucode config set <key> <value>");
      process.exitCode = 1;
      return;
    }
    writeGlobalConfig({ [key]: value });
    console.log(`Saved ${key}=${value} to ~/.ucode/config.json`);
    return;
  }

  if (positional[0] === "loop") {
    const interval = positional[1];
    const prompt = positional.slice(2).join(" ");
    if (!interval || !prompt) {
      console.error('Usage: ucode loop <interval> "<prompt>" [--max-runs N]');
      process.exitCode = 1;
      return;
    }
    await runLoopCommand({ interval, prompt, flags });
    return;
  }

  if (positional[0] === "heartbeat") {
    const interval = positional[1] || "30m";
    await runHeartbeatCommand({ interval, flags });
    return;
  }

  if (positional[0] === "fix") {
    const command = positional.slice(1).join(" ");
    if (!command) {
      console.error('Usage: ucode fix "<command>" [--max-attempts N]');
      process.exitCode = 1;
      return;
    }
    await runFixCommand({ command, flags });
    return;
  }

  if (positional.length > 0) {
    await runOneShot({ prompt: positional.join(" "), flags });
    return;
  }

  if (flags.print) {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    await runOneShot({ prompt: input.trim(), flags });
    return;
  }

  await startRepl({ flags });
}

function nonInteractiveConfirm(tool) {
  process.stderr.write(color(`(non-interactive: denying "${tool.name}"; pass --auto to allow mutating actions without prompts)\n`, "yellow"));
  return Promise.resolve(false);
}

async function runLoopCommand({ interval, prompt, flags }) {
  let intervalMs;
  try {
    intervalMs = parseInterval(interval);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  const runtime = await buildRuntime({ flags, confirm: nonInteractiveConfirm });
  if (runtime.problems.length) {
    for (const p of runtime.problems) console.error(color(`✗ ${p}`, "red"));
    process.exitCode = 1;
    return;
  }
  if (runtime.calibration && !runtime.calibration.ok) {
    console.error(color(`⚠ Calibration: ${runtime.calibration.reason}`, "yellow"));
  }
  if (!flags.auto) {
    console.error(color("Note: pass --auto for the loop to apply edits/commands without prompting (otherwise they're denied each run).", "yellow"));
  }

  const session = new Session(runtime.config);
  const ui = nonInteractiveUi({ quiet: flags.quiet });

  let stopped = false;
  process.on("SIGINT", () => {
    stopped = true;
    console.error(color("\nStopping loop...", "yellow"));
  });

  const { runs } = await startLoopRunner({ runtime, session, prompt, intervalMs, maxRuns: flags.maxRuns ?? Infinity, ui, isStopped: () => stopped });
  console.log(color(`Loop finished after ${runs} run(s).`, "gray"));
}

async function runHeartbeatCommand({ interval, flags }) {
  const runtime = await buildRuntime({ flags, confirm: nonInteractiveConfirm });
  if (runtime.problems.length) {
    for (const p of runtime.problems) console.error(color(`✗ ${p}`, "red"));
    process.exitCode = 1;
    return;
  }

  if (flags.init) {
    const file = scaffoldHeartbeat(runtime.config);
    console.log(color(`Wrote starter heartbeat file: ${file}`, "green"));
    console.log('Edit it with concrete check(s), then run: ucode heartbeat');
    return;
  }

  if (!readHeartbeat(runtime.config)) {
    console.error(color("No .ucode/HEARTBEAT.md found. Run `ucode heartbeat --init` to create a starter one.", "red"));
    process.exitCode = 1;
    return;
  }

  let intervalMs;
  try {
    intervalMs = parseInterval(interval);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }
  if (runtime.calibration && !runtime.calibration.ok) {
    console.error(color(`⚠ Calibration: ${runtime.calibration.reason}`, "yellow"));
  }
  if (!flags.auto) {
    console.error(color("Note: pass --auto for the heartbeat to act on findings without prompting each tick.", "yellow"));
  }

  const session = new Session(runtime.config);
  const ui = nonInteractiveUi({ quiet: flags.quiet });

  let stopped = false;
  process.on("SIGINT", () => {
    stopped = true;
    console.error(color("\nStopping heartbeat...", "yellow"));
  });

  const { runs } = await startLoopRunner({
    runtime,
    session,
    prompt: () => readHeartbeat(runtime.config) ?? "(.ucode/HEARTBEAT.md was removed; nothing to check.)",
    intervalMs,
    maxRuns: flags.maxRuns ?? Infinity,
    ui,
    isStopped: () => stopped,
  });
  console.log(color(`Heartbeat stopped after ${runs} run(s).`, "gray"));
}

async function runFixCommand({ command, flags }) {
  const runtime = await buildRuntime({ flags, confirm: nonInteractiveConfirm });
  if (runtime.problems.length) {
    for (const p of runtime.problems) console.error(color(`✗ ${p}`, "red"));
    process.exitCode = 1;
    return;
  }
  if (runtime.calibration && !runtime.calibration.ok) {
    console.error(color(`⚠ Calibration: ${runtime.calibration.reason}`, "yellow"));
  }
  if (!flags.auto) {
    console.error(color("Note: pass --auto for fixes to actually be applied non-interactively (otherwise edits are denied each attempt).", "yellow"));
  }

  const ui = nonInteractiveUi({ quiet: flags.quiet });
  const { success } = await runAutoFix({ runtime, command, maxAttempts: flags.maxAttempts ?? 5, ui });
  process.exitCode = success ? 0 : 1;
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
