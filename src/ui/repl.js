import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { runAgentLoop } from "../agent/loop.js";
import { Session, latestSession, listSessions } from "../agent/session.js";
import { renderEvent, renderBanner, renderTodos, color, setTheme } from "./render.js";
import { onTodosChange } from "../tools/todoStore.js";
import { buildRuntime } from "../agent/runtime.js";
import { createProvider } from "../providers/index.js";
import { resolvePreset, listPresets } from "../config/presets.js";
import { MODES } from "../agent/permissions.js";
import { listBackground } from "../tools/processManager.js";
import { startLoopRunner, parseInterval } from "../automation/loop.js";
import { readHeartbeat } from "../automation/heartbeat.js";
import { ensureCalibrated } from "../agent/calibrate.js";
import { resolveThemes } from "./themes.js";

const HELP = `Commands:
  /help                 show this help
  /mode <mode>          set permission mode: ${MODES.join(", ")}
  /auto                 shortcut for mode bypassPermissions ("auto mode")
  /plan                 shortcut for mode plan (read-only planning)
  /model [name]         show or change the model name
  /provider [name]      show or switch provider preset (${listPresets().map((p) => p.name).join(", ")})
  /memory               show loaded project/global memory
  /remember <text>      append a fact to project memory
  /sessions             list saved sessions in this project
  /resume <id>          resume a saved session
  /skills               list available skills (.ucode/skills/*.md)
  /agents               list available subagent types
  /theme [name]         show or switch color theme (default, dracula, solarized-dark, nord, monochrome, or custom)
  /plugins              list installed plugins (.ucode/plugins/, ~/.ucode/plugins/)
  /jobs                 list background processes started via run_command
  /loop <interval> <prompt>   re-run a prompt on a timer (e.g. /loop 10m "check CI status"); Ctrl+C to stop
  /heartbeat [interval]       re-run .ucode/HEARTBEAT.md on a timer (default 30m), re-read fresh each tick; Ctrl+C to stop
  /clear                start a fresh session
  /exit, /quit          leave
`;

export async function startRepl({ flags = {} } = {}) {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  const confirm = async (tool, args) => {
    const preview = JSON.stringify(args ?? {}).slice(0, 150);
    const ans = await rl.question(color(`Allow ${tool.name}(${preview})? [y/N] `, "yellow"));
    return /^y(es)?$/i.test(ans.trim());
  };

  const runtime = await buildRuntime({ flags, confirm });
  if (runtime.problems.length) {
    for (const p of runtime.problems) console.error(color(`✗ ${p}`, "red"));
    rl.close();
    process.exitCode = 1;
    return;
  }

  const { config, tools, memory, permissionGate, cwd, skills, subagentTypes, plugins } = runtime;
  let provider = runtime.provider;
  let providerLabel = runtime.providerLabel;

  let session;
  if (flags.resume) session = new Session(config, flags.resume);
  else if (flags.continueSession && latestSession(config)) session = new Session(config, latestSession(config).id);
  else session = new Session(config);

  let { messages } = session.load();

  renderBanner({ provider: config.provider, model: config.model, mode: config.permissionMode, cwd });
  if (runtime.calibration && !runtime.calibration.ok) {
    console.log(color(`⚠ Calibration: ${runtime.calibration.reason}`, "yellow"));
  }
  if (messages.length) console.log(color(`Resumed session ${session.id} (${messages.length} messages).`, "gray"));

  onTodosChange((todos) => renderTodos(todos));

  const ui = {
    log: renderEvent,
    askUser: async (question, options) => {
      console.log("\n" + color(question, "bold"));
      options.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
      const ans = await rl.question("> ");
      const idx = parseInt(ans, 10) - 1;
      return options[idx] ?? ans;
    },
  };

  while (true) {
    const input = await rl.question(color("\n> ", "bold"));
    const trimmed = input.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("/")) {
      const outcome = await handleSlashCommand(trimmed, {
        config,
        permissionGate,
        memory,
        session,
        rl,
        skills,
        subagentTypes,
        plugins,
        runtime: { config, provider, tools, memory, permissionGate, providerLabel, cwd },
        ui,
      });
      if (outcome === "exit") break;
      if (outcome === "clear") {
        session = new Session(config);
        messages = [];
      }
      if (outcome?.newProvider) {
        provider = outcome.newProvider;
        providerLabel = outcome.newProviderLabel;
      }
      continue;
    }

    messages.push({ role: "user", content: trimmed });
    const result = await runAgentLoop({
      config,
      provider,
      tools,
      initialMessages: messages,
      cwd,
      permissionGate,
      ui,
      memory,
      providerLabel,
      onMessage: (m) => session.save({ messages: m, usage: {} }),
    });
    messages = result.messages;
    session.save({ messages, usage: result.usage });
  }

  rl.close();
}

