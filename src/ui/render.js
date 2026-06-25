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

function truncateForDisplay(text, max = 400) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + color(` …[+${text.length - max} chars]`, "gray") : text;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

let spinnerTimer = null;
let spinnerStartedAt = null;

// TTY-only: non-interactive output (CI logs, redirected files) shouldn't get
// carriage-return-driven spinner frames mixed into it.
export function startThinking(label = "Thinking") {
  if (!isTTY || spinnerTimer) return;
  spinnerStartedAt = Date.now();
  let frame = 0;
  spinnerTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - spinnerStartedAt) / 1000);
    const glyph = SPINNER_FRAMES[frame++ % SPINNER_FRAMES.length];
    process.stdout.write(`\r${color(glyph, "cyan")} ${color(`${label}… (${elapsed}s)`, "gray")}\x1b[K`);
  }, 80);
}

export function stopThinking() {
  if (!spinnerTimer) return;
  clearInterval(spinnerTimer);
  spinnerTimer = null;
  process.stdout.write(`\r\x1b[K`);
}

export function renderEvent(event) {
  switch (event.type) {
    case "assistant-text":
      process.stdout.write(`\n${event.text}\n`);
      break;
    case "thinking":
      process.stdout.write(color("✻ Thinking…", "gray") + "\n" + color(truncateForDisplay(event.text, 600), "gray") + "\n");
      break;
    case "tool-call":
      process.stdout.write(color(`→ ${event.name}`, "cyan") + color(` ${JSON.stringify(event.args ?? {}).slice(0, 200)}`, "gray") + "\n");
      break;
    case "tool-result":
      process.stdout.write(
        (event.isError ? color("  ✗ ", "red") : color("  ✓ ", "green")) + truncateForDisplay(event.output) + "\n"
      );
      break;
    case "tool-denied":
      process.stdout.write(color(`  ⊘ blocked: ${event.reason}`, "yellow") + "\n");
      break;
    case "retry":
      process.stdout.write(color(`  (retrying after error: ${event.error}, attempt ${event.attempt})`, "yellow") + "\n");
      break;
    case "compacted":
      process.stdout.write(color(`  (context compacted, ${event.remaining} messages retained)`, "gray") + "\n");
      break;
    case "iteration-limit":
      process.stdout.write(color("  (stopped: reached max iterations for this turn)", "yellow") + "\n");
      break;
    case "error":
      process.stdout.write(color(`  error: ${event.message}`, "red") + "\n");
      break;
    default:
      break;
  }
}

export function renderBanner({ provider, model, mode, cwd }) {
  process.stdout.write(color("✻", "cyan") + " " + color("Universal Code", "bold") + color(`  ·  ${provider}/${model}  ·  mode: ${mode}`, "gray") + "\n");
  process.stdout.write(color(cwd, "gray") + "\n");
  process.stdout.write(color("/help for commands · Shift+Tab cycles modes · or just describe what you want done.", "gray") + "\n\n");
}

export function renderTodos(todos) {
  if (!todos?.length) return;
  process.stdout.write("\n" + color("Tasks:", "bold") + "\n");
  for (const t of todos) {
    const mark = t.status === "completed" ? color("x", "green") : t.status === "in_progress" ? color("~", "yellow") : " ";
    process.stdout.write(`  [${mark}] ${t.content}\n`);
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
