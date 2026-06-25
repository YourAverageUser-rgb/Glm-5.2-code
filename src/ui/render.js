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

export function renderEvent(event) {
  switch (event.type) {
    case "assistant-text":
      process.stdout.write(`\n${event.text}\n`);
      break;
    case "tool-call":
      process.stdout.write(color(`\n→ ${event.name}`, "cyan") + color(` ${JSON.stringify(event.args ?? {}).slice(0, 200)}`, "gray") + "\n");
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
  process.stdout.write(color("Universal Code", "bold") + color(`  (${provider}/${model})  mode:${mode}`, "gray") + "\n");
  process.stdout.write(color(cwd, "gray") + "\n");
  process.stdout.write(color('Type /help for commands, or just describe what you want done.', "gray") + "\n\n");
}

export function renderTodos(todos) {
  if (!todos?.length) return;
  process.stdout.write("\n" + color("Tasks:", "bold") + "\n");
  for (const t of todos) {
    const mark = t.status === "completed" ? color("x", "green") : t.status === "in_progress" ? color("~", "yellow") : " ";
    process.stdout.write(`  [${mark}] ${t.content}\n`);
  }
}
