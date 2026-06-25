import os from "node:os";
import { BUILTIN_THEMES, compileTheme } from "./themes.js";

let activeTheme = compileTheme(BUILTIN_THEMES.default);

/** Switch the colors used by color()/renderEvent()/etc. Pass a theme definition (the `{ colors }` shape from themes.js), not a compiled one. */
export function setTheme(themeDef) {
  activeTheme = compileTheme(themeDef);
}

const isTTY = process.stdout.isTTY;

export function color(text, name) {
  if (!isTTY) return text;
  const code = activeTheme[name];
  if (!code) return text;
  return `${code}${text}\x1b[0m`;
}

export function bold(text) {
  return isTTY ? `\x1b[1m${text}\x1b[0m` : text;
}

export function dim(text) {
  return isTTY ? `\x1b[2m${text}\x1b[0m` : text;
}

// A filled "chip" rendered with reverse video so a foreground hue becomes the
// background -- gives mode indicators a solid, premium pill look.
export function badge(text, name) {
  if (!isTTY) return `[${text}]`;
  const code = activeTheme[name] ?? "";
  return `${code}\x1b[7m ${text} \x1b[0m`;
}

const MODE_COLORS = { default: "blue", acceptEdits: "green", plan: "cyan", bypassPermissions: "yellow" };

export function modeBadge(mode) {
  return badge(mode, MODE_COLORS[mode] ?? "gray");
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function visibleWidth(s) {
  return [...s.replace(ANSI_RE, "")].length;
}

function shortenPath(p) {
  const home = os.homedir();
  return home && p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

// A rounded box sized to its (possibly colored) contents. Only the border glyphs
// are colored so inner ANSI segments don't bleed into the frame.
function box(lines) {
  const pad = 2;
  const widths = lines.map(visibleWidth);
  const inner = Math.max(...widths) + pad * 2;
  const horizontal = "─".repeat(inner);
  const v = color("│", "gray");
  const out = [color("╭" + horizontal + "╮", "gray")];
  lines.forEach((ln, i) => {
    out.push(v + " ".repeat(pad) + ln + " ".repeat(pad + inner - pad * 2 - widths[i]) + v);
  });
  out.push(color("╰" + horizontal + "╯", "gray"));
  return out.join("\n");
}

/** A labeled or plain horizontal rule, e.g. divider("result"). */
export function divider(label) {
  const width = 52;
  if (!label) return color("─".repeat(width), "gray");
  const tail = Math.max(0, width - label.length - 4);
  return color("── ", "gray") + bold(label) + " " + color("─".repeat(tail), "gray");
}

function truncateLine(text, max = 140) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + color("…", "gray") : text;
}

function truncateForDisplay(text, max = 400) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + color(` …[+${text.length - max} chars]`, "gray") : text;
}

// Turn raw tool arguments into a short, human-friendly summary instead of dumping
// JSON for the common tools.
function summarizeArgs(name, args = {}) {
  switch (name) {
    case "run_command":
      return args.command ?? "";
    case "read_file":
    case "write_file":
    case "edit_file":
      return args.path ?? "";
    case "glob_files":
    case "grep":
      return args.pattern ?? "";
    case "fetch_url":
      return args.url ?? "";
    default: {
      const json = JSON.stringify(args ?? {});
      return json === "{}" ? "" : json;
    }
  }
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

let spinnerTimer = null;
let spinnerStartedAt = null;

// TTY-only: non-interactive output (CI logs, redirected files) shouldn't get
// carriage-return-driven spinner frames mixed into it.
export function startThinking(label = "Working") {
  if (!isTTY || spinnerTimer) return;
  spinnerStartedAt = Date.now();
  let frame = 0;
  spinnerTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - spinnerStartedAt) / 1000);
    const glyph = SPINNER_FRAMES[frame++ % SPINNER_FRAMES.length];
    process.stdout.write(`\r${color(glyph, "cyan")} ${color(`${label}…`, "bold")} ${color(`${elapsed}s`, "gray")}\x1b[K`);
  }, 80);
}

export function stopThinking() {
  if (!spinnerTimer) return;
  clearInterval(spinnerTimer);
  spinnerTimer = null;
  process.stdout.write(`\r\x1b[K`);
}

