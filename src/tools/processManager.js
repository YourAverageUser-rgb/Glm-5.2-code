import { spawn } from "node:child_process";

// Tracks background shell processes started via run_command(..., background: true)
// so a later bash_output / bash_kill call can retrieve output or stop them.
let counter = 0;
const processes = new Map();

const MAX_BUFFER = 100_000; // chars kept per stream

function appendCapped(buf, chunk) {
  const next = buf + chunk;
  return next.length > MAX_BUFFER ? next.slice(next.length - MAX_BUFFER) : next;
}

export function startBackground(command, { cwd } = {}) {
  const id = `bg-${++counter}`;
  const child = spawn(command, { shell: true, cwd });
  const record = { id, command, child, stdout: "", stderr: "", exitCode: null, startedAt: Date.now() };
  child.stdout?.on("data", (d) => (record.stdout = appendCapped(record.stdout, d.toString())));
  child.stderr?.on("data", (d) => (record.stderr = appendCapped(record.stderr, d.toString())));
  child.on("exit", (code) => (record.exitCode = code));
  processes.set(id, record);
  return id;
}

export function getBackground(id) {
  return processes.get(id);
}

export function listBackground() {
  return [...processes.values()].map(({ id, command, exitCode, startedAt }) => ({ id, command, exitCode, startedAt }));
}

export function killBackground(id) {
  const record = processes.get(id);
  if (!record) return false;
  if (record.exitCode === null) record.child.kill();
  return true;
}
