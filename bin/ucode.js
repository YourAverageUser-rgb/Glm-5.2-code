#!/usr/bin/env node
import { startRepl } from "../src/ui/repl.js";
import { runOneShot } from "../src/ui/oneShot.js";
import { writeGlobalConfig } from "../src/config/index.js";
import { listPresets } from "../src/config/presets.js";

const HELP = `Universal Code (ucode) - a model-agnostic terminal coding agent.

Usage:
  ucode                          start interactive session in the current directory
  ucode "<prompt>"                run one prompt non-interactively and exit
  ucode config set <key> <value>  write a value to ~/.ucode/config.json
  ucode providers                 list built-in provider presets

Flags:
  --provider <name>      provider preset (${listPresets().map((p) => p.name).join(", ")}), default: glm
  --model <name>         model name override
  --base-url <url>       custom API base URL override
  --api-key <key>        API key (prefer env vars in practice)
  --api-key-env <name>   env var name to read the API key from
  --permission-mode <m>  default | acceptEdits | plan | bypassPermissions
  --auto                 shortcut for --permission-mode bypassPermissions
  --plan                 shortcut for --permission-mode plan
  -c, --continue         resume the most recent session in this project
  --resume <id>          resume a specific session id
  -p, --print            one-shot mode: print only the final answer
  -q, --quiet            suppress tool-call/result chatter
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

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
