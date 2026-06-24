import { execFile } from "node:child_process";
import { runAgentLoop } from "../agent/loop.js";
import { color } from "../ui/render.js";

function runCommandOnce(command, cwd) {
  return new Promise((resolve) => {
    execFile("/bin/sh", ["-c", command], { cwd, maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
      resolve({ exitCode: error?.code ?? 0, stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}

/**
 * Run a command (typically a test/build/lint command); if it fails, hand the
 * failure output to the agent to diagnose and fix, then re-run for real
 * verification rather than trusting the model's self-report. Repeats until
 * it passes or maxAttempts is exhausted.
 */
export async function runAutoFix({ runtime, command, maxAttempts = 5, ui = {} }) {
  const { config, provider, tools, memory, permissionGate, providerLabel, cwd } = runtime;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    process.stdout.write(color(`\n[auto-fix ${attempt}/${maxAttempts}] running: ${command}\n`, "gray"));
    const { exitCode, stdout, stderr } = await runCommandOnce(command, cwd);

    if (exitCode === 0) {
      process.stdout.write(color(`✓ "${command}" passed.\n`, "green"));
      return { success: true, attempts: attempt };
    }

    process.stdout.write(color(`✗ "${command}" failed (exit ${exitCode}). Asking the agent to diagnose and fix it...\n`, "yellow"));
    const prompt =
      `Running \`${command}\` failed with exit code ${exitCode}.\n\nstdout (tail):\n${stdout.slice(-4000)}\n\n` +
      `stderr (tail):\n${stderr.slice(-4000)}\n\n` +
      "Diagnose the root cause and fix the underlying code (not the command itself). Make the minimal necessary change, then stop — it will be re-run and verified independently.";

    await runAgentLoop({ config, provider, tools, initialMessages: [{ role: "user", content: prompt }], cwd, permissionGate, ui, memory, providerLabel });
  }

  process.stdout.write(color(`Gave up after ${maxAttempts} attempts; "${command}" is still failing.\n`, "red"));
  return { success: false, attempts: maxAttempts };
}
