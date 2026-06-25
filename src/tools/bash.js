import { exec } from "node:child_process";
import { startBackground, getBackground, listBackground, killBackground } from "./processManager.js";

const MAX_OUTPUT = 30_000;

function truncate(s) {
  if (!s) return s;
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + `\n…[truncated ${s.length - MAX_OUTPUT} chars]` : s;
}

function runForeground(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    // exec() spawns the platform's default shell (cmd.exe on Windows,
    // /bin/sh elsewhere) -- a hardcoded "/bin/sh" path fails with ENOENT
    // on Windows since that path doesn't exist there.
    exec(
      command,
      { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 20 },
      (error, stdout, stderr) => {
        if (error?.killed) {
          resolve({ isError: true, output: `Command timed out after ${timeoutMs}ms.\nstdout:\n${truncate(stdout)}\nstderr:\n${truncate(stderr)}` });
          return;
        }
        const exitCode = error?.code ?? 0;
        const body = [`exit code: ${exitCode}`, stdout && `stdout:\n${truncate(stdout)}`, stderr && `stderr:\n${truncate(stderr)}`]
          .filter(Boolean)
          .join("\n\n");
        resolve({ isError: exitCode !== 0, output: body || "(no output)" });
      }
    );
  });
}

export const bashTool = {
  name: "run_command",
  description:
    "Run a shell command. Set run_in_background:true for long-running processes (dev servers, watchers) " +
    "and poll them with bash_output; otherwise the call blocks until the command exits or times out.",
  riskLevel: "exec",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute" },
      timeout_ms: { type: "integer", description: "Max time to wait in foreground mode (default 120000)" },
      run_in_background: { type: "boolean" },
    },
    required: ["command"],
  },
  async execute({ command, timeout_ms, run_in_background }, { cwd, config }) {
    if (run_in_background) {
      const id = startBackground(command, { cwd });
      return { output: `Started background process ${id}: ${command}\nUse bash_output with this id to read its output.` };
    }
    const timeoutMs = timeout_ms ?? config?.toolTimeoutMs ?? 120_000;
    return runForeground(command, cwd, timeoutMs);
  },
};

export const bashOutputTool = {
  name: "bash_output",
  description: "Fetch accumulated stdout/stderr (and exit status, if finished) for a background process started by run_command.",
  riskLevel: "read",
  parameters: {
    type: "object",
    properties: { id: { type: "string", description: "Background process id, e.g. 'bg-1'. Omit to list all background processes." } },
    required: [],
  },
  async execute({ id }) {
    if (!id) {
      const all = listBackground();
      if (!all.length) return { output: "No background processes." };
      return { output: all.map((p) => `${p.id}\t${p.exitCode === null ? "running" : `exited ${p.exitCode}`}\t${p.command}`).join("\n") };
    }
    const record = getBackground(id);
    if (!record) return { isError: true, output: `No background process with id ${id}.` };
    const status = record.exitCode === null ? "running" : `exited with code ${record.exitCode}`;
    return { output: `status: ${status}\nstdout:\n${truncate(record.stdout)}\nstderr:\n${truncate(record.stderr)}` };
  },
};

export const bashKillTool = {
  name: "bash_kill",
  description: "Terminate a background process started by run_command.",
  riskLevel: "exec",
  parameters: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  async execute({ id }) {
    const ok = killBackground(id);
    return ok ? { output: `Killed ${id}.` } : { isError: true, output: `No background process with id ${id}.` };
  },
};
