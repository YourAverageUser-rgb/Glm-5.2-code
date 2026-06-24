import { execFile } from "node:child_process";

// settings.json shape:
// { "hooks": { "PreToolUse": [{ "matcher": "run_command", "command": "..." }],
//              "PostToolUse": [...], "SessionStart": [...] } }
// matcher is a tool name, a "*" wildcard, or a "prefix*" glob; omitted = matches everything.
// The hook command receives the event payload as JSON on stdin. For PreToolUse,
// a non-zero exit blocks the tool call (its stderr/stdout becomes the denial reason).

function matches(matcher, toolName) {
  if (!matcher || matcher === "*") return true;
  if (matcher.endsWith("*")) return toolName.startsWith(matcher.slice(0, -1));
  return matcher === toolName;
}

function runOne(command, payload, timeoutMs) {
  return new Promise((resolve) => {
    const child = execFile("/bin/sh", ["-c", command], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ exitCode: error?.code ?? 0, stdout: stdout?.trim(), stderr: stderr?.trim() });
    });
    // A hook command may exit before consuming stdin (e.g. "exit 0"); ignore
    // the resulting EPIPE instead of letting it crash the process.
    child.stdin?.on("error", () => {});
    child.stdin?.write(JSON.stringify(payload));
    child.stdin?.end();
  });
}

export async function runHooks(eventName, hookList, payload, { timeoutMs = 30_000 } = {}) {
  const relevant = (hookList ?? []).filter((h) => matches(h.matcher, payload.tool ?? ""));
  for (const hook of relevant) {
    const result = await runOne(hook.command, { event: eventName, ...payload }, timeoutMs);
    if (eventName === "PreToolUse" && result.exitCode !== 0) {
      return { blocked: true, reason: result.stderr || result.stdout || `PreToolUse hook "${hook.command}" exited ${result.exitCode}` };
    }
  }
  return { blocked: false };
}