function renderToolResult(event) {
  const connector = color("  ⎿ ", "gray");
  const indent = "    ";
  const lines = (event.output || "(no output)").split("\n");
  const shown = lines.slice(0, 6);
  const rest = lines.length - shown.length;
  const hue = event.isError ? "red" : "gray";
  const body = shown
    .map((l, i) => (i === 0 ? "" : indent) + color(truncateLine(l), hue))
    .join("\n");
  const more = rest > 0 ? color(`\n${indent}… +${rest} more line${rest === 1 ? "" : "s"}`, "gray") : "";
  process.stdout.write(connector + body + more + "\n");
}

export function renderEvent(event) {
  switch (event.type) {
    case "assistant-text":
      process.stdout.write(`\n${event.text}\n`);
      break;
    case "thinking":
      process.stdout.write(
        "\n" + color("✻ Thinking", "magenta") + "\n" +
        dim(truncateForDisplay(event.text, 600).split("\n").map((l) => "  " + l).join("\n")) + "\n"
      );
      break;
    case "tool-call": {
      const summary = summarizeArgs(event.name, event.args);
      process.stdout.write(
        "\n" + color("●", "cyan") + " " + bold(event.name) + (summary ? "  " + color(truncateLine(summary, 160), "gray") : "") + "\n"
      );
      break;
    }
    case "tool-result":
      renderToolResult(event);
      break;
    case "tool-denied":
      process.stdout.write(color("  ⎿ ", "gray") + color(`⊘ blocked: ${event.reason}`, "yellow") + "\n");
      break;
    case "retry":
      process.stdout.write(color(`  ↻ retrying (attempt ${event.attempt}): ${event.error}`, "yellow") + "\n");
      break;
    case "compacted":
      process.stdout.write(color(`  ⊜ context compacted — ${event.remaining} messages retained`, "gray") + "\n");
      break;
    case "iteration-limit":
      process.stdout.write(color("  ⊘ stopped: reached max iterations for this turn", "yellow") + "\n");
      break;
    case "error":
      process.stdout.write(color(`  ✗ ${event.message}`, "red") + "\n");
      break;
    default:
      break;
  }
}

export function renderBanner({ provider, model, mode, cwd }) {
  const lines = [
    color("✻", "magenta") + "  " + bold("Universal Code"),
    color("a model-agnostic coding agent", "gray"),
  ];
  process.stdout.write("\n" + box(lines) + "\n");
  const meta = `${color(provider, "cyan")} ${color("·", "gray")} ${color(model, "cyan")}`;
  process.stdout.write("  " + meta + "  " + color("·", "gray") + "  " + modeBadge(mode) + "\n");
  process.stdout.write("  " + color(shortenPath(cwd), "gray") + "\n");
  process.stdout.write(
    "  " + color("/help", "cyan") + color(" for commands", "gray") +
    color("   ·   ", "gray") + color("Shift+Tab", "cyan") + color(" cycles modes", "gray") +
    color("   ·   ", "gray") + color("/image", "cyan") + color(" attaches a picture", "gray") + "\n\n"
  );
}

export function renderTodos(todos) {
  if (!todos?.length) return;
  const done = todos.filter((t) => t.status === "completed").length;
  process.stdout.write("\n" + bold("Tasks") + " " + color(`${done}/${todos.length}`, "gray") + "\n");
  for (const t of todos) {
    let glyph = "○";
    let hue = "gray";
    if (t.status === "completed") { glyph = "●"; hue = "green"; }
    else if (t.status === "in_progress") { glyph = "◐"; hue = "yellow"; }
    const label = t.status === "completed" ? color(t.content, "gray") : t.content;
    process.stdout.write("  " + color(glyph, hue) + " " + label + "\n");
  }
}

// Shared by one-shot mode and the loop/heartbeat/fix subcommands, which all
// need the same renderEvent-backed logger plus a non-interactive askUser stub.
export function nonInteractiveUi({ quiet } = {}) {
  return {
    log: quiet ? () => {} : renderEvent,
    askUser: async (_question, options) => options?.[0] ?? "",
    startThinking: quiet ? () => {} : startThinking,
    stopThinking: quiet ? () => {} : stopThinking,
  };
}