async function handleSlashCommand(line, { config, permissionGate, memory, session, rl, skills, subagentTypes, plugins, runtime, ui }) {
  const [cmd, ...rest] = line.slice(1).split(/\s+/);
  const arg = rest.join(" ");

  switch (cmd) {
    case "help":
      console.log(HELP);
      return;
    case "exit":
    case "quit":
      return "exit";
    case "clear":
      console.log(color("Started a new session.", "gray"));
      return "clear";
    case "mode":
      if (!arg || !MODES.includes(arg)) {
        console.log(`Usage: /mode <${MODES.join("|")}>`);
        return;
      }
      config.permissionMode = arg;
      permissionGate.setMode(arg);
      console.log(color(`Permission mode -> ${arg}`, "green"));
      return;
    case "auto":
      config.permissionMode = "bypassPermissions";
      permissionGate.setMode("bypassPermissions");
      console.log(color("Auto mode on: edits and commands run without confirmation.", "green"));
      return;
    case "plan":
      config.permissionMode = "plan";
      permissionGate.setMode("plan");
      console.log(color("Plan mode on: read-only until you switch modes.", "green"));
      return;
    case "model":
      if (!arg) {
        console.log(`Current model: ${config.model}`);
        return;
      }
      config.model = arg;
      console.log(color(`Model -> ${arg}`, "green"));
      return;
    case "provider": {
      if (!arg) {
        console.log(`Current provider: ${config.provider} (${config.kind}, ${config.baseURL})`);
        console.log(`Available presets: ${listPresets().map((p) => p.name).join(", ")}`);
        return;
      }
      const preset = resolvePreset(arg);
      if (!preset) {
        console.log(color(`Unknown preset "${arg}". Edit .ucode/settings.json for a fully custom provider.`, "red"));
        return;
      }
      config.provider = arg;
      config.kind = preset.kind;
      config.model = preset.model;
      config.baseURL = preset.baseURL;
      config.apiKeyEnv = preset.apiKeyEnv;
      config.apiKey = preset.apiKeyEnv ? process.env[preset.apiKeyEnv] : null;
      config.apiKeyOptional = Boolean(preset.apiKeyOptional);
      if (!config.apiKey && !config.apiKeyOptional) {
        console.log(color(`Switched to ${arg}, but no API key found in $${preset.apiKeyEnv}. Set it before sending a message.`, "yellow"));
      } else {
        console.log(color(`Provider -> ${arg} (${preset.model})`, "green"));
      }
      const newProvider = createProvider(config);
      if (!config.skipCalibration && (config.apiKey || config.apiKeyOptional)) {
        const result = await ensureCalibrated({ provider: newProvider, config, globalDir: config.globalDir });
        if (!result.ok) console.log(color(`⚠ Calibration: ${result.reason}`, "yellow"));
      }
      return { newProvider, newProviderLabel: preset.label };
    }
    case "memory":
      console.log(memory.project ? `Project (${memory.project.path}):\n${memory.project.content}` : "No project memory file.");
      console.log(memory.global ? `\nGlobal (${memory.global.path}):\n${memory.global.content}` : "No global memory file.");
      return;
    case "remember": {
      if (!arg) {
        console.log("Usage: /remember <text>");
        return;
      }
      const { rememberTool } = await import("../tools/memoryWrite.js");
      const res = await rememberTool.execute({ content: arg }, { cwd: config.projectRoot, config });
      console.log(color(res.output, "green"));
      return;
    }
    case "sessions":
      for (const s of listSessions(config)) console.log(`${s.id}\t${new Date(s.mtime).toLocaleString()}`);
      return;
    case "resume": {
      if (!arg) {
        console.log("Usage: /resume <session-id>");
        return;
      }
      console.log(color(`Use: ucode --resume ${arg} (resuming mid-REPL isn't supported yet; restart with this flag).`, "yellow"));
      return;
    }
    case "skills":
      if (!skills?.length) {
        console.log(color("No skills defined yet. Add markdown files under .ucode/skills/.", "gray"));
        return;
      }
      for (const s of skills) console.log(`${color(s.name, "bold")}\t${s.description}`);
      return;
    case "agents":
      for (const [name, t] of Object.entries(subagentTypes ?? {})) {
        console.log(`${color(name, "bold")}\t${t.description}`);
      }
      return;
    case "theme": {
      const themes = resolveThemes(config);
      if (!arg) {
        for (const [name, def] of Object.entries(themes)) {
          const marker = name === config.theme ? "*" : " ";
          console.log(`${marker} ${color(name.padEnd(16), "bold")} ${def.description ?? ""}  (${def.source})`);
        }
        return;
      }
      const themeDef = themes[arg];
      if (!themeDef) {
        console.log(color(`Unknown theme "${arg}". Run /theme with no argument to see available themes.`, "red"));
        return;
      }
      config.theme = arg;
      setTheme(themeDef);
      console.log(color(`Theme -> ${arg}`, "green"));
      return;
    }
    case "plugins":
      if (!plugins?.length) {
        console.log(color("No plugins installed. Drop a directory under .ucode/plugins/<name>/ or ~/.ucode/plugins/<name>/.", "gray"));
        return;
      }
      for (const p of plugins) {
        const parts = [];
        if (p.skills.length) parts.push(`${p.skills.length} skill(s)`);
        if (Object.keys(p.agents).length) parts.push(`${Object.keys(p.agents).length} agent(s)`);
        if (Object.keys(p.themes).length) parts.push(`${Object.keys(p.themes).length} theme(s)`);
        if (Object.keys(p.hooks).length) parts.push("hooks");
        console.log(`${color(p.name, "bold")}${p.version ? `@${p.version}` : ""}  (${p.source})  ${p.description}`.trim());
        console.log(color(`  provides: ${parts.join(", ") || "nothing"}`, "gray"));
      }
      return;
    case "jobs": {
      const jobs = listBackground();
      if (!jobs.length) {
        console.log(color("No background processes.", "gray"));
        return;
      }
      for (const j of jobs) {
        const status = j.exitCode === null ? "running" : `exited ${j.exitCode}`;
        console.log(`${j.id}\t${status}\t${j.command}`);
      }
      return;
    }
    case "loop": {
      if (!arg) {
        console.log('Usage: /loop <interval> <prompt> (e.g. /loop 10m "check CI status")');
        return;
      }
      const [intervalStr, ...promptParts] = rest;
      const prompt = promptParts.join(" ").replace(/^"(.*)"$/, "$1");
      if (!prompt) {
        console.log('Usage: /loop <interval> <prompt> (e.g. /loop 10m "check CI status")');
        return;
      }
      let intervalMs;
      try {
        intervalMs = parseInterval(intervalStr);
      } catch (err) {
        console.log(color(err.message, "red"));
        return;
      }
      console.log(color(`Looping every ${intervalStr}. Press Ctrl+C to stop.`, "gray"));
      let stopped = false;
      const onSigint = () => {
        stopped = true;
        console.log(color("\nStopping loop...", "yellow"));
      };
      process.on("SIGINT", onSigint);
      try {
        const { runs } = await startLoopRunner({
          runtime,
          session,
          prompt,
          intervalMs,
          ui,
          isStopped: () => stopped,
        });
        console.log(color(`Loop finished after ${runs} run(s).`, "gray"));
      } finally {
        process.off("SIGINT", onSigint);
      }
      return;
    }
    case "heartbeat": {
      if (!readHeartbeat(config)) {
        console.log(color("No .ucode/HEARTBEAT.md found. Create one with instructions to check periodically (see examples/HEARTBEAT.md.example).", "red"));
        return;
      }
      let intervalMs;
      try {
        intervalMs = parseInterval(arg || "30m");
      } catch (err) {
        console.log(color(err.message, "red"));
        return;
      }
      console.log(color(`Heartbeat every ${arg || "30m"}, re-reading .ucode/HEARTBEAT.md each tick. Press Ctrl+C to stop.`, "gray"));
      let stopped = false;
      const onSigint = () => {
        stopped = true;
        console.log(color("\nStopping heartbeat...", "yellow"));
      };
      process.on("SIGINT", onSigint);
      try {
        const { runs } = await startLoopRunner({
          runtime,
          session,
          prompt: () => readHeartbeat(config) ?? "(.ucode/HEARTBEAT.md was removed; nothing to check.)",
          intervalMs,
          ui,
          isStopped: () => stopped,
        });
        console.log(color(`Heartbeat finished after ${runs} run(s).`, "gray"));
      } finally {
        process.off("SIGINT", onSigint);
      }
      return;
    }
    default:
      console.log(color(`Unknown command: /${cmd}. Try /help.`, "red"));
      return;
  }
}
